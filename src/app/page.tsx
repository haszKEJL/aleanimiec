"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type RoundPayload = {
  roundId: string;
  imageUrl: string;
  hintStepsCount: number;
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
  revealedHints: string[];
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
  const revealImage = Boolean(lastResult?.correct || lastResult?.revealed || (lastResult?.finished && lastResult?.answer));
  const blurPx = useMemo(() => {
    if (revealImage) {
      return 0;
    }

    const levels = [16, 12, 9, 6, 3, 0];
    return levels[Math.min(attemptsUsed, levels.length - 1)];
  }, [attemptsUsed, revealImage]);

  const attemptsLeft = useMemo(() => {
    if (!round) {
      return 0;
    }

    return lastResult ? lastResult.remainingAttempts : round.maxAttempts;
  }, [lastResult, round]);

  const revealedHints = lastResult?.revealedHints ?? [];

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header
        className="card"
        style={{
          display: "grid",
          gap: 12,
          borderColor: "#1f2431",
          background: "linear-gradient(180deg,#0f1219,#090b11)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 280,
            height: 280,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,180,255,0.16), transparent 70%)",
            top: -120,
            right: -90,
            pointerEvents: "none",
          }}
        />

        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: 0.2 }}>AniGuess PL</h1>
          <p className="muted" style={{ margin: 0 }}>
          Zgadnij anime po screenie. Masz 5 prób i zdobywasz punkty za szybką poprawną odpowiedź.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <span className="muted" style={{ padding: "6px 10px", border: "1px solid #232a39", borderRadius: 999, background: "#0d1118" }}>
              Punkty: <strong style={{ color: "#f3f4f6" }}>{totalScore}</strong>
            </span>
            <span className="muted" style={{ padding: "6px 10px", border: "1px solid #232a39", borderRadius: 999, background: "#0d1118" }}>
              Seria: <strong style={{ color: "#f3f4f6" }}>{streak}</strong>
            </span>
            <span className="muted" style={{ padding: "6px 10px", border: "1px solid #232a39", borderRadius: 999, background: "#0d1118" }}>
              Hinty: <strong style={{ color: "#f3f4f6" }}>{round ? Math.max(round.hintStepsCount - revealedHints.length, 0) : 0}</strong>
            </span>
          </div>
        </div>
      </header>

      <article
        className="card"
        style={{
          display: "grid",
          gap: 16,
          borderColor: "#1d2230",
          background: "linear-gradient(180deg,#0f1219,#090b11)",
        }}
      >
        {!round && !loadingRound ? (
          <button type="button" className="btn" onClick={() => void loadRound()} style={{ justifySelf: "start" }}>
            Start gry
          </button>
        ) : null}

        {loadingRound ? <p className="muted">Losowanie anime z top 5000 MAL...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {round ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="muted" style={{ padding: "6px 10px", border: "1px solid #273042", borderRadius: 999, background: "#0c1118" }}>
                Rok: {round.hints.year ?? "brak"}
              </span>
              <span className="muted" style={{ padding: "6px 10px", border: "1px solid #273042", borderRadius: 999, background: "#0c1118" }}>
                Odcinki: {round.hints.episodes ?? "?"}
              </span>
              <span className="muted" style={{ padding: "6px 10px", border: "1px solid #273042", borderRadius: 999, background: "#0c1118" }}>
                MAL: {round.hints.score ?? "?"}
              </span>
              <span className="muted" style={{ padding: "6px 10px", border: "1px solid #273042", borderRadius: 999, background: "#0c1118" }}>
                Rank: {round.hints.rank ?? "?"}
              </span>
            </div>

            <img
              src={round.imageUrl}
              alt="Anime screenshot"
              style={{
                width: "100%",
                maxWidth: 900,
                justifySelf: "center",
                aspectRatio: "16 / 9",
                objectFit: "cover",
                borderRadius: 16,
                filter: revealImage ? "none" : `blur(${blurPx}px) brightness(0.74) saturate(0.9)`,
                transition: "filter 220ms ease",
                border: "1px solid #2a3242",
                boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
              }}
            />

            <form
              onSubmit={handleGuess}
              style={{
                display: "grid",
                gap: 10,
                border: "1px solid #22293a",
                borderRadius: 12,
                padding: 12,
                background: "#0b0f16",
              }}
            >
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
                    border: "1px solid #343b4f",
                    background: "#10141d",
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
                    border: "1px solid #2c3446",
                    borderRadius: 8,
                    background: "#0f141e",
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

            {revealedHints.length ? (
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  border: "1px solid #2b3344",
                  borderRadius: 10,
                  padding: 10,
                  background: "#0f131c",
                }}
              >
                <strong style={{ fontSize: 14 }}>Podpowiedzi odblokowane po błędnych odpowiedziach:</strong>
                {revealedHints.map((hint, index) => (
                  <span key={`${hint}-${index}`} className="muted">
                    {index + 1}. {hint}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Błędna odpowiedź odblokowuje kolejną podpowiedź (studio, gatunki, sezon itd.).
              </p>
            )}

            {history.length ? (
              <div style={{ display: "grid", gap: 6, borderTop: "1px solid #21293a", paddingTop: 10 }}>
                {history.slice(0, 5).map((item, index) => (
                  <p key={`${item.text}-${index}`} className="muted" style={{ margin: 0 }}>
                    {item.correct ? "✅" : "❌"} {item.text} — podobieństwo {(item.similarity * 100).toFixed(1)}%
                  </p>
                ))}
              </div>
            ) : null}

            {lastResult?.finished && lastResult.answer ? (
              <div style={{ display: "grid", gap: 8, borderTop: "1px solid #21293a", paddingTop: 12 }}>
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
