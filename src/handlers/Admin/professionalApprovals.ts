import { Request, Response, NextFunction } from "express";
import User, { IUser } from "../../models/user";
import connecToDatabase from "../../config/db";
import jwt from 'jsonwebtoken';

// Get all professionals pending approval
export const getPendingProfessionals = async (req: Request, res: Response, next: NextFunction) => {
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

    // Get professionals with specified status
    const status = req.query.status as string || 'pending';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const professionals = await User.find({
      role: 'professional',
      professionalStatus: status
    })
    .select('-password -verificationCode -verificationCodeExpires')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await User.countDocuments({
      role: 'professional',
      professionalStatus: status
    });

    console.log(`👑 Admin: Retrieved ${professionals.length} professionals with status ${status} for ${adminUser.email}`);

    return res.status(200).json({
      success: true,
      data: {
        professionals,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error: any) {
    console.error('Get pending professionals error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to retrieve professionals"
    });
  }
};

// Get professional details for approval
export const getProfessionalDetails = async (req: Request, res: Response, next: NextFunction) => {
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

    const { professionalId } = req.params;

    await connecToDatabase();
    const adminUser = await User.findById(decoded.id);

    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        msg: "Admin access required"
      });
    }

    const professional = await User.findOne({
      _id: professionalId,
      role: 'professional'
    }).select('-password -verificationCode -verificationCodeExpires');

    if (!professional) {
      return res.status(404).json({
        success: false,
        msg: "Professional not found"
      });
    }

    console.log(`👑 Admin: Retrieved professional details for ${professional.email}`);

    return res.status(200).json({
      success: true,
      data: {
        professional
      }
    });

  } catch (error: any) {
    console.error('Get professional details error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to retrieve professional details"
    });
  }
};

// Approve professional
export const approveProfessional = async (req: Request, res: Response, next: NextFunction) => {
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

    const { professionalId } = req.params;

    await connecToDatabase();
    const adminUser = await User.findById(decoded.id);

    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        msg: "Admin access required"
      });
    }

    const professional = await User.findOne({
      _id: professionalId,
      role: 'professional'
    });

    if (!professional) {
      return res.status(404).json({
        success: false,
        msg: "Professional not found"
      });
    }

    if (professional.professionalStatus === 'approved') {
      return res.status(400).json({
        success: false,
        msg: "Professional is already approved"
      });
    }

    // Update professional status
    professional.professionalStatus = 'approved';
    professional.approvedBy = adminUser._id.toString();
    professional.approvedAt = new Date();
    professional.rejectionReason = undefined; // Clear any previous rejection reason
    await professional.save();

    console.log(`✅ Admin: Professional ${professional.email} approved by ${adminUser.email}`);

    return res.status(200).json({
      success: true,
      msg: "Professional approved successfully",
      data: {
        professional: {
          _id: professional._id,
          name: professional.name,
          email: professional.email,
          professionalStatus: professional.professionalStatus,
          approvedBy: professional.approvedBy,
          approvedAt: professional.approvedAt
        }
      }
    });

  } catch (error: any) {
    console.error('Approve professional error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to approve professional"
    });
  }
};

// Reject professional
export const rejectProfessional = async (req: Request, res: Response, next: NextFunction) => {
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

    const { professionalId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        msg: "Rejection reason is required and must be at least 10 characters"
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

    const professional = await User.findOne({
      _id: professionalId,
      role: 'professional'
    });

    if (!professional) {
      return res.status(404).json({
        success: false,
        msg: "Professional not found"
      });
    }

    // Update professional status
    professional.professionalStatus = 'rejected';
    professional.rejectionReason = reason.trim();
    professional.approvedBy = undefined;
    professional.approvedAt = undefined;
    await professional.save();

    console.log(`❌ Admin: Professional ${professional.email} rejected by ${adminUser.email}`);

    return res.status(200).json({
      success: true,
      msg: "Professional rejected successfully",
      data: {
        professional: {
          _id: professional._id,
          name: professional.name,
          email: professional.email,
          professionalStatus: professional.professionalStatus,
          rejectionReason: professional.rejectionReason
        }
      }
    });

  } catch (error: any) {
    console.error('Reject professional error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to reject professional"
    });
  }
};

// Suspend professional
export const suspendProfessional = async (req: Request, res: Response, next: NextFunction) => {
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

    const { professionalId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        msg: "Suspension reason is required and must be at least 10 characters"
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

    const professional = await User.findOne({
      _id: professionalId,
      role: 'professional'
    });

    if (!professional) {
      return res.status(404).json({
        success: false,
        msg: "Professional not found"
      });
    }

    // Update professional status
    professional.professionalStatus = 'suspended';
    professional.rejectionReason = reason.trim();
    await professional.save();

    console.log(`⏸️ Admin: Professional ${professional.email} suspended by ${adminUser.email}`);

    return res.status(200).json({
      success: true,
      msg: "Professional suspended successfully",
      data: {
        professional: {
          _id: professional._id,
          name: professional.name,
          email: professional.email,
          professionalStatus: professional.professionalStatus,
          rejectionReason: professional.rejectionReason
        }
      }
    });

  } catch (error: any) {
    console.error('Suspend professional error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to suspend professional"
    });
  }
};

// Get approval stats for dashboard
export const getApprovalStats = async (req: Request, res: Response, next: NextFunction) => {
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

    // Get counts for each status
    const stats = await Promise.all([
      User.countDocuments({ role: 'professional', professionalStatus: 'pending' }),
      User.countDocuments({ role: 'professional', professionalStatus: 'approved' }),
      User.countDocuments({ role: 'professional', professionalStatus: 'rejected' }),
      User.countDocuments({ role: 'professional', professionalStatus: 'suspended' })
    ]);

    const [pending, approved, rejected, suspended] = stats;
    const total = pending + approved + rejected + suspended;

    console.log(`📊 Admin: Retrieved approval stats for ${adminUser.email}`);

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          pending,
          approved,
          rejected,
          suspended,
          total
        }
      }
    });

  } catch (error: any) {
    console.error('Get approval stats error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to retrieve approval stats"
    });
  }
};