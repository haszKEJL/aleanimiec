import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
  const envFilePath = path.resolve(__dirname, ".env.origin");

  if (!existsSync(envFilePath)) {
    return;
  }

  const fileContent = readFileSync(envFilePath, "utf8");
  const lines = fileContent.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const ORIGIN_PORT = Number.parseInt(process.env.ORIGIN_PORT || "8080", 10);
const ORIGIN_HLS_DIR = process.env.ORIGIN_HLS_DIR || "C:\\hls";
const STREAM_SIGNING_SECRET = process.env.STREAM_SIGNING_SECRET || "";
const ORIGIN_ALLOWED_ORIGINS = (process.env.ORIGIN_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const baseDir = path.resolve(ORIGIN_HLS_DIR);

if (!STREAM_SIGNING_SECRET) {
  console.error("[origin] Missing STREAM_SIGNING_SECRET");
  process.exit(1);
}

if (!existsSync(baseDir)) {
  console.error(`[origin] ORIGIN_HLS_DIR does not exist: ${baseDir}`);
  process.exit(1);
}

function isOriginAllowed(requestOrigin) {
  if (!requestOrigin) {
    return false;
  }

  if (process.env.NODE_ENV !== "production") {
    if (requestOrigin.startsWith("http://localhost:") || requestOrigin.startsWith("http://127.0.0.1:")) {
      return true;
    }
  }

  return ORIGIN_ALLOWED_ORIGINS.includes(requestOrigin);
}

function applyCorsHeaders(req, res) {
  const requestOrigin = req.headers.origin;

  if (isOriginAllowed(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Range");
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function toHexHmac(secret, payload) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeCompareHex(actualHex, expectedHex) {
  try {
    return timingSafeEqual(Buffer.from(actualHex, "hex"), Buffer.from(expectedHex, "hex"));
  } catch {
    return false;
  }
}

function getContentType(filePath) {
  if (filePath.endsWith(".m3u8")) {
    return "application/vnd.apple.mpegurl";
  }

  if (filePath.endsWith(".ts")) {
    return "video/mp2t";
  }

  if (filePath.endsWith(".m4s")) {
    return "video/iso.segment";
  }

  return "application/octet-stream";
}

function buildSignedUriForPlaylistEntry(entryUri, playlistPathname, exp) {
  const [entryWithoutFragment, fragment] = entryUri.split("#", 2);
  const playlistUrl = new URL(playlistPathname, "http://origin.local");
  const resolved = new URL(entryWithoutFragment, playlistUrl);
  const tokenForPath = toHexHmac(STREAM_SIGNING_SECRET, `${resolved.pathname}:${exp}`);

  resolved.searchParams.set("exp", String(exp));
  resolved.searchParams.set("token", tokenForPath);

  const keepAbsolute = entryWithoutFragment.startsWith("http://") || entryWithoutFragment.startsWith("https://");
  const signedBase = keepAbsolute ? resolved.toString() : `${resolved.pathname}${resolved.search}`;

  return fragment ? `${signedBase}#${fragment}` : signedBase;
}

function rewritePlaylistContent(playlistContent, playlistPathname, exp) {
  return playlistContent
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return line;
      }

      return buildSignedUriForPlaylistEntry(trimmed, playlistPathname, exp);
    })
    .join("\n");
}

function mapUrlPathToFilePath(urlPathname) {
  if (!urlPathname.startsWith("/hls/")) {
    return null;
  }

  const relativePath = decodeURIComponent(urlPathname.replace(/^\/hls\//, ""));
  const absolutePath = path.resolve(baseDir, relativePath);

  if (!absolutePath.startsWith(baseDir + path.sep) && absolutePath !== baseDir) {
    return null;
  }

  return absolutePath;
}

function verifySignature(pathname, exp, token) {
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) {
    return false;
  }

  const payload = `${pathname}:${exp}`;
  const expected = toHexHmac(STREAM_SIGNING_SECRET, payload);
  return safeCompareHex(token, expected);
}

function parseByteRange(rangeHeader, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || "");
  if (!match) {
    return null;
  }

  const startRaw = match[1];
  const endRaw = match[2];

  let start = startRaw ? Number.parseInt(startRaw, 10) : 0;
  let end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }

  if (!startRaw && endRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) {
      return null;
    }

    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  }

  if (start < 0 || end < 0 || start > end || start >= fileSize) {
    return null;
  }

  end = Math.min(end, fileSize - 1);
  return { start, end };
}

const server = createServer(async (req, res) => {
  applyCorsHeaders(req, res);

  if (!req.url || !req.headers.host) {
    return sendJson(res, 400, { error: "Bad request" });
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === "/") {
    return sendJson(res, 200, {
      ok: true,
      message: "Origin server is running",
      health: "/health",
      hlsPrefix: "/hls/...",
    });
  }

  if (requestUrl.pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (!requestUrl.pathname.startsWith("/hls/")) {
    return sendJson(res, 404, { error: "Not found" });
  }

  const expRaw = requestUrl.searchParams.get("exp");
  const token = requestUrl.searchParams.get("token") || "";
  const exp = Number.parseInt(expRaw || "", 10);

  if (!expRaw || Number.isNaN(exp) || !token) {
    return sendJson(res, 401, { error: "Missing exp or token" });
  }

  if (!verifySignature(requestUrl.pathname, exp, token)) {
    return sendJson(res, 403, { error: "Invalid or expired token" });
  }

  const filePath = mapUrlPathToFilePath(requestUrl.pathname);
  if (!filePath) {
    return sendJson(res, 400, { error: "Invalid path" });
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return sendJson(res, 404, { error: "Not found" });
    }

    if (filePath.endsWith(".m3u8")) {
      const playlistContent = await readFile(filePath, "utf8");
      const rewrittenPlaylist = rewritePlaylistContent(playlistContent, requestUrl.pathname, exp);

      res.statusCode = 200;
      res.setHeader("Content-Type", getContentType(filePath));
      res.setHeader("Content-Length", String(Buffer.byteLength(rewrittenPlaylist, "utf8")));
      res.setHeader("Cache-Control", "private, max-age=5");

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      res.end(rewrittenPlaylist);
      return;
    }

    const rangeHeader = req.headers.range;
    const contentType = getContentType(filePath);
    const fileSize = fileStat.size;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=5");
    res.setHeader("Accept-Ranges", "bytes");

    const range = typeof rangeHeader === "string" ? parseByteRange(rangeHeader, fileSize) : null;

    if (rangeHeader && !range) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      res.end();
      return;
    }

    if (range) {
      const chunkSize = range.end - range.start + 1;
      res.statusCode = 206;
      res.setHeader("Content-Length", String(chunkSize));
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${fileSize}`);

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      const partialStream = createReadStream(filePath, { start: range.start, end: range.end });
      partialStream.on("error", (error) => {
        console.error("[origin] stream error", error);
        if (!res.headersSent) {
          sendJson(res, 500, { error: "Internal error" });
        } else {
          res.destroy(error);
        }
      });

      partialStream.pipe(res);
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Length", String(fileSize));

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = createReadStream(filePath);
    stream.on("error", (error) => {
      console.error("[origin] stream error", error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal error" });
      } else {
        res.destroy(error);
      }
    });

    stream.pipe(res);
  } catch {
    return sendJson(res, 404, { error: "Not found" });
  }
});

server.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.error(`[origin] Port ${ORIGIN_PORT} is already in use.`);
    console.error("[origin] Close the app using this port or change ORIGIN_PORT in origin/.env.origin (e.g. 8081).");
    process.exit(1);
  }

  console.error("[origin] Server failed to start", error);
  process.exit(1);
});

server.listen(ORIGIN_PORT, () => {
  console.log(`[origin] listening on http://localhost:${ORIGIN_PORT}`);
  console.log(`[origin] serving from: ${baseDir}`);
  console.log(`[origin] allowed origins: ${ORIGIN_ALLOWED_ORIGINS.join(", ") || "(none)"}`);
});
