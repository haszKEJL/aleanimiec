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

const ADMIN_PASSWORD = "dupa123";

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

export async function GET(request: NextRequest) {
  const episodeId = request.nextUrl.searchParams.get("episodeId")?.trim() || "";

  if (!episodeId) {
    return NextResponse.json({ error: "Missing episodeId" }, { status: 400 });
  }

  if (!getEpisodeById(episodeId)) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  return NextResponse.json(getOrCreateSyncState(episodeId));
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

  const action = body.action || "update";
  const adminClientId = sanitizeAdminClientId(body.adminClientId || "");

  if (!adminClientId) {
    return NextResponse.json({ error: "Missing adminClientId" }, { status: 400 });
  }

  if (action === "login") {
    if ((body.adminPassword || "") !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid admin password" }, { status: 403 });
    }

    if (state.adminClientId && state.adminClientId !== adminClientId) {
      return NextResponse.json({ error: "Another admin is already active" }, { status: 409 });
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
    return NextResponse.json({ error: "Not current admin" }, { status: 403 });
  }

  state.currentTime = clampCurrentTime(body.currentTime ?? state.currentTime);
  state.paused = Boolean(body.paused);
  state.updatedAt = Date.now();
  state.adminLastSeenAt = Date.now();

  syncStore.set(episodeId, state);

  return NextResponse.json(state);
}
