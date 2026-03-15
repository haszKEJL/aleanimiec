import { createHmac, timingSafeEqual } from "crypto";

const MAX_TOKEN_TTL_SECONDS = 300;

function toHexHmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function getPayload(path: string, exp: number): string {
  return `${path}:${exp}`;
}

export function createStreamToken(path: string, exp: number, secret: string): string {
  return toHexHmac(secret, getPayload(path, exp));
}

export function verifyStreamToken(path: string, exp: number, token: string, secret: string): boolean {
  const expected = createStreamToken(path, exp, secret);

  try {
    return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function buildSignedStreamUrl(
  originBaseUrl: string,
  path: string,
  secret: string,
  ttlSeconds = MAX_TOKEN_TTL_SECONDS,
): string {
  const safeTtl = Math.min(Math.max(ttlSeconds, 1), MAX_TOKEN_TTL_SECONDS);
  const exp = Math.floor(Date.now() / 1000) + safeTtl;
  const token = createStreamToken(path, exp, secret);

  const url = new URL(path, originBaseUrl);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("token", token);

  return url.toString();
}

export { MAX_TOKEN_TTL_SECONDS };
