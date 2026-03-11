import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IReferralConfig extends Document {
  isEnabled: boolean;
  referrerRewardAmount: number; // e.g., 15 = €15 credit
  referredCustomerDiscountType: 'percentage' | 'fixed';
  referredCustomerDiscountValue: number; // e.g., 10 = 10% or €10
  referredCustomerDiscountMaxAmount: number; // max discount cap (e.g., €25)
  referredProfessionalCommissionReduction: number; // e.g., 50 = 50% off commission
  referredProfessionalBenefitBookings: number; // number of bookings with reduced commission
  referralExpiryDays: number; // days for referred user to complete qualifying action
  creditExpiryMonths: number; // how long earned credits last
  maxReferralsPerUser: number; // annual cap
  minBookingAmountForTrigger: number; // minimum first booking value to qualify
  lastModifiedBy: mongoose.Types.ObjectId;
  lastModified: Date;
}

export interface IReferralConfigModel extends Model<IReferralConfig> {
  getCurrentConfig(): Promise<IReferralConfig>;
}

const referralConfigSchema = new Schema<IReferralConfig>({
  isEnabled: {
    type: Boolean,
    default: false
  },
  referrerRewardAmount: {
    type: Number,
    default: 15,
    min: 0
  },
  referredCustomerDiscountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  referredCustomerDiscountValue: {
    type: Number,
    default: 10,
    min: 0
  },
  referredCustomerDiscountMaxAmount: {
    type: Number,
    default: 25,
    min: 0
  },
  referredProfessionalCommissionReduction: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },
  referredProfessionalBenefitBookings: {
    type: Number,
    default: 3,
    min: 0
  },
  referralExpiryDays: {
    type: Number,
    default: 90,
    min: 1
  },
  creditExpiryMonths: {
    type: Number,
    default: 6,
    min: 1
  },
  maxReferralsPerUser: {
    type: Number,
    default: 50,
    min: 1
  },
  minBookingAmountForTrigger: {
    type: Number,
    default: 25,
    min: 0
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModified: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Singleton: only one config document
referralConfigSchema.index({}, { unique: true });

referralConfigSchema.statics.getCurrentConfig = async function(): Promise<IReferralConfig> {
  let config = await this.findOne();

  if (!config) {
    const defaultAdmin = await mongoose.model('User').findOne({ role: 'admin' });

    config = await this.create({
      isEnabled: false,
      referrerRewardAmount: 15,
      referredCustomerDiscountType: 'percentage',
      referredCustomerDiscountValue: 10,
      referredCustomerDiscountMaxAmount: 25,
      referredProfessionalCommissionReduction: 50,
      referredProfessionalBenefitBookings: 3,
      referralExpiryDays: 90,
      creditExpiryMonths: 6,
      maxReferralsPerUser: 50,
      minBookingAmountForTrigger: 25,
      lastModifiedBy: defaultAdmin?._id,
      lastModified: new Date()
    });
  }

  return config;
};

const ReferralConfig = mongoose.model('ReferralConfig', referralConfigSchema) as unknown as IReferralConfigModel;

export default ReferralConfig;
