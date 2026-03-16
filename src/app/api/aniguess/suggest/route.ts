import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type JikanSearchResponse = {
  data: Array<{
    title?: string;
    title_english?: string | null;
    title_japanese?: string | null;
    title_synonyms?: string[];
  }>;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim() || "";
  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] as string[] });
  }

  try {
    const response = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=8&sfw=true&order_by=score&sort=desc`,
      {
        cache: "no-store",
        headers: {
          "User-Agent": "Aleanimiec-AniGuess/1.0",
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      return NextResponse.json({ suggestions: [] as string[] });
    }

    const payload = (await response.json()) as JikanSearchResponse;
    const suggestions = Array.from(
      new Set(
        (payload.data ?? [])
          .flatMap((anime) => [anime.title || "", anime.title_english || "", anime.title_japanese || "", ...(anime.title_synonyms || [])])
          .map((value) => value.trim())
          .filter((value) => value.length >= 2),
      ),
    ).slice(0, 8);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] as string[] });
  }
}
