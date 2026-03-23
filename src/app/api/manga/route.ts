import { timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { addChapter, createSeries, listSeriesBasic, listSeriesCards, normalizeSlug, readStore } from "@/lib/manga-cms-store";

export const runtime = "nodejs";

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isAdmin(request: NextRequest): boolean {
  const provided = request.headers.get("x-admin-password")?.trim() || "";
  const expected = process.env.ADMIN_SYNC_PASSWORD || "";
  if (!provided || !expected) {
    return false;
  }
  return safeEquals(provided, expected);
}

function sanitizeFilePart(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "file";
}

function extensionFromFilename(filename: string, fallback = "jpg"): string {
  const ext = path.extname(filename || "").replace(".", "").toLowerCase();
  if (!ext || !/^[a-z0-9]{1,6}$/.test(ext)) {
    return fallback;
  }
  return ext;
}

async function saveUploadedFile(file: File, targetPath: string): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, Buffer.from(arrayBuffer));
}

export async function GET(request: NextRequest) {
  const modeParam = (request.nextUrl.searchParams.get("mode") || "latest").toLowerCase();
  const query = request.nextUrl.searchParams.get("query")?.trim() || "";

  const parsedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "18", 10);
  const parsedOffset = Number.parseInt(request.nextUrl.searchParams.get("offset") || "0", 10);

  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 40) : 18;
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

  if (modeParam === "series") {
    const series = await listSeriesBasic();
    return NextResponse.json({ items: series, total: series.length, limit: series.length, offset: 0 });
  }

  const mode = modeParam === "popular" || modeParam === "search" ? modeParam : "latest";
  const result = await listSeriesCards({ mode, query, limit, offset });

  return NextResponse.json({
    items: result.items,
    total: result.total,
    limit,
    offset,
  });
}

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Brak autoryzacji admina." }, { status: 401 });
  }

  const formData = await request.formData();
  const action = `${formData.get("action") || ""}`;

  try {
    if (action === "create-series") {
      const title = `${formData.get("title") || ""}`.trim();
      const slugInput = `${formData.get("slug") || ""}`.trim();
      const description = `${formData.get("description") || ""}`.trim();
      const status = `${formData.get("status") || "ongoing"}`;
      const tagsRaw = `${formData.get("tags") || ""}`;
      const tags = tagsRaw
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 10);

      if (!title) {
        return NextResponse.json({ error: "Tytuł serii jest wymagany." }, { status: 400 });
      }

      const coverCandidate = formData.get("cover");
      let coverUrl: string | null = null;

      if (coverCandidate instanceof File && coverCandidate.size > 0) {
        const slug = sanitizeFilePart(normalizeSlug(slugInput || title));
        const extension = extensionFromFilename(coverCandidate.name, "jpg");
        const filename = `${slug}-${Date.now()}.${extension}`;
        const diskPath = path.join(process.cwd(), "public", "uploads", "manga", "covers", filename);
        await saveUploadedFile(coverCandidate, diskPath);
        coverUrl = `/uploads/manga/covers/${filename}`;
      }

      const normalizedStatus = status === "completed" || status === "hiatus" ? status : "ongoing";

      const created = await createSeries({
        title,
        slug: slugInput,
        description,
        tags,
        status: normalizedStatus,
        coverUrl,
      });

      return NextResponse.json({ ok: true, series: created });
    }

    if (action === "create-chapter") {
      const seriesId = `${formData.get("seriesId") || ""}`.trim();
      const chapterTitle = `${formData.get("chapterTitle") || ""}`.trim();
      const chapterNumberRaw = `${formData.get("chapterNumber") || ""}`.trim();
      const chapterNumber = Number.parseFloat(chapterNumberRaw);

      if (!seriesId) {
        return NextResponse.json({ error: "Wybierz serię." }, { status: 400 });
      }

      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
        return NextResponse.json({ error: "Nieprawidłowy numer rozdziału." }, { status: 400 });
      }

      const store = await readStore();
      const series = store.series.find((entry) => entry.id === seriesId);
      if (!series) {
        return NextResponse.json({ error: "Nie znaleziono serii." }, { status: 404 });
      }

      const pageFiles = formData
        .getAll("pages")
        .filter((entry): entry is File => entry instanceof File && entry.size > 0)
        .slice(0, 240);

      if (!pageFiles.length) {
        return NextResponse.json({ error: "Dodaj minimum jedną stronę." }, { status: 400 });
      }

      const chapterPathPart = `ch-${String(chapterNumber).replace(".", "-")}-${Date.now()}`;
      const chapterDir = path.join(process.cwd(), "public", "uploads", "manga", series.slug, chapterPathPart);
      await mkdir(chapterDir, { recursive: true });

      const pages: string[] = [];

      for (let index = 0; index < pageFiles.length; index += 1) {
        const pageFile = pageFiles[index];
        const ext = extensionFromFilename(pageFile.name, "jpg");
        const filename = `${String(index + 1).padStart(3, "0")}.${ext}`;
        const diskPath = path.join(chapterDir, filename);
        await saveUploadedFile(pageFile, diskPath);
        pages.push(`/uploads/manga/${series.slug}/${chapterPathPart}/${filename}`);
      }

      const created = await addChapter({
        seriesId,
        number: chapterNumber,
        title: chapterTitle,
        pages,
      });

      return NextResponse.json({ ok: true, chapter: created });
    }

    return NextResponse.json({ error: "Nieznana akcja." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Błąd serwera." }, { status: 500 });
  }
}