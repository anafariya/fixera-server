import { resyncCounter } from './counterSequence';

const MAX_RETRIES = 2;

export const saveBookingWithRetry = async (doc: any): Promise<any> => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await doc.save();
    } catch (error: any) {
      if (error?.code !== 11000 || attempt === MAX_RETRIES) {
        throw error;
      }

      const year = new Date().getFullYear();

      if (error.keyPattern?.bookingNumber) {
        doc.bookingNumber = await resyncCounter(`bookingNumber-${year}`, `BK-${year}`);
      } else if (error.keyPattern?.quotationNumber) {
        const newNumber = await resyncCounter(`quotationNumber-${year}`, `QT-${year}`);
        doc.quotationNumber = newNumber;
        if (Array.isArray(doc.quoteVersions)) {
          for (const version of doc.quoteVersions) {
            if (version.quotationNumber) {
              version.quotationNumber = newNumber;
            }
          }
        }
      } else {
        throw error;
      }
    }
  }
};
