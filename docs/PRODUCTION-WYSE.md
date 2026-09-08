# Production Activation — Dell Wyse 5060 / 4 GB

This runbook activates the self-hosted Auto Media service without placing secrets in GitHub. The safe rollout order is: app health -> OAuth -> connection test -> private upload test -> unlisted/public.

## 1. Prepare the host

Recommended for the 4 GB Wyse profile:

- Docker Engine + Docker Compose v2.
- Keep VieNeu local TTS disabled on 4 GB (`VIENEU_TTS_ENABLED=false`); use external/lightweight TTS instead.
- Keep Ollama disabled (`OLLAMA_ENABLED=false`).
- Keep at least 2 GB free disk for the render guard; 4–8 GB swap is recommended if the host has little/no swap.

Check memory and swap:

```bash
free -h
swapon --show
```

If swap is absent and the host has enough SSD space, create it using the operating system's normal administration procedure before enabling unattended rendering.

## 2. Pull the application and create runtime directories

```bash
git pull --ff-only
mkdir -p data output
sudo chown -R 1000:1000 data output
```

The production image runs as the non-root Node user (UID 1000), so the bind-mounted directories must be writable by UID 1000.

## 3. Create `.env` locally — never commit it

```bash
cp .env.example .env
chmod 600 .env
```

Generate three independent high-entropy secrets locally, for example:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Put them into these separate fields in `.env`:

```dotenv
RENDER_API_KEY=<secret-1>
CREDENTIAL_VAULT_KEY=<secret-2>
OAUTH_STATE_SECRET=<secret-3>
```

Do not paste these values into GitHub issues, commits, screenshots, or chat logs.

For the initial boot keep:

```dotenv
BIND_ADDRESS=127.0.0.1
PUBLISH_LIVE_ENABLED=false
PUBLISH_STRICT_STARTUP=false
YOUTUBE_PRIVACY_STATUS=private
OLLAMA_ENABLED=false
VIENEU_TTS_ENABLED=false
```

The default Wyse limits are:

```dotenv
NODE_OPTIONS=--max-old-space-size=768
APP_MEM_LIMIT=2800m
APP_CPUS=2.0
```

## 4. Configure HTTPS / reverse proxy

The Compose file binds the app to `127.0.0.1:8787` by default so it is not directly exposed to the Internet. Put an HTTPS reverse proxy in front of it.

Example Caddy concept:

```caddy
media.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Use your actual domain and existing reverse-proxy setup. The public callback must be HTTPS.

## 5. Configure Google / YouTube OAuth

In the Google OAuth client, add the exact authorized redirect URI:

```text
https://YOUR-DOMAIN/api/publish-oauth/youtube/callback
```

Then set these only in the server `.env`:

```dotenv
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REDIRECT_URI=https://YOUR-DOMAIN/api/publish-oauth/youtube/callback
```

Keep `YOUTUBE_PRIVACY_STATUS=private` for the first real upload.

## 6. Build and start production

```bash
docker compose build --pull auto-media
docker compose up -d auto-media
docker compose ps
```

Follow startup diagnostics:

```bash
docker compose logs --tail=100 auto-media
```

Check liveness:

```bash
curl -fsS http://127.0.0.1:8787/health
```

Run the operator readiness check from inside the container:

```bash
docker compose exec auto-media npm run prod:check
```

The first check may show the publisher gate as locked while `PUBLISH_LIVE_ENABLED=false`; that is expected during initial setup.

## 7. Connect the real YouTube channel

Open the application through the HTTPS domain and use **KẾT NỐI / ĐỔI KÊNH**.

After OAuth returns to the app:

1. Confirm the displayed YouTube channel name.
2. Confirm the Channel ID.
3. Click **TEST KẾT NỐI**.
4. Confirm refresh token, OAuth scopes and readiness are all OK.

Do not enable public/unlisted publishing if the channel identity is not exactly the intended channel.

## 8. Perform the first real upload as PRIVATE

A Private Live Test is a real YouTube upload, but the backend always forces the test job to `private` even if another privacy value is configured.

Set:

```dotenv
PUBLISH_LIVE_ENABLED=true
PUBLISH_STRICT_STARTUP=true
YOUTUBE_PRIVACY_STATUS=private
```

Restart only the app service:

```bash
docker compose up -d --force-recreate auto-media
```

Click **TEST KẾT NỐI** again, then choose a small approved/rendered video in **Private Live Test** and run it.

Verify on YouTube Studio that:

- the video exists on the intended channel;
- visibility is **Private**;
- title/description are correct;
- playback is valid.

A successful test records only safe certification metadata in the encrypted credential record (test time/video ID), not OAuth tokens in the UI.

## 9. Enable Unlisted or Public only after Private Test PASS

For a staged rollout, prefer `unlisted` first:

```dotenv
YOUTUBE_PRIVACY_STATUS=unlisted
PUBLISH_LIVE_ENABLED=true
PUBLISH_STRICT_STARTUP=true
```

Then restart:

```bash
docker compose up -d --force-recreate auto-media
```

Run **TEST KẾT NỐI** immediately before creating a live publish job because channel readiness intentionally expires after the configured TTL (15 minutes by default).

After successful unlisted validation, change to `public` only when desired:

```dotenv
YOUTUBE_PRIVACY_STATUS=public
```

The backend still blocks Public/Unlisted if the Private Live Test certificate is missing.

## 10. Operational checks

Container status and resource use:

```bash
docker compose ps
docker stats --no-stream bien-noi-nho-auto-media
```

Application logs:

```bash
docker compose logs --tail=200 auto-media
```

Strict operator check:

```bash
docker compose exec -e PROD_CHECK_STRICT=true auto-media npm run prod:check
```

If live publishing is intentionally disabled, use the normal non-strict check instead.

## 11. Backup before upgrades

The bind mounts `./data` and `./output` persist across image rebuilds. For the simplest consistent SQLite backup, stop the app briefly before copying the database directory:

```bash
docker compose stop auto-media
cp -a data "data-backup-$(date +%Y%m%d-%H%M%S)"
docker compose start auto-media
```

Keep `.env` backups private and outside Git. Never commit `data/`, `output/`, SQLite WAL/SHM files, or `.env`.

## 12. Emergency stop for publishing

The fastest kill switch is:

```dotenv
PUBLISH_LIVE_ENABLED=false
```

Apply it with:

```bash
docker compose up -d --force-recreate auto-media
```

This disables new real publish work while leaving the application, Review Gate and render workflow available.
