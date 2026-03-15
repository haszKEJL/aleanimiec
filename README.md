# Platforma streamingowa MVP (Next.js + Vercel + domowy origin HLS)

MVP platformy do odtwarzania odcinków HLS, gdzie:
- frontend + API działają na Vercel (Next.js),
- pliki wideo (`.m3u8`, `.ts`) są hostowane na domowym serwerze,
- API zwraca krótkotrwały signed URL (`exp` + `token`).

## Wymagania
- Node.js 20+
- npm
- działający serwer origin z plikami HLS (HTTPS)

## Zmienne środowiskowe
Skopiuj `.env.example` do `.env.local` i uzupełnij:

- `VIDEO_ORIGIN_BASE_URL` – bazowy URL serwera z HLS, np. `https://video.example.com`
- `STREAM_SIGNING_SECRET` – długi losowy sekret do HMAC SHA-256
- `NEXT_PUBLIC_APP_NAME` – opcjonalna nazwa aplikacji

## Uruchomienie lokalne
1. Instalacja zależności:
   ```bash
   npm install
   ```
2. Utwórz plik `.env.local` z wymaganymi zmiennymi.
3. Start dev server:
   ```bash
   npm run dev
   ```
4. Otwórz: `http://localhost:3000`

## Deploy na Vercel
1. Wypchnij repozytorium do GitHub.
2. Zaimportuj projekt w Vercel.
3. W ustawieniach projektu dodaj env:
   - `VIDEO_ORIGIN_BASE_URL`
   - `STREAM_SIGNING_SECRET`
   - opcjonalnie `NEXT_PUBLIC_APP_NAME`
4. Wykonaj deploy.

## Jak wskazać `VIDEO_ORIGIN_BASE_URL`
- To adres publiczny Twojego domowego serwera video (najlepiej HTTPS), np.:
  - `https://video.example.com`
- Endpoint API generuje URL:
  - `${VIDEO_ORIGIN_BASE_URL}/hls/<episode>/master.m3u8?exp=<unix>&token=<hmac_hex>`

## Zaimplementowane endpointy i strony
- `GET /` – lista odcinków
- `GET /watch/[episodeId]` – ekran odtwarzania
- `GET /api/stream-url?episodeId=...` – signed URL
  - `404` dla nieznanego odcinka
  - walidacja `episodeId`
  - rate limiting in-memory (best effort)

## Bezpieczeństwo MVP
- Token ważny maksymalnie 5 minut (`300s`).
- Sekret podpisu jest używany tylko po stronie serwera.
- API waliduje `episodeId` przed podpisaniem URL.
- Endpoint `/api/stream-url` ma prosty rate limit in-memory.

## Przepływ ruchu
API na Vercel tylko autoryzuje i podpisuje URL. Transfer wideo idzie bezpośrednio:

`użytkownik <-> domowy serwer video`

Wydajność zależy głównie od uploadu Twojego łącza domowego.

## Struktura
- `src/app/page.tsx` – lista odcinków
- `src/app/watch/[episodeId]/page.tsx` – ekran odtwarzania
- `src/app/api/stream-url/route.ts` – signed URL + rate limit
- `src/components/VideoPlayer.tsx` – odtwarzacz HLS (`hls.js` + fallback natywny)
- `src/data/episodes.ts` – statyczny katalog odcinków
- `src/lib/signing.ts` – HMAC SHA-256 sign/verify helper
- `.env.example`

## Uwaga operacyjna
To MVP bez CDN i bez rozproszonego rate-limitingu. Przy większym ruchu ograniczeniem będzie origin domowy i jego upload.

## Krok po kroku (bardzo prosto) – jak streamować z własnego komputera

Poniżej jest najprostsza ścieżka, żeby działało za darmo.

### 1) Przygotuj folder z HLS na swoim komputerze
1. Utwórz folder, np. `C:\hls\episode-1`.
2. Wrzuć tam `master.m3u8` i segmenty (`.ts` albo `.m4s`).
3. Przykładowa struktura:
  - `C:\hls\episode-1\master.m3u8`
  - `C:\hls\episode-1\seg_000.ts`

### 2) Ustaw dane odcinka w aplikacji
W pliku `src/data/episodes.ts` wpis dla odcinka musi wskazywać:
- `hlsPath: "/hls/episode-1/master.m3u8"`

Ta ścieżka musi pasować do folderu z punktu 1.

### 3) Uruchom domowy origin server (ten repo już go ma)
1. Skopiuj `origin/.env.origin.example` do pliku `.env.origin` (obok niego).
2. Ustaw wartości:
  - `ORIGIN_PORT=8080`
  - `ORIGIN_HLS_DIR=C:\hls`
  - `STREAM_SIGNING_SECRET=` **dokładnie ten sam sekret co na Vercel**
  - `ORIGIN_ALLOWED_ORIGINS=https://twoja-apka.vercel.app,http://localhost:3000`

3. W PowerShell (w katalogu projektu) uruchom:
  ```powershell
  $env:ORIGIN_PORT="8080"
  $env:ORIGIN_HLS_DIR="C:\hls"
  $env:STREAM_SIGNING_SECRET="TU_WKLEJ_TEN_SAM_SEKRET_CO_NA_VERCEL"
  $env:ORIGIN_ALLOWED_ORIGINS="https://twoja-apka.vercel.app,http://localhost:3000"
  npm run origin:start
  ```

Jeśli zobaczysz `listening on http://localhost:8080` to znaczy, że origin działa.

### 4) Wystaw origin do internetu

#### Opcja A (najprościej i za darmo): Cloudflare Quick Tunnel
1. Zainstaluj `cloudflared`.
2. W nowym terminalu uruchom:
  ```powershell
  cloudflared tunnel --url http://localhost:8080
  ```
3. Skopiuj adres `https://...trycloudflare.com`.

#### Opcja B: publiczne IP + port forwarding
1. W routerze zrób przekierowanie portu `443` na komputer z originem.
2. Zapewnij HTTPS (np. reverse proxy).
3. Użyj swojej domeny/DDNS.

### 5) Ustaw Vercel
W projekcie na Vercel ustaw env:
- `VIDEO_ORIGIN_BASE_URL`:
  - Opcja A: `https://...trycloudflare.com`
  - Opcja B: `https://twoja-domena.pl`
- `STREAM_SIGNING_SECRET`: ten sam co na originie
- `NEXT_PUBLIC_APP_NAME` (opcjonalnie)

Po zmianie env zrób redeploy.

### 6) Test
1. Wejdź na `/watch/episode-1`.
2. Sprawdź czy odtwarzacz startuje.
3. Jeśli nie działa:
  - sprawdź czy `hlsPath` zgadza się z plikami,
  - sprawdź czy sekrety są identyczne,
  - sprawdź czy `VIDEO_ORIGIN_BASE_URL` jest aktualny,
  - sprawdź logi origin servera.

## Ważne
- Koledzy oglądają przez stronę na Vercel.
- Transfer video idzie bezpośrednio z Twojego komputera (Twój upload).
- Komputer z originem musi być włączony podczas oglądania.
