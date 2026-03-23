"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type MangaMode = "latest" | "popular" | "search";

type MangaItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "ongoing" | "completed" | "hiatus";
  tags: string[];
  coverUrl: string | null;
  chapterCount: number;
  latestChapterNumber: number | null;
  latestChapterDate: string | null;
};

type SeriesBasicItem = {
  id: string;
  slug: string;
  title: string;
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
  const [seriesOptions, setSeriesOptions] = useState<SeriesBasicItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(18);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [creatingSeries, setCreatingSeries] = useState(false);
  const [creatingChapter, setCreatingChapter] = useState(false);

  const [seriesTitle, setSeriesTitle] = useState("");
  const [seriesSlug, setSeriesSlug] = useState("");
  const [seriesDescription, setSeriesDescription] = useState("");
  const [seriesTags, setSeriesTags] = useState("");
  const [seriesStatus, setSeriesStatus] = useState<"ongoing" | "completed" | "hiatus">("ongoing");
  const [seriesCover, setSeriesCover] = useState<File | null>(null);

  const [chapterSeriesId, setChapterSeriesId] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterPages, setChapterPages] = useState<FileList | null>(null);

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

  const loadSeriesOptions = useCallback(async () => {
    try {
      const response = await fetch("/api/manga?mode=series&limit=500", { cache: "no-store" });
      const payload = (await response.json()) as { items?: SeriesBasicItem[] };
      if (!response.ok) {
        return;
      }
      const itemsList = payload.items || [];
      setSeriesOptions(itemsList);
      if (!chapterSeriesId && itemsList.length) {
        setChapterSeriesId(itemsList[0].id);
      }
    } catch {
      setSeriesOptions([]);
    }
  }, [chapterSeriesId]);

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

  useEffect(() => {
    void loadSeriesOptions();
  }, [loadSeriesOptions]);

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

  const submitCreateSeries = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAdminMessage("");

      if (!adminPassword.trim()) {
        setAdminMessage("Podaj hasło admina.");
        return;
      }

      if (!seriesTitle.trim()) {
        setAdminMessage("Podaj tytuł serii.");
        return;
      }

      setCreatingSeries(true);

      try {
        const formData = new FormData();
        formData.set("action", "create-series");
        formData.set("title", seriesTitle.trim());
        formData.set("slug", seriesSlug.trim());
        formData.set("description", seriesDescription.trim());
        formData.set("tags", seriesTags.trim());
        formData.set("status", seriesStatus);
        if (seriesCover) {
          formData.set("cover", seriesCover);
        }

        const response = await fetch("/api/manga", {
          method: "POST",
          headers: {
            "x-admin-password": adminPassword.trim(),
          },
          body: formData,
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Nie udało się dodać serii.");
        }

        setAdminMessage("Seria została dodana.");
        setSeriesTitle("");
        setSeriesSlug("");
        setSeriesDescription("");
        setSeriesTags("");
        setSeriesCover(null);
        await Promise.all([fetchManga(0, false), loadSeriesOptions()]);
      } catch (submitError) {
        setAdminMessage(submitError instanceof Error ? submitError.message : "Nie udało się dodać serii.");
      } finally {
        setCreatingSeries(false);
      }
    },
    [adminPassword, seriesTitle, seriesSlug, seriesDescription, seriesTags, seriesStatus, seriesCover, fetchManga, loadSeriesOptions],
  );

  const submitCreateChapter = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAdminMessage("");

      if (!adminPassword.trim()) {
        setAdminMessage("Podaj hasło admina.");
        return;
      }

      if (!chapterSeriesId) {
        setAdminMessage("Wybierz serię.");
        return;
      }

      if (!chapterNumber.trim()) {
        setAdminMessage("Podaj numer rozdziału.");
        return;
      }

      if (!chapterPages || chapterPages.length === 0) {
        setAdminMessage("Dodaj strony rozdziału (obrazy). ");
        return;
      }

      setCreatingChapter(true);

      try {
        const formData = new FormData();
        formData.set("action", "create-chapter");
        formData.set("seriesId", chapterSeriesId);
        formData.set("chapterNumber", chapterNumber.trim());
        formData.set("chapterTitle", chapterTitle.trim());

        Array.from(chapterPages).forEach((file) => {
          formData.append("pages", file);
        });

        const response = await fetch("/api/manga", {
          method: "POST",
          headers: {
            "x-admin-password": adminPassword.trim(),
          },
          body: formData,
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Nie udało się dodać rozdziału.");
        }

        setAdminMessage("Rozdział został dodany.");
        setChapterNumber("");
        setChapterTitle("");
        setChapterPages(null);
        await Promise.all([fetchManga(0, false), loadSeriesOptions()]);
      } catch (submitError) {
        setAdminMessage(submitError instanceof Error ? submitError.message : "Nie udało się dodać rozdziału.");
      } finally {
        setCreatingChapter(false);
      }
    },
    [adminPassword, chapterSeriesId, chapterNumber, chapterPages, chapterTitle, fetchManga, loadSeriesOptions],
  );

  const canLoadMore = items.length > 0 && items.length < total;

  return (
    <section className="manga-root">
      <header className="manga-hero">
        <div>
          <p className="manga-brand">Manga CMS</p>
          <h1>Strona grupy tłumaczeniowej</h1>
          <p className="muted">Publikuj swoje tłumaczenia, rozdziały i czytaj je w prostym czytniku.</p>
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
          Najaktywniejsze
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
                  {item.status} · rozdziały: {item.chapterCount}
                </p>
                <p className="manga-card__description">{item.description}</p>

                <p className="manga-card__meta">
                  {item.latestChapterNumber ? `Ostatni: ${item.latestChapterNumber}` : "Brak rozdziałów"}
                  {item.latestChapterDate ? ` · ${new Date(item.latestChapterDate).toLocaleDateString("pl-PL")}` : ""}
                </p>

                {item.tags.length ? (
                  <div className="manga-card__tags">
                    {item.tags.map((tag) => (
                      <span key={`${item.id}-${tag}`} className="manga-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <Link href={`/manga/${item.slug}`} className="manga-card__link">
                  Otwórz serię
                </Link>
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

      <section className="manga-admin">
        <h2>Panel uploadu grupy</h2>
        <p className="muted">Dodaj serie i wrzucaj własne rozdziały (obrazy stron).</p>

        <label className="manga-admin__field">
          <span>Hasło admina</span>
          <input
            type="password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            placeholder="ADMIN_SYNC_PASSWORD"
            className="manga-search__input"
          />
        </label>

        <div className="manga-admin__grid">
          <form className="manga-admin__card" onSubmit={submitCreateSeries}>
            <h3>Nowa seria</h3>
            <input className="manga-search__input" placeholder="Tytuł" value={seriesTitle} onChange={(event) => setSeriesTitle(event.target.value)} />
            <input className="manga-search__input" placeholder="Slug (opcjonalnie)" value={seriesSlug} onChange={(event) => setSeriesSlug(event.target.value)} />
            <textarea
              className="manga-admin__textarea"
              placeholder="Opis"
              value={seriesDescription}
              onChange={(event) => setSeriesDescription(event.target.value)}
            />
            <input
              className="manga-search__input"
              placeholder="Tagi po przecinku (np. action, fantasy)"
              value={seriesTags}
              onChange={(event) => setSeriesTags(event.target.value)}
            />
            <select className="manga-search__input" value={seriesStatus} onChange={(event) => setSeriesStatus(event.target.value as "ongoing" | "completed" | "hiatus")}>
              <option value="ongoing">ongoing</option>
              <option value="completed">completed</option>
              <option value="hiatus">hiatus</option>
            </select>
            <input type="file" accept="image/*" onChange={(event) => setSeriesCover(event.target.files?.[0] || null)} className="manga-admin__file" />
            <button type="submit" className="btn btn-primary" disabled={creatingSeries || creatingChapter}>
              {creatingSeries ? "Dodawanie..." : "Dodaj serię"}
            </button>
          </form>

          <form className="manga-admin__card" onSubmit={submitCreateChapter}>
            <h3>Nowy rozdział</h3>
            <select className="manga-search__input" value={chapterSeriesId} onChange={(event) => setChapterSeriesId(event.target.value)}>
              {!seriesOptions.length ? <option value="">Brak serii</option> : null}
              {seriesOptions.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.title}
                </option>
              ))}
            </select>
            <input
              className="manga-search__input"
              placeholder="Numer rozdziału (np. 12 lub 12.5)"
              value={chapterNumber}
              onChange={(event) => setChapterNumber(event.target.value)}
            />
            <input
              className="manga-search__input"
              placeholder="Tytuł rozdziału (opcjonalnie)"
              value={chapterTitle}
              onChange={(event) => setChapterTitle(event.target.value)}
            />
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setChapterPages(event.target.files)}
              className="manga-admin__file"
            />
            <button type="submit" className="btn btn-primary" disabled={creatingSeries || creatingChapter || !seriesOptions.length}>
              {creatingChapter ? "Wrzucanie..." : "Dodaj rozdział"}
            </button>
          </form>
        </div>

        {adminMessage ? <p className="manga-admin__message">{adminMessage}</p> : null}
      </section>
    </section>
  );
}