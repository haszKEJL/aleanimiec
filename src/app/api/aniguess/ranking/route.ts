import { NextRequest, NextResponse } from "next/server";
import { canUseRankingDatabase, getRanking, type RankingScope } from "@/lib/aniguess-ranking-db";

export const runtime = "nodejs";

const ALLOWED_SCOPES: RankingScope[] = ["daily", "weekly", "alltime"];

export async function GET(request: NextRequest) {
  if (!canUseRankingDatabase()) {
    return NextResponse.json(
      {
        error: "Ranking database is not configured. Set DATABASE_URL.",
      },
      { status: 503 },
    );
  }

  const rawScope = request.nextUrl.searchParams.get("scope") || "alltime";
  const scope = ALLOWED_SCOPES.includes(rawScope as RankingScope) ? (rawScope as RankingScope) : "alltime";
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") || "25");
  const limit = Number.isFinite(rawLimit) ? rawLimit : 25;

  try {
    const entries = await getRanking(scope, limit);
    return NextResponse.json({ scope, entries });
  } catch (error) {
    console.error("[aniguess] failed to load ranking", error);
    return NextResponse.json({ error: "Failed to load ranking" }, { status: 500 });
  }
}
