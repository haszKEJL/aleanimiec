import { NextRequest, NextResponse } from "next/server";
import { getRound, normalizeGuessText, saveRound, similarityScore } from "@/lib/aniguess-store";

export const runtime = "nodejs";

type GuessBody = {
  roundId?: string;
  guess?: string;
  action?: "guess" | "reveal";
};

const POINTS_BY_ATTEMPT = [1000, 750, 550, 350, 200];

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
    return NextResponse.json({
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
    });
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

    if (guess.length >= 4 && title.includes(guess)) {
      return true;
    }

    if (title.length >= 4 && guess.includes(title)) {
      return true;
    }

    return false;
  });

  const correct = exactish || similarity >= 0.92;
  const finished = correct || round.attemptsUsed >= round.maxAttempts;
  const pointsAwarded = correct ? POINTS_BY_ATTEMPT[Math.min(round.attemptsUsed - 1, POINTS_BY_ATTEMPT.length - 1)] : 0;

  saveRound(round);

  return NextResponse.json({
    correct,
    finished,
    revealed: finished && !correct,
    pointsAwarded,
    attemptsUsed: round.attemptsUsed,
    remainingAttempts: Math.max(round.maxAttempts - round.attemptsUsed, 0),
    similarity,
    answer: finished
      ? {
          title: round.displayTitle,
          malUrl: round.malUrl,
          malId: round.malId,
        }
      : null,
  });
}
