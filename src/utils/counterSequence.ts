import mongoose from 'mongoose';

export const getNextSequence = async (key: string, prefix: string): Promise<string> => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error(`Database unavailable: cannot generate ${key}`);
  }
  const countersCollection = db.collection<{ _id: string; seq: number }>('counters');

  const counter = await countersCollection.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  if (!counter?.seq) {
    throw new Error(`Failed to generate ${key}: counter upsert returned ${JSON.stringify(counter)}`);
  }
  return `${prefix}-${String(counter.seq).padStart(6, '0')}`;
};

export const resyncCounter = async (key: string, prefix: string): Promise<string> => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error(`Database unavailable: cannot resync ${key}`);
  }

  const field = key.startsWith('bookingNumber') ? 'bookingNumber' : 'quotationNumber';
  const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);

  const [latest] = await db.collection('bookings')
    .find({ [field]: { $regex: regex } })
    .sort({ [field]: -1 })
    .limit(1)
    .toArray();

  let latestPersistedSeq = 0;
  if (latest) {
    const match = (latest[field] as string).match(regex);
    if (match) {
      latestPersistedSeq = parseInt(match[1], 10);
    }
  }

  const countersCollection = db.collection<{ _id: string; seq: number }>('counters');
  const counter = await countersCollection.findOneAndUpdate(
    { _id: key },
    [
      { $set: { seq: { $add: [{ $max: [{ $ifNull: ['$seq', 0] }, latestPersistedSeq] }, 1] } } },
    ],
    { upsert: true, returnDocument: 'after' }
  );

  const seq = counter?.seq;
  if (!seq) {
    throw new Error(`Failed to resync ${key}: counter returned ${JSON.stringify(counter)}`);
  }
  return `${prefix}-${String(seq).padStart(6, '0')}`;
};
