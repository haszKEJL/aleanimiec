import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type MangaSeries = {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  status: "ongoing" | "completed" | "hiatus";
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MangaChapter = {
  id: string;
  seriesId: string;
  number: number;
  title: string;
  pages: string[];
  createdAt: string;
};

type MangaStore = {
  series: MangaSeries[];
  chapters: MangaChapter[];
};

export type MangaCard = {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  status: MangaSeries["status"];
  coverUrl: string | null;
  chapterCount: number;
  latestChapterNumber: number | null;
  latestChapterDate: string | null;
  updatedAt: string;
};

const STORE_PATH = path.join(process.cwd(), "data", "manga-cms.json");

const EMPTY_STORE: MangaStore = {
  series: [],
  chapters: [],
};

function sanitizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isMangaStore(value: unknown): value is MangaStore {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as MangaStore;
  return Array.isArray(candidate.series) && Array.isArray(candidate.chapters);
}

export function normalizeSlug(input: string): string {
  return sanitizeSlug(input);
}

export async function readStore(): Promise<MangaStore> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });

  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isMangaStore(parsed)) {
      return EMPTY_STORE;
    }
    return parsed;
  } catch {
    await writeStore(EMPTY_STORE);
    return EMPTY_STORE;
  }
}

export async function writeStore(store: MangaStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function createSeries(input: {
  title: string;
  slug?: string;
  description?: string;
  tags?: string[];
  status?: MangaSeries["status"];
  coverUrl?: string | null;
}): Promise<MangaSeries> {
  const store = await readStore();

  const baseSlug = normalizeSlug(input.slug || input.title);
  if (!baseSlug) {
    throw new Error("Nieprawidłowy slug serii.");
  }

  let slug = baseSlug;
  let attempt = 1;
  while (store.series.some((series) => series.slug === slug)) {
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const now = new Date().toISOString();
  const series: MangaSeries = {
    id: randomUUID(),
    slug,
    title: input.title.trim(),
    description: (input.description || "").trim(),
    tags: (input.tags || []).map((tag) => tag.trim()).filter(Boolean).slice(0, 10),
    status: input.status || "ongoing",
    coverUrl: input.coverUrl || null,
    createdAt: now,
    updatedAt: now,
  };

  store.series.unshift(series);
  await writeStore(store);

  return series;
}

export async function addChapter(input: {
  seriesId: string;
  number: number;
  title?: string;
  pages: string[];
}): Promise<MangaChapter> {
  const store = await readStore();

  const series = store.series.find((entry) => entry.id === input.seriesId);
  if (!series) {
    throw new Error("Nie znaleziono serii.");
  }

  if (!input.pages.length) {
    throw new Error("Rozdział musi mieć minimum jedną stronę.");
  }

  const chapter: MangaChapter = {
    id: randomUUID(),
    seriesId: series.id,
    number: input.number,
    title: (input.title || "").trim() || `Rozdział ${input.number}`,
    pages: input.pages,
    createdAt: new Date().toISOString(),
  };

  store.chapters.unshift(chapter);
  series.updatedAt = new Date().toISOString();
  await writeStore(store);

  return chapter;
}

export async function listSeriesCards(params: {
  mode: "latest" | "popular" | "search";
  query?: string;
  limit: number;
  offset: number;
}): Promise<{ items: MangaCard[]; total: number }> {
  const store = await readStore();
  const query = (params.query || "").trim().toLowerCase();

  const cards = store.series.map((series) => {
    const chapters = store.chapters
      .filter((chapter) => chapter.seriesId === series.id)
      .sort((left, right) => right.number - left.number || right.createdAt.localeCompare(left.createdAt));

    const latest = chapters[0];

    return {
      id: series.id,
      slug: series.slug,
      title: series.title,
      description: series.description,
      tags: series.tags,
      status: series.status,
      coverUrl: series.coverUrl,
      chapterCount: chapters.length,
      latestChapterNumber: latest ? latest.number : null,
      latestChapterDate: latest ? latest.createdAt : null,
      updatedAt: series.updatedAt,
    } satisfies MangaCard;
  });

  const filtered = query
    ? cards.filter((card) => `${card.title} ${card.description} ${card.tags.join(" ")}`.toLowerCase().includes(query))
    : cards;

  const sorted = [...filtered].sort((left, right) => {
    if (params.mode === "popular") {
      return right.chapterCount - left.chapterCount || right.updatedAt.localeCompare(left.updatedAt);
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });

  const start = Math.max(params.offset, 0);
  const end = start + Math.max(params.limit, 1);
  return {
    items: sorted.slice(start, end),
    total: sorted.length,
  };
}

export async function listSeriesBasic(): Promise<Array<Pick<MangaSeries, "id" | "slug" | "title">>> {
  const store = await readStore();
  return [...store.series]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((series) => ({ id: series.id, slug: series.slug, title: series.title }));
}

export async function getSeriesBySlug(slug: string): Promise<{
  series: MangaSeries;
  chapters: MangaChapter[];
} | null> {
  const store = await readStore();
  const series = store.series.find((entry) => entry.slug === slug);
  if (!series) {
    return null;
  }

  const chapters = store.chapters
    .filter((chapter) => chapter.seriesId === series.id)
    .sort((left, right) => right.number - left.number || right.createdAt.localeCompare(left.createdAt));

  return { series, chapters };
}