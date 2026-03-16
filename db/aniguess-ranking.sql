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
