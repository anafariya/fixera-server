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
