import { Request, Response, NextFunction } from "express";
import User, { IUser } from "../../models/user";
import connecToDatabase from "../../config/db";
import jwt from 'jsonwebtoken';
import { upload, uploadToS3, deleteFromS3, generateFileName, validateFile } from "../../utils/s3Upload";

// Upload ID proof
export const uploadIdProof = async (req: Request, res: Response, next: NextFunction) => {
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
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        msg: "User not found"
      });
    }

    // Check if user is a professional
    if (user.role !== 'professional') {
      return res.status(403).json({
        success: false,
        msg: "ID proof upload is only available for professionals"
      });
    }

    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        msg: "No file uploaded"
      });
    }

    // Validate file
    const validation = validateFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        msg: validation.error
      });
    }

    console.log(`📄 ID Proof: Processing upload for user ${user.email}`);
    
    // Delete existing file if any
    if (user.idProofUrl && user.idProofFileName) {
      try {
        // Extract key from URL or use filename
        const existingKey = user.idProofFileName.startsWith('id-proof/') 
          ? user.idProofFileName 
          : `id-proof/${user._id}/${user.idProofFileName}`;
        await deleteFromS3(existingKey);
        console.log(`🗑️ ID Proof: Deleted existing file for ${user.email}`);
      } catch (error) {
        console.warn(`⚠️ ID Proof: Could not delete existing file:`, error);
      }
    }

    // Generate unique filename
    const fileName = generateFileName(req.file.originalname, user._id.toString(), 'id-proof');

    // Upload to S3
    const uploadResult = await uploadToS3(req.file, fileName);

    // Update user record
    user.idProofUrl = uploadResult.url;
    user.idProofFileName = uploadResult.key;
    user.idProofUploadedAt = new Date();
    user.isIdVerified = false; // Reset verification status when new file is uploaded
    await user.save();

    console.log(`✅ ID Proof: Successfully uploaded for ${user.email}`);

    // Return updated user data (without password)
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isEmailVerified: user.isEmailVerified || false,
      isPhoneVerified: user.isPhoneVerified || false,
      vatNumber: user.vatNumber,
      isVatVerified: user.isVatVerified || false,
      idProofUrl: user.idProofUrl,
      idProofFileName: user.idProofFileName,
      idProofUploadedAt: user.idProofUploadedAt,
      isIdVerified: user.isIdVerified || false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    return res.status(200).json({
      success: true,
      msg: "ID proof uploaded successfully",
      user: userResponse
    });

  } catch (error: any) {
    console.error('ID proof upload error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to upload ID proof"
    });
  }
};

// Update professional profile
export const updateProfessionalProfile = async (req: Request, res: Response, next: NextFunction) => {
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

    const { 
      businessInfo, 
      hourlyRate, 
      currency, 
      serviceCategories, 
      availability,
      blockedDates 
    } = req.body;

    await connecToDatabase();
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        msg: "User not found"
      });
    }

    // Check if user is a professional
    if (user.role !== 'professional') {
      return res.status(403).json({
        success: false,
        msg: "Professional profile updates are only available for professionals"
      });
    }

    console.log(`👤 Profile: Updating professional profile for ${user.email}`);

    // Update fields if provided
    if (businessInfo) {
      user.businessInfo = {
        ...user.businessInfo,
        ...businessInfo
      };
    }

    if (hourlyRate !== undefined) {
      if (hourlyRate < 0 || hourlyRate > 10000) {
        return res.status(400).json({
          success: false,
          msg: "Hourly rate must be between 0 and 10000"
        });
      }
      user.hourlyRate = hourlyRate;
    }

    if (currency) {
      const allowedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
      if (!allowedCurrencies.includes(currency)) {
        return res.status(400).json({
          success: false,
          msg: "Invalid currency. Allowed: USD, EUR, GBP, CAD, AUD"
        });
      }
      user.currency = currency;
    }

    if (serviceCategories) {
      if (!Array.isArray(serviceCategories)) {
        return res.status(400).json({
          success: false,
          msg: "Service categories must be an array"
        });
      }
      user.serviceCategories = serviceCategories;
    }

    if (availability) {
      user.availability = {
        ...user.availability,
        ...availability
      };
    }

    if (blockedDates) {
      if (!Array.isArray(blockedDates)) {
        return res.status(400).json({
          success: false,
          msg: "Blocked dates must be an array"
        });
      }
      user.blockedDates = blockedDates.map(date => new Date(date));
    }

    // Mark profile as completed if key fields are filled
    if (user.businessInfo?.companyName && user.hourlyRate && user.serviceCategories?.length) {
      user.profileCompletedAt = new Date();
    }

    await user.save();

    console.log(`✅ Profile: Successfully updated professional profile for ${user.email}`);

    // Return updated user data (without password)
    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isEmailVerified: user.isEmailVerified || false,
      isPhoneVerified: user.isPhoneVerified || false,
      vatNumber: user.vatNumber,
      isVatVerified: user.isVatVerified || false,
      idProofUrl: user.idProofUrl,
      idProofFileName: user.idProofFileName,
      idProofUploadedAt: user.idProofUploadedAt,
      isIdVerified: user.isIdVerified || false,
      businessInfo: user.businessInfo,
      hourlyRate: user.hourlyRate,
      currency: user.currency,
      serviceCategories: user.serviceCategories,
      availability: user.availability,
      blockedDates: user.blockedDates,
      profileCompletedAt: user.profileCompletedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    return res.status(200).json({
      success: true,
      msg: "Professional profile updated successfully",
      user: userResponse
    });

  } catch (error: any) {
    console.error('Professional profile update error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to update professional profile"
    });
  }
};