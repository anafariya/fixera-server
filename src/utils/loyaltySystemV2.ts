import User, { IUser } from "../models/user";
import LoyaltyConfig, { ILoyaltyConfig, ILoyaltyTier } from "../models/loyaltyConfig";

export interface LoyaltyCalculation {
  points: number;
  level: string;
  tierInfo: ILoyaltyTier;
  nextTier?: ILoyaltyTier;
  nextTierPoints?: number;
  progress?: number; // percentage to next tier
  pointsToNextTier?: number;
}

export interface PointsEarned {
  fromSpending: number;
  fromBooking: number;
  total: number;
  bookingAmount: number;
  tierUsed: string;
}

// Calculate loyalty points based on current tier configuration
export const calculateLoyaltyPointsV2 = async (
  bookingAmount: number, 
  totalSpent: number = 0,
  includeBookingBonus: boolean = true
): Promise<PointsEarned> => {
  try {
    const config = await LoyaltyConfig.getCurrentConfig();
    
    if (!config.globalSettings.isEnabled) {
      return {
        fromSpending: 0,
        fromBooking: 0,
        total: 0,
        bookingAmount,
        tierUsed: 'Disabled'
      };
    }

    // Check minimum booking amount
    if (bookingAmount < config.globalSettings.minBookingAmount) {
      return {
        fromSpending: 0,
        fromBooking: 0,
        total: 0,
        bookingAmount,
        tierUsed: 'Below Minimum'
      };
    }

    // Find current tier based on total spending
    const currentTier = getCurrentTier(config.tiers, totalSpent);
    
    // Calculate points from spending (percentage-based)
    const spendingPoints = Math.floor(bookingAmount * (currentTier.pointsPercentage / 100));
    
    // Apply rounding rule
    const roundedSpendingPoints = applyRoundingRule(
      bookingAmount * (currentTier.pointsPercentage / 100), 
      config.globalSettings.roundingRule
    );
    
    // Booking bonus points
    const bookingPoints = includeBookingBonus ? currentTier.bookingBonus : 0;
    
    const totalPoints = roundedSpendingPoints + bookingPoints;
    
    console.log(`🏆 Loyalty V2: Calculated points - Amount: $${bookingAmount}, Tier: ${currentTier.name} (${currentTier.pointsPercentage}%), Spending: ${roundedSpendingPoints}pts, Booking: ${bookingPoints}pts, Total: ${totalPoints}pts`);
    
    return {
      fromSpending: roundedSpendingPoints,
      fromBooking: bookingPoints,
      total: totalPoints,
      bookingAmount,
      tierUsed: currentTier.name
    };
    
  } catch (error) {
    console.error('❌ Loyalty V2: Points calculation failed:', error);
    return {
      fromSpending: 0,
      fromBooking: 0,
      total: 0,
      bookingAmount,
      tierUsed: 'Error'
    };
  }
};

// Get current tier based on total spending amount
export const getCurrentTier = (tiers: ILoyaltyTier[], totalSpent: number): ILoyaltyTier => {
  // Find the highest tier the user qualifies for
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (totalSpent >= tiers[i].minSpendingAmount) {
      return tiers[i];
    }
  }
  
  // Default to first tier if no match
  return tiers[0];
};

// Get next tier information
export const getNextTierInfo = (tiers: ILoyaltyTier[], totalSpent: number): {
  nextTier?: ILoyaltyTier;
  amountNeeded?: number;
  progress?: number;
} => {
  const currentTier = getCurrentTier(tiers, totalSpent);
  
  // Find next tier
  const currentIndex = tiers.findIndex(tier => tier.name === currentTier.name);
  const nextTier = currentIndex < tiers.length - 1 ? tiers[currentIndex + 1] : null;
  
  if (!nextTier) {
    return {}; // Already at max tier
  }
  
  const amountNeeded = nextTier.minSpendingAmount - totalSpent;
  const progress = Math.min(100, Math.round((totalSpent / nextTier.minSpendingAmount) * 100));
  
  return {
    nextTier,
    amountNeeded,
    progress
  };
};

// Apply rounding rule to points
const applyRoundingRule = (points: number, rule: 'floor' | 'ceil' | 'round'): number => {
  switch (rule) {
    case 'ceil':
      return Math.ceil(points);
    case 'round':
      return Math.round(points);
    case 'floor':
    default:
      return Math.floor(points);
  }
};

// Full loyalty calculation with tier info
export const calculateLoyaltyStatusV2 = async (
  totalSpent: number = 0,
  currentPoints: number = 0,
  totalBookings: number = 0
): Promise<LoyaltyCalculation> => {
  try {
    const config = await LoyaltyConfig.getCurrentConfig();
    const currentTier = getCurrentTier(config.tiers, totalSpent);
    const nextTierInfo = getNextTierInfo(config.tiers, totalSpent);
    
    return {
      points: currentPoints,
      level: currentTier.name,
      tierInfo: currentTier,
      nextTier: nextTierInfo.nextTier,
      nextTierPoints: nextTierInfo.nextTier?.minSpendingAmount,
      pointsToNextTier: nextTierInfo.amountNeeded,
      progress: nextTierInfo.progress
    };
    
  } catch (error) {
    console.error('❌ Loyalty V2: Status calculation failed:', error);
    
    // Fallback to Bronze tier
    return {
      points: currentPoints,
      level: 'Bronze',
      tierInfo: {
        name: 'Bronze',
        minSpendingAmount: 0,
        pointsPercentage: 1,
        bookingBonus: 25,
        benefits: ['Standard customer support'],
        color: '#CD7F32',
        icon: 'bronze-medal',
        isActive: true,
        order: 1
      } as ILoyaltyTier
    };
  }
};

// Update user's loyalty status with new system
export const updateUserLoyaltyV2 = async (
  userId: string, 
  bookingAmount: number,
  includeBookingBonus: boolean = true
): Promise<{ user: IUser | null; pointsEarned: PointsEarned; leveledUp: boolean; oldLevel: string }> => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.error(`❌ Loyalty V2: User not found: ${userId}`);
      return {
        user: null,
        pointsEarned: {
          fromSpending: 0,
          fromBooking: 0,
          total: 0,
          bookingAmount,
          tierUsed: 'User Not Found'
        },
        leveledUp: false,
        oldLevel: 'Unknown'
      };
    }

    // Only update for customers
    if (user.role !== 'customer') {
      console.log(`ℹ️ Loyalty V2: Skipping loyalty update for ${user.role}: ${user.email}`);
      return {
        user,
        pointsEarned: {
          fromSpending: 0,
          fromBooking: 0,
          total: 0,
          bookingAmount,
          tierUsed: 'Non-Customer'
        },
        leveledUp: false,
        oldLevel: user.loyaltyLevel || 'Bronze'
      };
    }

    const currentPoints = user.loyaltyPoints || 0;
    const currentTotalSpent = user.totalSpent || 0;
    const oldLevel = user.loyaltyLevel || 'Bronze';

    // Calculate points earned from this booking (based on current tier from total spending)
    const pointsEarned = await calculateLoyaltyPointsV2(
      bookingAmount,
      currentTotalSpent,
      includeBookingBonus
    );

    // Update user totals
    const newTotalPoints = currentPoints + pointsEarned.total;
    const newTotalSpent = (user.totalSpent || 0) + bookingAmount;
    const newTotalBookings = (user.totalBookings || 0) + (includeBookingBonus ? 1 : 0);

    // Calculate new tier (based on spending amount, not points)
    const newLoyaltyStatus = await calculateLoyaltyStatusV2(
      newTotalSpent,
      newTotalPoints,
      newTotalBookings
    );

    const leveledUp = oldLevel !== newLoyaltyStatus.level;

    // Update user
    user.loyaltyPoints = newTotalPoints;
    user.loyaltyLevel = newLoyaltyStatus.level as 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
    user.totalSpent = newTotalSpent;
    user.totalBookings = newTotalBookings;
    user.lastLoyaltyUpdate = new Date();

    await user.save();

    if (leveledUp) {
      console.log(`🎉 Loyalty V2: Level up! ${user.email} promoted from ${oldLevel} to ${newLoyaltyStatus.level}`);
    }

    console.log(`🏆 Loyalty V2: Updated ${user.email} - Booking: $${bookingAmount}, Points Earned: ${pointsEarned.total}, Total Points: ${newTotalPoints}, Level: ${newLoyaltyStatus.level}`);

    return {
      user,
      pointsEarned,
      leveledUp,
      oldLevel
    };

  } catch (error) {
    console.error('❌ Loyalty V2: Update failed:', error);
    return {
      user: null,
      pointsEarned: {
        fromSpending: 0,
        fromBooking: 0,
        total: 0,
        bookingAmount,
        tierUsed: 'Error'
      },
      leveledUp: false,
      oldLevel: 'Unknown'
    };
  }
};

// Get loyalty benefits for a user
export const getUserLoyaltyBenefits = async (userId: string): Promise<string[]> => {
  try {
    const user = await User.findById(userId);
    if (!user || user.role !== 'customer') {
      return [];
    }

    const loyaltyStatus = await calculateLoyaltyStatusV2(user.totalSpent || 0, user.loyaltyPoints || 0);
    return loyaltyStatus.tierInfo.benefits;

  } catch (error) {
    console.error('❌ Loyalty V2: Benefits lookup failed:', error);
    return [];
  }
};

// Simulate booking points (for testing)
export const simulateBookingPoints = async (userId: string, bookingAmount: number): Promise<any> => {
  const result = await updateUserLoyaltyV2(userId, bookingAmount, true);
  return {
    success: true,
    data: {
      pointsEarned: result.pointsEarned,
      leveledUp: result.leveledUp,
      oldLevel: result.oldLevel,
      newLevel: result.user?.loyaltyLevel,
      totalPoints: result.user?.loyaltyPoints,
      totalSpent: result.user?.totalSpent
    }
  };
};