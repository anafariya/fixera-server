import mongoose from "mongoose";
import { randomUUID } from "crypto";
import os from "os";
import WarrantyClaim from "../models/warrantyClaim";
import {
  autoCloseResolvedWarrantyClaim,
  autoEscalateWarrantyClaim,
} from "../handlers/WarrantyClaim";

const LOCK_COLLECTION = "schedulerLocks";
const LOCK_ID = "warranty-claim-check";
const LOCK_TTL_MS = 15 * 60 * 1000;
const LOCK_REFRESH_MS = 5 * 60 * 1000;
const RUN_INTERVAL_MS = 12 * 60 * 60 * 1000;

interface LockDoc {
  _id: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface WarrantyClaimSchedulerHandle {
  stop: () => void;
  ready: Promise<void>;
}

const getLocksCollection = () => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB connection is not ready for scheduler lock setup");
  }
  return db.collection<LockDoc>(LOCK_COLLECTION);
};

const ensureLockIndexes = async () => {
  const locksCollection = getLocksCollection();
  await locksCollection
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "warranty_claim_expiresAt_ttl" })
    .catch((error) => {
      console.warn(
        `[Warranty Scheduler] Failed to create index "warranty_claim_expiresAt_ttl" on "${LOCK_COLLECTION}":`,
        error
      );
      throw error;
    });
};

const acquireLock = async (ownerId: string): Promise<boolean> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
  const locksCollection = getLocksCollection();

  try {
    await locksCollection.insertOne({
      _id: LOCK_ID,
      ownerId,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });
    return true;
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
  }

  const updateResult = await locksCollection.updateOne(
    { _id: LOCK_ID, expiresAt: { $lte: now } },
    { $set: { ownerId, updatedAt: now, expiresAt } }
  );
  return updateResult.modifiedCount === 1;
};

const refreshLock = async (ownerId: string): Promise<boolean> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
  const locksCollection = getLocksCollection();
  const result = await locksCollection.updateOne(
    { _id: LOCK_ID, ownerId },
    { $set: { updatedAt: now, expiresAt } }
  );
  return result.modifiedCount === 1;
};

const releaseLock = async (ownerId: string) => {
  const locksCollection = getLocksCollection();
  await locksCollection.deleteOne({ _id: LOCK_ID, ownerId });
};

export const runWarrantyClaimChecks = async () => {
  const now = new Date();
  let escalated = 0;
  let closed = 0;
  const errors: string[] = [];

  console.log(`[Warranty Scheduler] ⏳ Running checks at ${now.toISOString()}`);

  const [staleOpenClaims, overdueResolvedClaims] = await Promise.all([
    WarrantyClaim.find({
      status: "open",
      "sla.professionalResponseDueAt": { $exists: true, $lte: now },
    }),
    WarrantyClaim.find({
      status: "resolved",
      "sla.customerConfirmationDueAt": { $exists: true, $lte: now },
    }),
  ]);

  console.log(`[Warranty Scheduler] Found ${staleOpenClaims.length} stale open claim(s) to escalate`);
  console.log(`[Warranty Scheduler] Found ${overdueResolvedClaims.length} overdue resolved claim(s) to auto-close`);

  for (const claim of staleOpenClaims) {
    try {
      console.log(`[Warranty Scheduler] Escalating claim ${(claim as any).claimNumber || claim._id} (professional response due: ${(claim as any).sla?.professionalResponseDueAt})`);
      await autoEscalateWarrantyClaim(claim);
      escalated++;
      console.log(`[Warranty Scheduler] ✅ Escalated claim ${(claim as any).claimNumber || claim._id}`);
    } catch (error) {
      const msg = `Failed to auto-escalate claim ${claim._id}`;
      console.error(`[Warranty Scheduler] ❌ ${msg}:`, error);
      errors.push(msg);
    }
  }

  for (const claim of overdueResolvedClaims) {
    try {
      console.log(`[Warranty Scheduler] Auto-closing claim ${(claim as any).claimNumber || claim._id} (customer confirmation due: ${(claim as any).sla?.customerConfirmationDueAt})`);
      await autoCloseResolvedWarrantyClaim(claim);
      closed++;
      console.log(`[Warranty Scheduler] ✅ Auto-closed claim ${(claim as any).claimNumber || claim._id}`);
    } catch (error) {
      const msg = `Failed to auto-close claim ${claim._id}`;
      console.error(`[Warranty Scheduler] ❌ ${msg}:`, error);
      errors.push(msg);
    }
  }

  console.log(`[Warranty Scheduler] ✅ Done — escalated: ${escalated}, closed: ${closed}, errors: ${errors.length}`);
  return { escalated, closed, errors };
};

const runWithLock = async (ownerId: string) => {
  let lockAcquired = false;
  let lockRefreshHandle: NodeJS.Timeout | null = null;

  try {
    lockAcquired = await acquireLock(ownerId);
    if (!lockAcquired) {
      console.log("[Warranty Scheduler] Lock not acquired; skipping run.");
      return;
    }

    lockRefreshHandle = setInterval(async () => {
      try {
        await refreshLock(ownerId);
      } catch (error) {
        console.warn("[Warranty Scheduler] Lock refresh failed:", error);
      }
    }, LOCK_REFRESH_MS);

    await runWarrantyClaimChecks();
  } catch (error) {
    console.error("[Warranty Scheduler] Run failed:", error);
  } finally {
    if (lockRefreshHandle) clearInterval(lockRefreshHandle);
    if (lockAcquired) {
      try {
        await releaseLock(ownerId);
      } catch (error) {
        console.error("[Warranty Scheduler] Failed to release lock:", error);
      }
    }
  }
};

export const startWarrantyClaimScheduler = (): WarrantyClaimSchedulerHandle => {
  const ownerId = `${os.hostname()}-${process.pid}-${randomUUID()}`;
  let intervalHandle: NodeJS.Timeout | null = null;
  let stopped = false;

  const ready = (async () => {
    try {
      await ensureLockIndexes();
    } catch (error) {
      console.error("[Warranty Scheduler] Failed to initialize lock indexes:", error);
    }

    await runWithLock(ownerId);

    if (!stopped) {
      intervalHandle = setInterval(() => {
        void runWithLock(ownerId);
      }, RUN_INTERVAL_MS);
      console.log("[Warranty Scheduler] Started, running every 12 hours");
    }
  })();

  return {
    stop: () => {
      stopped = true;
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
      }
    },
    ready,
  };
};
