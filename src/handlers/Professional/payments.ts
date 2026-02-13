/**
 * Professional Payment Handlers
 * Provides payment stats and transaction history for professionals
 */

import { Request, Response } from 'express';
import Payment from '../../models/payment';

/**
 * Get payment stats for the authenticated professional
 * GET /api/professional/payment-stats
 */
export const getPaymentStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const [completedStats, pendingStats] = await Promise.all([
      Payment.aggregate([
        { $match: { professional: userId, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalEarnings: { $sum: '$professionalPayout' },
            count: { $sum: 1 },
            currency: { $first: '$currency' },
          },
        },
      ]),
      Payment.aggregate([
        { $match: { professional: userId, status: 'authorized' } },
        {
          $group: {
            _id: null,
            pendingEarnings: { $sum: '$professionalPayout' },
          },
        },
      ]),
    ]);

    const completed = completedStats[0] || { totalEarnings: 0, count: 0, currency: 'EUR' };
    const pending = pendingStats[0] || { pendingEarnings: 0 };

    res.json({
      success: true,
      data: {
        totalEarnings: completed.totalEarnings || 0,
        pendingEarnings: pending.pendingEarnings || 0,
        completedBookings: completed.count || 0,
        currency: completed.currency || 'EUR',
      },
    });
  } catch (error: any) {
    console.error('Error fetching payment stats:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message || 'Failed to fetch payment stats' },
    });
  }
};

/**
 * Get transaction history for the authenticated professional
 * GET /api/professional/transactions?limit=10
 */
export const getTransactions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 10, 1), 50);

    const transactions = await Payment.find({ professional: userId })
      .select('bookingNumber status currency professionalPayout createdAt capturedAt transferredAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const data = transactions.map((t: any) => ({
      _id: t._id,
      date: t.transferredAt || t.capturedAt || t.createdAt,
      bookingNumber: t.bookingNumber || 'N/A',
      status: t.status,
      currency: t.currency || 'EUR',
      amount: t.professionalPayout || 0,
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message || 'Failed to fetch transactions' },
    });
  }
};
