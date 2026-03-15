"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VideoPlayer from "@/components/VideoPlayer";
import { getEpisodeById } from "@/data/episodes";

type StreamApiResponse = {
  url: string;
};

type SyncStateResponse = {
  currentTime: number;
  paused: boolean;
  updatedAt: number;
  adminClientId: string | null;
  adminLastSeenAt: number | null;
};

const HOME_EPISODE_ID = "episode-1";
const ADMIN_CLIENT_ID_STORAGE_KEY = "aleanimiec_admin_client_id";

export default function HomePage() {
  const episodeId = HOME_EPISODE_ID;
  const episode = useMemo(() => getEpisodeById(episodeId), [episodeId]);

  const [streamUrl, setStreamUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [adminClientId, setAdminClientId] = useState("");
  const [syncState, setSyncState] = useState<SyncStateResponse | null>(null);
  const [syncError, setSyncError] = useState("");
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const lastAdminSyncAtRef = useRef(0);

  const isAdmin = Boolean(adminSecret);
  const handleTokenExpired = useCallback(() => {
    setError("Token wygasł. Odśwież URL.");
  }, []);

  const fetchSignedUrl = useCallback(async () => {
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

  useEffect(() => {
    const existing = localStorage.getItem(ADMIN_CLIENT_ID_STORAGE_KEY)?.trim();
    if (existing) {
      setAdminClientId(existing);
      return;
    }

    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `admin-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    localStorage.setItem(ADMIN_CLIENT_ID_STORAGE_KEY, generated);
    setAdminClientId(generated);
  }, []);

  const fetchSyncState = useCallback(async () => {
    try {
      const response = await fetch(`/api/sync-state?episodeId=${encodeURIComponent(episodeId)}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        setSyncError("Nie udało się pobrać stanu synchronizacji.");
        return;
      }

      const payload = (await response.json()) as SyncStateResponse;
      setSyncState(payload);
      setSyncError("");
    } catch {
      setSyncError("Błąd połączenia z synchronizacją odtwarzania.");
    }
  }, [episodeId]);

  const pushAdminSyncState = useCallback(
    async (forcedCurrentTime?: number, forcedPaused?: boolean) => {
      if (!adminSecret || !videoElement || !adminClientId) {
        return;
      }

      const currentTime = typeof forcedCurrentTime === "number" ? forcedCurrentTime : videoElement.currentTime;
      const paused = typeof forcedPaused === "boolean" ? forcedPaused : videoElement.paused;

      try {
        const response = await fetch("/api/sync-state", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "update",
            episodeId,
            currentTime,
            paused,
            adminClientId,
          }),
        });

        if (response.status === 403) {
          setAdminSecret("");
          setSyncError("Sesja admina została przejęta lub wygasła.");
          return;
        }

        if (!response.ok) {
          setSyncError("Nie udało się wysłać stanu admina.");
          return;
        }

        const payload = (await response.json()) as SyncStateResponse;
        setSyncState(payload);
        setSyncError("");
      } catch {
        setSyncError("Błąd połączenia podczas wysyłania stanu admina.");
      }
    },
    [adminClientId, adminSecret, episodeId, videoElement],
  );

  const handleAdminLogin = async () => {
    const password = adminPasswordInput.trim();
    if (!password || !adminClientId) {
      setSyncError("Podaj hasło administratora.");
      return;
    }

    try {
      const response = await fetch("/api/sync-state", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "login",
          episodeId,
          currentTime: videoElement?.currentTime ?? 0,
          paused: videoElement?.paused ?? true,
          adminPassword: password,
          adminClientId,
        }),
      });

      if (response.status === 403) {
        setSyncError("Niepoprawne hasło administratora.");
        return;
      }

      if (response.status === 409) {
        setSyncError("Administrator jest już zalogowany na innym urządzeniu.");
        return;
      }

      if (!response.ok) {
        setSyncError("Nie udało się włączyć trybu admina.");
        return;
      }

      const payload = (await response.json()) as SyncStateResponse;
      setAdminSecret(password);
      setSyncState(payload);
      setSyncError("");
      setAdminPasswordInput("");
    } catch {
      setSyncError("Błąd połączenia podczas logowania admina.");
    }
  };

  const handleAdminLogout = async () => {
    if (!adminClientId) {
      return;
    }

    try {
      await fetch("/api/sync-state", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "logout",
          episodeId,
          adminClientId,
        }),
      });
    } catch {
      // best effort logout
    }

    setAdminSecret("");
    setSyncError("");
  };

  useEffect(() => {
    if (isAdmin) {
      return;
    }

    void fetchSyncState();

    const interval = setInterval(() => {
      void fetchSyncState();
    }, 1000);

    return () => clearInterval(interval);
  }, [fetchSyncState, isAdmin]);

  useEffect(() => {
    if (!videoElement || !syncState || isAdmin) {
      return;
    }

    const shouldSeek = Math.abs(videoElement.currentTime - syncState.currentTime) > 0.8;
    if (shouldSeek) {
      videoElement.currentTime = syncState.currentTime;
    }

    if (syncState.paused && !videoElement.paused) {
      videoElement.pause();
      return;
    }

    if (!syncState.paused && videoElement.paused) {
      void videoElement.play().catch(() => {
        setSyncError("Kliknij w wideo, żeby dołączyć do synchronizacji odtwarzania.");
      });
    }
  }, [isAdmin, syncState, videoElement]);

  useEffect(() => {
    if (!videoElement || !isAdmin) {
      return;
    }

    const syncNow = () => {
      void pushAdminSyncState();
    };

    const syncThrottled = () => {
      const now = Date.now();
      if (now - lastAdminSyncAtRef.current < 800) {
        return;
      }

      lastAdminSyncAtRef.current = now;
      void pushAdminSyncState();
    };

    videoElement.addEventListener("play", syncNow);
    videoElement.addEventListener("pause", syncNow);
    videoElement.addEventListener("seeked", syncNow);
    videoElement.addEventListener("timeupdate", syncThrottled);

    const heartbeat = setInterval(() => {
      void pushAdminSyncState();
    }, 1500);

    return () => {
      videoElement.removeEventListener("play", syncNow);
      videoElement.removeEventListener("pause", syncNow);
      videoElement.removeEventListener("seeked", syncNow);
      videoElement.removeEventListener("timeupdate", syncThrottled);
      clearInterval(heartbeat);
    };
  }, [isAdmin, pushAdminSyncState, videoElement]);

  useEffect(() => {
    if (!videoElement || isAdmin || !syncState) {
      return;
    }

    const enforceViewerRules = () => {
      if (syncState.paused) {
        if (!videoElement.paused) {
          videoElement.pause();
        }
        return;
      }

      if (videoElement.paused) {
        void videoElement.play().catch(() => {
          setSyncError("Kliknij przycisk play, aby dołączyć do seansu.");
        });
      }
    };

    const preventSeekDrift = () => {
      if (Math.abs(videoElement.currentTime - syncState.currentTime) > 0.6) {
        videoElement.currentTime = syncState.currentTime;
      }
      enforceViewerRules();
    };

    videoElement.addEventListener("pause", enforceViewerRules);
    videoElement.addEventListener("seeking", preventSeekDrift);

    return () => {
      videoElement.removeEventListener("pause", enforceViewerRules);
      videoElement.removeEventListener("seeking", preventSeekDrift);
    };
  }, [isAdmin, syncState, videoElement]);

  if (!episode) {
    return (
      <section className="card">
        <h1>Brak dostępnego odcinka</h1>
        <p className="muted">Skonfiguruj odcinek `episode-1` w katalogu danych.</p>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <article className="card" style={{ display: "grid", gap: 10 }}>
        <p className="muted" style={{ margin: 0 }}>Aleanimiec • Live Room</p>
        <h1 style={{ margin: 0 }}>{episode.title}</h1>
        <p className="muted" style={{ margin: 0 }}>{episode.description}</p>
      </article>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!isAdmin ? (
            <>
              <input
                type="password"
                value={adminPasswordInput}
                onChange={(event) => setAdminPasswordInput(event.target.value)}
                placeholder="Hasło admina"
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #202b4b",
                  background: "#0f162d",
                  color: "#f3f4f6",
                }}
              />
              <button type="button" className="btn" onClick={() => void handleAdminLogin()}>
                Zaloguj admina
              </button>
            </>
          ) : (
            <>
              <span className="muted">Tryb admina aktywny</span>
              <button type="button" className="btn" onClick={() => void handleAdminLogout()}>
                Wyłącz admina
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)", alignItems: "start" }}>
        <article className="card" style={{ display: "grid", gap: 12 }}>
          {error ? <p className="error">{error}</p> : null}
          {loading ? <p className="muted">Pobieranie signed URL...</p> : null}
          {syncError ? <p className="error">{syncError}</p> : null}

          <VideoPlayer
            streamUrl={streamUrl}
            onTokenExpired={handleTokenExpired}
            showControls
            onVideoElementChange={setVideoElement}
          />

          {!isAdmin ? (
            <p className="muted" style={{ margin: 0 }}>
              Sterowanie odtwarzaniem jest zablokowane. Kontrolę ma administrator.
            </p>
          ) : null}

          <div>
            <button type="button" className="btn" onClick={() => void fetchSignedUrl()} disabled={loading}>
              Odśwież token
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
