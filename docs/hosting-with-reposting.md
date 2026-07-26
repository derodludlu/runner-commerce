# Hosting With Reposting Undisturbed

This runbook keeps WhatsApp capture/reposting online while making the web app public. The first hosting phase is Vercel for the frontend plus Cloudflare Tunnel for the existing local backend.

## Hard Rule

Do not stop these while hosting work is underway unless there is an explicit maintenance window:

- `runner-commerce-whatsapp-monitor`
- any `whatsapp:session:bridge` / `scripts/whatsapp-session-bridge.js` process
- PostgreSQL

API restarts should be avoided during active repost windows. If an API restart is required for config changes, validate first and restart only `runner-commerce-api`.

## Preflight

From `backend`:

```powershell
npm run hosting:preflight
```

The command confirms PM2 API/monitor status, active WhatsApp bridge processes, and local backend health.

## Backend Tunnel

Install/authenticate Cloudflare Tunnel outside the app workflow if it is not already installed. Start a quick tunnel for testing without touching reposting:

```powershell
cloudflared tunnel --url http://localhost:3001
```

For a permanent domain, use a named tunnel based on `backend/config/cloudflared-runner-commerce.example.yml` and point `api.your-domain.example` to `http://localhost:3001`.

## Frontend on Vercel

Set Vercel environment variables from `frontend/env.production.example`:

- `NEXT_PUBLIC_API_URL`: public Cloudflare backend URL
- `NEXT_PUBLIC_FRONTEND_URL`: Vercel frontend URL
- `NEXT_PUBLIC_ENABLE_PHASE_2=true`

Deploy the `frontend` directory. Do not run PM2 stop commands as part of this deploy.

## Backend CORS

Add the Vercel frontend origin to backend env using exact origins:

```text
FRONTEND_URLS=https://your-vercel-app.vercel.app,http://localhost:3000,http://localhost:3002
CORS_ORIGINS=https://your-vercel-app.vercel.app,http://localhost:3000,http://localhost:3002
FRONTEND_URL=https://your-vercel-app.vercel.app
NEXT_PUBLIC_FRONTEND_URL=https://your-vercel-app.vercel.app
```

The backend now accepts `FRONTEND_URLS`, `CORS_ORIGINS`, or `FRONTEND_URL` for allowed CORS origins.

## Smoke Check

After the public URLs are available:

```powershell
$env:PUBLIC_FRONTEND_URL="https://your-vercel-app.vercel.app"
$env:PUBLIC_BACKEND_URL="https://api.your-domain.example"
$env:RUNNER_CODE="RUN-EXAMPLE"
npm run hosting:smoke
```

Optional: set `ORDER_CODE` to test `/r/[runnerCode]?code=[orderCode]` and the public runner API deep link.
