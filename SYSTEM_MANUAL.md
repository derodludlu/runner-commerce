# Runner Commerce System Manual

Last updated: 2026-06-30

## 1. Purpose And Current Scope

Runner Commerce is a WhatsApp-first commerce operations platform for runners and shop owners. It captures product posts from shop WhatsApp groups, creates reusable product records, and reposts selected products to runner or shop advertising groups.

The system has two independently controlled service phases:

- **Phase 1 - Capture and reposting:** WhatsApp group discovery, shop capture, product parsing, runner listings, scheduled reposting, bridge health, quotas, and audit logs.
- **Phase 2 - Order operations:** customer baskets, checkout, payment submission, runner verification, shop-by-shop buying lists, packing, handover, returns, and order history.

Current runtime state on 2026-06-30:

- Phase 1 is active.
- Phase 2 web order management is enabled.
- Incoming WhatsApp order-chat intake is a separate switch and is currently disabled.
- AI enrichment is suspended.
- The primary mobile strategy is the responsive PWA/web app. The Expo app remains secondary.

Phase 1 must continue working when Phase 2 is disabled.

## 2. Core Business Workflow

### Phase 1

1. A bridge WhatsApp number joins supplier/shop groups.
2. The bridge discovers and syncs those groups.
3. Admin imports a group as a shop source or links it to an existing shop.
4. The bridge captures media and the related caption from the source group.
5. The backend parses prices and creates products/import records.
6. Each approved runner receives an independent listing for products from joined shops.
7. The runner chooses up to two advertising groups.
8. The bridge reposts eligible listings and records status per runner, listing, and destination group.

Products are captured once and may be listed and reposted by many runners. One runner posting a product does not mark it posted for another runner.

### Phase 2

1. A customer adds runner listings to the web basket.
2. The customer adds quantity, size, colour, item notes, and optional reference images.
3. Checkout separates a mixed basket into one order per runner.
4. The customer chooses collection, delivery station, or public transport handover.
5. The customer submits a local payment method, reference, and/or proof image.
6. Payment remains `SUBMITTED` until the runner verifies it.
7. A verified paid order appears in the runner's shop-by-shop shopping list.
8. The runner progresses the order through buying, packing, handover, and completion.

## 3. Roles And RBAC

### Admin And Superuser

Admin users can:

- Manage users, roles, runners, shops, and shop owners.
- Reset passwords and issue temporary password delivery through Bridge 1.
- Create, update, pause, verify, and monitor WhatsApp bridges.
- Discover, classify, link, archive, restore, and remove WhatsApp groups.
- Import groups as shops or runner advertising groups.
- Manage subscriptions, invoices, payments, upgrades, downgrades, pauses, cancellations, approvals, and rejections.
- Enable or disable Phase 2 and WhatsApp order intake independently.
- Use development cleanup and reset controls.

### Shop Owner

Shop owners can:

- Manage owned shops and related WhatsApp groups.
- Select one primary source group per shop.
- Track paused destination groups belonging to the same shop.
- Review products/imports where intervention is enabled.
- Approve, reject, or remove runners from owned shops.
- Manage shop subscription billing.

Shop-to-shop destination reposting remains paused unless explicitly enabled after agreement with the shop owner.

### Runner

Runners can:

- Discover and request access to shops.
- See clearly which shops are already joined or pending.
- Configure global automation and shop-specific overrides.
- Select up to two default runner advertising groups.
- Edit, suppress, delete, filter, manually repost, or auto-post own listings.
- Track capture, listing, repost, failure, and backlog metrics.
- Manage incoming WhatsApp requests when intake is enabled.
- Verify customer payments and progress owned orders.
- Use the shop-by-shop shopping list.
- Manage own profile, WhatsApp number, destination groups, and billing.

### Customer

Customers can:

- Register and sign in.
- Browse products and runner listings.
- Use text or internal image search.
- Maintain a basket with reference images.
- Submit separate runner orders at checkout.
- Submit manual payment details for verification.
- View order, buying, packing, and handover status.
- Cancel eligible orders and submit returns where permitted.

Backend guards enforce RBAC even when navigation links are hidden.

## 4. Technology And Architecture

### Frontend

- Next.js 16 and React 19 in `frontend`.
- Responsive web/PWA metadata and manifest.
- Production URL locally: `http://localhost:3000`.
- API client: `frontend/lib/api.ts`.
- Runtime feature flags come from `GET /health/features`.

### Backend

- NestJS API in `backend`.
- Prisma ORM with PostgreSQL.
- JWT authentication, validation, RBAC, throttling, and Swagger.
- Production URL locally: `http://localhost:3001`.
- Swagger when enabled: `http://localhost:3001/api/docs`.

### Infrastructure

- PostgreSQL 15 in Docker container `runner-commerce-postgres`.
- Redis in Docker container `runner-commerce-redis`.
- Named Docker volumes preserve database and Redis data.
- PM2 supervises the frontend, API, and WhatsApp monitor.
- Interactive PowerShell workers run WhatsApp bridge sessions.

### WhatsApp Bridge

- Node.js 22 and `whatsapp-web.js`.
- Google Chrome and persistent WhatsApp Web authentication.
- One isolated session/auth folder per bridge number.
- Heartbeats, logs, group discovery, capture, reposting, retries, and outboxes are reported to the backend.

### Durable Media

Local uploads remain outside Docker in:

```text
backend/uploads
```

WhatsApp sessions remain outside Docker in folders such as:

```text
backend/.wwebjs_auth
backend/.wwebjs_auth_bridge_002
```

## 5. Data Model Overview

Important records include:

- `User`, `Role`, `Runner`, and `Shop`.
- `WhatsAppBridgeAccount` and bridge assignments.
- `WhatsAppDiscoveredGroup` and `WhatsAppGroupMapping`.
- `WhatsAppCaptureCheckpoint` and capture runs.
- `WhatsAppImport`, `Product`, and `RunnerListing`.
- `WhatsAppRepostLog`, stamped media logs, and retry state.
- `Cart`, `CartItem`, `Order`, and `OrderItem`.
- `ManualPaymentRecord` for customer and platform payments.
- `BillingPlan`, `Subscription`, and `PlatformInvoice`.
- `PlatformBillingEvent` for immutable per-order service fees.

Archive/restore is preferred over hard deletion for operational records. Hard deletion is reserved for explicit development cleanup or expired media/listings.

## 6. Prerequisites

- Windows 10/11.
- Node.js 22 LTS for bridge stability.
- npm.
- Docker Desktop.
- Google Chrome.
- A WhatsApp account for each bridge session.

Node.js 24 is not recommended for bridge workers because it previously caused Puppeteer/WhatsApp Web execution-context failures.

Install dependencies:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm install

cd C:\Dev\runnercommercequen35plus\frontend
npm install
```

## 7. Recommended Local Hosting

Runner Commerce currently uses a hybrid layout:

- Docker: PostgreSQL and Redis.
- PM2: frontend, API, and bridge monitor.
- Interactive PowerShell/Task Scheduler: Bridge 1 and Bridge 2.

Start everything except interactive bridges:

```powershell
cd C:\Dev\runnercommercequen35plus
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\start-hybrid-local.ps1
```

Start infrastructure and open bridge windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\start-hybrid-local.ps1 -StartBridges
```

Check:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:3001
Swagger:  http://localhost:3001/api/docs
```

Stop PM2 apps while leaving Docker data services running:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\stop-hybrid-local.ps1
```

Stop apps and Docker infrastructure:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\stop-hybrid-local.ps1 -StopDocker
```

Stop bridge workers as well:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\stop-hybrid-local.ps1 -StopBridges
```

Do not use `docker compose down -v` unless permanent deletion of database volumes is intended.

## 8. Development Mode

Keep Docker PostgreSQL/Redis running and use separate development processes.

Backend:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm run start:dev:watch
```

Frontend:

```powershell
cd C:\Dev\runnercommercequen35plus\frontend
npm run dev
```

Avoid running production PM2 and development servers on the same ports. `EADDRINUSE` means another process already owns `3000` or `3001`.

Apply schema changes:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npx prisma format
npx prisma db push
npx prisma generate
```

On Windows, Prisma generation can report `EPERM` if the API or bridge holds the query-engine file. Stop the API/monitor briefly, generate, then restart. Do not kill unrelated Node processes.

Build verification:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm run build
npm test -- --runInBand

cd C:\Dev\runnercommercequen35plus\frontend
npm run build
```

## 9. Environment Configuration

Backend file:

```text
backend/.env
```

Important non-secret settings:

```env
PORT=3001
BACKEND_URL=http://localhost:3001
WHATSAPP_SESSION_BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
WHATSAPP_SESSION_HEADLESS=false
WHATSAPP_GROUP_DISCOVERY_INTERVAL_MINUTES=30
WHATSAPP_AUTO_CAPTURE_INTERVAL_MINUTES=15
WHATSAPP_AUTO_PIPELINE_INTERVAL_MINUTES=10
WHATSAPP_AUTO_REPOST_INTERVAL_MINUTES=30
WHATSAPP_AUTO_REPOST_MAX_LISTINGS_PER_RUN=10
```

Automatic reposting uses the standard 30-minute safety cadence. Per-job repost volume is capped at 10 posts, with 90-second bridge send delays to fit the 15-minute repost window.

Frontend file:

```text
frontend/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Never place JWT secrets, bridge secrets, session files, database passwords, or API keys in this manual or source control.

## 10. Creating And Connecting Bridges

Go to:

```text
Admin -> WhatsApp Bridges
```

Recommended setup order:

1. Create a bridge record.
2. Give it a stable name such as `WhatsApp Bridge 1`.
3. Record the expected WhatsApp number.
4. Copy the generated bridge ID.
5. Configure a unique session name, worker key, and auth folder.
6. Start the matching bridge script.
7. Scan the QR code when required.
8. Confirm the reported authenticated number matches the expected number.
9. Assign runners.
10. Sync groups and classify them.

Bridge modes:

- `CAPTURE_ONLY`: discovers/captures but does not repost.
- `POST_ONLY`: reposts but does not capture.
- `CAPTURE_AND_POST`: performs both.
- `PAUSED`: performs neither.

Phone verification statuses include `VERIFIED`, `UNVERIFIED`, `MISMATCHED`, and `UNKNOWN`. A mismatched expected/authenticated number blocks operational work until corrected.

Use one session name and auth path per number. Never run two workers against the same auth folder.

## 11. Bridge Scripts

Bridge 1:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Dev\runnercommercequen35plus\ops\start-whatsapp-bridge-001.ps1
```

Bridge 2:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Dev\runnercommercequen35plus\ops\start-whatsapp-bridge-002.ps1
```

Bridge 2 is locally configured as repost-only by disabling shop capture, the auto pipeline, and order tracking before starting the worker.

Watchdog:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Dev\runnercommercequen35plus\ops\watch-whatsapp-bridges.ps1
```

Logs:

```text
backend/logs/task-whatsapp-bridge-001.log
backend/logs/task-whatsapp-bridge-002.log
backend/logs/whatsapp-bridge-watchdog.log
```

Bridge console logs are also available from the Admin bridge UI.

For Task Scheduler, use `Run only when user is logged on` so Chrome can use the interactive desktop.

## 12. Group Discovery And Management

Useful commands:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm run whatsapp:session:list-groups
npm run whatsapp:session:sync-groups
npm run whatsapp:session:analyze
```

When the bridge worker is already running for the configured session, these
commands submit the request to that live worker and reuse its WhatsApp Web
client instead of starting a second client. Use `-- --force-session-start` only
when you intentionally want the command to attempt its own session lock.

The WhatsApp Groups UI distinguishes:

- Shop source groups.
- Shop destination groups.
- Runner advertising groups.
- Unclassified groups.

Group discovery is bridge-aware. `AVAILABLE` means the current bridge reported the group recently. `STALE` means it was previously seen but is no longer current for that bridge. A group seen only by another bridge must not appear available on the wrong bridge.

Group discovery excludes simple contacts and non-group chats. Participant counts may be zero when WhatsApp did not expose participant metadata during that sync; zero does not automatically mean the group is empty.

Use group avatars/profile pictures throughout the UI to strengthen identity. Refresh discovery to update names, counts, and profile pictures.

### Linking Groups To Shops

- Use `Import as Shop` to create a shop from a source group.
- Use `Link to Shop` for another group belonging to an existing shop.
- Use `Import as Runner Advertising Group` for customer-facing runner groups.
- Select the shop explicitly; the UI must not default to an unrelated shop.

Duplicate/relationship suggestions may use partial name similarity and matching creator metadata. Suggestions are warnings, not proof. Confirm before linking and use delink when a relationship is wrong.

One shop should normally have one active primary source. Other groups from the same shop should be marked as paused destinations unless shop-owner reposting has been agreed.

## 13. Capture And Checkpoints

The bridge groups media and captions using group, sender, message order, and timing. It supports posts where images arrive first and a description/price follows.

Capture safeguards:

- Media can be required.
- Products without valid media are skipped when required.
- Checkpoints store the last fully completed source message.
- Retries resume from the last completed point.
- Message IDs and source fingerprints prevent repeated imports.
- Capture run statistics record scanned, captured, skipped, and failed totals.

The checkpoint is advanced only after a message/product group is fully handled. This avoids skipping partially processed product posts after network, Chrome, or API interruptions.

Backfill from the last checkpoint:

```powershell
npm run whatsapp:session:backfill -- --since-last-capture --limit=500
```

Backfill a time window:

```powershell
npm run whatsapp:session:backfill -- --from=2026-06-01T08:00 --to=2026-06-01T18:00 --limit=1000
```

## 14. Price Parsing

The parser normalizes common currency variants including:

```text
R240
R 240
R.240
R 👉 240
Ř 240
🅡 240
®️ 240
ZAR 240
SZL 240
```

It extracts candidates and ranks them using context instead of blindly using the first `R` value.

Supported concepts include:

- `PRICE`, `EACH`, and retail/unit price.
- `STOCK` as a wholesale/bulk price when paired with `EACH`.
- `3 for R 150` as bulk total R150 and unit equivalent R50.
- Decimal/superscript endings such as `9999` when the source styling represents R99.99.
- Bulk savings when unit/retail and bulk prices are both known.
- Runner fee applied to both retail unit price and bulk price where appropriate.

Products retain raw candidates, confidence, warnings, bulk quantity/total, and unit price metadata. Low-confidence prices should display a confirmation warning and must not receive automatic runner-fee pricing.

AI enrichment is currently suspended. Original shop captions and media remain the primary source.

## 15. Runner Marketplace And Listings

Runner path:

```text
Runner -> Marketplace
```

Use `Discover Shops` to request access. `My Shops` contains approved shops and automation settings.

Global settings can apply to all approved shops:

- Auto-list captured products.
- Auto-post approved listings.
- Require media.
- Markup/runner-fee percentage.
- Maximum listings per run.
- Up to two runner destination groups.

Shop-specific overrides remain available.

Runner listings support:

- Posted/not-posted filtering per destination group.
- Caption and media editing.
- Suppression/deletion before reposting.
- Manual repost packs.
- Deletion by listing age.
- Repost status, retry state, and destination audit.
- Search by shop, source group, runner, captured date, reposted date, and destination.

## 16. Reposting Rules

The configured local schedule is every 30 minutes with a maximum of 10 listings per run.

`Max posts/run` counts listings, not WhatsApp messages. One listing may produce several media messages plus its caption.

Each product pack:

- Preserves related media as separate selectable images.
- Sends images before the caption.
- Repeats the first image when exactly four images need visual grouping.
- Keeps the product divider.
- Does not send a separate product-header message.
- Uses compact fee-focused captioning.
- Includes the runner contact/order link and order code when configured.

Stamped images and order codes can be matched when a customer returns an image. The system records which stamped media was sent and how often it was returned.

Posting status is unique per runner, listing, and destination. Failed attempts retain reason, retry count, and retry timing. Backlog should contain only eligible, not-yet-posted destinations.

## 17. Phase 2 Feature Controls

Go to:

```text
Admin -> Development
```

Controls:

- **Phase 2 order management:** enables cart, orders, returns, wishlist, coupons, runner order requests, shopping list, and earnings routes.
- **Incoming WhatsApp order tracking:** enables private-message/chatbot intake only when Phase 2 is also enabled.

Disabling Phase 2 automatically makes WhatsApp order tracking ineffective. Reposting remains active.

## 18. Customer Basket And Checkout

The web basket supports:

- Quantity updates.
- Customer reference-image upload.
- Automatic cycle reset/retention notices.
- Runner fee and customer-total transparency.

Checkout supports:

- Size, colour, item note, quantity, and reference images.
- Collection from runner.
- Town delivery station.
- Public transport handover.
- Customer WhatsApp number and location.
- MTN MoMo, EFT, cash deposit, Instant Money, eWallet, Unayo, cash, and other manual methods.
- Payment reference and proof-image upload.

A basket containing listings from multiple runners is split into separate orders. This prevents unassigned mixed-runner orders.

Payment submission does not mark an order paid. It creates a pending manual payment record and changes the order to `PENDING_PAYMENT`/`SUBMITTED` until runner verification.

## 19. Order Lifecycle

Operational statuses include:

```text
CREATED
ORDER_CONFIRMED
PENDING_PAYMENT
PAID
BUYING_TRIP_PLANNED
BUYING_IN_PROGRESS
PURCHASED_FROM_SHOPS
ARRIVED_FOR_PACKING
PACKED
READY_FOR_HANDOVER
OUT_FOR_HANDOVER or SHIPPED
COMPLETED
```

Terminal states include `CANCELLED` and `REFUNDED`.

Runners verify or reject submitted customer payments. After verification, runner controls advance the order through the buying and fulfilment lifecycle.

The shop-by-shop shopping list groups items by:

- Shop.
- Product and media identity.
- Size and colour.
- Customer and order.

Product and customer reference images remain visible so the runner can buy and pack the correct item even when product names are similar.

## 20. WhatsApp Order Intake

When separately enabled, the `whatsapp-web.js` bridge can run a structured private-message conversation:

1. Match order code or stamped media.
2. Request item image if missing.
3. Request size.
4. Request colour.
5. Request quantity.
6. Show confirmation/edit/cancel options.
7. Sync the request to the platform order/basket flow.
8. Notify the correct runner with concise order details.

Customer identity is derived from the actual incoming chat/sender identity, not forwarded message text. Duplicate forwards and auto-responses are deduplicated.

This switch is currently off and may be enabled without changing Phase 1 reposting.

## 21. Platform Billing

Currency is ZAR and displayed as `R 0.00`.

Configured launch plan prices are defined by the backend and shown in the Billing UI. Current runner plans include weekly, starter, active, and power tiers. Shop plans include starter, active, and multi-group tiers.

Current promotional plan values:

| Audience   | Plan             | Billing cycle | Price |
| ---------- | ---------------- | ------------- | ----: |
| Runner     | Starter Runner   | Weekly        |   R95 |
| Runner     | Active Runner    | Weekly        |  R150 |
| Runner     | Power Runner     | Weekly        |  R240 |
| Runner     | Starter Runner   | Monthly       |  R299 |
| Runner     | Active Runner    | Monthly       |  R479 |
| Runner     | Power Runner     | Monthly       |  R769 |
| Shop owner | Shop Starter     | Monthly       |  R189 |
| Shop owner | Shop Active      | Monthly       |  R299 |
| Shop owner | Shop Multi-Group | Monthly       |  R479 |

Runner delivery allowances are sized from a baseline of at least 1,250
successful listing-to-destination posts per runner per week:

| Runner plan | Weekly allowance | Monthly allowance |
| ----------- | ---------------: | ----------------: |
| Starter     |            1,500 |             6,000 |
| Active      |            2,500 |            10,000 |
| Power       |            4,000 |            16,000 |

Runner capacity add-ons include 500 weekly or 2,000 monthly repost deliveries,
plus 10 source groups.

The Billing UI displays the calculated regular price with a strike-through and the 25% launch offer through 31 July 2026. Update backend plan defaults and the promotion copy together when pricing changes.

Two add-ons are intentionally separate:

- **Capacity add-on:** additional reposting/source-group capacity.
- **Phase 2 order workflow add-on:** R99/month on monthly runner plans, or R35/week on the weekly plan.
- **Add runner price editing/calculation:** R49/month on monthly runner plans, or R14/week on the weekly plan.
- **Attach shop price to each image:** R49/month on monthly runner plans, or R14/week on the weekly plan.

When the Phase 2 add-on is enabled, the platform charges:

```text
R 3.00 per runner-verified paid order
```

Rules:

- A charge is created only when the runner verifies customer payment.
- `PlatformBillingEvent.orderId` is unique, preventing duplicate charges.
- Repeated verification cannot create another event.
- Cancellation before runner purchase reverses a charge.
- If an already-paid platform invoice contains the charge, reversal becomes `CREDIT_PENDING` for admin handling.
- Platform fees are billed to the runner, not added to the customer's product total.
- Capacity and Phase 2 add-ons appear separately on invoices.

Billing event statuses include:

- `CHARGEABLE`.
- `INVOICED`.
- `REVERSED`.
- `CREDIT_PENDING`.

The Billing UI includes a verified-order fee ledger showing order, runner, time, fee, status, and invoice.

Manual platform invoice payments support EFT, MTN MoMo, cash deposit, reference, and proof URL/path. Admin can verify/reject payments and approve/reject/pause/cancel subscriptions.

Existing subscriptions are not silently opted into Phase 2. Enable the Phase 2 add-on from Runner/Admin Billing.

## 22. Internal Image Search

Products and runner listings provide `Search by Image`.

Backend endpoint:

```text
POST /products/image-search
```

The service compares SHA/perceptual fingerprints against captured internal media and returns ranked Exact, Strong, or Possible matches. It does not currently call Google Lens or external visual-search services.

Admin backfill endpoint:

```text
POST /products/image-search/backfill
```

## 23. Admin CRUD And Cleanup

Admin controls include:

- Archive/restore shops and groups.
- Delink incorrect group/shop relationships.
- Cancel runner shop requests.
- Change user roles with safeguards.
- Pause/resume bridges and group capture/posting.
- Delete old products/listings by source capture age.
- Remove orphaned groups not connected to any bridge or shop mapping.
- Reset orders, listings, billing, or shop/group development data.

Cleanup must respect dependencies and RBAC. Prefer archive/restore. Reset and hard-delete controls are destructive and intended for development or deliberate data retention operations.

The maintenance service removes expired products, baskets, and media according to configured retention. Customers are notified that baskets reset on a new shopping cycle.

## 24. PM2 Operations

PM2 configuration:

```text
backend/ecosystem.config.cjs
```

Managed processes:

```text
runner-commerce-frontend
runner-commerce-api
runner-commerce-whatsapp-monitor
```

The bridge PM2 entry is experimental and should not replace interactive bridge scripts on this Windows machine.

Commands:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm run pm2:start:apps
npm run pm2:status
npm run pm2:logs
npm run pm2:save
npm run pm2:stop:apps
```

PM2 runtime data is stored in:

```text
C:\Dev\runnercommercequen35plus\.pm2
```

Application logs are stored under `backend/logs`.

## 25. Backup And Recovery

Run the backup helper:

```powershell
cd C:\Dev\runnercommercequen35plus
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\backup-runner-commerce.ps1
```

It backs up PostgreSQL and `backend/uploads`.

Include WhatsApp sessions only to secure encrypted storage:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\backup-runner-commerce.ps1 -IncludeWhatsAppSession
```

Session folders can grant access to linked WhatsApp accounts. Treat them like credentials.

Recovery order:

1. Restore PostgreSQL.
2. Restore uploads.
3. Restore session folders only when trusted and needed.
4. Start Docker.
5. Start API/frontend/monitor.
6. Start each bridge once.
7. Confirm bridge phone verification and group availability.

## 26. Public Access And Hosting

The frontend can be hosted on Vercel while the current laptop backend is exposed through Cloudflare Tunnel.

Helper:

```text
ops/start-backend-cloudflare-tunnel.ps1
```

Requirements:

- Set Vercel `NEXT_PUBLIC_API_URL` to the HTTPS tunnel/backend URL.
- Add the public frontend origin to backend `FRONTEND_URLS`.
- Ensure `/uploads/**` is reachable through the same backend URL.
- Keep the laptop, internet, API, database, and tunnel running.

Long-term recommended hosting:

- Cloud frontend and API.
- Managed PostgreSQL and Redis.
- Object storage for uploads.
- Local/VPS interactive bridge workers with isolated sessions.

## 27. Privacy And Security

- Runner customer communication and customer payments remain controlled by the runner.
- Phase 1 does not require Runner Commerce to take customer payments.
- Use dedicated bridge numbers where practical.
- Do not share session folders or QR authentication data.
- Verify expected bridge phone numbers before enabling work.
- Use strong production database/JWT secrets.
- Change the development Docker password before exposing services publicly.
- Restrict backend CORS to known frontend origins.
- Back up and protect customer phone numbers, payment proofs, and order images.
- Record admin actions and important bridge/group changes in audit logs.

## 28. Troubleshooting

### App Does Not Load

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm run pm2:status
docker compose ps
```

Check ports:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,3001
```

### Chunk 404 Or `ChunkLoadError`

The browser has stale Next.js assets after a rebuild. Hard refresh, close duplicate frontend processes, and restart the PM2 frontend.

### `EADDRINUSE`

Another process owns the port. Stop the wrong process; do not start a second frontend/API on the same port.

### Invalid Credentials

Confirm identifier, password, backend health, user status, password-reset requirement, and assigned role. Never edit password hashes directly.

Self-service recovery:

1. Open `Login -> Forgot password?`.
2. Enter the account phone, email, or exact account name.
3. The system always returns the same privacy-safe response.
4. If an active account matches, Bridge 1 sends a six-digit PIN to its registered WhatsApp number.
5. Enter the PIN and a new password of at least eight characters.
6. The PIN expires after 15 minutes, allows at most five failed attempts, and is consumed after success.

If Bridge 1 is unavailable or the registered number cannot receive the PIN, an admin can use `Admin -> Users -> Reset Password`. That route creates a temporary password, queues it through Bridge 1, and forces replacement under Account Security after login.

### Bridge Opens And Closes

Check Node 22, Chrome path, internet/DNS, auth folder, duplicate workers, and expected phone mismatch. Inspect the task bridge log.

### WhatsApp Web Does Not Fully Load

Stop the bridge from its lock file or with `stop-hybrid-local.ps1 -StopBridges`, close stale WhatsApp Web tabs, wait briefly, then restart the correct bridge script.

### `Runtime.callFunctionOn timed out`

The WhatsApp page or browser context stalled. The bridge retries, but repeated failures require a clean bridge restart. Do not advance capture checkpoints past the failed message.

### Zero Available Groups

Confirm the correct bridge session is online and verified, then sync groups. Stale groups from another bridge must not count as available.

### No New Listings

Check:

- Bridge mode permits capture.
- Source mapping is active.
- Capture is enabled at bridge and group level.
- Checkpoint is moving.
- Media requirement is satisfied.
- Auto-list is enabled.
- Runner-shop assignment is approved.

### Posting Backlog Does Not Clear

Check:

- Bridge mode permits posting.
- Destination belongs to the bridge.
- Runner has selected no more than two active groups.
- Listing is active and approved.
- Per-run limits and retry delays.
- Existing repost log for that runner/listing/group.

### Images Do Not Load

Confirm `NEXT_PUBLIC_API_URL`, backend `/uploads` availability, CORS origins, and public tunnel URL. Product media must not use an unconfigured local hostname from a public frontend.

### `429 Too Many Requests`

Use bulk endpoints such as `Apply Settings to All Approved Shops`. Avoid firing one request per shop concurrently.

### Prisma `EPERM`

Stop processes using Prisma, regenerate, then restart. Bridge sessions may remain linked; stopping the worker does not delete the auth folder.

## 29. Daily Operating Checklist

### Admin/Operator

1. Confirm Docker PostgreSQL and Redis are healthy.
2. Confirm PM2 frontend, API, and monitor are online.
3. Confirm each bridge heartbeat, mode, and verified number.
4. Check bridge logs for timeout/retry loops.
5. Confirm capture checkpoints moved for active source groups.
6. Check failed imports, repost retries, and backlog.
7. Sync newly joined groups and classify them.
8. Review stale/wrong-bridge groups.
9. Review subscriptions, invoices, credits, and billing events.
10. Confirm backups and retention cleanup.

### Runner

1. Confirm default advertising groups.
2. Review dashboard metrics by shop/source group.
3. Check not-posted and failed listings.
4. Verify submitted customer payments.
5. Use the shop-by-shop shopping list.
6. Progress buying, packing, and handover statuses.
7. Review billing and verified-order fees.

## 30. Known Limitations

- WhatsApp Web group automation is unofficial and can break when WhatsApp changes its web client.
- A bridge number can only access groups it has joined.
- Bridge 2 cannot capture groups joined only by Bridge 1.
- High-volume groups may need lower capture/post limits.
- Official WhatsApp APIs do not provide the same joined-group scraping workflow.
- Group creator metadata is not always exposed.
- Participant counts and avatars may occasionally be unavailable.
- AI/web enrichment is suspended.
- External Google Lens-style search is not implemented.
- The Expo mobile app is not the primary production client.
- Payment processing remains manual; Runner Commerce verifies records but does not currently hold customer funds.

## 31. Command Reference

### Hybrid Hosting

```powershell
cd C:\Dev\runnercommercequen35plus
.\ops\start-hybrid-local.ps1
.\ops\stop-hybrid-local.ps1
```

### Docker

```powershell
docker compose up -d postgres redis
docker compose ps
docker compose logs postgres redis
docker compose stop postgres redis
```

### Backend

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm run start:dev:watch
npm run build
npm test -- --runInBand
npx prisma format
npx prisma db push
npx prisma generate
```

### Frontend

```powershell
cd C:\Dev\runnercommercequen35plus\frontend
npm run dev
npm run build
```

### WhatsApp

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm run whatsapp:session:bridge
npm run whatsapp:session:list-groups
npm run whatsapp:session:sync-groups
npm run whatsapp:session:analyze
npm run whatsapp:session:backfill -- --since-last-capture --limit=500
```

## 32. Change Management

For every operational release:

1. Back up data when the change affects schema or retention.
2. Update this manual.
3. Apply Prisma changes.
4. Build backend and frontend.
5. Run focused tests.
6. Restart only affected PM2 processes.
7. Confirm `/health/features`, `/billing/plans`, frontend HTTP 200, and bridge heartbeats.
8. Test one capture and one repost without flooding groups.
9. For Phase 2 changes, test basket, checkout, payment verification, shopping list, and completion with test records.

Keep bridge changes small, observable, and reversible.
