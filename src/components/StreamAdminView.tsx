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

type UploadJobStatus = "idle" | "uploading" | "converting" | "swapping" | "done" | "error";

type UploadJobState = {
  status: UploadJobStatus;
  message: string;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  bytesReceived: number;
  maxBytes: number;
  filename: string | null;
  error: string | null;
};

const HOME_EPISODE_ID = "episode-1";
const ADMIN_CLIENT_ID_STORAGE_KEY = "aleanimiec_admin_client_id";
const CLIENT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export default function StreamAdminView() {
  const episodeId = HOME_EPISODE_ID;
  const episode = useMemo(() => getEpisodeById(episodeId), [episodeId]);

  const [streamUrl, setStreamUrl] = useState<string>("");
  const [, setError] = useState<string>("");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [adminClientId, setAdminClientId] = useState("");
  const [syncState, setSyncState] = useState<SyncStateResponse | null>(null);
  const [, setSyncError] = useState("");
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadJobState | null>(null);
  const [isStartingUpload, setIsStartingUpload] = useState(false);
  const lastAdminSyncAtRef = useRef(0);
  const lastStreamRefreshAtRef = useRef(0);
  const pendingResumeTimeRef = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const lastUploadDoneAtRef = useRef<number | null>(null);

  const isAdmin = Boolean(adminSecret);

  const forceLocalAdminLogout = useCallback(() => {
    setAdminSecret("");
    setSyncError("Sesja admina została przejęta lub wygasła po 30 minutach bez aktywności.");
    setUploadFile(null);
  }, []);

  const fetchSignedUrl = useCallback(async () => {
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
    }

    clearTimeout(timeoutId);
  }, [episodeId]);

  const refreshSignedUrl = useCallback(async () => {
    const now = Date.now();
    if (now - lastStreamRefreshAtRef.current < 5000) {
      return;
    }

    lastStreamRefreshAtRef.current = now;
    pendingResumeTimeRef.current = videoElement?.currentTime ?? null;
    await fetchSignedUrl();
  }, [fetchSignedUrl, videoElement]);

  const handleTokenExpired = useCallback(() => {
    setError("Odświeżam stream po błędzie autoryzacji...");
    void refreshSignedUrl();
  }, [refreshSignedUrl]);

  useEffect(() => {
    void fetchSignedUrl();
  }, [fetchSignedUrl]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshSignedUrl();
    }, 240000);

    return () => clearInterval(interval);
  }, [refreshSignedUrl]);

  useEffect(() => {
    if (!videoElement) {
      return;
    }

    const resumeTarget = pendingResumeTimeRef.current;
    if (resumeTarget == null) {
      return;
    }

    const resume = () => {
      if (Math.abs(videoElement.currentTime - resumeTarget) > 2) {
        videoElement.currentTime = resumeTarget;
      }
      pendingResumeTimeRef.current = null;
    };

    videoElement.addEventListener("loadedmetadata", resume, { once: true });
    videoElement.addEventListener("canplay", resume, { once: true });

    return () => {
      videoElement.removeEventListener("loadedmetadata", resume);
      videoElement.removeEventListener("canplay", resume);
    };
  }, [streamUrl, videoElement]);

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
            adminPassword: adminSecret,
            adminClientId,
          }),
        });

        if (response.status === 403 || response.status === 409) {
          forceLocalAdminLogout();
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
    [adminClientId, adminSecret, episodeId, forceLocalAdminLogout, videoElement],
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
    setUploadFile(null);
  };

  const fetchUploadState = useCallback(async () => {
    if (!adminSecret) {
      return;
    }

    try {
      const response = await fetch("/api/admin/upload", {
        method: "GET",
        headers: {
          "x-admin-password": adminSecret,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as UploadJobState;
      setUploadState(payload);
    } catch {
      // best effort polling
    }
  }, [adminSecret]);

  const handleUploadSubmit = useCallback(async () => {
    if (!isAdmin || !adminSecret || !uploadFile) {
      return;
    }

    if (uploadFile.size > CLIENT_MAX_UPLOAD_BYTES) {
      setUploadState({
        status: "error",
        message: "Upload nieudany.",
        updatedAt: Date.now(),
        startedAt: Date.now(),
        finishedAt: Date.now(),
        bytesReceived: uploadFile.size,
        maxBytes: CLIENT_MAX_UPLOAD_BYTES,
        filename: uploadFile.name,
        error: "Plik przekracza 500MB.",
      });
      return;
    }

    setIsStartingUpload(true);

    try {
      const response = await fetch("/api/admin/upload", {
        method: "POST",
        headers: {
          "x-admin-password": adminSecret,
          "x-file-name": uploadFile.name,
          "content-type": uploadFile.type || "application/octet-stream",
        },
        body: uploadFile,
      });

      if (response.ok) {
        const payload = (await response.json()) as UploadJobState;
        setUploadState(payload);
        setUploadFile(null);
        if (uploadInputRef.current) {
          uploadInputRef.current.value = "";
        }
        return;
      }

      const payload = (await response.json()) as { error?: string; state?: UploadJobState };
      setUploadState(
        payload.state || {
          status: "error",
          message: "Upload nieudany.",
          updatedAt: Date.now(),
          startedAt: Date.now(),
          finishedAt: Date.now(),
          bytesReceived: 0,
          maxBytes: CLIENT_MAX_UPLOAD_BYTES,
          filename: uploadFile.name,
          error: payload.error || "Nie udało się wrzucić pliku.",
        },
      );
    } catch {
      setUploadState({
        status: "error",
        message: "Upload nieudany.",
        updatedAt: Date.now(),
        startedAt: Date.now(),
        finishedAt: Date.now(),
        bytesReceived: 0,
        maxBytes: CLIENT_MAX_UPLOAD_BYTES,
        filename: uploadFile.name,
        error: "Błąd sieci podczas uploadu.",
      });
    } finally {
      setIsStartingUpload(false);
    }
  }, [adminSecret, isAdmin, uploadFile]);

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

    const drift = syncState.currentTime - videoElement.currentTime;
    if (drift > 2.5) {
      videoElement.currentTime = syncState.currentTime;
    } else if (drift < -4) {
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
    if (!isAdmin || !adminSecret) {
      return;
    }

    void fetchUploadState();

    const interval = setInterval(() => {
      void fetchUploadState();
    }, 2000);

    return () => clearInterval(interval);
  }, [adminSecret, fetchUploadState, isAdmin]);

  useEffect(() => {
    if (!uploadState || uploadState.status !== "done" || !uploadState.finishedAt) {
      return;
    }

    if (lastUploadDoneAtRef.current === uploadState.finishedAt) {
      return;
    }

    lastUploadDoneAtRef.current = uploadState.finishedAt;
    void refreshSignedUrl();
  }, [refreshSignedUrl, uploadState]);

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
      const drift = syncState.currentTime - videoElement.currentTime;
      if (drift > 2.5 || drift < -4) {
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
    return null;
  }

  const uploadInProgress =
    uploadState?.status === "uploading" || uploadState?.status === "converting" || uploadState?.status === "swapping";
  const uploadProgressPercent =
    uploadState && uploadState.maxBytes > 0
      ? Math.min(100, Math.round((uploadState.bytesReceived / uploadState.maxBytes) * 100))
      : 0;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
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

              <input
                ref={uploadInputRef}
                type="file"
                accept="video/mp4,video/x-m4v,video/quicktime,video/*"
                onChange={(event) => {
                  setUploadFile(event.target.files?.[0] ?? null);
                }}
                style={{
                  maxWidth: 220,
                  color: "#f3f4f6",
                }}
              />

              <button
                type="button"
                className="btn"
                onClick={() => void handleUploadSubmit()}
                disabled={!uploadFile || uploadInProgress || isStartingUpload}
                style={{ opacity: !uploadFile || uploadInProgress || isStartingUpload ? 0.6 : 1 }}
              >
                {isStartingUpload ? "Wysyłanie..." : "Wrzuć odcinek"}
              </button>
            </>
          )}
        </div>

        {isAdmin && uploadState ? (
          <span className="muted" style={{ width: "100%", textAlign: "center" }}>
            Upload: {uploadState.message}
            {uploadState.status === "uploading" ? ` (${uploadProgressPercent}%)` : ""}
            {uploadState.error ? ` — ${uploadState.error}` : ""}
          </span>
        ) : null}
      </div>

      <VideoPlayer
        streamUrl={streamUrl}
        onTokenExpired={handleTokenExpired}
        showControls
        onVideoElementChange={setVideoElement}
      />
    </section>
  );
}
