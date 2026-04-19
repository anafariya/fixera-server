import { Request, Response } from "express";
import CmsContent, {
  CMS_CONTENT_TYPES,
  CmsContentType,
  FAQ_CATEGORIES,
  FAQ_CATEGORY_SLUGS,
} from "../../models/cmsContent";
import connecToDatabase from "../../config/db";

const LISTING_FIELDS =
  "type title slug locale excerpt coverImage tags publishedAt seo category author updatedAt";

export const listPublicCmsContent = async (req: Request, res: Response) => {
  try {
    const type = req.params.type as CmsContentType;
    if (!CMS_CONTENT_TYPES.includes(type)) {
      return res.status(404).json({ success: false, msg: "Unknown content type" });
    }

    const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || "12", 10)));
    const skip = (page - 1) * limit;

    const locale = typeof req.query.locale === "string" ? req.query.locale.toLowerCase() : "en";
    const filter: Record<string, unknown> = { type, status: "published", locale };

    const tag = typeof req.query.tag === "string" ? req.query.tag.toLowerCase() : "";
    if (tag) filter.tags = tag;

    await connecToDatabase();

    const [items, total] = await Promise.all([
      CmsContent.find(filter)
        .select(LISTING_FIELDS)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("author", "name")
        .lean(),
      CmsContent.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error("Public list CMS content error:", error);
    return res.status(500).json({ success: false, msg: "Failed to load content" });
  }
};

export const getPublicCmsContentBySlug = async (req: Request, res: Response) => {
  try {
    const type = req.params.type as CmsContentType;
    if (!CMS_CONTENT_TYPES.includes(type)) {
      return res.status(404).json({ success: false, msg: "Unknown content type" });
    }

    const slug = (req.params.slug || "").toLowerCase();
    if (!slug) return res.status(404).json({ success: false, msg: "Not found" });

    const locale = typeof req.query.locale === "string" ? req.query.locale.toLowerCase() : "en";

    await connecToDatabase();

    const doc = await CmsContent.findOneAndUpdate(
      { type, slug, locale, status: "published" },
      { $inc: { viewCount: 1 } },
      { new: true }
    )
      .populate("author", "name")
      .populate("relatedContent", "title slug type excerpt coverImage publishedAt")
      .populate("relatedServices", "name slug")
      .lean();

    if (!doc) return res.status(404).json({ success: false, msg: "Not found" });

    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error("Public get CMS content error:", error);
    return res.status(500).json({ success: false, msg: "Failed to load content" });
  }
};

export const listPublicFaq = async (req: Request, res: Response) => {
  try {
    const locale = typeof req.query.locale === "string" ? req.query.locale.toLowerCase() : "en";

    await connecToDatabase();

    const items = await CmsContent.find({ type: "faq", status: "published", locale })
      .select("title slug body category publishedAt updatedAt")
      .sort({ category: 1, publishedAt: -1 })
      .lean();

    const byCategory: Record<string, any[]> = {};
    for (const slug of FAQ_CATEGORY_SLUGS) byCategory[slug] = [];
    for (const item of items) {
      const cat = item.category && FAQ_CATEGORY_SLUGS.includes(item.category) ? item.category : "general";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(item);
    }

    const groups = FAQ_CATEGORIES.map((c) => ({
      slug: c.slug,
      name: c.name,
      items: byCategory[c.slug] || [],
    })).filter((g) => g.items.length > 0);

    return res.status(200).json({ success: true, data: { groups, categories: FAQ_CATEGORIES } });
  } catch (error) {
    console.error("Public FAQ error:", error);
    return res.status(500).json({ success: false, msg: "Failed to load FAQ" });
  }
};

export const listCmsSitemapEntries = async (_req: Request, res: Response) => {
  try {
    await connecToDatabase();
    const items = await CmsContent.find({ status: "published" })
      .select("type slug locale updatedAt publishedAt")
      .lean();

    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error("CMS sitemap entries error:", error);
    return res.status(500).json({ success: false, msg: "Failed to load sitemap entries" });
  }
};
