import { timingSafeEqual } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  addChapter,
  createSeries,
  deleteChapter,
  deleteSeries,
  listAdminSeriesDetails,
  listSeriesBasic,
  listSeriesCards,
  normalizeSlug,
  readStore,
  updateChapter,
  updateSeries,
} from "@/lib/manga-cms-store";
import { getMangaUploadsDir, getRelativePathFromAssetUrl, toMangaAssetUrl } from "@/lib/manga-storage";

export const runtime = "nodejs";

const MANGA_UPLOADS_DIR = getMangaUploadsDir();

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

async function removePublicUploadByUrl(url: string | null): Promise<void> {
  const relative = getRelativePathFromAssetUrl(url);
  if (!relative) {
    return;
  }

  const targetPath = path.join(MANGA_UPLOADS_DIR, relative);
  const uploadsRoot = MANGA_UPLOADS_DIR;
  const normalized = path.normalize(targetPath);

  if (!normalized.startsWith(path.normalize(uploadsRoot))) {
    return;
  }

  await rm(normalized, { recursive: true, force: true });
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

  if (modeParam === "admin") {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Brak autoryzacji admina." }, { status: 401 });
    }

    const items = await listAdminSeriesDetails();
    return NextResponse.json({ items, total: items.length, limit: items.length, offset: 0 });
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
        const diskPath = path.join(MANGA_UPLOADS_DIR, "covers", filename);
        await saveUploadedFile(coverCandidate, diskPath);
        coverUrl = toMangaAssetUrl(`covers/${filename}`);
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
      const chapterDir = path.join(MANGA_UPLOADS_DIR, series.slug, chapterPathPart);
      await mkdir(chapterDir, { recursive: true });

      const pages: string[] = [];

      for (let index = 0; index < pageFiles.length; index += 1) {
        const pageFile = pageFiles[index];
        const ext = extensionFromFilename(pageFile.name, "jpg");
        const filename = `${String(index + 1).padStart(3, "0")}.${ext}`;
        const diskPath = path.join(chapterDir, filename);
        await saveUploadedFile(pageFile, diskPath);
        pages.push(toMangaAssetUrl(`${series.slug}/${chapterPathPart}/${filename}`));
      }

      const created = await addChapter({
        seriesId,
        number: chapterNumber,
        title: chapterTitle,
        pages,
      });

      return NextResponse.json({ ok: true, chapter: created });
    }

    if (action === "update-series") {
      const seriesId = `${formData.get("seriesId") || ""}`.trim();
      const title = `${formData.get("title") || ""}`.trim();
      const slugInput = `${formData.get("slug") || ""}`.trim();
      const description = `${formData.get("description") || ""}`.trim();
      const statusInput = `${formData.get("status") || "ongoing"}`;
      const tagsRaw = `${formData.get("tags") || ""}`;
      const keepCover = `${formData.get("keepCover") || "true"}` !== "false";

      if (!seriesId || !title) {
        return NextResponse.json({ error: "Brakuje danych serii." }, { status: 400 });
      }

      const status = statusInput === "completed" || statusInput === "hiatus" ? statusInput : "ongoing";
      const tags = tagsRaw
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 10);

      const store = await readStore();
      const current = store.series.find((entry) => entry.id === seriesId);
      if (!current) {
        return NextResponse.json({ error: "Nie znaleziono serii." }, { status: 404 });
      }

      let nextCoverUrl: string | null | undefined;
      const coverCandidate = formData.get("cover");
      if (coverCandidate instanceof File && coverCandidate.size > 0) {
        const slugPart = sanitizeFilePart(normalizeSlug(slugInput || title || current.slug));
        const extension = extensionFromFilename(coverCandidate.name, "jpg");
        const filename = `${slugPart}-${Date.now()}.${extension}`;
        const diskPath = path.join(MANGA_UPLOADS_DIR, "covers", filename);
        await saveUploadedFile(coverCandidate, diskPath);
        nextCoverUrl = toMangaAssetUrl(`covers/${filename}`);
      }

      const updated = await updateSeries({
        id: seriesId,
        title,
        slug: slugInput,
        description,
        tags,
        status,
        coverUrl: nextCoverUrl,
        keepCover,
      });

      if (nextCoverUrl && current.coverUrl && current.coverUrl !== nextCoverUrl) {
        await removePublicUploadByUrl(current.coverUrl);
      }

      if (!keepCover && current.coverUrl) {
        await removePublicUploadByUrl(current.coverUrl);
      }

      return NextResponse.json({ ok: true, series: updated });
    }

    if (action === "delete-series") {
      const seriesId = `${formData.get("seriesId") || ""}`.trim();
      if (!seriesId) {
        return NextResponse.json({ error: "Brakuje ID serii." }, { status: 400 });
      }

      const store = await readStore();
      const series = store.series.find((entry) => entry.id === seriesId);
      if (!series) {
        return NextResponse.json({ error: "Nie znaleziono serii." }, { status: 404 });
      }

      const result = await deleteSeries(seriesId);

      await removePublicUploadByUrl(series.coverUrl);
      await rm(path.join(MANGA_UPLOADS_DIR, series.slug), { recursive: true, force: true });

      return NextResponse.json({ ok: true, removed: result.removedChapterIds.length });
    }

    if (action === "update-chapter") {
      const chapterId = `${formData.get("chapterId") || ""}`.trim();
      const numberRaw = `${formData.get("chapterNumber") || ""}`.trim();
      const title = `${formData.get("chapterTitle") || ""}`.trim();
      const number = Number.parseFloat(numberRaw);

      if (!chapterId || !Number.isFinite(number) || number <= 0) {
        return NextResponse.json({ error: "Nieprawidłowe dane rozdziału." }, { status: 400 });
      }

      const updated = await updateChapter({ chapterId, number, title });
      return NextResponse.json({ ok: true, chapter: updated });
    }

    if (action === "delete-chapter") {
      const chapterId = `${formData.get("chapterId") || ""}`.trim();
      if (!chapterId) {
        return NextResponse.json({ error: "Brakuje ID rozdziału." }, { status: 400 });
      }

      const deleted = await deleteChapter(chapterId);

      const firstPage = deleted.pages[0] || "";
      if (firstPage.startsWith("/uploads/manga/")) {
        const directoryUrl = firstPage.split("/").slice(0, -1).join("/");
        await removePublicUploadByUrl(directoryUrl);
      }

      return NextResponse.json({ ok: true, chapter: deleted.id });
    }

    return NextResponse.json({ error: "Nieznana akcja." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Błąd serwera." }, { status: 500 });
  }
}