"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type MangaMode = "latest" | "popular" | "search";

type MangaItem = {
  id: string;
  title: string;
  description: string;
  year: number | null;
  status: string | null;
  tags: string[];
  coverUrl: string | null;
  mangaDexUrl: string;
};

type MangaPayload = {
  items: MangaItem[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
};

export default function MangaPage() {
  const [mode, setMode] = useState<MangaMode>("latest");
  const [inputValue, setInputValue] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [items, setItems] = useState<MangaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(18);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fetchManga = useCallback(
    async (nextOffset: number, append: boolean) => {
      setError("");
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams({
          mode,
          limit: String(limit),
          offset: String(nextOffset),
        });

        if (mode === "search" && activeQuery.trim().length >= 2) {
          params.set("query", activeQuery.trim());
        }

        const response = await fetch(`/api/manga?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as MangaPayload;

        if (!response.ok || payload.error) {
          throw new Error(payload.error || "Nie udało się pobrać mang.");
        }

        setItems((previous) => (append ? [...previous, ...(payload.items || [])] : payload.items || []));
        setTotal(payload.total || 0);
        setOffset(payload.offset || nextOffset);
        setLimit(payload.limit || 18);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Nie udało się pobrać mang.");
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [mode, activeQuery, limit],
  );

  useEffect(() => {
    if (mode === "search" && activeQuery.trim().length < 2) {
      setItems([]);
      setTotal(0);
      setOffset(0);
      setLoading(false);
      return;
    }

    void fetchManga(0, false);
  }, [mode, activeQuery, fetchManga]);

  const handleSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const query = inputValue.trim();
      if (query.length < 2) {
        setError("Wpisz minimum 2 znaki.");
        return;
      }

      setMode("search");
      setActiveQuery(query);
    },
    [inputValue],
  );

  const canLoadMore = items.length > 0 && items.length < total;

  return (
    <section className="manga-root">
      <header className="manga-hero">
        <div>
          <p className="manga-brand">Manga</p>
          <h1>Przeglądaj serie</h1>
          <p className="muted">Nowe rozdziały, popularne tytuły i szybkie wyszukiwanie.</p>
        </div>
        <Link href="/" className="btn btn-ghost">
          Wróć do AniGuess
        </Link>
      </header>

      <form className="manga-search" onSubmit={handleSearch}>
        <input
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Szukaj mangi po tytule..."
          className="manga-search__input"
        />
        <button type="submit" className="btn btn-primary" disabled={loading || loadingMore}>
          Szukaj
        </button>
      </form>

      <div className="manga-tabs" role="tablist" aria-label="Tryb listy mang">
        <button type="button" className={`manga-tab ${mode === "latest" ? "manga-tab--active" : ""}`} onClick={() => setMode("latest")}>
          Najnowsze
        </button>
        <button type="button" className={`manga-tab ${mode === "popular" ? "manga-tab--active" : ""}`} onClick={() => setMode("popular")}>
          Popularne
        </button>
        <button type="button" className={`manga-tab ${mode === "search" ? "manga-tab--active" : ""}`} onClick={() => setMode("search")}>
          Wyniki wyszukiwania
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Ładowanie mang...</p> : null}
      {!loading && mode === "search" && activeQuery.trim().length < 2 ? <p className="muted">Wpisz frazę i kliknij Szukaj.</p> : null}
      {!loading && !error && items.length === 0 && (mode !== "search" || activeQuery.trim().length >= 2) ? (
        <p className="muted">Brak wyników.</p>
      ) : null}

      {items.length ? (
        <div className="manga-grid">
          {items.map((item) => (
            <article key={item.id} className="manga-card">
              <div className="manga-card__cover-wrap">
                {item.coverUrl ? <img src={item.coverUrl} alt={`Okładka ${item.title}`} className="manga-card__cover" loading="lazy" /> : null}
              </div>

              <div className="manga-card__body">
                <h2>{item.title}</h2>
                <p className="manga-card__meta">
                  {item.year ? `Rok: ${item.year}` : "Rok: ?"} · {item.status || "status nieznany"}
                </p>
                <p className="manga-card__description">{item.description}</p>

                {item.tags.length ? (
                  <div className="manga-card__tags">
                    {item.tags.map((tag) => (
                      <span key={`${item.id}-${tag}`} className="manga-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <a href={item.mangaDexUrl} target="_blank" rel="noreferrer" className="manga-card__link">
                  Otwórz na MangaDex
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {canLoadMore ? (
        <div className="manga-load-more">
          <button type="button" className="btn btn-ghost" onClick={() => void fetchManga(offset + limit, true)} disabled={loadingMore || loading}>
            {loadingMore ? "Ładowanie..." : "Pokaż więcej"}
          </button>
        </div>
      ) : null}
    </section>
  );
}