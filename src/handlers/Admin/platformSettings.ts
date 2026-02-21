import { Request, Response, NextFunction } from "express";
import User from "../../models/user";
import PlatformSettings from "../../models/platformSettings";
import connecToDatabase from "../../config/db";
import jwt from 'jsonwebtoken';

// Get current platform settings
export const getPlatformSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.['auth-token'];

    if (!token) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required"
      });
    }

    let decoded: { id: string } | null = null;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    } catch (err) {
      return res.status(401).json({
        success: false,
        msg: "Invalid authentication token"
      });
    }

    await connecToDatabase();
    const adminUser = await User.findById(decoded.id);

    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        msg: "Admin access required"
      });
    }

    const config = await PlatformSettings.getCurrentConfig();

    return res.status(200).json({
      success: true,
      data: {
        commissionPercent: config.commissionPercent,
        lastModified: config.lastModified,
        version: config.version,
      }
    });

  } catch (error: any) {
    console.error('Get platform settings error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to retrieve platform settings"
    });
  }
};

// Update platform settings
export const updatePlatformSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.['auth-token'];

    if (!token) {
      return res.status(401).json({
        success: false,
        msg: "Authentication required"
      });
    }

    let decoded: { id: string } | null = null;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    } catch (err) {
      return res.status(401).json({
        success: false,
        msg: "Invalid authentication token"
      });
    }

    const { commissionPercent } = req.body;

    if (typeof commissionPercent !== 'number' || !Number.isFinite(commissionPercent)) {
      return res.status(400).json({
        success: false,
        msg: "commissionPercent must be a valid number"
      });
    }

    if (commissionPercent < 0 || commissionPercent > 100) {
      return res.status(400).json({
        success: false,
        msg: "commissionPercent must be between 0 and 100"
      });
    }

    await connecToDatabase();
    const adminUser = await User.findById(decoded.id);

    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        msg: "Admin access required"
      });
    }

    const config = await PlatformSettings.getCurrentConfig();
    config.commissionPercent = commissionPercent;
    config.lastModifiedBy = adminUser._id as any;
    await config.save();

    console.log(`⚙️  Admin ${adminUser.email} updated platform commission to ${commissionPercent}%`);

    return res.status(200).json({
      success: true,
      data: {
        commissionPercent: config.commissionPercent,
        lastModified: config.lastModified,
        version: config.version,
      }
    });

  } catch (error: any) {
    console.error('Update platform settings error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to update platform settings"
    });
  }
};
