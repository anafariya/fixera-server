import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user";

dotenv.config();

async function dedupeStripeAccountIds(apply = false) {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI or MONGODB_URI not found in environment variables");
  }

  const initialReadyState = mongoose.connection.readyState;
  const shouldOpenConnection = initialReadyState === 0;
  let openedConnection = false;

  try {
    if (shouldOpenConnection) {
      await mongoose.connect(mongoUri);
      openedConnection = true;
      console.log("Connected to MongoDB");
    } else {
      console.log("Using existing MongoDB connection");
    }

    const duplicates = await User.aggregate([
      { $match: { "stripe.accountId": { $exists: true, $ne: null } } },
      { $sort: { createdAt: 1, _id: 1 } },
      {
        $group: {
          _id: "$stripe.accountId",
          userIds: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ]);

    if (duplicates.length === 0) {
      console.log("No duplicate stripe.accountId values found.");
      return;
    }

    console.warn(`Found ${duplicates.length} duplicate stripe.accountId values.`);

    for (const dup of duplicates) {
      const [primaryUserId, ...duplicateUserIds] = dup.userIds;
      console.log(
        `stripe.accountId=${dup._id} primary=${primaryUserId} duplicates=${duplicateUserIds.join(",")}`
      );

      if (apply && duplicateUserIds.length > 0) {
        await User.updateMany(
          { _id: { $in: duplicateUserIds } },
          {
            $unset: { stripe: "" },
          }
        );
        console.log(`Cleared stripe field for ${duplicateUserIds.length} duplicate users.`);
      }
    }

    if (!apply) {
      console.log("Dry run complete. Re-run with APPLY_CHANGES=true to clear duplicates.");
    }
  } finally {
    if (openedConnection) {
      await mongoose.disconnect();
      console.log("Disconnected from MongoDB");
    }
  }
}

if (require.main === module) {
  const apply = process.env.APPLY_CHANGES === "true";
  dedupeStripeAccountIds(apply)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Stripe account dedupe failed:", error);
      process.exit(1);
    });
}

export { dedupeStripeAccountIds };
