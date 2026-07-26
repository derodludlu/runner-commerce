# Runner Commerce Scaling Phase 1 Progress

Last updated: 2026-06-18

## Current Status

The core product idea is now proven at prototype level. Runner Commerce can capture product posts from WhatsApp shop/source groups, store products/listings, and repost products to runner destination groups. The remaining work is mostly operational hardening for running this as a reliable phase-1 reposting service for multiple runners.

## Phase-1 Pricing Direction

Runner reposting is positioned at R 399 per month, with a weekly option of R 125. The weekly option matches the normal shopping cycle and is easier for runners who buy stock weekly.

## Completed Foundations

- WhatsApp session bridge script exists for capture, group discovery, and reposting.
- Admin can create and manage WhatsApp bridge accounts.
- Runners can be assigned to bridge accounts.
- Bridge-aware group discovery has been added.
- Admin can import WhatsApp groups as shops from discovered groups.
- Shop/group/listing cleanup tools exist for development resets.
- Runner listings support reposting with image handling and runner WhatsApp link captions.
- Per-run post limits exist at bridge/runner automation level.
- Repost tracking exists per runner/listing/group, so one runner posting an item does not block another runner from posting the same captured product.
- Admin monitoring now flags destination WhatsApp groups selected by more than one active runner, reducing duplicate repost risk.
- Storage cleanup and manual listing/product cleanup tools have been started.

## Remaining Scaling Requirements

### 1. Create Real Bridge Accounts

Add each WhatsApp posting/capture device in Admin -> WhatsApp Bridges. Each bridge should represent one real WhatsApp linked number/device/session.

Each runner should be assigned to a bridge account so posting load and group access are traceable.

### 2. Make Bridge Running Reliable

Do not run bridges as manual terminal commands for production.

Recommended options:

- Windows: PM2, NSSM, or Task Scheduler.
- Linux/VPS: PM2, systemd, or Docker.
- Cloud worker: containerized bridge worker with persistent browser/session storage.

Each bridge worker must restart automatically after crashes, machine reboot, or network drops.

### 3. Per-Bridge Environment Setup

Each bridge needs its own isolated configuration:

- `WHATSAPP_BRIDGE_ACCOUNT_ID`
- `WHATSAPP_SESSION_NAME`
- Chrome/session profile
- WhatsApp linked number
- Worker/service name
- Upload/media storage path
- Backend API URL and ingest secret

The session profile must not be shared between bridge numbers.

### 4. Bridge Dashboard Polish

Improve Admin -> WhatsApp Bridges to show:

- Online/offline/stale status.
- Last heartbeat.
- Assigned runners.
- Capacity used versus capacity available.
- Posts sent today.
- Failed posts today.
- Last successful capture.
- Last successful repost.
- Current worker/session name.

### 5. Posting Quota And Backlog Controls

Add clearer controls to prevent one runner or one destination group from flooding the bridge.

Needed controls:

- Max posts per runner per interval.
- Max posts per destination group per interval.
- Max posts per bridge run.
- Backlog ordering by runner, shop, capture age, and priority.
- Skip or defer stale posts older than the configured selling cycle.

### 6. Better Failure Recovery

Track failed repost attempts with:

- Failure reason.
- Retry count.
- First failed time.
- Last failed time.
- Next retry time.
- Final failed state after max retries.

The bridge should retry temporary failures and avoid repeatedly retrying permanent failures.

### 7. Capture/Repost Audit Logs

Add a clear audit view showing:

- Captured from which shop/source group.
- Captured by which bridge.
- Captured at what time.
- Reposted to which runner destination group.
- Reposted by which bridge.
- Reposted at what time.
- Whether media was sent successfully.
- Whether the post was skipped, failed, retried, or completed.

### 8. Bridge Capacity Rules

Start conservatively:

- 5 to 8 active runners per WhatsApp bridge number/device.
- Maximum 2 destination groups per runner at a time.
- High-volume source groups should reduce bridge capacity.
- Monitor bans, disconnects, failed sends, queue delays, and user complaints before increasing limits.

Capacity must be adjusted after real usage data.

### 9. Deployment Plan

Recommended phase-1 deployment:

- Cloud-hosted web app and API.
- Cloud PostgreSQL database.
- Local or VPS-hosted WhatsApp bridge workers.
- Persistent bridge session storage.
- HTTPS public backend URL for bridge workers.
- Scheduled backups for database and uploaded media.
- Basic monitoring for API, database, and bridge workers.

## Immediate Next Build Steps

1. Add bridge worker service documentation for Windows and Linux.
2. Add per-bridge `.env` templates.
3. Improve Admin -> WhatsApp Bridges dashboard metrics.
4. Add failed repost retry metadata and UI.
5. Add capture/repost audit log UI.
6. Add per-run quota controls per runner and destination group.
7. Test with 2 to 3 real runner bridge numbers before onboarding 20+ runners.

## Working Assumption

Phase 1 focuses on reposting automation. Order workflow automation remains phase 2 and should be advertised as coming next, not as the initial service promise.
