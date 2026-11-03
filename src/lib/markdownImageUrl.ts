// https://www.mediawiki.org/wiki/Common_thumbnail_sizes
const WIKIMEDIA_THUMBNAIL_WIDTHS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];

/** Preserve the file identity and format; repair only unsupported thumbnail widths. */
export function normalizeMarkdownImageUrl(src: string): string {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || !["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname) || !url.pathname.includes("/thumb/")) return src;
    const match = url.pathname.match(/\/(\d+)px-([^/]+)$/);
    if (!match) return src;
    const width = Number(match[1]);
    if (WIKIMEDIA_THUMBNAIL_WIDTHS.includes(width)) return src;
    const supported = WIKIMEDIA_THUMBNAIL_WIDTHS.find(size => size >= width) ?? 3840;
    url.pathname = url.pathname.replace(/\/\d+px-([^/]+)$/, `/${supported}px-$1`);
    return url.toString();
  } catch { return src; }
}

/** Resolve Commons by its filename instead of trusting a model-generated hash path. */
export function wikimediaImageFallback(src: string): { imageUrl: string; searchUrl: string } | null {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || !["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)(?:\/[^/]+)?$/i);
    if (!match) return null;
    const filename = decodeURIComponent(match[1]);
    if (/[\/\\]/.test(filename)) return null;
    return {
      imageUrl: `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=960`,
      searchUrl: `https://commons.wikimedia.org/wiki/Special:MediaSearch?type=image&search=${encodeURIComponent(filename.replace(/\.[^.]+$/, "").replaceAll("_", " "))}`,
    };
  } catch { return null; }
}
