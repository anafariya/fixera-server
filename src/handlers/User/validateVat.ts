import { Request, Response, NextFunction } from "express";
import { validateVATNumber, isValidVATFormat, formatVATNumber } from "../../utils/viesApi";
import User, { IUser } from "../../models/user";
import connecToDatabase from "../../config/db";
import jwt from 'jsonwebtoken';

export const validateVAT = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { vatNumber } = req.body;

    if (!vatNumber) {
      return res.status(400).json({
        success: false,
        msg: "VAT number is required"
      });
    }

    const formattedVAT = formatVATNumber(vatNumber);

    // Basic format validation
    if (!isValidVATFormat(formattedVAT)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid VAT number format. Must be 2-letter country code followed by 4-15 alphanumeric characters"
      });
    }

    // Validate with VIES API
    const validationResult = await validateVATNumber(formattedVAT);

    return res.status(200).json({
      success: true,
      data: {
        vatNumber: formattedVAT,
        valid: validationResult.valid,
        companyName: validationResult.companyName,
        companyAddress: validationResult.companyAddress,
        error: validationResult.error
      }
    });

  } catch (error: any) {
    console.error('VAT validation error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to validate VAT number"
    });
  }
};

export const updateUserVAT = async (req: Request, res: Response, next: NextFunction) => {
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

    const { vatNumber } = req.body;

    await connecToDatabase();
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        msg: "User not found"
      });
    }

    // Check if user is a professional or customer
    if (user.role !== 'professional' && user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        msg: "VAT number can only be added by professionals and customers"
      });
    }

    let isVatVerified = false;
    let formattedVAT = '';

    if (vatNumber) {
      formattedVAT = formatVATNumber(vatNumber);

      // Basic format validation
      if (!isValidVATFormat(formattedVAT)) {
        return res.status(400).json({
          success: false,
          msg: "Invalid VAT number format"
        });
      }

      // Validate with VIES API (but don't prevent saving if it fails)
      const validationResult = await validateVATNumber(formattedVAT);
      isVatVerified = validationResult.valid;

      console.log(`💾 VAT Save: VAT ${formattedVAT} - Format valid, VIES verified: ${isVatVerified}`);
    }

    // Update user
    console.log(`💾 VAT Save: Updating user ${user.email} - VAT: ${formattedVAT || 'REMOVED'}, Verified: ${isVatVerified}`);
    user.vatNumber = formattedVAT || undefined;
    user.isVatVerified = isVatVerified;
    await user.save();
    console.log(`✅ VAT Save: User updated successfully`);

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
      isVatVerified: user.isVatVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    return res.status(200).json({
      success: true,
      msg: vatNumber ? "VAT number updated successfully" : "VAT number removed successfully",
      user: userResponse
    });

  } catch (error: any) {
    console.error('Update VAT error:', error);
    return res.status(500).json({
      success: false,
      msg: "Failed to update VAT number"
    });
  }
};