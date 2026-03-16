import type { PoolClient } from "pg";
import { dbQuery, dbTransaction, isDatabaseConfigured } from "@/lib/postgres";

const PLAYER_COOKIE_NAME = "aniguess_player_id";

let schemaReady = false;

export type RankingScope = "daily" | "weekly" | "alltime";

export type RankingEntry = {
  position: number;
  displayName: string;
  points: number;
  rounds: number;
  correctRounds: number;
  accuracy: number;
  bestRound: number;
};

export function getPlayerCookieName(): string {
  return PLAYER_COOKIE_NAME;
}

export function canUseRankingDatabase(): boolean {
  return isDatabaseConfigured();
}

export async function ensureRankingSchema(): Promise<void> {
  if (!canUseRankingDatabase() || schemaReady) {
    return;
  }

  await dbQuery(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS aniguess_players (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      player_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS aniguess_round_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id UUID NOT NULL REFERENCES aniguess_players(id) ON DELETE CASCADE,
      round_id TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      attempts_used INT NOT NULL DEFAULT 0,
      points_awarded INT NOT NULL DEFAULT 0,
      correct BOOLEAN,
      revealed BOOLEAN NOT NULL DEFAULT FALSE,
      CONSTRAINT aniguess_round_sessions_unique_player_round UNIQUE (player_id, round_id)
    );

    CREATE TABLE IF NOT EXISTS aniguess_guesses (
      id BIGSERIAL PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES aniguess_round_sessions(id) ON DELETE CASCADE,
      attempt_no INT NOT NULL,
      guess_text TEXT NOT NULL,
      similarity NUMERIC(6,5) NOT NULL,
      correct BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT aniguess_guesses_text_len CHECK (char_length(guess_text) BETWEEN 1 AND 200),
      CONSTRAINT aniguess_guesses_unique_attempt UNIQUE (session_id, attempt_no)
    );

    CREATE INDEX IF NOT EXISTS idx_aniguess_sessions_finished_at ON aniguess_round_sessions(finished_at DESC);
    CREATE INDEX IF NOT EXISTS idx_aniguess_sessions_player_finished ON aniguess_round_sessions(player_id, finished_at DESC);
    CREATE INDEX IF NOT EXISTS idx_aniguess_guesses_session_attempt ON aniguess_guesses(session_id, attempt_no);
  `);

  schemaReady = true;
}

async function upsertPlayer(client: PoolClient, playerKey: string): Promise<{ id: string }> {
  const displaySuffix = playerKey.replace(/-/g, "").slice(0, 6).toUpperCase();
  const displayName = `Gracz-${displaySuffix}`;

  const result = await client.query<{ id: string }>(
    `
      INSERT INTO aniguess_players(player_key, display_name)
      VALUES ($1, $2)
      ON CONFLICT(player_key)
      DO UPDATE SET last_seen_at = NOW()
      RETURNING id
    `,
    [playerKey, displayName],
  );

  return result.rows[0];
}

async function upsertSession(client: PoolClient, playerId: string, roundId: string): Promise<{ id: string }> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO aniguess_round_sessions(player_id, round_id)
      VALUES ($1, $2)
      ON CONFLICT(player_id, round_id)
      DO UPDATE SET attempts_used = aniguess_round_sessions.attempts_used
      RETURNING id
    `,
    [playerId, roundId],
  );

  return result.rows[0];
}

type RecordGuessParams = {
  playerKey: string;
  roundId: string;
  guessText: string;
  attemptNo: number;
  similarity: number;
  correct: boolean;
  finished: boolean;
  pointsAwarded: number;
  revealed: boolean;
};

export async function recordGuessEvent(params: RecordGuessParams): Promise<void> {
  if (!canUseRankingDatabase()) {
    return;
  }

  await ensureRankingSchema();

  await dbTransaction(async (client) => {
    const player = await upsertPlayer(client, params.playerKey);
    const session = await upsertSession(client, player.id, params.roundId);

    await client.query(
      `
        INSERT INTO aniguess_guesses(session_id, attempt_no, guess_text, similarity, correct)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(session_id, attempt_no) DO NOTHING
      `,
      [session.id, params.attemptNo, params.guessText.slice(0, 200), params.similarity, params.correct],
    );

    if (params.finished) {
      await client.query(
        `
          UPDATE aniguess_round_sessions
          SET attempts_used = GREATEST(attempts_used, $2),
              points_awarded = $3,
              correct = $4,
              revealed = $5,
              finished_at = COALESCE(finished_at, NOW())
          WHERE id = $1
        `,
        [session.id, params.attemptNo, params.pointsAwarded, params.correct, params.revealed],
      );
      return;
    }

    await client.query(
      `
        UPDATE aniguess_round_sessions
        SET attempts_used = GREATEST(attempts_used, $2)
        WHERE id = $1
      `,
      [session.id, params.attemptNo],
    );
  });
}

type RecordRevealParams = {
  playerKey: string;
  roundId: string;
  attemptsUsed: number;
};

export async function recordRevealEvent(params: RecordRevealParams): Promise<void> {
  if (!canUseRankingDatabase()) {
    return;
  }

  await ensureRankingSchema();

  await dbTransaction(async (client) => {
    const player = await upsertPlayer(client, params.playerKey);
    const session = await upsertSession(client, player.id, params.roundId);

    await client.query(
      `
        UPDATE aniguess_round_sessions
        SET attempts_used = GREATEST(attempts_used, $2),
            points_awarded = 0,
            correct = FALSE,
            revealed = TRUE,
            finished_at = COALESCE(finished_at, NOW())
        WHERE id = $1
      `,
      [session.id, params.attemptsUsed],
    );
  });
}

export async function getRanking(scope: RankingScope, limit: number): Promise<RankingEntry[]> {
  if (!canUseRankingDatabase()) {
    return [];
  }

  await ensureRankingSchema();

  const boundedLimit = Math.min(Math.max(limit, 1), 100);

  const timeframeWhere =
    scope === "daily"
      ? `finished_at >= date_trunc('day', now())`
      : scope === "weekly"
        ? `finished_at >= date_trunc('week', now())`
        : `TRUE`;

  const result = await dbQuery<{
    position: number;
    display_name: string;
    points: string;
    rounds: string;
    correct_rounds: string;
    best_round: string;
  }>(
    `
      WITH aggregated AS (
        SELECT
          p.display_name,
          SUM(s.points_awarded)::BIGINT AS points,
          COUNT(*)::BIGINT AS rounds,
          SUM(CASE WHEN s.correct THEN 1 ELSE 0 END)::BIGINT AS correct_rounds,
          MAX(s.points_awarded)::BIGINT AS best_round
        FROM aniguess_round_sessions s
        INNER JOIN aniguess_players p ON p.id = s.player_id
        WHERE s.finished_at IS NOT NULL
          AND ${timeframeWhere}
        GROUP BY p.display_name
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY points DESC, correct_rounds DESC, rounds DESC, display_name ASC) AS position,
        display_name,
        points,
        rounds,
        correct_rounds,
        best_round
      FROM aggregated
      ORDER BY points DESC, correct_rounds DESC, rounds DESC, display_name ASC
      LIMIT $1
    `,
    [boundedLimit],
  );

  return result.rows.map((row) => {
    const rounds = Number(row.rounds);
    const correctRounds = Number(row.correct_rounds);

    return {
      position: Number(row.position),
      displayName: row.display_name,
      points: Number(row.points),
      rounds,
      correctRounds,
      accuracy: rounds > 0 ? correctRounds / rounds : 0,
      bestRound: Number(row.best_round),
    };
  });
}
