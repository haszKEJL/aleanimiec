import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRound, normalizeGuessText, saveRound, similarityScore } from "@/lib/aniguess-store";
import { getPlayerCookieName, recordGuessEvent, recordRevealEvent } from "@/lib/aniguess-ranking-db";

export const runtime = "nodejs";

type GuessBody = {
  roundId?: string;
  guess?: string;
  action?: "guess" | "reveal";
};

const POINTS_BY_ATTEMPT = [1000, 750, 550, 350, 200];
const PLAYER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function resolvePlayerKey(request: NextRequest): { key: string; shouldSetCookie: boolean } {
  const cookieName = getPlayerCookieName();
  const fromCookie = request.cookies.get(cookieName)?.value?.trim() || "";

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fromCookie)) {
    return { key: fromCookie, shouldSetCookie: false };
  }

  return { key: randomUUID(), shouldSetCookie: true };
}

function setPlayerCookie(response: NextResponse, playerKey: string, shouldSetCookie: boolean): void {
  if (!shouldSetCookie) {
    return;
  }

  response.cookies.set({
    name: getPlayerCookieName(),
    value: playerKey,
    path: "/",
    maxAge: PLAYER_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function bestSimilarity(guess: string, titles: string[]): number {
  let best = 0;

  for (const title of titles) {
    const score = similarityScore(guess, title);
    if (score > best) {
      best = score;
    }
  }

  return best;
}

export async function POST(request: NextRequest) {
  let body: GuessBody;
  const player = resolvePlayerKey(request);

  try {
    body = (await request.json()) as GuessBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const roundId = body.roundId?.trim() || "";
  if (!roundId) {
    return NextResponse.json({ error: "Missing roundId" }, { status: 400 });
  }

  const round = getRound(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found or expired" }, { status: 404 });
  }

  const action = body.action || "guess";

  if (action === "reveal") {
    const response = NextResponse.json({
      correct: false,
      finished: true,
      revealed: true,
      pointsAwarded: 0,
      attemptsUsed: round.attemptsUsed,
      remainingAttempts: Math.max(round.maxAttempts - round.attemptsUsed, 0),
      answer: {
        title: round.displayTitle,
        malUrl: round.malUrl,
        malId: round.malId,
      },
      similarity: 0,
      revealedHints: round.hintSteps,
    });

    setPlayerCookie(response, player.key, player.shouldSetCookie);

    try {
      await recordRevealEvent({
        playerKey: player.key,
        roundId,
        attemptsUsed: round.attemptsUsed,
      });
    } catch (error) {
      console.error("[aniguess] failed to persist reveal event", error);
    }

    return response;
  }

  const guessRaw = body.guess?.trim() || "";
  const guess = normalizeGuessText(guessRaw);

  if (!guess) {
    return NextResponse.json({ error: "Missing guess" }, { status: 400 });
  }

  round.attemptsUsed += 1;
  const similarity = bestSimilarity(guess, round.normalizedTitles);

  const exactish = round.normalizedTitles.some((title) => {
    if (guess === title) {
      return true;
    }

    if (guess.length >= 2 && title.includes(guess)) {
      return true;
    }

    if (title.length >= 2 && guess.includes(title)) {
      return true;
    }

    return false;
  });

  const correct = exactish || similarity >= 0.92;
  if (!correct) {
    round.wrongAttemptsUsed += 1;
  }
  const finished = correct || round.attemptsUsed >= round.maxAttempts;
  const pointsAwarded = correct ? POINTS_BY_ATTEMPT[Math.min(round.attemptsUsed - 1, POINTS_BY_ATTEMPT.length - 1)] : 0;

  saveRound(round);

  const response = NextResponse.json({
    correct,
    finished,
    revealed: finished && !correct,
    pointsAwarded,
    attemptsUsed: round.attemptsUsed,
    remainingAttempts: Math.max(round.maxAttempts - round.attemptsUsed, 0),
    similarity,
    revealedHints: round.hintSteps.slice(0, Math.min(round.wrongAttemptsUsed, round.hintSteps.length)),
    answer: finished
      ? {
          title: round.displayTitle,
          malUrl: round.malUrl,
          malId: round.malId,
        }
      : null,
  });

  setPlayerCookie(response, player.key, player.shouldSetCookie);

  try {
    await recordGuessEvent({
      playerKey: player.key,
      roundId,
      guessText: guessRaw,
      attemptNo: round.attemptsUsed,
      similarity,
      correct,
      finished,
      pointsAwarded,
      revealed: finished && !correct,
    });
  } catch (error) {
    console.error("[aniguess] failed to persist guess event", error);
  }

  return response;
}
