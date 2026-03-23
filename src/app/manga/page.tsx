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

type AdminChapter = {
  id: string;
  number: number;
  title: string;
  createdAt: string;
};

type AdminSeriesItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  status: "ongoing" | "completed" | "hiatus";
  coverUrl: string | null;
  chapters: AdminChapter[];
};

type MangaPayload = {
  items: MangaItem[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
};

export default function MangaPage() {
  const ADMIN_SESSION_KEY = "manga_admin_session";
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
  const [adminInput, setAdminInput] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [adminItems, setAdminItems] = useState<AdminSeriesItem[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [creatingSeries, setCreatingSeries] = useState(false);
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [workingId, setWorkingId] = useState("");

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

  const loadAdminData = useCallback(async () => {
    if (!adminPassword.trim()) {
      setAdminItems([]);
      return;
    }

    setAdminLoading(true);

    try {
      const response = await fetch("/api/manga?mode=admin", {
        cache: "no-store",
        headers: {
          "x-admin-password": adminPassword.trim(),
        },
      });

      const payload = (await response.json()) as { items?: AdminSeriesItem[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Nie udało się pobrać panelu zarządzania.");
      }

      setAdminItems(payload.items || []);
    } catch (loadError) {
      setAdminMessage(loadError instanceof Error ? loadError.message : "Nie udało się pobrać panelu zarządzania.");
      setAdminItems([]);
    } finally {
      setAdminLoading(false);
    }
  }, [adminPassword]);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedPassword = window.sessionStorage.getItem(ADMIN_SESSION_KEY) || "";
    if (!storedPassword) {
      return;
    }

    setAdminInput(storedPassword);

    void (async () => {
      setAdminLoading(true);

      try {
        const response = await fetch("/api/manga?mode=admin", {
          cache: "no-store",
          headers: {
            "x-admin-password": storedPassword,
          },
        });

        const payload = (await response.json()) as { items?: AdminSeriesItem[]; error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Nie udało się przywrócić sesji admina.");
        }

        setAdminPassword(storedPassword);
        setAdminUnlocked(true);
        setAdminItems(payload.items || []);
      } catch {
        window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
        setAdminPassword("");
        setAdminUnlocked(false);
        setAdminItems([]);
      } finally {
        setAdminLoading(false);
      }
    })();
  }, []);

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

  const unlockAdminPanel = useCallback(async () => {
    setAdminMessage("");

    const password = adminInput.trim();
    if (!password) {
      setAdminMessage("Podaj hasło admina.");
      return;
    }

    setAdminLoading(true);

    try {
      const response = await fetch("/api/manga?mode=admin", {
        cache: "no-store",
        headers: {
          "x-admin-password": password,
        },
      });

      const payload = (await response.json()) as { items?: AdminSeriesItem[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Nieprawidłowe hasło admina.");
      }

      setAdminPassword(password);
      setAdminUnlocked(true);
      setAdminItems(payload.items || []);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(ADMIN_SESSION_KEY, password);
      }
      setAdminMessage("Panel odblokowany.");
    } catch (unlockError) {
      setAdminUnlocked(false);
      setAdminPassword("");
      setAdminItems([]);
      setAdminMessage(unlockError instanceof Error ? unlockError.message : "Nie udało się odblokować panelu.");
    } finally {
      setAdminLoading(false);
    }
  }, [adminInput]);

  const lockAdminPanel = useCallback(() => {
    setAdminUnlocked(false);
    setAdminPassword("");
    setAdminInput("");
    setAdminItems([]);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    }
    setAdminMessage("Panel został zablokowany.");
  }, []);

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
        await Promise.all([fetchManga(0, false), loadSeriesOptions(), loadAdminData()]);
      } catch (submitError) {
        setAdminMessage(submitError instanceof Error ? submitError.message : "Nie udało się dodać serii.");
      } finally {
        setCreatingSeries(false);
      }
    },
    [adminPassword, seriesTitle, seriesSlug, seriesDescription, seriesTags, seriesStatus, seriesCover, fetchManga, loadSeriesOptions, loadAdminData],
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
        await Promise.all([fetchManga(0, false), loadSeriesOptions(), loadAdminData()]);
      } catch (submitError) {
        setAdminMessage(submitError instanceof Error ? submitError.message : "Nie udało się dodać rozdziału.");
      } finally {
        setCreatingChapter(false);
      }
    },
    [adminPassword, chapterSeriesId, chapterNumber, chapterPages, chapterTitle, fetchManga, loadSeriesOptions, loadAdminData],
  );

  const submitUpdateSeries = useCallback(
    async (event: FormEvent<HTMLFormElement>, seriesId: string) => {
      event.preventDefault();
      setAdminMessage("");

      if (!adminPassword.trim()) {
        setAdminMessage("Podaj hasło admina.");
        return;
      }

      const form = event.currentTarget;
      const formData = new FormData(form);
      formData.set("action", "update-series");
      formData.set("seriesId", seriesId);
      if (!formData.get("keepCover")) {
        formData.set("keepCover", "false");
      }

      setWorkingId(`series-${seriesId}`);

      try {
        const response = await fetch("/api/manga", {
          method: "POST",
          headers: {
            "x-admin-password": adminPassword.trim(),
          },
          body: formData,
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Nie udało się zapisać serii.");
        }

        setAdminMessage("Seria została zaktualizowana.");
        await Promise.all([fetchManga(0, false), loadSeriesOptions(), loadAdminData()]);
      } catch (submitError) {
        setAdminMessage(submitError instanceof Error ? submitError.message : "Nie udało się zapisać serii.");
      } finally {
        setWorkingId("");
      }
    },
    [adminPassword, fetchManga, loadSeriesOptions, loadAdminData],
  );

  const submitDeleteSeries = useCallback(
    async (seriesId: string) => {
      if (!adminPassword.trim()) {
        setAdminMessage("Podaj hasło admina.");
        return;
      }

      if (!confirm("Usunąć serię i wszystkie jej rozdziały?")) {
        return;
      }

      setWorkingId(`series-delete-${seriesId}`);
      setAdminMessage("");

      try {
        const formData = new FormData();
        formData.set("action", "delete-series");
        formData.set("seriesId", seriesId);

        const response = await fetch("/api/manga", {
          method: "POST",
          headers: {
            "x-admin-password": adminPassword.trim(),
          },
          body: formData,
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Nie udało się usunąć serii.");
        }

        setAdminMessage("Seria została usunięta.");
        await Promise.all([fetchManga(0, false), loadSeriesOptions(), loadAdminData()]);
      } catch (deleteError) {
        setAdminMessage(deleteError instanceof Error ? deleteError.message : "Nie udało się usunąć serii.");
      } finally {
        setWorkingId("");
      }
    },
    [adminPassword, fetchManga, loadSeriesOptions, loadAdminData],
  );

  const submitUpdateChapter = useCallback(
    async (event: FormEvent<HTMLFormElement>, chapterId: string) => {
      event.preventDefault();
      setAdminMessage("");

      if (!adminPassword.trim()) {
        setAdminMessage("Podaj hasło admina.");
        return;
      }

      setWorkingId(`chapter-${chapterId}`);

      try {
        const formData = new FormData(event.currentTarget);
        formData.set("action", "update-chapter");
        formData.set("chapterId", chapterId);

        const response = await fetch("/api/manga", {
          method: "POST",
          headers: {
            "x-admin-password": adminPassword.trim(),
          },
          body: formData,
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Nie udało się zapisać rozdziału.");
        }

        setAdminMessage("Rozdział został zaktualizowany.");
        await Promise.all([fetchManga(0, false), loadAdminData()]);
      } catch (submitError) {
        setAdminMessage(submitError instanceof Error ? submitError.message : "Nie udało się zapisać rozdziału.");
      } finally {
        setWorkingId("");
      }
    },
    [adminPassword, fetchManga, loadAdminData],
  );

  const submitDeleteChapter = useCallback(
    async (chapterId: string) => {
      if (!adminPassword.trim()) {
        setAdminMessage("Podaj hasło admina.");
        return;
      }

      if (!confirm("Usunąć ten rozdział?")) {
        return;
      }

      setWorkingId(`chapter-delete-${chapterId}`);
      setAdminMessage("");

      try {
        const formData = new FormData();
        formData.set("action", "delete-chapter");
        formData.set("chapterId", chapterId);

        const response = await fetch("/api/manga", {
          method: "POST",
          headers: {
            "x-admin-password": adminPassword.trim(),
          },
          body: formData,
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Nie udało się usunąć rozdziału.");
        }

        setAdminMessage("Rozdział został usunięty.");
        await Promise.all([fetchManga(0, false), loadAdminData()]);
      } catch (deleteError) {
        setAdminMessage(deleteError instanceof Error ? deleteError.message : "Nie udało się usunąć rozdziału.");
      } finally {
        setWorkingId("");
      }
    },
    [adminPassword, fetchManga, loadAdminData],
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
        <p className="muted">Dodaj, edytuj i usuwaj serie oraz rozdziały.</p>

        {!adminUnlocked ? (
          <form
            className="manga-admin__card"
            onSubmit={(event) => {
              event.preventDefault();
              void unlockAdminPanel();
            }}
          >
            <h3>Odblokuj panel</h3>
            <label className="manga-admin__field">
              <span>Hasło admina</span>
              <input
                type="password"
                value={adminInput}
                onChange={(event) => setAdminInput(event.target.value)}
                placeholder="ADMIN_SYNC_PASSWORD"
                className="manga-search__input"
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={adminLoading}>
              {adminLoading ? "Sprawdzanie..." : "Odblokuj"}
            </button>
          </form>
        ) : (
          <>
            <div className="manga-admin__actions">
              <button type="button" className="btn btn-ghost" onClick={() => void loadAdminData()} disabled={adminLoading || !!workingId}>
                {adminLoading ? "Odświeżanie..." : "Odśwież listę do edycji"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={lockAdminPanel} disabled={adminLoading || !!workingId}>
                Zablokuj panel
              </button>
            </div>

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

            {adminItems.length ? (
              <div className="manga-admin-manage">
                {adminItems.map((series) => (
                  <article key={series.id} className="manga-admin-manage__series">
                    <form className="manga-admin-manage__series-form" onSubmit={(event) => void submitUpdateSeries(event, series.id)}>
                      <h3>{series.title}</h3>
                      <input name="title" className="manga-search__input" defaultValue={series.title} placeholder="Tytuł" />
                      <input name="slug" className="manga-search__input" defaultValue={series.slug} placeholder="Slug" />
                      <textarea name="description" className="manga-admin__textarea" defaultValue={series.description} placeholder="Opis" />
                      <input name="tags" className="manga-search__input" defaultValue={series.tags.join(", ")} placeholder="Tagi po przecinku" />
                      <select name="status" className="manga-search__input" defaultValue={series.status}>
                        <option value="ongoing">ongoing</option>
                        <option value="completed">completed</option>
                        <option value="hiatus">hiatus</option>
                      </select>
                      <label className="manga-admin__checkbox">
                        <input type="checkbox" name="keepCover" defaultChecked />
                        <span>Zachowaj obecną okładkę</span>
                      </label>
                      <input name="cover" type="file" accept="image/*" className="manga-admin__file" />
                      <div className="manga-admin__row">
                        <button type="submit" className="btn btn-primary" disabled={!!workingId}>
                          {workingId === `series-${series.id}` ? "Zapisywanie..." : "Zapisz serię"}
                        </button>
                        <button type="button" className="btn btn-ghost" disabled={!!workingId} onClick={() => void submitDeleteSeries(series.id)}>
                          {workingId === `series-delete-${series.id}` ? "Usuwanie..." : "Usuń serię"}
                        </button>
                        <Link href={`/manga/${series.slug}`} className="btn btn-ghost">
                          Podgląd
                        </Link>
                      </div>
                    </form>

                    <div className="manga-admin-manage__chapters">
                      <h4>Rozdziały</h4>
                      {!series.chapters.length ? <p className="muted">Brak rozdziałów.</p> : null}
                      {series.chapters.map((chapter) => (
                        <form key={chapter.id} className="manga-admin-manage__chapter" onSubmit={(event) => void submitUpdateChapter(event, chapter.id)}>
                          <input
                            name="chapterNumber"
                            className="manga-search__input"
                            defaultValue={String(chapter.number)}
                            placeholder="Numer"
                          />
                          <input
                            name="chapterTitle"
                            className="manga-search__input"
                            defaultValue={chapter.title}
                            placeholder="Tytuł rozdziału"
                          />
                          <div className="manga-admin__row">
                            <button type="submit" className="btn btn-primary" disabled={!!workingId}>
                              {workingId === `chapter-${chapter.id}` ? "Zapisywanie..." : "Zapisz"}
                            </button>
                            <button type="button" className="btn btn-ghost" disabled={!!workingId} onClick={() => void submitDeleteChapter(chapter.id)}>
                              {workingId === `chapter-delete-${chapter.id}` ? "Usuwanie..." : "Usuń"}
                            </button>
                            <Link href={`/manga/${series.slug}/${chapter.id}`} className="btn btn-ghost">
                              Czytaj
                            </Link>
                          </div>
                        </form>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        )}

        {adminMessage ? <p className="manga-admin__message">{adminMessage}</p> : null}
      </section>
    </section>
  );
}