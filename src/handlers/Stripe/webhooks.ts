/**
 * Stripe Webhook Handlers
 * Processes Stripe webhook events
 */

import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe, STRIPE_CONFIG } from '../../services/stripe';
import Booking from '../../models/booking';
import Payment from '../../models/payment';
import User from '../../models/user';

// In-memory set for recent event deduplication (supplement with DB check for durability)
const processedEvents = new Set<string>();
const MAX_PROCESSED_EVENTS = 10000;

function markEventProcessed(eventId: string) {
  processedEvents.add(eventId);
  // Evict oldest entries when set gets too large
  if (processedEvents.size > MAX_PROCESSED_EVENTS) {
    const first = processedEvents.values().next().value;
    if (first) processedEvents.delete(first);
  }
}

/**
 * Main webhook endpoint handler
 * POST /api/stripe/webhooks
 */
export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).send('No signature');
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      STRIPE_CONFIG.webhookSecret
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Deduplicate: skip already-processed events
  if (processedEvents.has(event.id)) {
    console.log(`Webhook duplicate skipped: ${event.id}`);
    return res.json({ received: true, duplicate: true });
  }

  console.log(`Webhook received: ${event.type} (${event.id})`);

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.canceled':
        await handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.captured':
        await handleChargeCaptured(event.data.object as Stripe.Charge);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;

      case 'charge.dispute.closed':
        await handleDisputeClosed(event.data.object as Stripe.Dispute);
        break;

      case 'transfer.created':
        await handleTransferCreated(event.data.object as Stripe.Transfer);
        break;

      case 'transfer.reversed':
        await handleTransferReversed(event.data.object as Stripe.Transfer);
        break;

      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      case 'account.application.deauthorized':
        await handleAccountDeauthorized(event.account ?? null);
        break;

      case 'payout.paid':
        await handlePayoutPaid(event.data.object as Stripe.Payout);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Mark as processed after successful handling
    markEventProcessed(event.id);

    // Return 200 to acknowledge receipt
    res.json({ received: true });

  } catch (error: any) {
    console.error(`Error handling webhook ${event.type}:`, error);
    // Return 500 so Stripe retries the webhook
    res.status(500).json({ received: false, error: error.message });
  }
};

/**
 * Handle payment_intent.succeeded event
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const bookingId = paymentIntent.metadata.bookingId;
  if (!bookingId) return;

  const booking = await Booking.findById(bookingId);
  if (!booking || !booking.payment) return;

  // Only update if not already authorized
  if (booking.payment.status === 'pending') {
    booking.payment.status = 'authorized';
    booking.payment.authorizedAt = new Date();
    if (paymentIntent.latest_charge) {
      booking.payment.stripeChargeId = paymentIntent.latest_charge as string;
    }
    booking.status = 'booked';
    await booking.save();

    await Payment.findOneAndUpdate(
      { booking: booking._id },
      {
        status: 'authorized',
        authorizedAt: booking.payment.authorizedAt,
        stripeChargeId: booking.payment.stripeChargeId,
      }
    );

    console.log(`Payment authorized via webhook for booking ${bookingId}`);
  }
}

/**
 * Handle payment_intent.payment_failed event
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const bookingId = paymentIntent.metadata.bookingId;
  if (!bookingId) return;

  const booking = await Booking.findById(bookingId);
  if (!booking || !booking.payment) return;

  booking.payment.status = 'failed';
  booking.status = 'payment_pending'; // Allow retry
  await booking.save();

  await Payment.findOneAndUpdate(
    { booking: booking._id },
    { status: 'failed' }
  );

  console.log(`Payment failed via webhook for booking ${bookingId}`);
}

/**
 * Handle payment_intent.canceled event
 */
async function handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent) {
  const bookingId = paymentIntent.metadata.bookingId;
  if (!bookingId) return;

  const booking = await Booking.findById(bookingId);
  if (!booking || !booking.payment) return;

  if (booking.payment.status === 'authorized') {
    booking.payment.status = 'refunded';
    booking.payment.refundedAt = new Date();
    booking.status = 'cancelled';
    await booking.save();

    await Payment.findOneAndUpdate(
      { booking: booking._id },
      { status: 'refunded', refundedAt: new Date(), canceledAt: new Date() }
    );

    console.log(`Payment cancelled via webhook for booking ${bookingId}`);
  }
}

/**
 * Handle charge.captured event
 */
async function handleChargeCaptured(charge: Stripe.Charge) {
  const paymentIntentId = charge.payment_intent as string;
  if (!paymentIntentId) return;

  const booking = await Booking.findOne({ 'payment.stripePaymentIntentId': paymentIntentId });
  if (!booking || !booking.payment) return;

  if (booking.payment.status === 'authorized') {
    booking.payment.capturedAt = new Date();
    await booking.save();

    await Payment.findOneAndUpdate(
      { booking: booking._id },
      { capturedAt: booking.payment.capturedAt }
    );

    console.log(`Charge captured via webhook for booking ${booking._id}`);
  }
}

/**
 * Handle charge.refunded event
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = charge.payment_intent as string;
  if (!paymentIntentId) return;

  const booking = await Booking.findOne({ 'payment.stripePaymentIntentId': paymentIntentId });
  if (!booking || !booking.payment) return;

  const refundAmount = charge.amount_refunded / 100;
  const totalAmount = charge.amount / 100;

  if (refundAmount >= totalAmount) {
    booking.payment.status = 'refunded';
  } else {
    booking.payment.status = 'partially_refunded';
  }

  booking.payment.refundedAt = new Date();
  booking.status = 'refunded';
  await booking.save();

  await Payment.findOneAndUpdate(
    { booking: booking._id },
    { status: booking.payment.status, refundedAt: booking.payment.refundedAt }
  );

  console.log(`Charge refunded via webhook for booking ${booking._id}`);
}

/**
 * Handle charge.dispute.created event
 * A customer has opened a dispute/chargeback
 */
async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const charge = dispute.charge as string;
  if (!charge) return;

  const booking = await Booking.findOne({ 'payment.stripeChargeId': charge });
  if (!booking || !booking.payment) {
    console.error(`Dispute created for unknown charge: ${charge}, dispute: ${dispute.id}`);
    return;
  }

  // Record dispute on the payment
  booking.payment.status = 'refunded';
  booking.payment.refundReason = `Dispute: ${dispute.reason || 'unknown'}`;
  booking.payment.refundSource = 'platform';
  booking.payment.refundNotes = `Dispute ${dispute.id} opened. Amount: ${dispute.amount / 100} ${dispute.currency}. Status: ${dispute.status}`;
  booking.payment.refundedAt = new Date();
  await booking.save();

  await Payment.findOneAndUpdate(
    { booking: booking._id },
    {
      status: 'refunded',
      refundedAt: new Date(),
      $push: {
        refunds: {
          amount: dispute.amount / 100,
          reason: `Dispute: ${dispute.reason || 'unknown'}`,
          refundId: dispute.id,
          refundedAt: new Date(),
          source: 'platform',
          notes: `Chargeback dispute opened. Status: ${dispute.status}`,
        },
      },
    }
  );

  console.error(`DISPUTE CREATED for booking ${booking._id}: ${dispute.id} - Amount: ${dispute.amount / 100} ${dispute.currency} - Reason: ${dispute.reason}`);
}

/**
 * Handle charge.dispute.closed event
 * A dispute has been resolved (won or lost)
 */
async function handleDisputeClosed(dispute: Stripe.Dispute) {
  const charge = dispute.charge as string;
  if (!charge) return;

  const booking = await Booking.findOne({ 'payment.stripeChargeId': charge });
  if (!booking || !booking.payment) return;

  if (dispute.status === 'won') {
    // We won the dispute - restore payment status
    booking.payment.status = 'completed';
    booking.payment.refundNotes = `Dispute ${dispute.id} won. Funds restored.`;
    await booking.save();

    await Payment.findOneAndUpdate(
      { booking: booking._id },
      { status: 'completed' }
    );

    console.log(`Dispute WON for booking ${booking._id}: ${dispute.id}`);
  } else {
    // Dispute lost - funds are gone
    booking.payment.refundNotes = `Dispute ${dispute.id} lost. Status: ${dispute.status}`;
    await booking.save();

    console.error(`DISPUTE LOST for booking ${booking._id}: ${dispute.id} - Status: ${dispute.status}`);
  }
}

/**
 * Handle transfer.created event
 */
async function handleTransferCreated(transfer: Stripe.Transfer) {
  const bookingId = transfer.metadata.bookingId;
  if (!bookingId) return;

  const booking = await Booking.findById(bookingId);
  if (!booking || !booking.payment) return;

  booking.payment.stripeTransferId = transfer.id;
  booking.payment.transferredAt = new Date();
  await booking.save();

  await Payment.findOneAndUpdate(
    { booking: booking._id },
    { stripeTransferId: transfer.id, transferredAt: new Date() }
  );

  console.log(`Transfer created via webhook for booking ${bookingId}: ${transfer.id}`);
}

/**
 * Handle transfer.reversed event
 */
async function handleTransferReversed(transfer: Stripe.Transfer) {
  const bookingId = transfer.metadata.bookingId;
  if (!bookingId) return;

  const booking = await Booking.findById(bookingId);
  if (!booking || !booking.payment) return;

  console.log(`Transfer reversed via webhook for booking ${bookingId}`);
}

/**
 * Handle transfer.failed event
 * Transfer to professional's connected account failed
 */
async function handleAccountUpdated(account: Stripe.Account) {
  const userId = account.metadata?.userId;
  if (!userId) return;

  const user = await User.findById(userId);
  if (!user || !user.stripe) return;

  // Update user's Stripe account status
  user.stripe.onboardingCompleted = account.details_submitted || false;
  user.stripe.chargesEnabled = account.charges_enabled || false;
  user.stripe.payoutsEnabled = account.payouts_enabled || false;
  user.stripe.detailsSubmitted = account.details_submitted || false;
  user.stripe.accountStatus = account.charges_enabled ? 'active' :
                               account.details_submitted ? 'pending' : 'pending';
  await user.save();

  console.log(`Account updated via webhook for user ${userId}`);
}

/**
 * Handle account.application.deauthorized event.
 * event.account contains the disconnected connected account ID.
 */
async function handleAccountDeauthorized(connectedAccountId: string | null) {
  if (!connectedAccountId) return;

  const user = await User.findOne({ 'stripe.accountId': connectedAccountId });
  const userId = user?._id?.toString();

  if (!user || !user.stripe) return;

  user.stripe.chargesEnabled = false;
  user.stripe.payoutsEnabled = false;
  user.stripe.accountStatus = 'restricted';
  await user.save();

  console.error(`Account DEAUTHORIZED for user ${userId}: ${connectedAccountId} - Professional disconnected Stripe`);
}

/**
 * Handle payout.paid event
 */
async function handlePayoutPaid(payout: Stripe.Payout) {
  console.log(`Payout paid: ${payout.id} - Amount: ${payout.amount / 100} ${payout.currency}`);
}
