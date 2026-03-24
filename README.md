# Platforma streamingowa MVP (Next.js + Vercel + domowy origin HLS)

MVP platformy do odtwarzania odcinków HLS, gdzie:
- frontend + API działają na Vercel (Next.js),
- pliki wideo (`.m3u8`, `.ts`) są hostowane na domowym serwerze,
- API zwraca krótkotrwały signed URL (`exp` + `token`).

## Wymagania
- Node.js 20+
- npm
- działający serwer origin z plikami HLS (HTTPS)
- `ffmpeg` (wymagany do konwersji uploadowanego pliku `.mp4` do HLS)

## Zmienne środowiskowe
Skopiuj `.env.example` do `.env.local` i uzupełnij:

- `VIDEO_ORIGIN_BASE_URL` – bazowy URL serwera z HLS, np. `https://video.example.com`
- `STREAM_SIGNING_SECRET` – długi losowy sekret do HMAC SHA-256
- `ADMIN_SYNC_PASSWORD` – hasło administratora (backend)
- `ACCESS_PASSWORD` – hasło wejścia na stronę
- `ACCESS_SESSION_SECRET` – sekret do podpisu cookie dostępu
- `NEXT_PUBLIC_APP_NAME` – opcjonalna nazwa aplikacji
- `UPLOAD_HLS_DIR` – katalog z aktywnym odcinkiem HLS na serwerze, np. `/srv/hls`
- `UPLOAD_EPISODE_DIR` – katalog odcinka podmienianego przez upload, domyślnie `episode-1`
- `UPLOAD_TMP_DIR` – katalog roboczy dla uploadu i konwersji, np. `/tmp/aleanimiec-upload`
- `UPLOAD_TMP_MAX_AGE_MS` – po ilu ms usuwać stare katalogi tymczasowe uploadu (domyślnie `21600000`, czyli 6h)
- `MANGA_UPLOADS_DIR` – katalog trwałego storage obrazów mangi (zalecane poza repo), np. `/var/lib/aleanimiec/manga`

## Uruchomienie lokalne
1. Instalacja zależności:
   ```bash
 - `DATABASE_URL` – połączenie do Postgresa (zalecane lokalnie na VPS), np. `postgresql://aniguess_user:haslo@127.0.0.1:5432/aniguess`
 - `DATABASE_SSL` – `true` tylko gdy łączysz się do zewnętrznego Postgresa po TLS
 - `DATABASE_SSL_REJECT_UNAUTHORIZED` – domyślnie `true`; ustaw `false` tylko gdy świadomie używasz self-signed cert
1. Wypchnij repozytorium do GitHub.
2. Zaimportuj projekt w Vercel.
  - `ACCESS_PASSWORD`
  - `ACCESS_SESSION_SECRET`
   - opcjonalnie `NEXT_PUBLIC_APP_NAME`
 - `GET /api/aniguess/ranking?scope=alltime|weekly|daily&limit=25` – ranking punktów z Postgresa
  - `${VIDEO_ORIGIN_BASE_URL}/hls/<episode>/master.m3u8?exp=<unix>&token=<hmac_hex>`

- API waliduje `episodeId` przed podpisaniem URL.
- Endpoint `/api/stream-url` ma prosty rate limit in-memory.


## PostgreSQL na tym samym VPS (minimum kosztów + bezpieczeństwo)

1. Zainstaluj Postgresa na VPS:
  ```bash
  sudo apt update
  sudo apt install -y postgresql postgresql-contrib
  ```

2. Utwórz użytkownika i bazę:
  ```bash
  sudo -u postgres psql -c "CREATE USER aniguess_user WITH PASSWORD 'MOCNE_HASLO';"
  sudo -u postgres psql -c "CREATE DATABASE aniguess OWNER aniguess_user;"
  sudo -u postgres psql -c "REVOKE ALL ON DATABASE aniguess FROM PUBLIC;"
  ```

3. Zastosuj schemat:
  ```bash
  sudo -u postgres psql -d aniguess -f /srv/aleanimiec/db/aniguess-ranking.sql
  ```

4. W `.env.local` ustaw:
  ```bash
  DATABASE_URL=postgresql://aniguess_user:MOCNE_HASLO@127.0.0.1:5432/aniguess
  DATABASE_SSL=false
  DATABASE_SSL_REJECT_UNAUTHORIZED=true
  ```

5. Hardening (ważne):
  - nie wystawiaj portu `5432` publicznie,
  - trzymaj `listen_addresses = 'localhost'` w `postgresql.conf`,
  - w `pg_hba.conf` zostaw dostęp lokalny (`127.0.0.1/32`),
  - rób backupy `pg_dump` (np. cron raz dziennie).

6. Restart Postgresa po zmianach konfiguracyjnych:
  ```bash
  sudo systemctl restart postgresql
  sudo systemctl status postgresql --no-pager
  ```
## Przepływ ruchu
API na Vercel tylko autoryzuje i podpisuje URL. Transfer wideo idzie bezpośrednio:

`użytkownik <-> domowy serwer video`

Wydajność zależy głównie od uploadu Twojego łącza domowego.

## Struktura
- `src/app/page.tsx` – publiczna strona główna AniGuess (MAL/Jikan)
- `src/app/api/aniguess/round/route.ts` – tworzenie rundy guessera
- `src/app/api/aniguess/guess/route.ts` – ocena odpowiedzi i punkty
- `src/lib/aniguess-store.ts` – pamięć rund i scoring similarity
- `src/app/aleanimiec/page.tsx` – ekran streamingu
- `src/components/StreamAdminView.tsx` – panel streamingu/admina
- `src/app/access/page.tsx` – strona hasła dostępu
- `src/middleware.ts` – wymuszenie hasła wejścia (cookie HttpOnly)
- `src/app/watch/[episodeId]/page.tsx` – redirect do `/`
- `src/app/api/stream-url/route.ts` – signed URL + rate limit
- `src/app/api/access-login/route.ts` – ustawienie cookie dostępu
- `src/app/api/sync-state/route.ts` – stan sesji odtwarzania (admin/viewer)
- `src/app/api/admin/upload/route.ts` – upload + konwersja + podmiana aktywnego odcinka
- `src/components/VideoPlayer.tsx` – odtwarzacz HLS (`hls.js` + fallback natywny)
- `src/data/episodes.ts` – statyczny katalog odcinków
- `src/lib/admin-upload.ts` – pamięć statusu uploadu i blokada równoległych jobów
- `src/lib/signing.ts` – HMAC SHA-256 sign/verify helper
- `.env.example`

## Upload odcinka z panelu admina (VPS)
- Po zalogowaniu admina możesz wybrać plik `.mp4` i kliknąć `Wrzuć odcinek`.
- Backend zapisuje plik na serwerze, konwertuje do HLS (`master.m3u8` + segmenty) i podmienia katalog aktywnego odcinka.
- Poprzedni odcinek jest usuwany po udanej podmianie.
- Dla części plików DVR backend automatycznie próbuje fallback konwersji wejścia (`mpegts`) zanim zwróci błąd.
- Stare katalogi tymczasowe uploadu są automatycznie czyszczone co ~6 godzin.
- Wymagane jest działające `ffmpeg` w systemie (`ffmpeg -version`).

## Uwaga operacyjna
To MVP bez CDN i bez rozproszonego rate-limitingu. Przy większym ruchu ograniczeniem będzie origin domowy i jego upload.

## Krok po kroku (bardzo prosto) – jak streamować z własnego komputera

Poniżej jest najprostsza ścieżka, żeby działało za darmo.

### 1) Konwersja odcinka `.mp4` do HLS (FFmpeg)
1. Utwórz folder, np. `C:\hls\episode-1`.
2. Wejdź do folderu z plikiem `input.mp4` i uruchom:
  ```powershell
  ffmpeg -i input.mp4 -c:v libx264 -c:a aac -f hls -hls_time 6 -hls_playlist_type vod -hls_segment_filename "C:\hls\episode-1\seg_%03d.ts" "C:\hls\episode-1\master.m3u8"
  ```
3. Po konwersji masz:
  - `C:\hls\episode-1\master.m3u8`
  - `C:\hls\episode-1\seg_000.ts` itd.

### 2) Ustaw dane odcinka w aplikacji
W pliku `src/data/episodes.ts` wpis dla odcinka musi wskazywać:
- `hlsPath: "/hls/episode-1/master.m3u8"`

Ta ścieżka musi pasować do folderu z punktu 1.

### 3) Uruchom domowy origin server (ten repo już go ma)
1. Skopiuj `origin/.env.origin.example` do pliku `origin/.env.origin`.
2. Ustaw wartości:
  - `ORIGIN_PORT=8080`
  - `ORIGIN_HLS_DIR=C:\hls`
  - `STREAM_SIGNING_SECRET=` **dokładnie ten sam sekret co na Vercel**
  - `ORIGIN_ALLOWED_ORIGINS=https://twoja-apka.vercel.app,http://localhost:3000`

3. W PowerShell (w katalogu projektu) uruchom:
  ```powershell
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
1. Wejdź na `/`.
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

## Komendy uruchamiania (Windows)

1. Terminal #1 – origin:
```powershell
cd "C:\Users\haszK\Desktop\striming odcinkow"
npm run origin:start
```

2. Terminal #2 – Caddy (HTTPS reverse proxy):
```powershell
cd "C:\Users\haszK\Desktop\striming odcinkow"
caddy run --config .\Caddyfile --adapter caddyfile
```

Jeśli `caddy` nie jest w PATH, użyj pełnej ścieżki:
```powershell
& "C:\Users\haszK\AppData\Local\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe" run --config .\Caddyfile --adapter caddyfile
```
