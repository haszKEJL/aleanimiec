import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getMangaUploadsDir } from "@/lib/manga-storage";

export const runtime = "nodejs";

const MANGA_UPLOADS_DIR = getMangaUploadsDir();

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".png") {
    return "image/png";
  }

  if (ext === ".webp") {
    return "image/webp";
  }

  if (ext === ".gif") {
    return "image/gif";
  }

  if (ext === ".avif") {
    return "image/avif";
  }

  return "image/jpeg";
}

type Props = {
  params: Promise<{
    segments: string[];
  }>;
};

export async function GET(_request: NextRequest, { params }: Props) {
  const { segments } = await params;

  if (!segments.length) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const safeSegments = segments
    .map((segment) => decodeURIComponent(segment))
    .filter((segment) => segment && segment !== "." && segment !== ".." && !segment.includes(".."));

  if (!safeSegments.length || safeSegments.length !== segments.length) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const relative = safeSegments.join(path.sep);
  const target = path.normalize(path.join(MANGA_UPLOADS_DIR, relative));
  const root = path.normalize(MANGA_UPLOADS_DIR);

  if (!target.startsWith(root)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const file = await readFile(target);

    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": getContentType(target),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
