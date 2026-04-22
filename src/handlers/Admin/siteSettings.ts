import { Request, Response } from "express";
import SiteSettings, { ISocialLinks } from "../../models/siteSettings";
import connectDB from "../../config/db";
import { IUser } from "../../models/user";

const ALLOWED_SOCIAL_KEYS: Array<keyof ISocialLinks> = [
  "facebook",
  "twitter",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
];

const sanitizeUrl = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return undefined;
    return parsed.toString().slice(0, 500);
  } catch {
    return undefined;
  }
};

export const getAdminSiteSettings = async (_req: Request, res: Response) => {
  try {
    await connectDB();
    const doc = await SiteSettings.getCurrent();
    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error("Admin site settings get error:", error);
    return res.status(500).json({ success: false, msg: "Failed to load site settings" });
  }
};

export const updateAdminSiteSettings = async (req: Request, res: Response) => {
  try {
    await connectDB();
    const doc = await SiteSettings.getCurrent();

    const body = req.body || {};
    if (body.socialLinks && typeof body.socialLinks === "object") {
      const next: ISocialLinks = { ...(doc.socialLinks || {}) };
      for (const key of ALLOWED_SOCIAL_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body.socialLinks, key)) {
          const cleaned = sanitizeUrl(body.socialLinks[key]);
          if (cleaned === undefined) {
            return res.status(400).json({ success: false, msg: `Invalid URL for ${key}` });
          }
          if (!cleaned) {
            delete next[key];
          } else {
            next[key] = cleaned;
          }
        }
      }
      doc.socialLinks = next;
    }

    const admin = (req as Request & { admin?: IUser }).admin;
    if (admin?._id) doc.lastModifiedBy = admin._id;
    doc.lastModified = new Date();

    await doc.save();
    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error("Admin site settings update error:", error);
    return res.status(500).json({ success: false, msg: "Failed to update site settings" });
  }
};
