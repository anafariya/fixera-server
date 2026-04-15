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

  let maxSeq = 0;
  if (latest) {
    const match = (latest[field] as string).match(regex);
    if (match) {
      maxSeq = parseInt(match[1], 10);
    }
  }

  const nextSeq = maxSeq + 1;
  const countersCollection = db.collection<{ _id: string; seq: number }>('counters');
  await countersCollection.updateOne(
    { _id: key },
    { $max: { seq: nextSeq } },
    { upsert: true }
  );

  return `${prefix}-${String(nextSeq).padStart(6, '0')}`;
};
