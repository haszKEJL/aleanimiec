import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextRequest, NextResponse } from "next/server";
import {
  getUploadJobState,
  isUploadJobRunning,
  MAX_UPLOAD_BYTES,
  setUploadJobRunning,
  updateUploadJobState,
} from "@/lib/admin-upload";

export const runtime = "nodejs";

const UPLOAD_TMP_DIR = process.env.UPLOAD_TMP_DIR || "/tmp/aleanimiec-upload";
const UPLOAD_HLS_DIR = process.env.UPLOAD_HLS_DIR || "/srv/hls";
const UPLOAD_EPISODE_DIR = process.env.UPLOAD_EPISODE_DIR || "episode-1";
const UPLOAD_TMP_MAX_AGE_MS = Number.parseInt(process.env.UPLOAD_TMP_MAX_AGE_MS || "21600000", 10);
const UPLOAD_TMP_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

declare global {
  var __adminUploadCleanupTimerStarted: boolean | undefined;
}

function timingSafeStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorizedAdmin(request: NextRequest): boolean {
  const providedPassword = request.headers.get("x-admin-password")?.trim() || "";
  const expectedPassword = process.env.ADMIN_SYNC_PASSWORD || "";

  if (!expectedPassword || !providedPassword) {
    return false;
  }

  return timingSafeStringEquals(providedPassword, expectedPassword);
}

function sanitizeFilename(input: string): string {
  const fromPath = path.basename(input || "video.mp4");
  const normalized = fromPath.replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized || "video.mp4";
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function runFfmpeg(inputPath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const segmentPattern = path.join(outputDir, "seg_%03d.ts");
    const playlistPath = path.join(outputDir, "master.m3u8");

    const runOnce = (args: string[]) =>
      new Promise<{ code: number; details: string }>((innerResolve) => {
        const ffmpeg = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });

        const stderrLines: string[] = [];

        ffmpeg.stderr.on("data", (chunk: Buffer) => {
          const line = chunk.toString("utf8").trim();
          if (!line) {
            return;
          }

          stderrLines.push(line);
          if (stderrLines.length > 30) {
            stderrLines.shift();
          }
        });

        ffmpeg.on("error", (error) => {
          innerResolve({ code: -1, details: `Nie udało się uruchomić ffmpeg: ${error.message}` });
        });

        ffmpeg.on("close", (code) => {
          innerResolve({ code: code ?? -1, details: stderrLines.join("\n") });
        });
      });

    const baseOutputArgs = [
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-f",
      "hls",
      "-hls_time",
      "6",
      "-hls_playlist_type",
      "vod",
      "-hls_segment_filename",
      segmentPattern,
      playlistPath,
    ];

    const primaryArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-analyzeduration",
      "100M",
      "-probesize",
      "100M",
      "-i",
      inputPath,
      ...baseOutputArgs,
    ];

    const dvrFallbackArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "mpegts",
      "-analyzeduration",
      "200M",
      "-probesize",
      "200M",
      "-fflags",
      "+genpts+igndts+discardcorrupt",
      "-err_detect",
      "ignore_err",
      "-i",
      inputPath,
      ...baseOutputArgs,
    ];

    const isContainerIssue = (details: string) => /moov atom not found|Invalid data found when processing input/i.test(details);

    void (async () => {
      const primary = await runOnce(primaryArgs);
      if (primary.code === 0) {
        resolve();
        return;
      }

      if (isContainerIssue(primary.details)) {
        const fallback = await runOnce(dvrFallbackArgs);
        if (fallback.code === 0) {
          resolve();
          return;
        }

        if (isContainerIssue(fallback.details)) {
          reject(
            new Error(
              "Plik ma niekompatybilny kontener dla ffmpeg. Spróbowałem automatycznej naprawy (DVR fallback), ale się nie powiodła. Przekonwertuj plik lokalnie do standardowego MP4 (H.264 + AAC) i wrzuć ponownie.",
            ),
          );
          return;
        }

        reject(new Error(`ffmpeg fallback zakończył się kodem ${fallback.code}. ${fallback.details}`.trim()));
        return;
      }

      reject(new Error(`ffmpeg zakończył się kodem ${primary.code}. ${primary.details}`.trim()));
    })().catch((error: unknown) => {
      reject(error instanceof Error ? error : new Error("Nieznany błąd ffmpeg."));
    });
  });
}

async function cleanupOldTempUploads(): Promise<void> {
  await mkdir(UPLOAD_TMP_DIR, { recursive: true });

  const entries = await readdir(UPLOAD_TMP_DIR, { withFileTypes: true });
  const now = Date.now();
  const maxAge = Number.isFinite(UPLOAD_TMP_MAX_AGE_MS) && UPLOAD_TMP_MAX_AGE_MS > 0 ? UPLOAD_TMP_MAX_AGE_MS : 21600000;

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) {
        return;
      }

      const fullPath = path.join(UPLOAD_TMP_DIR, entry.name);
      const info = await stat(fullPath).catch(() => null);
      if (!info) {
        return;
      }

      if (now - info.mtimeMs < maxAge) {
        return;
      }

      await rm(fullPath, { recursive: true, force: true });
    }),
  );
}

function ensureCleanupScheduler(): void {
  if (globalThis.__adminUploadCleanupTimerStarted) {
    return;
  }

  globalThis.__adminUploadCleanupTimerStarted = true;

  void cleanupOldTempUploads().catch(() => undefined);

  const timer = setInterval(() => {
    void cleanupOldTempUploads().catch(() => undefined);
  }, UPLOAD_TMP_CLEANUP_INTERVAL_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

ensureCleanupScheduler();

async function swapEpisodeDirectory(sourceDir: string): Promise<void> {
  await mkdir(UPLOAD_HLS_DIR, { recursive: true });

  const targetDir = path.join(UPLOAD_HLS_DIR, UPLOAD_EPISODE_DIR);
  const stagingDir = path.join(UPLOAD_HLS_DIR, `${UPLOAD_EPISODE_DIR}.next`);
  const backupDir = path.join(UPLOAD_HLS_DIR, `${UPLOAD_EPISODE_DIR}.backup`);

  await rm(stagingDir, { recursive: true, force: true });
  await rm(backupDir, { recursive: true, force: true });
  await cp(sourceDir, stagingDir, { recursive: true });

  const targetExists = await pathExists(targetDir);
  if (targetExists) {
    await rename(targetDir, backupDir);
  }

  try {
    await rename(stagingDir, targetDir);
    await rm(backupDir, { recursive: true, force: true });
  } catch (swapError) {
    if (!(await pathExists(targetDir)) && (await pathExists(backupDir))) {
      await rename(backupDir, targetDir);
    }
    throw swapError;
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(getUploadJobState());
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isUploadJobRunning()) {
    return NextResponse.json({ error: "Upload already in progress", state: getUploadJobState() }, { status: 409 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN;
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large (max 500MB)" }, { status: 413 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "Missing request body" }, { status: 400 });
  }

  const uploadStartedAt = Date.now();
  const rawFilename = request.headers.get("x-file-name") || "video.mp4";
  const filename = sanitizeFilename(rawFilename);
  const uploadId = `${uploadStartedAt}-${Math.random().toString(16).slice(2, 10)}`;
  const workDir = path.join(UPLOAD_TMP_DIR, `job-${uploadId}`);
  const uploadPath = path.join(workDir, filename);
  const outputDir = path.join(workDir, "hls-output");

  setUploadJobRunning(true);
  updateUploadJobState({
    status: "uploading",
    message: "Wgrywanie pliku na serwer...",
    startedAt: uploadStartedAt,
    finishedAt: null,
    bytesReceived: 0,
    filename,
    error: null,
  });

  try {
    await mkdir(outputDir, { recursive: true });

    let bytesReceived = 0;
    let lastStateUpdate = 0;

    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytesReceived += chunk.length;
        if (bytesReceived > MAX_UPLOAD_BYTES) {
          callback(new Error("LIMIT_EXCEEDED"));
          return;
        }

        if (bytesReceived - lastStateUpdate >= 1024 * 1024) {
          lastStateUpdate = bytesReceived;
          updateUploadJobState({
            status: "uploading",
            message: "Wgrywanie pliku na serwer...",
            bytesReceived,
          });
        }

        callback(null, chunk);
      },
    });

    const bodyStream = Readable.fromWeb(request.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(bodyStream, counter, createWriteStream(uploadPath));

    updateUploadJobState({
      status: "converting",
      message: "Konwersja do HLS (ffmpeg) trwa...",
      bytesReceived,
    });

    await runFfmpeg(uploadPath, outputDir);

    updateUploadJobState({
      status: "swapping",
      message: "Podmieniam aktywny odcinek...",
      bytesReceived,
    });

    await swapEpisodeDirectory(outputDir);

    updateUploadJobState({
      status: "done",
      message: "Nowy odcinek jest aktywny.",
      finishedAt: Date.now(),
      bytesReceived,
      error: null,
    });

    return NextResponse.json(getUploadJobState());
  } catch (error) {
    const isTooLarge = error instanceof Error && error.message === "LIMIT_EXCEEDED";
    const message =
      isTooLarge
        ? "Plik jest za duży (max 500MB)."
        : error instanceof Error
          ? error.message
          : "Nieznany błąd uploadu.";

    updateUploadJobState({
      status: "error",
      message: "Upload nieudany.",
      finishedAt: Date.now(),
      error: message,
    });

    return NextResponse.json({ error: message, state: getUploadJobState() }, { status: isTooLarge ? 413 : 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    setUploadJobRunning(false);
  }
}
