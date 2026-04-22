import { presignS3Url, isAllowedS3Url } from "./s3Upload";

const IMG_SRC_RE = /(<img\b[^>]*?\bsrc\s*=\s*)(['"])([^'"]+)(\2)/gi;

const DEFAULT_EXPIRES_IN = 7 * 24 * 60 * 60;

async function presignIfAllowed(url: string | undefined, expiresIn: number): Promise<string | undefined> {
  if (!url) return url;
  if (!isAllowedS3Url(url)) return url;
  const signed = await presignS3Url(url, expiresIn);
  return signed ?? url;
}

export async function presignBodyImages(html: string, expiresIn = DEFAULT_EXPIRES_IN): Promise<string> {
  if (!html) return html;

  const matches: Array<{ full: string; prefix: string; quote: string; url: string; suffix: string }> = [];
  IMG_SRC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_SRC_RE.exec(html)) !== null) {
    matches.push({ full: m[0], prefix: m[1], quote: m[2], url: m[3], suffix: m[4] });
  }
  if (matches.length === 0) return html;

  const uniqueUrls = Array.from(new Set(matches.map((x) => x.url)));
  const resolved: Record<string, string> = {};
  await Promise.all(
    uniqueUrls.map(async (u) => {
      resolved[u] = (await presignIfAllowed(u, expiresIn)) ?? u;
    })
  );

  let out = "";
  let cursor = 0;
  IMG_SRC_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_SRC_RE.exec(html)) !== null) {
    const start = match.index;
    const url = match[3];
    const replacement = `${match[1]}${match[2]}${resolved[url] ?? url}${match[4]}`;
    out += html.slice(cursor, start) + replacement;
    cursor = start + match[0].length;
  }
  out += html.slice(cursor);
  return out;
}

export async function presignCmsDoc<T extends Record<string, any>>(doc: T, expiresIn = DEFAULT_EXPIRES_IN): Promise<T> {
  if (!doc) return doc;
  const rawSeo = doc.seo && typeof doc.seo === "object" ? (doc.seo as Record<string, any>) : undefined;
  const [coverImage, ogImage, body] = await Promise.all([
    presignIfAllowed(doc.coverImage, expiresIn),
    presignIfAllowed(rawSeo?.ogImage as string | undefined, expiresIn),
    typeof doc.body === "string" && doc.body ? presignBodyImages(doc.body, expiresIn) : Promise.resolve(doc.body),
  ]);
  const next: Record<string, any> = { ...doc, coverImage, body };
  if (rawSeo) {
    next.seo = { ...rawSeo, ogImage };
  }
  return next as T;
}

export async function presignCmsDocs<T extends Record<string, any>>(docs: T[], expiresIn = DEFAULT_EXPIRES_IN): Promise<T[]> {
  return Promise.all(docs.map((d) => presignCmsDoc(d, expiresIn)));
}
