import { NextRequest, NextResponse } from "next/server";
import { getEpisodeById } from "@/data/episodes";
import { buildSignedStreamUrl } from "@/lib/signing";

export const runtime = "nodejs";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

declare global {
  var __streamRateLimitStore: Map<string, RateLimitEntry> | undefined;
}

const rateLimitStore = globalThis.__streamRateLimitStore ?? new Map<string, RateLimitEntry>();
if (!globalThis.__streamRateLimitStore) {
  globalThis.__streamRateLimitStore = rateLimitStore;
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(clientKey: string): boolean {
  const now = Date.now();
  const current = rateLimitStore.get(clientKey);

  if (!current || now > current.resetAt) {
    rateLimitStore.set(clientKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  current.count += 1;
  rateLimitStore.set(clientKey, current);
  return false;
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const episodeId = request.nextUrl.searchParams.get("episodeId");
  if (!episodeId) {
    return NextResponse.json({ error: "Missing episodeId" }, { status: 400 });
  }

  const episode = getEpisodeById(episodeId);
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const originBaseUrl = process.env.VIDEO_ORIGIN_BASE_URL;
  const signingSecret = process.env.STREAM_SIGNING_SECRET;

  if (!originBaseUrl || !signingSecret) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const url = buildSignedStreamUrl(originBaseUrl, episode.hlsPath, signingSecret, 300);

  return NextResponse.json({ url });
}
