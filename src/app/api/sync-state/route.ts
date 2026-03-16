import { NextRequest, NextResponse } from "next/server";
import { getEpisodeById } from "@/data/episodes";

export const runtime = "nodejs";

type EpisodeSyncState = {
  currentTime: number;
  paused: boolean;
  updatedAt: number;
  adminClientId: string | null;
  adminLastSeenAt: number | null;
};

type SyncBody = {
  action?: "login" | "update" | "logout";
  episodeId?: string;
  currentTime?: number;
  paused?: boolean;
  adminPassword?: string;
  adminClientId?: string;
};

const ADMIN_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

declare global {
  var __episodeSyncStore: Map<string, EpisodeSyncState> | undefined;
}

const syncStore = globalThis.__episodeSyncStore ?? new Map<string, EpisodeSyncState>();
if (!globalThis.__episodeSyncStore) {
  globalThis.__episodeSyncStore = syncStore;
}

function getOrCreateSyncState(episodeId: string): EpisodeSyncState {
  const existing = syncStore.get(episodeId);
  if (existing) {
    return existing;
  }

  const created: EpisodeSyncState = {
    currentTime: 0,
    paused: true,
    updatedAt: Date.now(),
    adminClientId: null,
    adminLastSeenAt: null,
  };
  syncStore.set(episodeId, created);
  return created;
}

function clampCurrentTime(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.round(value * 1000) / 1000;
}

function clearAdminLock(state: EpisodeSyncState): void {
  state.adminClientId = null;
  state.adminLastSeenAt = null;
}

function sanitizeAdminClientId(value: string): string {
  return value.trim().slice(0, 120);
}

function hasAdminSessionExpired(state: EpisodeSyncState): boolean {
  if (!state.adminClientId || !state.adminLastSeenAt) {
    return false;
  }

  return Date.now() - state.adminLastSeenAt > ADMIN_INACTIVITY_TIMEOUT_MS;
}

function applyAdminInactivityTimeout(state: EpisodeSyncState): void {
  if (hasAdminSessionExpired(state)) {
    clearAdminLock(state);
    state.updatedAt = Date.now();
  }
}

export async function GET(request: NextRequest) {
  const episodeId = request.nextUrl.searchParams.get("episodeId")?.trim() || "";

  if (!episodeId) {
    return NextResponse.json({ error: "Missing episodeId" }, { status: 400 });
  }

  if (!getEpisodeById(episodeId)) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const state = getOrCreateSyncState(episodeId);
  applyAdminInactivityTimeout(state);
  syncStore.set(episodeId, state);
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  let body: SyncBody;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const episodeId = body.episodeId?.trim() || "";
  if (!episodeId) {
    return NextResponse.json({ error: "Missing episodeId" }, { status: 400 });
  }

  if (!getEpisodeById(episodeId)) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const state = getOrCreateSyncState(episodeId);
  applyAdminInactivityTimeout(state);
  const adminPassword = process.env.ADMIN_SYNC_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const action = body.action || "update";
  const adminClientId = sanitizeAdminClientId(body.adminClientId || "");

  if (!adminClientId) {
    return NextResponse.json({ error: "Missing adminClientId" }, { status: 400 });
  }

  if (action === "login") {
    if ((body.adminPassword || "") !== adminPassword) {
      return NextResponse.json({ error: "Invalid admin password" }, { status: 403 });
    }

    state.adminClientId = adminClientId;
    state.adminLastSeenAt = Date.now();
    state.currentTime = clampCurrentTime(body.currentTime ?? state.currentTime);
    state.paused = Boolean(body.paused ?? state.paused);
    state.updatedAt = Date.now();

    syncStore.set(episodeId, state);
    return NextResponse.json(state);
  }

  if (action === "logout") {
    if (state.adminClientId !== adminClientId) {
      return NextResponse.json({ error: "Not current admin" }, { status: 403 });
    }

    clearAdminLock(state);
    state.updatedAt = Date.now();
    syncStore.set(episodeId, state);
    return NextResponse.json(state);
  }

  if (state.adminClientId !== adminClientId) {
    if (!state.adminClientId && (body.adminPassword || "") === adminPassword) {
      state.adminClientId = adminClientId;
      state.adminLastSeenAt = Date.now();
      state.updatedAt = Date.now();
      syncStore.set(episodeId, state);
    } else {
      return NextResponse.json({ error: "Not current admin" }, { status: 403 });
    }
  }

  if (state.adminClientId !== adminClientId) {
    return NextResponse.json({ error: "Not current admin" }, { status: 403 });
  }

  state.currentTime = clampCurrentTime(body.currentTime ?? state.currentTime);
  state.paused = Boolean(body.paused);
  state.updatedAt = Date.now();
  state.adminLastSeenAt = Date.now();

  syncStore.set(episodeId, state);

  return NextResponse.json(state);
}
