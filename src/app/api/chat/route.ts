import { NextRequest, NextResponse } from "next/server";
import { getEpisodeById } from "@/data/episodes";

export const runtime = "nodejs";

type ChatMessage = {
  id: string;
  username: string;
  text: string;
  createdAt: number;
};

type ChatRoom = {
  messages: ChatMessage[];
  presence: Map<string, number>;
};

type ChatState = {
  messages: ChatMessage[];
  onlineUsers: string[];
};

type ChatPostBody = {
  episodeId?: string;
  username?: string;
  message?: string;
};

const ONLINE_TTL_MS = 45_000;
const MAX_MESSAGES = 120;

declare global {
  var __chatRoomsStore: Map<string, ChatRoom> | undefined;
}

const roomsStore = globalThis.__chatRoomsStore ?? new Map<string, ChatRoom>();
if (!globalThis.__chatRoomsStore) {
  globalThis.__chatRoomsStore = roomsStore;
}

function getOrCreateRoom(episodeId: string): ChatRoom {
  const existing = roomsStore.get(episodeId);
  if (existing) {
    return existing;
  }

  const created: ChatRoom = {
    messages: [],
    presence: new Map<string, number>(),
  };

  roomsStore.set(episodeId, created);
  return created;
}

function sanitizeUsername(value: string): string {
  return value.trim().slice(0, 24);
}

function sanitizeMessage(value: string): string {
  return value.trim().slice(0, 400);
}

function cleanupRoom(room: ChatRoom, now: number): void {
  for (const [username, lastSeen] of room.presence.entries()) {
    if (now - lastSeen > ONLINE_TTL_MS) {
      room.presence.delete(username);
    }
  }

  if (room.messages.length > MAX_MESSAGES) {
    room.messages.splice(0, room.messages.length - MAX_MESSAGES);
  }
}

function buildState(room: ChatRoom): ChatState {
  return {
    messages: room.messages,
    onlineUsers: [...room.presence.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([username]) => username),
  };
}

function validateEpisodeId(episodeId: string): boolean {
  return Boolean(getEpisodeById(episodeId));
}

export async function GET(request: NextRequest) {
  const episodeId = request.nextUrl.searchParams.get("episodeId")?.trim() || "";
  const usernameRaw = request.nextUrl.searchParams.get("username")?.trim() || "";

  if (!episodeId) {
    return NextResponse.json({ error: "Missing episodeId" }, { status: 400 });
  }

  if (!validateEpisodeId(episodeId)) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const room = getOrCreateRoom(episodeId);
  const now = Date.now();

  if (usernameRaw) {
    const username = sanitizeUsername(usernameRaw);
    if (username) {
      room.presence.set(username, now);
    }
  }

  cleanupRoom(room, now);
  return NextResponse.json(buildState(room));
}

export async function POST(request: NextRequest) {
  let body: ChatPostBody;
  try {
    body = (await request.json()) as ChatPostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const episodeId = body.episodeId?.trim() || "";
  const username = sanitizeUsername(body.username || "");
  const message = sanitizeMessage(body.message || "");

  if (!episodeId || !username) {
    return NextResponse.json({ error: "Missing episodeId or username" }, { status: 400 });
  }

  if (!validateEpisodeId(episodeId)) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  const room = getOrCreateRoom(episodeId);
  const now = Date.now();

  room.presence.set(username, now);

  if (message) {
    room.messages.push({
      id: `${now}-${Math.random().toString(16).slice(2)}`,
      username,
      text: message,
      createdAt: now,
    });
  }

  cleanupRoom(room, now);
  return NextResponse.json(buildState(room));
}
