import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type MangaDexResponse = {
  data?: Array<{
    id: string;
    attributes?: {
      title?: Record<string, string>;
      altTitles?: Array<Record<string, string>>;
      description?: Record<string, string>;
      year?: number | null;
      status?: string | null;
      tags?: Array<{
        attributes?: {
          name?: Record<string, string>;
        };
      }>;
    };
    relationships?: Array<{
      type?: string;
      attributes?: {
        fileName?: string;
      };
    }>;
  }>;
  total?: number;
  limit?: number;
  offset?: number;
};

function pickLocalizedText(record?: Record<string, string>): string {
  if (!record) {
    return "";
  }

  return record.pl || record.en || record["ja-ro"] || record.ja || Object.values(record).find(Boolean) || "";
}

export async function GET(request: NextRequest) {
  const modeParam = (request.nextUrl.searchParams.get("mode") || "latest").toLowerCase();
  const query = request.nextUrl.searchParams.get("query")?.trim() || "";

  const parsedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "18", 10);
  const parsedOffset = Number.parseInt(request.nextUrl.searchParams.get("offset") || "0", 10);

  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 30) : 18;
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;
  const mode = modeParam === "popular" || modeParam === "search" ? modeParam : "latest";

  if (mode === "search" && query.length < 2) {
    return NextResponse.json({
      items: [],
      total: 0,
      limit,
      offset,
    });
  }

  const url = new URL("https://api.mangadex.org/manga");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("includes[]", "cover_art");
  url.searchParams.set("hasAvailableChapters", "true");
  url.searchParams.set("contentRating[]", "safe");
  url.searchParams.append("contentRating[]", "suggestive");

  if (mode === "latest") {
    url.searchParams.set("order[latestUploadedChapter]", "desc");
  }

  if (mode === "popular") {
    url.searchParams.set("order[followedCount]", "desc");
    url.searchParams.set("order[rating]", "desc");
  }

  if (mode === "search") {
    url.searchParams.set("title", query);
    url.searchParams.set("order[relevance]", "desc");
  }

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        "User-Agent": "AniGuess-Manga/1.0",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Nie udało się pobrać mang" }, { status: 502 });
    }

    const payload = (await response.json()) as MangaDexResponse;
    const items = (payload.data || []).map((manga) => {
      const attributes = manga.attributes;
      const title = pickLocalizedText(attributes?.title) || pickLocalizedText(attributes?.altTitles?.[0]) || "Bez tytułu";
      const description = pickLocalizedText(attributes?.description);
      const cover = (manga.relationships || []).find((entry) => entry.type === "cover_art");
      const coverFileName = cover?.attributes?.fileName;

      const coverUrl = coverFileName ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}.512.jpg` : null;

      const tags = (attributes?.tags || [])
        .map((tag) => pickLocalizedText(tag.attributes?.name))
        .filter((tagName) => tagName.length > 0)
        .slice(0, 4);

      return {
        id: manga.id,
        title,
        description: description || "Brak opisu.",
        year: attributes?.year || null,
        status: attributes?.status || null,
        tags,
        coverUrl,
        mangaDexUrl: `https://mangadex.org/title/${manga.id}`,
      };
    });

    return NextResponse.json({
      items,
      total: payload.total || items.length,
      limit: payload.limit || limit,
      offset: payload.offset || offset,
    });
  } catch {
    return NextResponse.json({ error: "Nie udało się pobrać mang" }, { status: 502 });
  }
}