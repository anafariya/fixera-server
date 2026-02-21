import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IPlatformSettings extends Document {
  commissionPercent: number;
  lastModifiedBy: mongoose.Types.ObjectId;
  lastModified: Date;
  version: number;
}

export interface IPlatformSettingsModel extends Model<IPlatformSettings> {
  getCurrentConfig(): Promise<IPlatformSettings>;
}

const platformSettingsSchema = new Schema<IPlatformSettings>({
  commissionPercent: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 0,
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  lastModified: {
    type: Date,
    default: Date.now,
  },
  version: {
    type: Number,
    default: 1,
  },
}, {
  timestamps: true,
});

// Single-document pattern
platformSettingsSchema.index({}, { unique: true });

// Pre-save: clamp commission, increment version, update timestamp
platformSettingsSchema.pre('save', function (next) {
  this.commissionPercent = Math.min(Math.max(this.commissionPercent, 0), 100);
  this.version += 1;
  this.lastModified = new Date();
  next();
});

// Static method to get current config or create default seeded from env var
platformSettingsSchema.statics.getCurrentConfig = async function (): Promise<IPlatformSettings> {
  let config = await this.findOne();

  if (!config) {
    const parsed = Number.parseFloat(process.env.STRIPE_PLATFORM_COMMISSION_PERCENT || '0');
    const seedValue = Number.isFinite(parsed) ? parsed : 0;

    const defaultAdmin = await mongoose.model('User').findOne({ role: 'admin' });

    config = await this.create({
      commissionPercent: seedValue,
      lastModifiedBy: defaultAdmin?._id,
      lastModified: new Date(),
      version: 1,
    });
  }

  return config;
};

const PlatformSettings = mongoose.model<IPlatformSettings, IPlatformSettingsModel>(
  'PlatformSettings',
  platformSettingsSchema
);

export default PlatformSettings;
