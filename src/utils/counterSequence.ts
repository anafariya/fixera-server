import mongoose from 'mongoose';

export const getNextSequence = async (key: string, prefix: string): Promise<string> => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error(`Database unavailable: cannot generate ${key}`);
  }

  const field = key.startsWith('bookingNumber') ? 'bookingNumber'
    : key.startsWith('quotationNumber') ? 'quotationNumber'
    : null;

  const collection = field ? 'bookings' : null;
  let maxSeq = 0;

  if (collection && field) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = `^${escapedPrefix}-(\\d+)$`;

    const [result] = await db.collection(collection).aggregate([
      { $match: { [field]: { $regex: regexPattern } } },
      {
        $project: {
          numericSeq: {
            $toInt: {
              $arrayElemAt: [
                { $getField: { field: 'captures', input: { $regexFind: { input: `$${field}`, regex: regexPattern } } } },
                0,
              ],
            },
          },
        },
      },
      { $sort: { numericSeq: -1 } },
      { $limit: 1 },
    ]).toArray();

    maxSeq = result?.numericSeq ?? 0;
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}-${String(nextSeq).padStart(6, '0')}`;
};
