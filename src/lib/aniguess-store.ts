import { randomUUID } from "node:crypto";

export type AniGuessRound = {
  id: string;
  createdAt: number;
  attemptsUsed: number;
  maxAttempts: number;
  normalizedTitles: string[];
  displayTitle: string;
  malId: number;
  malUrl: string;
  imageUrl: string;
  score: number | null;
  episodes: number | null;
  year: number | null;
  rank: number | null;
};

declare global {
  var __aniguessRounds: Map<string, AniGuessRound> | undefined;
}

const ROUND_TTL_MS = 2 * 60 * 60 * 1000;

const rounds = globalThis.__aniguessRounds ?? new Map<string, AniGuessRound>();
if (!globalThis.__aniguessRounds) {
  globalThis.__aniguessRounds = rounds;
}

export function normalizeGuessText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const matrix: number[][] = Array.from({ length: left.length + 1 }, () => []);

  for (let i = 0; i <= left.length; i += 1) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= right.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  return matrix[left.length][right.length];
}

export function similarityScore(left: string, right: string): number {
  if (!left.length || !right.length) {
    return 0;
  }

  const distance = levenshteinDistance(left, right);
  const maxLength = Math.max(left.length, right.length);
  return Math.max(0, 1 - distance / maxLength);
}

export function cleanupExpiredRounds(): void {
  const now = Date.now();
  for (const [id, round] of rounds.entries()) {
    if (now - round.createdAt > ROUND_TTL_MS) {
      rounds.delete(id);
    }
  }
}

export function createRound(data: Omit<AniGuessRound, "id" | "createdAt" | "attemptsUsed">): AniGuessRound {
  cleanupExpiredRounds();

  const round: AniGuessRound = {
    ...data,
    id: randomUUID(),
    createdAt: Date.now(),
    attemptsUsed: 0,
  };

  rounds.set(round.id, round);
  return round;
}

export function getRound(roundId: string): AniGuessRound | null {
  cleanupExpiredRounds();
  return rounds.get(roundId) ?? null;
}

export function saveRound(round: AniGuessRound): void {
  rounds.set(round.id, round);
}
