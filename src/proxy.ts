import { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE_NAME = "aleanimiec_access";

async function signExp(exp: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(exp));
  const bytes = new Uint8Array(signature);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hasValidAccessCookie(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(ACCESS_COOKIE_NAME)?.value || "";
  const [expRaw, signature] = token.split(".", 2);

  if (!expRaw || !signature) {
    return false;
  }

  const exp = Number.parseInt(expRaw, 10);
  if (Number.isNaN(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const secret = process.env.ACCESS_SESSION_SECRET ?? process.env.STREAM_SIGNING_SECRET;
  if (!secret) {
    return false;
  }

  const expected = await signExp(expRaw, secret);
  return expected === signature;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/" ||
    pathname === "/access" ||
    pathname.startsWith("/api/access-login") ||
    pathname.startsWith("/api/aniguess/")
  ) {
    return NextResponse.next();
  }

  const hasAccess = await hasValidAccessCookie(request);
  if (hasAccess) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/access";
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
