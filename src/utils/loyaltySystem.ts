import User, { IUser } from "../models/user";

export interface LoyaltyCalculation {
  points: number;
  level: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  nextLevelPoints?: number;
  nextLevel?: string;
  progress?: number; // percentage to next level
}

// Points earning rates
export const LOYALTY_RATES = {
  SPENDING_MULTIPLIER: 1, // 1 point per $1 spent
  BOOKING_BONUS: 50, // 50 points per completed booking
  
  // Level thresholds (points required)
  LEVELS: {
    Bronze: 0,
    Silver: 500,
    Gold: 1500,
    Platinum: 3000
  }
};

// Calculate loyalty points based on spending and bookings
export const calculateLoyaltyPoints = (totalSpent: number, totalBookings: number): number => {
  const spendingPoints = Math.floor(totalSpent * LOYALTY_RATES.SPENDING_MULTIPLIER);
  const bookingPoints = totalBookings * LOYALTY_RATES.BOOKING_BONUS;
  
  const totalPoints = spendingPoints + bookingPoints;
  
  console.log(`🏆 Loyalty: Calculated points - Spending: $${totalSpent} = ${spendingPoints}pts, Bookings: ${totalBookings} = ${bookingPoints}pts, Total: ${totalPoints}pts`);
  
  return totalPoints;
};

// Determine loyalty level based on points
export const getLoyaltyLevel = (points: number): 'Bronze' | 'Silver' | 'Gold' | 'Platinum' => {
  if (points >= LOYALTY_RATES.LEVELS.Platinum) return 'Platinum';
  if (points >= LOYALTY_RATES.LEVELS.Gold) return 'Gold';
  if (points >= LOYALTY_RATES.LEVELS.Silver) return 'Silver';
  return 'Bronze';
};

// Get next level information
export const getNextLevelInfo = (currentPoints: number): { nextLevel: string; pointsNeeded: number; progress: number } | null => {
  const currentLevel = getLoyaltyLevel(currentPoints);
  
  let nextLevel: string;
  let nextLevelPoints: number;
  
  switch (currentLevel) {
    case 'Bronze':
      nextLevel = 'Silver';
      nextLevelPoints = LOYALTY_RATES.LEVELS.Silver;
      break;
    case 'Silver':
      nextLevel = 'Gold';
      nextLevelPoints = LOYALTY_RATES.LEVELS.Gold;
      break;
    case 'Gold':
      nextLevel = 'Platinum';
      nextLevelPoints = LOYALTY_RATES.LEVELS.Platinum;
      break;
    case 'Platinum':
      return null; // Already at max level
  }
  
  const pointsNeeded = nextLevelPoints - currentPoints;
  const progress = Math.min(100, Math.round((currentPoints / nextLevelPoints) * 100));
  
  return {
    nextLevel,
    pointsNeeded,
    progress
  };
};

// Full loyalty calculation with all info
export const calculateLoyaltyStatus = (totalSpent: number, totalBookings: number): LoyaltyCalculation => {
  const points = calculateLoyaltyPoints(totalSpent, totalBookings);
  const level = getLoyaltyLevel(points);
  const nextLevelInfo = getNextLevelInfo(points);
  
  return {
    points,
    level,
    nextLevelPoints: nextLevelInfo?.pointsNeeded,
    nextLevel: nextLevelInfo?.nextLevel,
    progress: nextLevelInfo?.progress
  };
};

// Update user's loyalty status
export const updateUserLoyalty = async (userId: string, additionalSpending: number = 0, additionalBookings: number = 0): Promise<IUser | null> => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.error(`❌ Loyalty: User not found: ${userId}`);
      return null;
    }

    // Only update for customers (not professionals or admins)
    if (user.role !== 'customer') {
      console.log(`ℹ️ Loyalty: Skipping loyalty update for ${user.role}: ${user.email}`);
      return user;
    }

    // Update totals
    const newTotalSpent = (user.totalSpent || 0) + additionalSpending;
    const newTotalBookings = (user.totalBookings || 0) + additionalBookings;
    
    // Calculate new loyalty status
    const loyaltyStatus = calculateLoyaltyStatus(newTotalSpent, newTotalBookings);
    
    // Check if level changed
    const oldLevel = user.loyaltyLevel || 'Bronze';
    const levelChanged = oldLevel !== loyaltyStatus.level;
    
    // Update user
    user.totalSpent = newTotalSpent;
    user.totalBookings = newTotalBookings;
    user.loyaltyPoints = loyaltyStatus.points;
    user.loyaltyLevel = loyaltyStatus.level;
    user.lastLoyaltyUpdate = new Date();
    
    await user.save();
    
    if (levelChanged) {
      console.log(`🎉 Loyalty: Level up! ${user.email} promoted from ${oldLevel} to ${loyaltyStatus.level}`);
    }
    
    console.log(`🏆 Loyalty: Updated ${user.email} - Spent: $${newTotalSpent}, Bookings: ${newTotalBookings}, Points: ${loyaltyStatus.points}, Level: ${loyaltyStatus.level}`);
    
    return user;
  } catch (error) {
    console.error('❌ Loyalty: Update failed:', error);
    return null;
  }
};

// Recalculate all users' loyalty (for admin/maintenance)
export const recalculateAllLoyalty = async (): Promise<{ updated: number; errors: number }> => {
  try {
    const customers = await User.find({ role: 'customer' });
    let updated = 0;
    let errors = 0;
    
    console.log(`🔄 Loyalty: Recalculating loyalty for ${customers.length} customers...`);
    
    for (const customer of customers) {
      try {
        const loyaltyStatus = calculateLoyaltyStatus(customer.totalSpent || 0, customer.totalBookings || 0);
        
        customer.loyaltyPoints = loyaltyStatus.points;
        customer.loyaltyLevel = loyaltyStatus.level;
        customer.lastLoyaltyUpdate = new Date();
        
        await customer.save();
        updated++;
      } catch (error) {
        console.error(`❌ Loyalty: Failed to update ${customer.email}:`, error);
        errors++;
      }
    }
    
    console.log(`✅ Loyalty: Recalculation complete - Updated: ${updated}, Errors: ${errors}`);
    
    return { updated, errors };
  } catch (error) {
    console.error('❌ Loyalty: Recalculation failed:', error);
    return { updated: 0, errors: 1 };
  }
};

// Get loyalty level benefits (for future use)
export const getLoyaltyBenefits = (level: string): string[] => {
  switch (level) {
    case 'Bronze':
      return ['Standard customer support', 'Basic booking features'];
    case 'Silver':
      return ['5% discount on services', 'Priority customer support', 'Early access to new professionals'];
    case 'Gold':
      return ['10% discount on services', 'Free service call fees', 'Dedicated account manager', 'Monthly loyalty rewards'];
    case 'Platinum':
      return ['15% discount on services', 'Free cancellations', 'Premium support line', 'Exclusive seasonal offers', 'VIP badge'];
    default:
      return [];
  }
};