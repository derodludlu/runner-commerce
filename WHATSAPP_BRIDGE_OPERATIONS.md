# WhatsApp Bridge Operations

This note covers the phase-1 reposting worker setup. The web app/API/database can run in the cloud, while WhatsApp bridge workers run on machines or VPS instances that keep WhatsApp Web sessions linked.

## Per-Bridge Setup

1. Create a bridge in Admin -> WhatsApp Bridges.
2. Copy the bridge id.
3. Copy `backend/.env.bridge.example` to a bridge-specific env file.
4. Set:
   - `WHATSAPP_BRIDGE_ACCOUNT_ID`
   - `WHATSAPP_SESSION_NAME`
   - `WHATSAPP_BRIDGE_WORKER_KEY`
   - `BACKEND_URL`
   - `WHATSAPP_INGEST_SECRET`
5. Link the correct WhatsApp number by scanning the QR code.
6. Assign runners to the bridge in Admin -> Runners.

Use one unique WhatsApp session name and Chrome/session profile per bridge number. Do not share the same session profile across bridge numbers.

## Windows Supervision Options

Preferred simple options:

- PM2 for Node process supervision.
- NSSM for Windows service setup.
- Task Scheduler for auto-start on login or reboot.

Example PM2 flow:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
pm2 start scripts\whatsapp-session-bridge.js --name runner-commerce-bridge-001
pm2 save
pm2 startup
```

Set bridge env vars before starting PM2, or use an ecosystem config per worker.

## Linux/VPS Supervision Options

Preferred options:

- PM2
- systemd
- Docker with persistent volumes

The worker needs persistent storage for WhatsApp session auth/cache, uploads, and browser profile data.

## Capacity Rules

Start conservatively:

- 5 to 8 active runners per bridge number.
- Maximum 2 destination groups per runner.
- Maximum 8 reposts per job while a bridge number is warming up or after a WhatsApp warning.
- Keep at least 90 seconds between reposted products.
- Keep bridge-level reposting below 80 delivered posts per day until the number is stable again.
- Reduce runner count when source groups are high volume.
- Watch queue delay, failed sends, disconnects, and customer complaints.

After a WhatsApp restriction warning, leave the safer limits in place for at least 7 days before increasing capacity gradually.

## Operational Checks

Admin -> WhatsApp Bridges should be checked for:

- HEALTHY/STALE/OFFLINE status.
- Last heartbeat.
- Assigned runner count.
- Posts sent today.
- Failed posts today.
- Pending retries.
- Last successful repost.
- Last failed repost.

## Failure Handling

Failed reposts are tracked with:

- status
- error message
- retry count
- last attempt time
- next retry time
- bridge id
- runner/listing/group

Temporary failures should be retried. Permanent failures should be fixed by correcting group access, bridge session state, media access, or runner destination configuration.

Use `WHATSAPP_REPOST_RETRY_DELAY_MINUTES` to control when a failed post becomes eligible again, and `WHATSAPP_REPOST_MAX_RETRY_COUNT` to stop repeated failures from blocking the bridge. Keep `WHATSAPP_AUTO_REPOST_INTERVAL_MINUTES=30`, `WHATSAPP_REPOST_MAX_POSTS_PER_JOB=10`, `WHATSAPP_BRIDGE_DAILY_REPOST_LIMIT=80`, and both repost send delays at `90000` or higher; these are the default safety settings for all automatic reposting.
