"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type JikanAnime = {
  mal_id: number;
  title: string;
  title_english?: string | null;
  synopsis?: string | null;
  score?: number | null;
  episodes?: number | null;
  year?: number | null;
  images?: {
    jpg?: {
      image_url?: string;
      large_image_url?: string;
    };
  };
};

type JikanTopAnimeResponse = {
  data: JikanAnime[];
};

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export default function HomePage() {
  const [animeList, setAnimeList] = useState<JikanAnime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [roundSeed, setRoundSeed] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("https://api.jikan.moe/v4/top/anime?limit=24", {
          cache: "no-store",
        });

        if (!response.ok) {
          setError("Nie udało się pobrać danych z MyAnimeList.");
          return;
        }

        const payload = (await response.json()) as JikanTopAnimeResponse;
        setAnimeList(payload.data ?? []);
      } catch {
        setError("Błąd połączenia z API MyAnimeList (Jikan).");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const currentAnime = useMemo(() => {
    if (!animeList.length) {
      return null;
    }

    const index = Math.abs(roundSeed) % animeList.length;
    return animeList[index];
  }, [animeList, roundSeed]);

  const displayTitle = currentAnime?.title_english?.trim() || currentAnime?.title || "";
  const isCorrect =
    currentAnime &&
    guessInput.trim().length > 0 &&
    normalizeTitle(guessInput).includes(normalizeTitle(displayTitle));

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <header className="card" style={{ display: "grid", gap: 8 }}>
        <h1 style={{ margin: 0 }}>AniGuess PL</h1>
        <p className="muted" style={{ margin: 0 }}>
          Zgadnij anime po opisie. Dane pobierane z MyAnimeList przez API Jikan.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn" href="/aleanimiec">
            Przejdź do streamu
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setRoundSeed((prev) => prev + 1);
              setGuessInput("");
              setRevealed(false);
            }}
            disabled={!animeList.length}
          >
            Następne anime
          </button>
        </div>
      </header>

      <article className="card" style={{ display: "grid", gap: 10 }}>
        {loading ? <p className="muted">Ładowanie danych MAL...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {!loading && !error && currentAnime ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Podpowiedzi: {currentAnime.year ?? "brak roku"} • {currentAnime.episodes ?? "?"} odc. • ocena MAL {currentAnime.score ?? "?"}
            </p>

            <p style={{ margin: 0, lineHeight: 1.6 }}>
              {currentAnime.synopsis?.slice(0, 700) || "Brak opisu."}
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Wpisz tytuł anime"
                value={guessInput}
                onChange={(event) => setGuessInput(event.target.value)}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #202b4b",
                  background: "#0f162d",
                  color: "#f3f4f6",
                  minWidth: 260,
                }}
              />
              <button type="button" className="btn" onClick={() => setRevealed(true)}>
                Pokaż odpowiedź
              </button>
            </div>

            {isCorrect ? <p style={{ margin: 0, color: "#4ade80" }}>✅ Dobra odpowiedź!</p> : null}

            {revealed || isCorrect ? (
              <div style={{ display: "grid", gap: 8 }}>
                <p style={{ margin: 0 }}>
                  Tytuł: <strong>{displayTitle}</strong>
                </p>
                <a
                  href={`https://myanimelist.net/anime/${currentAnime.mal_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="muted"
                >
                  Otwórz w MyAnimeList
                </a>
              </div>
            ) : null}
          </>
        ) : null}
      </article>

      {!loading && animeList.length ? (
        <section className="card" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Top anime (MAL)</h2>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            }}
          >
            {animeList.slice(0, 12).map((anime) => (
              <a
                key={anime.mal_id}
                href={`https://myanimelist.net/anime/${anime.mal_id}`}
                target="_blank"
                rel="noreferrer"
                className="card"
                style={{ padding: 10, display: "grid", gap: 6 }}
              >
                {anime.images?.jpg?.image_url ? (
                  <img
                    src={anime.images.jpg.image_url}
                    alt={anime.title}
                    style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 8 }}
                  />
                ) : null}
                <strong style={{ fontSize: 14, lineHeight: 1.3 }}>{anime.title_english || anime.title}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  MAL: {anime.score ?? "?"}
                </span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
