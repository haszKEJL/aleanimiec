"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ChatSidebar from "@/components/ChatSidebar";
import VideoPlayer from "@/components/VideoPlayer";
import { getEpisodeById } from "@/data/episodes";

type StreamApiResponse = {
  url: string;
};

export default function WatchPage() {
  const params = useParams<{ episodeId: string }>();
  const episodeId = params?.episodeId ?? "";

  const episode = useMemo(() => getEpisodeById(episodeId), [episodeId]);

  const [streamUrl, setStreamUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const fetchSignedUrl = useCallback(async () => {
    if (!episodeId) {
      setError("Brak identyfikatora odcinka.");
      return;
    }

    setLoading(true);
    setError("");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`/api/stream-url?episodeId=${encodeURIComponent(episodeId)}`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });

      if (response.status === 404) {
        setError("Nie znaleziono odcinka.");
        setStreamUrl("");
        return;
      }

      if (response.status === 401 || response.status === 403) {
        setError("Brak dostępu do streamu (401/403).");
        setStreamUrl("");
        return;
      }

      if (!response.ok) {
        setError("Nie udało się pobrać URL streamu.");
        setStreamUrl("");
        return;
      }

      const payload: StreamApiResponse = await response.json();
      if (!payload.url) {
        setError("API zwróciło pusty URL streamu.");
        setStreamUrl("");
        return;
      }

      setStreamUrl(payload.url);
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        setError("Przekroczono limit czasu oczekiwania na API.");
      } else {
        setError("Błąd sieci podczas pobierania streamu.");
      }
      setStreamUrl("");
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [episodeId]);

  useEffect(() => {
    void fetchSignedUrl();
  }, [fetchSignedUrl]);

  if (!episode) {
    return (
      <section className="card">
        <h1>Nie znaleziono odcinka</h1>
        <p className="muted">Sprawdź poprawność adresu lub wróć do listy odcinków.</p>
        <Link href="/" className="btn" style={{ display: "inline-block" }}>
          Wróć na stronę główną
        </Link>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <Link href="/" className="muted">
          ← Wróć do listy
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 2fr) minmax(300px, 1fr)",
          alignItems: "start",
        }}
      >
        <article className="card" style={{ display: "grid", gap: 12 }}>
          <h1 style={{ margin: 0 }}>{episode.title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {episode.description}
          </p>

          {error ? <p className="error">{error}</p> : null}

          {loading ? <p className="muted">Pobieranie signed URL...</p> : null}

          <VideoPlayer streamUrl={streamUrl} onTokenExpired={() => setError("Token wygasł. Odśwież URL.")} />

          <div>
            <button type="button" className="btn" onClick={() => void fetchSignedUrl()} disabled={loading}>
              Odśwież token
            </button>
          </div>
        </article>

        <ChatSidebar episodeId={episodeId} />
      </div>
    </section>
  );
}
