"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type RoundPayload = {
  roundId: string;
  imageUrl: string;
  hints: {
    score: number | null;
    episodes: number | null;
    year: number | null;
    rank: number | null;
  };
  maxAttempts: number;
};

type GuessPayload = {
  correct: boolean;
  finished: boolean;
  revealed: boolean;
  pointsAwarded: number;
  attemptsUsed: number;
  remainingAttempts: number;
  similarity: number;
  answer: {
    title: string;
    malUrl: string;
    malId: number;
  } | null;
};

type GuessHistoryItem = {
  text: string;
  similarity: number;
  correct: boolean;
};

type SuggestPayload = {
  suggestions: string[];
};

export default function HomePage() {
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [loadingRound, setLoadingRound] = useState(false);
  const [guessing, setGuessing] = useState(false);
  const [error, setError] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [lastResult, setLastResult] = useState<GuessPayload | null>(null);
  const [history, setHistory] = useState<GuessHistoryItem[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const loadRound = useCallback(async () => {
    setLoadingRound(true);
    setError("");
    setGuessInput("");
    setLastResult(null);
    setHistory([]);
    setSuggestions([]);

    try {
      const response = await fetch("/api/aniguess/round", {
        cache: "no-store",
      });

      if (!response.ok) {
        setError("Nie udało się przygotować nowej rundy.");
        setRound(null);
        return;
      }

      const payload = (await response.json()) as RoundPayload;
      setRound(payload);
    } catch {
      setError("Błąd połączenia z API rund.");
      setRound(null);
    } finally {
      setLoadingRound(false);
    }
  }, []);

  const handleGuess = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (!round || !guessInput.trim() || guessing || (lastResult?.finished ?? false)) {
        return;
      }

      setGuessing(true);

      try {
        const response = await fetch("/api/aniguess/guess", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roundId: round.roundId,
            guess: guessInput,
            action: "guess",
          }),
        });

        if (!response.ok) {
          setError("Nie udało się wysłać odpowiedzi.");
          return;
        }

        const payload = (await response.json()) as GuessPayload;
        setLastResult(payload);
        setHistory((prev) => [
          { text: guessInput.trim(), similarity: payload.similarity, correct: payload.correct },
          ...prev,
        ]);

        if (payload.correct) {
          setTotalScore((prev) => prev + payload.pointsAwarded);
          setStreak((prev) => prev + 1);
        } else if (payload.finished) {
          setStreak(0);
        }

        setGuessInput("");
      } catch {
        setError("Błąd połączenia podczas zgadywania.");
      } finally {
        setGuessing(false);
      }
    },
    [guessInput, guessing, lastResult?.finished, round],
  );

  const revealAnswer = useCallback(async () => {
    if (!round || guessing || (lastResult?.finished ?? false)) {
      return;
    }

    setGuessing(true);
    try {
      const response = await fetch("/api/aniguess/guess", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roundId: round.roundId,
          action: "reveal",
        }),
      });

      if (!response.ok) {
        setError("Nie udało się odsłonić odpowiedzi.");
        return;
      }

      const payload = (await response.json()) as GuessPayload;
      setLastResult(payload);
      setStreak(0);
    } catch {
      setError("Błąd połączenia podczas odsłaniania odpowiedzi.");
    } finally {
      setGuessing(false);
    }
  }, [guessing, lastResult?.finished, round]);

  useEffect(() => {
    const term = guessInput.trim();
    if (term.length < 2 || (lastResult?.finished ?? false)) {
      setSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      void (async () => {
        setLoadingSuggestions(true);
        try {
          const response = await fetch(`/api/aniguess/suggest?query=${encodeURIComponent(term)}`, {
            cache: "no-store",
          });

          if (!response.ok) {
            setSuggestions([]);
            return;
          }

          const payload = (await response.json()) as SuggestPayload;
          setSuggestions(payload.suggestions ?? []);
        } catch {
          setSuggestions([]);
        } finally {
          setLoadingSuggestions(false);
        }
      })();
    }, 180);

    return () => clearTimeout(timeoutId);
  }, [guessInput, lastResult?.finished]);

  const attemptsUsed = lastResult?.attemptsUsed ?? 0;
  const blurPx = useMemo(() => {
    const levels = [16, 12, 9, 6, 3, 0];
    return levels[Math.min(attemptsUsed, levels.length - 1)];
  }, [attemptsUsed]);

  const attemptsLeft = useMemo(() => {
    if (!round) {
      return 0;
    }

    return lastResult ? lastResult.remainingAttempts : round.maxAttempts;
  }, [lastResult, round]);

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <header className="card" style={{ display: "grid", gap: 10, borderColor: "#16181d", background: "#08090b" }}>
        <h1 style={{ margin: 0 }}>AniGuess PL</h1>
        <p className="muted" style={{ margin: 0 }}>
          Zgadnij anime po screenie. Masz 5 prób i zdobywasz punkty za szybką poprawną odpowiedź.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn" href="/aleanimiec">
            Przejdź do streamu
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void loadRound();
            }}
            disabled={loadingRound || guessing}
          >
            {loadingRound ? "Losowanie..." : "Nowa runda"}
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Punkty: {totalScore} • Seria: {streak}
        </p>
      </header>

      <article className="card" style={{ display: "grid", gap: 12, borderColor: "#16181d", background: "#0a0b0f" }}>
        {!round && !loadingRound ? (
          <button type="button" className="btn" onClick={() => void loadRound()}>
            Start gry
          </button>
        ) : null}

        {loadingRound ? <p className="muted">Losowanie anime z top 5000 MAL...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {round ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Podpowiedzi: {round.hints.year ?? "brak roku"} • {round.hints.episodes ?? "?"} odc. • ocena MAL {round.hints.score ?? "?"} • ranking {round.hints.rank ?? "?"}
            </p>

            <img
              src={round.imageUrl}
              alt="Anime screenshot"
              style={{
                width: "100%",
                maxWidth: 720,
                justifySelf: "center",
                aspectRatio: "16 / 9",
                objectFit: "cover",
                borderRadius: 12,
                filter: `blur(${blurPx}px) brightness(0.75)`,
                transition: "filter 180ms ease",
                border: "1px solid #1f232d",
              }}
            />

            <form onSubmit={handleGuess} style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Wpisz tytuł anime (EN/JP)"
                  value={guessInput}
                  onChange={(event) => setGuessInput(event.target.value)}
                  disabled={guessing || (lastResult?.finished ?? false)}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #232633",
                    background: "#0d0f14",
                    color: "#f3f4f6",
                    minWidth: 280,
                    flex: 1,
                  }}
                />
                <button type="submit" className="btn" disabled={guessing || !guessInput.trim() || (lastResult?.finished ?? false)}>
                  {guessing ? "Sprawdzam..." : "Sprawdź"}
                </button>
                <button type="button" className="btn" onClick={() => void revealAnswer()} disabled={guessing || (lastResult?.finished ?? false)}>
                  Pokaż odpowiedź
                </button>
              </div>

              {(loadingSuggestions || suggestions.length > 0) && !(lastResult?.finished ?? false) ? (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    padding: 8,
                    border: "1px solid #1d212c",
                    borderRadius: 8,
                    background: "#0b0d12",
                  }}
                >
                  {loadingSuggestions ? <span className="muted">Szukam tytułów...</span> : null}
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="btn"
                      onClick={() => {
                        setGuessInput(suggestion);
                        setSuggestions([]);
                      }}
                      style={{ padding: "6px 10px" }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </form>

            <p className="muted" style={{ margin: 0 }}>
              Pozostałe próby: {attemptsLeft}
            </p>

            {history.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                {history.slice(0, 5).map((item, index) => (
                  <p key={`${item.text}-${index}`} className="muted" style={{ margin: 0 }}>
                    {item.correct ? "✅" : "❌"} {item.text} — podobieństwo {(item.similarity * 100).toFixed(1)}%
                  </p>
                ))}
              </div>
            ) : null}

            {lastResult?.finished && lastResult.answer ? (
              <div style={{ display: "grid", gap: 8 }}>
                <p style={{ margin: 0 }}>
                  Odpowiedź: <strong>{lastResult.answer.title}</strong>
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  {lastResult.correct ? `+${lastResult.pointsAwarded} pkt` : "0 pkt"}
                </p>
                <a href={lastResult.answer.malUrl} target="_blank" rel="noreferrer" className="muted">
                  Otwórz w MyAnimeList
                </a>
              </div>
            ) : null}
          </>
        ) : null}
      </article>
    </section>
  );
}
