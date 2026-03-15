"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

type VideoPlayerProps = {
  streamUrl?: string;
  onTokenExpired?: () => void;
  showControls?: boolean;
  onVideoElementChange?: (video: HTMLVideoElement | null) => void;
};

const LOAD_TIMEOUT_MS = 45000;

export default function VideoPlayer({
  streamUrl,
  onTokenExpired,
  showControls = true,
  onVideoElementChange,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onVideoElementChange?.(videoRef.current);
    return () => onVideoElementChange?.(null);
  }, [onVideoElementChange]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (!streamUrl) {
      setError("Brak URL do streamu.");
      return;
    }

    let hls: Hls | null = null;
    const timeoutId = setTimeout(() => {
      setPlayerError("Przekroczono limit czasu ładowania streamu.");
    }, LOAD_TIMEOUT_MS);

    const finishLoading = () => {
      clearTimeout(timeoutId);
    };

    const markReady = () => {
      finishLoading();
      setError(null);
    };

    const setPlayerError = (message: string) => {
      console.error("[VideoPlayer]", message);
      setError(message);
    };

    setError(null);

    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");

    if (nativeHls) {
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", markReady, { once: true });
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, markReady);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        const statusCode = data.response?.code;
        console.error("[VideoPlayer] hls.js error", data);

        if (statusCode === 401 || statusCode === 403) {
          setPlayerError("Brak autoryzacji do streamu (401/403).");
          onTokenExpired?.();
          return;
        }

        if (data.fatal) {
          setPlayerError("Wystąpił błąd odtwarzania HLS.");
        }
      });
    } else {
      setPlayerError("Ta przeglądarka nie wspiera HLS.");
    }

    const onVideoError = () => {
      setPlayerError("Nie udało się odtworzyć materiału wideo.");
    };

    const onCanPlay = () => {
      markReady();
    };

    video.addEventListener("error", onVideoError);
    video.addEventListener("canplay", onCanPlay);

    return () => {
      finishLoading();
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("canplay", onCanPlay);
      if (hls) {
        hls.destroy();
      }
    };
  }, [streamUrl, onTokenExpired]);

  return (
    <div>
      {error ? <p className="error">{error}</p> : null}
      <video
        ref={videoRef}
        controls={showControls}
        autoPlay
        style={{ width: "100%", borderRadius: 12, background: "black" }}
      />
    </div>
  );
}
