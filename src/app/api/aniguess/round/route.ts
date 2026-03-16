import { NextResponse } from "next/server";
import { createRound, normalizeGuessText } from "@/lib/aniguess-store";

export const runtime = "nodejs";

type JikanAnimeEntry = {
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[];
  score?: number | null;
  episodes?: number | null;
  year?: number | null;
  rank?: number | null;
  url?: string;
  images?: {
    jpg?: {
      large_image_url?: string;
      image_url?: string;
    };
  };
};

type JikanTopResponse = {
  data: JikanAnimeEntry[];
};

type JikanPicturesResponse = {
  data: Array<{
    jpg?: {
      large_image_url?: string;
      image_url?: string;
    };
  }>;
};

const MAX_RANK = 5000;
const PAGE_SIZE = 25;
const MAX_ATTEMPTS = 5;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "Aleanimiec-AniGuess/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Jikan error: ${response.status}`);
  }

  return (await response.json()) as T;
}

function uniqueNormalizedTitles(anime: JikanAnimeEntry): string[] {
  const rawTitles = [
    anime.title,
    anime.title_english ?? "",
    anime.title_japanese ?? "",
    ...(anime.title_synonyms ?? []),
  ].filter(Boolean);

  const normalized = rawTitles.map((title) => normalizeGuessText(title));
  return Array.from(new Set(normalized.filter((value) => value.length >= 2)));
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export async function GET() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const targetRank = Math.floor(Math.random() * MAX_RANK) + 1;
      const page = Math.floor((targetRank - 1) / PAGE_SIZE) + 1;
      const index = (targetRank - 1) % PAGE_SIZE;

      const topPayload = await fetchJson<JikanTopResponse>(
        `https://api.jikan.moe/v4/top/anime?page=${page}&limit=${PAGE_SIZE}&sfw=true`,
      );

      const candidates = topPayload.data ?? [];
      if (!candidates.length) {
        continue;
      }

      const anime = candidates[index] ?? pickRandom(candidates);
      const normalizedTitles = uniqueNormalizedTitles(anime);
      if (!normalizedTitles.length) {
        continue;
      }

      let imageUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || "";

      try {
        const picturesPayload = await fetchJson<JikanPicturesResponse>(`https://api.jikan.moe/v4/anime/${anime.mal_id}/pictures`);
        const pictureCandidates = (picturesPayload.data ?? [])
          .map((picture) => picture.jpg?.large_image_url || picture.jpg?.image_url || "")
          .filter(Boolean);

        if (pictureCandidates.length) {
          imageUrl = pickRandom(pictureCandidates);
        }
      } catch {
        // fallback to base image from top payload
      }

      if (!imageUrl) {
        continue;
      }

      const displayTitle = anime.title_english?.trim() || anime.title;

      const round = createRound({
        maxAttempts: MAX_ATTEMPTS,
        normalizedTitles,
        displayTitle,
        malId: anime.mal_id,
        malUrl: anime.url || `https://myanimelist.net/anime/${anime.mal_id}`,
        imageUrl,
        score: anime.score ?? null,
        episodes: anime.episodes ?? null,
        year: anime.year ?? null,
        rank: anime.rank ?? null,
      });

      return NextResponse.json({
        roundId: round.id,
        imageUrl: round.imageUrl,
        hints: {
          score: round.score,
          episodes: round.episodes,
          year: round.year,
          rank: round.rank,
        },
        maxAttempts: round.maxAttempts,
      });
    } catch {
      // retry another random rank
    }
  }

  return NextResponse.json({ error: "Nie udało się przygotować rundy z danych MyAnimeList." }, { status: 503 });
}
