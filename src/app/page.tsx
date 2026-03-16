"use client";

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

type RankingScope = "daily" | "weekly" | "alltime";

type RankingEntry = {
  position: number;
  displayName: string;
  points: number;
  rounds: number;
  correctRounds: number;
  accuracy: number;
  bestRound: number;
};

type RankingResponse = {
  scope: RankingScope;
  entries: RankingEntry[];
  error?: string;
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
  const [rankingScope, setRankingScope] = useState<RankingScope>("alltime");
  const [rankingEntries, setRankingEntries] = useState<RankingEntry[]>([]);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState("");

  const loadRound = useCallback(async () => {
    setLoadingRound(true);
    setError("");
    setGuessInput("");
    setLastResult(null);
    setHistory([]);
    setSuggestions([]);

    try {
      const response = await fetch("/api/aniguess/round", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Nie udało się pobrać rundy");
      }

      const payload = (await response.json()) as RoundPayload;
      setRound(payload);
    } catch (loadError) {
      setRound(null);
      setError(loadError instanceof Error ? loadError.message : "Nie udało się pobrać rundy");
    } finally {
      setLoadingRound(false);
    }
  }, []);

  useEffect(() => {
    void loadRound();
  }, [loadRound]);

  const loadRanking = useCallback(async (scope: RankingScope) => {
    setRankingLoading(true);
    setRankingError("");

    try {
      const response = await fetch(`/api/aniguess/ranking?scope=${scope}&limit=10`, {
        cache: "no-store",
      });

      const payload = (await response.json()) as RankingResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Nie udało się pobrać rankingu");
      }

      setRankingEntries(payload.entries ?? []);
    } catch (rankingLoadError) {
      setRankingEntries([]);
      setRankingError(rankingLoadError instanceof Error ? rankingLoadError.message : "Nie udało się pobrać rankingu");
    } finally {
      setRankingLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRanking(rankingScope);
  }, [loadRanking, rankingScope]);

  useEffect(() => {
    if (!round || guessInput.trim().length < 2 || (lastResult?.finished ?? false)) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoadingSuggestions(true);

      try {
        const response = await fetch(`/api/aniguess/suggest?query=${encodeURIComponent(guessInput.trim())}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          setSuggestions([]);
          return;
        }

        const payload = (await response.json()) as SuggestPayload;
        setSuggestions(payload.suggestions ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSuggestions(false);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [guessInput, round, lastResult?.finished]);

  const submitGuess = useCallback(
    async (guessText: string) => {
      if (!round) {
        return;
      }

      const trimmed = guessText.trim();
      if (!trimmed) {
        return;
      }

      setGuessing(true);
      setError("");

      try {
        const response = await fetch("/api/aniguess/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roundId: round.roundId,
            action: "guess",
            guess: trimmed,
          }),
        });

        const payload = (await response.json()) as GuessPayload | { error?: string };

        if (!response.ok || "error" in payload) {
          throw new Error("error" in payload && payload.error ? payload.error : "Nie udało się sprawdzić odpowiedzi");
        }

        const result = payload as GuessPayload;

        setLastResult(result);
        setSuggestions([]);
        setGuessInput("");
        setHistory((previous) => [{ text: trimmed, similarity: result.similarity, correct: result.correct }, ...previous]);

        if (result.correct) {
          setTotalScore((current) => current + result.pointsAwarded);
          setStreak((current) => current + 1);
        } else if (result.finished) {
          setStreak(0);
        }
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Nie udało się sprawdzić odpowiedzi");
      } finally {
        setGuessing(false);
      }
    },
    [round],
  );

  const revealAnswer = useCallback(async () => {
    if (!round || guessing || (lastResult?.finished ?? false)) {
      return;
    }

    setGuessing(true);
    setError("");

    try {
      const response = await fetch("/api/aniguess/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: round.roundId,
          action: "reveal",
        }),
      });

      const payload = (await response.json()) as GuessPayload | { error?: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload && payload.error ? payload.error : "Nie udało się odkryć odpowiedzi");
      }

      const result = payload as GuessPayload;

      setLastResult(result);
      setStreak(0);
      setSuggestions([]);
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : "Nie udało się odkryć odpowiedzi");
    } finally {
      setGuessing(false);
    }
  }, [round, guessing, lastResult?.finished]);

  const handleGuess = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await submitGuess(guessInput);
    },
    [guessInput, submitGuess],
  );

  const attemptsLeft = useMemo(() => {
    if (!round) {
      return 0;
    }

    if (!lastResult) {
      return round.maxAttempts;
    }

    return lastResult.remainingAttempts;
  }, [round, lastResult]);

  const blurPx = useMemo(() => {
    if (!round) {
      return 10;
    }

    const used = round.maxAttempts - attemptsLeft;
    return Math.max(8 - used * 1.25, 0);
  }, [round, attemptsLeft]);

  const revealImage = Boolean(lastResult?.finished || lastResult?.correct || lastResult?.revealed);
  const revealedHints = lastResult?.revealedHints ?? [];

  return (
    <section className="aniguess-root">
      <header className="aniguess-hero">
        <div className="aniguess-hero__left">
          <p className="aniguess-brand">AniGuess</p>
        </div>

        <div className="aniguess-hero__right">
          <div className="aniguess-pill">
            Punkty <strong>{totalScore}</strong>
          </div>
          <div className="aniguess-pill">
            Seria <strong>{streak}</strong>
          </div>
          <div className="aniguess-pill">
            Hinty <strong>{round ? Math.max(round.hintStepsCount - revealedHints.length, 0) : 0}</strong>
          </div>
        </div>
      </header>

      <main className="aniguess-layout">
        <article className="aniguess-main-card">
          <div className="aniguess-toolbar">
            <button type="button" className="btn btn-primary" onClick={() => void loadRound()} disabled={loadingRound || guessing}>
              {loadingRound ? "Losowanie..." : round ? "Nowa runda" : "Start gry"}
            </button>
            <div className="aniguess-mini-meta">
              <span>Rok: {round?.hints.year ?? "?"}</span>
              <span>Odcinki: {round?.hints.episodes ?? "?"}</span>
              <span>MAL: {round?.hints.score ?? "?"}</span>
              <span>Rank: {round?.hints.rank ?? "?"}</span>
            </div>
          </div>

          {loadingRound ? <p className="muted">Losowanie anime z top 5000 MAL...</p> : null}
          {error ? <p className="error">{error}</p> : null}

          {round ? (
            <>
              <figure className="aniguess-frame">
                <img
                  src={round.imageUrl}
                  alt="Anime screenshot"
                  className="aniguess-image"
                  style={{ filter: revealImage ? "none" : `blur(${blurPx}px) brightness(0.72) saturate(0.9)` }}
                />
                <figcaption className="aniguess-frame__caption">Próby: {attemptsLeft}</figcaption>
              </figure>

              <form onSubmit={handleGuess} className="aniguess-guess-form">
                <div className="aniguess-input-row">
                  <input
                    type="text"
                    placeholder="Wpisz tytuł anime (EN/JP)"
                    value={guessInput}
                    onChange={(event) => setGuessInput(event.target.value)}
                    disabled={guessing || (lastResult?.finished ?? false)}
                    className="aniguess-input"
                  />
                  <button type="submit" className="btn btn-primary" disabled={guessing || !guessInput.trim() || (lastResult?.finished ?? false)}>
                    {guessing ? "Sprawdzam..." : "Sprawdź"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => void revealAnswer()} disabled={guessing || (lastResult?.finished ?? false)}>
                    Pokaż odpowiedź
                  </button>
                </div>

                {(loadingSuggestions || suggestions.length > 0) && !(lastResult?.finished ?? false) ? (
                  <div className="aniguess-suggestions">
                    {loadingSuggestions ? <span className="muted">Szukam tytułów...</span> : null}
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="aniguess-chip"
                        onClick={() => {
                          setGuessInput(suggestion);
                          setSuggestions([]);
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </form>

              {lastResult?.finished && lastResult.answer ? (
                <div className="aniguess-result">
                  <p>
                    Odpowiedź: <strong>{lastResult.answer.title}</strong>
                  </p>
                  <p className="muted">{lastResult.correct ? `+${lastResult.pointsAwarded} pkt` : "0 pkt"}</p>
                  <a href={lastResult.answer.malUrl} target="_blank" rel="noreferrer" className="aniguess-link">
                    Zobacz w MyAnimeList
                  </a>
                </div>
              ) : null}
            </>
          ) : null}
        </article>

        <aside className="aniguess-side-card">
          <h2>Podpowiedzi</h2>
          {revealedHints.length ? (
            <ol className="aniguess-hints-list">
              {revealedHints.map((hint, index) => (
                <li key={`${hint}-${index}`}>{hint}</li>
              ))}
            </ol>
          ) : (
            <p className="muted">Po każdej błędnej odpowiedzi odblokujesz kolejną podpowiedź (studio, gatunki, sezon, źródło...).</p>
          )}

          <h2>Historia prób</h2>
          {history.length ? (
            <ul className="aniguess-history-list">
              {history.slice(0, 6).map((item, index) => (
                <li key={`${item.text}-${index}`}>
                  <span>{item.correct ? "✅" : "❌"}</span>
                  <span>{item.text}</span>
                  <span>{(item.similarity * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Brak prób w tej rundzie.</p>
          )}
        </aside>
      </main>

      <section className="aniguess-ranking-card">
        <div className="aniguess-ranking__head">
          <h2>Ranking</h2>
          <div className="aniguess-ranking__tabs">
            <button
              type="button"
              className={`aniguess-tab ${rankingScope === "daily" ? "aniguess-tab--active" : ""}`}
              onClick={() => setRankingScope("daily")}
              disabled={rankingLoading}
            >
              Daily
            </button>
            <button
              type="button"
              className={`aniguess-tab ${rankingScope === "weekly" ? "aniguess-tab--active" : ""}`}
              onClick={() => setRankingScope("weekly")}
              disabled={rankingLoading}
            >
              Weekly
            </button>
            <button
              type="button"
              className={`aniguess-tab ${rankingScope === "alltime" ? "aniguess-tab--active" : ""}`}
              onClick={() => setRankingScope("alltime")}
              disabled={rankingLoading}
            >
              All-time
            </button>
          </div>
        </div>

        {rankingLoading ? <p className="muted">Ładowanie rankingu...</p> : null}
        {rankingError ? <p className="error">{rankingError}</p> : null}

        {!rankingLoading && !rankingError ? (
          rankingEntries.length ? (
            <div className="aniguess-ranking-table">
              <div className="aniguess-ranking-row aniguess-ranking-row--head">
                <span>#</span>
                <span>Gracz</span>
                <span>Punkty</span>
                <span>Skuteczność</span>
                <span>Best</span>
              </div>

              {rankingEntries.map((entry) => (
                <div key={`${entry.displayName}-${entry.position}`} className="aniguess-ranking-row">
                  <span>{entry.position}</span>
                  <span>{entry.displayName}</span>
                  <span>{entry.points}</span>
                  <span>{(entry.accuracy * 100).toFixed(0)}%</span>
                  <span>{entry.bestRound}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Brak wyników w tym zakresie czasu.</p>
          )
        ) : null}
      </section>
    </section>
  );
}
