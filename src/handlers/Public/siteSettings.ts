import { Request, Response } from "express";
import SiteSettings from "../../models/siteSettings";
import connectDB from "../../config/db";

export const getPublicSiteSettings = async (_req: Request, res: Response) => {
  try {
    await connectDB();
    const doc = await SiteSettings.getCurrent();
    const socialLinks = doc.socialLinks || {};
    return res.status(200).json({ success: true, data: { socialLinks } });
  } catch (error) {
    console.error("Public site settings error:", error);
    return res.status(500).json({ success: false, msg: "Failed to load site settings" });
  }
};
