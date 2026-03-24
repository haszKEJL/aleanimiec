import path from "node:path";

const API_PREFIX = "/api/manga/image/";
const LEGACY_PREFIX = "/uploads/manga/";

export function getMangaUploadsDir(): string {
  return process.env.MANGA_UPLOADS_DIR || path.join(process.cwd(), "public", "uploads", "manga");
}

export function toMangaAssetUrl(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${API_PREFIX}${normalized}`;
}

export function getRelativePathFromAssetUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  if (url.startsWith(API_PREFIX)) {
    return url.slice(API_PREFIX.length).replace(/^\/+/, "");
  }

  if (url.startsWith(LEGACY_PREFIX)) {
    return url.slice(LEGACY_PREFIX.length).replace(/^\/+/, "");
  }

  return null;
}

export function normalizeMangaAssetUrl(url: string | null): string | null {
  const relative = getRelativePathFromAssetUrl(url);
  if (!relative) {
    return url;
  }

  return toMangaAssetUrl(relative);
}
