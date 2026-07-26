# Online Frontend Setup

This setup keeps the backend, PostgreSQL, uploads, and WhatsApp bridge workers on
the local laptop while making the Next.js frontend available online.

## 1. Start Local Services

```powershell
cd C:\Dev\runnercommercequen35plus
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\start-hybrid-local.ps1
```

Keep WhatsApp bridge workers running through the existing interactive scripts or
Task Scheduler.

## 2. Start A Backend Tunnel

Install `cloudflared`, then run:

```powershell
cd C:\Dev\runnercommercequen35plus
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\start-backend-cloudflare-tunnel.ps1
```

Copy the public `https://...trycloudflare.com` URL printed by Cloudflare.

## 3. Deploy The Frontend To Vercel

Deploy the `frontend` folder as the Vercel project root.

Set Vercel environment variables:

```env
NEXT_PUBLIC_API_URL=https://your-backend-tunnel.example.com
NEXT_PUBLIC_ENABLE_PHASE_2=false
```

Redeploy after changing these values.

## 4. Allow The Public Frontend In The Backend

In `backend/.env`, add the Vercel URL to `FRONTEND_URLS`:

```env
FRONTEND_URLS=http://localhost:3000,http://localhost:3002,http://localhost:8081,http://localhost:19006,http://127.0.0.1:8081,http://127.0.0.1:19006,https://your-vercel-app.vercel.app
```

Restart the backend after changing this value.

## Notes

- The laptop and internet connection must stay on.
- The Cloudflare Tunnel window must stay open unless you configure a named tunnel
  as a Windows service later.
- Product images are served from the backend `/uploads` path through the tunnel.
- WhatsApp bridges remain local and interactive for QR/session stability.
