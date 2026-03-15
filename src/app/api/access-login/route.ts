import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ACCESS_COOKIE_NAME = "aleanimiec_access";
const ACCESS_COOKIE_TTL_SECONDS = 60 * 60 * 12;

type AccessLoginBody = {
  password?: string;
};

function signAccessToken(exp: number, secret: string): string {
  const signature = createHmac("sha256", secret).update(String(exp)).digest("hex");
  return `${exp}.${signature}`;
}

export async function POST(request: NextRequest) {
  let body: AccessLoginBody;
  try {
    body = (await request.json()) as AccessLoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const expectedPassword = process.env.ACCESS_PASSWORD ?? process.env.ADMIN_SYNC_PASSWORD;
  const sessionSecret = process.env.ACCESS_SESSION_SECRET ?? process.env.STREAM_SIGNING_SECRET;

  if (!expectedPassword || !sessionSecret) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const provided = (body.password || "").trim();
  if (!provided || provided !== expectedPassword) {
    return NextResponse.json({ error: "Invalid access password" }, { status: 403 });
  }

  const exp = Math.floor(Date.now() / 1000) + ACCESS_COOKIE_TTL_SECONDS;
  const token = signAccessToken(exp, sessionSecret);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: ACCESS_COOKIE_TTL_SECONDS,
  });

  return response;
}
