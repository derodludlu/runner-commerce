# Runner Commerce Phase 1 Operational Manual

Last updated: 2026-07-10

## 1. Purpose

This manual is the day-to-day operating guide for the Runner Commerce Phase 1 pilot.

Phase 1 is a controlled runner pilot for:

- Runner onboarding.
- Free trial or subscription setup.
- Shop group discovery and runner shop selection.
- Runner-submitted missing shop links.
- Runner reposting group setup.
- Reposting into runner posting groups for the two-week trial, currently up to 30 shops.
- Bot-controlled reposting commands.
- Admin verification before reposting starts.

Phase 1 is not a full order-management rollout. Avoid wording that suggests Runner Commerce is currently taking over the full customer order lifecycle for pilot runners.

## 2. Correct Phase 1 Wording

Use this wording when confirming the runner WhatsApp number:

```text
We will use this WhatsApp number for your Runner Commerce communication, setup updates, reposting controls, and support messages:

+268 76XXXXXX

Is this correct?

1. Yes
2. No, I want to use another number
```

Do not say:

```text
We will use this WhatsApp number for your runner orders.
```

## 3. Operating Principles

- Keep the pilot small and supervised.
- Reposting must not start from link submission alone.
- A runner must always see what is selected, what is missing, and what to do next.
- Admin verification is required before any group is considered ready.
- Posting group capacity follows the runner subscription plan.
- Posting stays paused until the runner intentionally starts or resumes reposting.
- Raw WhatsApp group IDs should not be shown in normal runner UI.

## 4. Key Limits

### Shop Selection

During Phase 1 trial setup, a runner may select:

```text
5 shop groups
```

The system enforces this as the Phase 1 shop selection cap.

### Reposting Groups

Reposting groups are WhatsApp posting destinations that runners submit for bot-controlled product reposting.

| Group type | Purpose | Limit |
| --- | --- | --- |
| Posting group | Runner advertising or customer-facing posting destination | According to the active trial offer/subscription |

If no active runner subscription is found, the current system fallback is:

```text
1 posting group
```

Active subscription plan features are used to infer posting group capacity, for example:

- `1 runner advertising group`
- `Up to 2 runner advertising groups`

## 5. Core URLs

Local app:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:3001
Health:   http://localhost:3001/health/features
```

Key UI areas:

```text
Runner -> Phase 1 Setup
Admin -> Runners
Admin -> WhatsApp Groups
Admin -> WhatsApp Bridges
Admin -> Billing
```

## 6. Services And Health Checks

Check PM2:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm run pm2:status
```

Expected core processes:

```text
runner-commerce-api
runner-commerce-frontend
runner-commerce-whatsapp-monitor
```

Check feature flags:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3001/health/features
```

Expected Phase 1 state:

```json
{
  "phase1Enabled": true
}
```

Start API/frontend/monitor:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm run pm2:start:apps
npm run pm2:save
```

Restart only API:

```powershell
npm run pm2:start:api
```

Restart only frontend:

```powershell
npm run pm2:start:frontend
```

## 7. Phase 1 Data Records

Important backend records:

- `Runner`
- `RunnerShopLink`
- `RunnerRepostingGroup`
- `RunnerSubmittedShopLink`
- `BotSession`
- `WhatsAppBridgeAccount`
- `WhatsAppDiscoveredGroup`
- `WhatsAppGroupMapping`
- `WhatsAppOutboundMessage`
- `Subscription`
- `BillingPlan`

Important runner statuses:

```text
PENDING
APPROVED
ACTIVE
SUSPENDED
REJECTED
```

Trial statuses:

```text
TRIAL_PENDING_SETUP
TRIAL_ACTIVE
TRIAL_EXPIRED
SUBSCRIPTION_REQUIRED
```

Subscription statuses:

```text
PENDING_SUBSCRIPTION
PROOF_SUBMITTED
SUBSCRIPTION_UNDER_REVIEW
ACTIVE_SUBSCRIPTION
EXPIRED_SUBSCRIPTION
SUSPENDED_SUBSCRIPTION
```

Reposting statuses:

```text
NOT_STARTED
SCHEDULED
ACTIVE
PAUSED
STOPPED
EXPIRED
```

Group readiness statuses:

```text
GROUP_LINK_RECEIVED
JOIN_ATTEMPT_STARTED
JOINED_GROUP
JOIN_FAILED
ADMIN_STATUS_PENDING
RUNNER_CONFIRMED_ADMIN
ADMIN_VERIFIED
BOT_NOT_ADMIN
READY_FOR_REPOSTING
REMOVED_FROM_GROUP
```

Submitted shop link statuses:

```text
PENDING_REVIEW
APPROVED
REJECTED
ACTIVE
INACTIVE
DUPLICATE
NEEDS_MORE_INFO
```

## 8. Runner Onboarding Procedure

### Step 1: Runner Starts Chat

Runner may send:

```text
Hi
I want to join Runner Commerce
```

The bot should respond with the Phase 1 welcome and options.

If the runner already has an account, they can use commands such as:

```text
STATUS
SHOPS
GROUPS
HELP
```

### Step 2: Register Runner

Runner registration creates or uses the existing runner profile.

Initial expected state:

```text
Runner status: PENDING
Trial status: TRIAL_PENDING_SETUP
Subscription status: PENDING_SUBSCRIPTION
Reposting status: NOT_STARTED
```

### Step 3: Admin Approves And Activates Trial

Admin path:

```text
Admin -> Runners
```

Actions:

1. Confirm runner identity and WhatsApp number.
2. Assign bridge account if needed.
3. Click `Trial` to activate Phase 1 trial.
4. Confirm runner state changed to:

```text
Runner status: ACTIVE
Trial status: TRIAL_ACTIVE
Trial ends: now + 14 days unless admin changed it
```

## 9. Shop Discovery And Selection

Runner path:

```text
Runner -> Phase 1 Setup -> Shop Groups
```

Runner can search by:

- Shop name.
- Location.
- Category.
- Text such as `Durban`, `shoes`, or `cosmetics`.

The runner may select up to 5 Phase 1 shop groups for the initial setup.

The 2-week reposting trial may include up to 30 shops after admin approval.

Operational rule:

```text
Only active shops with active WhatsApp source group mappings should appear.
```

If more than 5 are selected, the system rejects the change.

Admin checks:

```text
Admin -> WhatsApp Groups
Admin -> Runners
```

A shop should normally have one primary active source group. Related same-shop groups should not be used as capture sources unless deliberately configured.

## 10. Runner-Submitted Shop Links

Runner path:

```text
Runner -> Phase 1 Setup -> Submit Missing Shop Links
```

Runner sends WhatsApp group invite links, one per line:

```text
https://chat.whatsapp.com/xxxxxxxx
https://chat.whatsapp.com/yyyyyyyy
```

System stores them as:

```text
PENDING_REVIEW
```

Admin review procedure:

1. Open the runner in `Admin -> Runners`.
2. Review submitted links.
3. Check if the link is already known.
4. Classify result:
   - `APPROVED`
   - `REJECTED`
   - `DUPLICATE`
   - `NEEDS_MORE_INFO`
5. If approved, add/import/link the actual shop destination through `Admin -> WhatsApp Groups`.

Important:

```text
Runner-submitted shop links do not automatically become available shop sources.
```

## 11. Reposting Group Setup

Runner path:

```text
Runner -> Phase 1 Setup -> Reposting Groups
```

Runner submits:

- Group name.
- Invite link.
- Posting group details.

Recommended setup:

```text
1 or more posting groups depending on subscription
```

The posting group should be clearly named:

```text
Mbabane Deals
```

## 12. Bot Group Access Requirements

Reposting must not start unless all of these are true:

1. Runner is approved/active.
2. Trial or subscription is active.
3. At least one shop is selected and approved.
4. At least one reposting group exists.
5. At least one reposting group is `READY_FOR_REPOSTING`.
6. Bot joined the group.
7. Bot has admin status.
8. Bridge/system verified the bot can post in the group, or an operator manually verified it as fallback.

Group link submission creates:

```text
GROUP_LINK_RECEIVED
```

This is not ready for reposting.

## 13. Reposting Group Readiness

Default path:

```text
Runner sends GROUPS, then submits one WhatsApp posting group invite link
```

The first setup step should be one posting group:

```text
Mbabane Deals https://chat.whatsapp.com/...
```

The runner submits the group where Runner Commerce should repost products after setup is ready.

When the runner needs another posting group, they submit each group separately:

```text
Mbabane Deals 2 https://chat.whatsapp.com/...
```

If the runner has more than one posting group, the bot must join every group and have posting/admin access in every group before reposting starts there.

For each runner reposting group, the bridge should:

1. Queue bot joining automatically.
2. Join the group from the submitted invite link.
3. Mark the group ready once posting access is trusted.

Manual admin fallback:

```text
Admin -> Runners
```

Use `Mark ready` or `ADMIN VERIFY` only when automatic verification is stuck and group access has been checked.

Marking ready sets:

```text
status: READY_FOR_REPOSTING
botJoinStatus: JOINED_GROUP
botAdminStatus: ADMIN_VERIFIED
adminVerifiedAt: current time
```

Do not mark a group ready if the bot cannot post media or text.

## 14. START Command

Runner sends:

```text
START
```

If setup is complete:

```text
Reposting status: ACTIVE
autoPostEnabled: true
```

If setup is incomplete, bot/API returns blockers such as:

- Runner must be approved/active.
- Phase 1 trial or subscription must be active.
- Select at least one approved shop group.
- Connect at least one reposting group.
- At least one reposting group must be `READY_FOR_REPOSTING`.
- Bot must join the reposting group.
- Bot posting/admin access must be verified automatically, or manually by an operator if automation is stuck.
- Admin/system must verify group readiness.

Operator response:

1. Read the blockers.
2. Fix the missing setup item.
3. Ask the runner to send `STATUS`.
4. Ask the runner to send `START` only after blockers are cleared.

## 15. PAUSE, RESUME, STOP

### PAUSE

Runner sends:

```text
PAUSE
```

System sets:

```text
repostingStatus: PAUSED
autoPostEnabled: false
```

Use when the runner wants to temporarily stop reposting but keep settings.

### RESUME

Runner sends:

```text
RESUME
```

System checks readiness again. If ready:

```text
repostingStatus: ACTIVE
autoPostEnabled: true
```

If not ready, the bot returns blockers.

### STOP

Runner sends:

```text
STOP
```

System sets:

```text
repostingStatus: STOPPED
autoPostEnabled: false
```

Use when reposting is ended more permanently than pause.

## 16. STATUS, GROUPS, SHOPS, HELP

### STATUS

Shows:

- Access label.
- Trial end date where present.
- Reposting status.
- Selected shops count.
- Posting group count.
- Setup readiness.
- Missing blockers.

### GROUPS

Shows runner reposting groups with status.

### SHOPS

Shows selected shop groups.

### HELP

Shows supported commands:

```text
START
PAUSE
RESUME
STOP
STATUS
GROUPS
SHOPS
SET MARKUP
BACKLOG
SUPPORT
```

## 17. Bot Message Handling

Private WhatsApp messages are routed by the bridge into:

```text
POST /phase1-bot/webhook/messages
```

The webhook:

1. Identifies the sender WhatsApp number.
2. Looks for a matching user/runner.
3. Parses exact commands and simple natural-language aliases.
4. Updates or creates a `BotSession`.
5. Queues a reply through `WhatsAppOutboundMessage`.

Messages with order codes should remain in the order-intake path when order tracking is active.

## 18. Supported Natural Language Aliases

Examples:

```text
Start reposting
Pause my reposts
Resume reposting
Stop all reposting
Show my groups
Show my shops
Repost products from yesterday
Start from last week
```

These map to the nearest supported command.

## 19. Subscription-Based Posting Group Capacity

Posting groups are governed by active runner subscription plan features.

Current plan feature examples:

```text
1 runner advertising group
Up to 2 runner advertising groups
```

Operational rule:

```text
Do not treat “2 groups” as a global hard cap.
```

The Phase 1 posting group allowance comes from the active trial offer/subscription.

Posting group count should be reviewed when:

- A subscription is activated.
- A subscription expires.
- A runner upgrades or downgrades.
- A runner asks to add another posting group.

## 20. Admin Daily Checklist

1. Open `Admin -> Runners`.
2. Review new pending runners.
3. Confirm WhatsApp numbers.
4. Activate trials for approved pilot runners.
5. Check selected shop count.
6. Check posting group counts.
7. Verify submitted group links.
8. Confirm bot joined and bot admin status.
9. Mark only verified groups as ready.
10. Review submitted shop links.
11. Review bridge health.
12. Check failed reposts and backlog.
13. Confirm runners understand `START`, `PAUSE`, `RESUME`, `STOP`, and `STATUS`.

## 21. Runner Support Checklist

When a runner asks for help:

1. Ask them to send `STATUS`.
2. Read the readiness blockers.
3. Check if their trial/subscription is active.
4. Check selected shops.
5. Check reposting groups.
6. Confirm at least one posting group exists.
7. Confirm posting group allowance from subscription.
8. Confirm bot joined the group.
9. Confirm automatic group readiness, or use manual verification only if the bridge is stuck.
10. Ask runner to send `START` again.

## 22. Incident Handling

### Runner Cannot Start Reposting

Likely causes:

- Trial not active.
- No approved shops.
- No reposting group.
- Group not ready.
- Bot not admin.
- Admin verification missing.

Action:

```text
Use STATUS blockers as the source of truth.
```

### Runner Added Group But It Is Not Posting

Check:

- Does posting group count exceed subscription?
- Is status `READY_FOR_REPOSTING`?
- Did runner confirm admin?
- Did admin verify?
- Is bridge online?
- Can the bridge see the group?
- Can the bot send media to the group?

### Runner Wants More Posting Groups

Check active subscription.

If plan allows more, add/verify the group.

If plan does not allow more, explain upgrade requirement.

### Runner Wants Another Posting Group

Posting group capacity follows the active trial offer/subscription.

Recommended response:

```text
You can add another posting group if your active plan allows it. Send GROUPS with the WhatsApp invite link, and support can help if the group does not become ready.
```

### Bot Replies Are Not Arriving

Check:

- Bridge account online.
- `WhatsAppOutboundMessage` queue.
- Bridge outbound watcher running.
- Recipient phone format.
- Ingest secret.
- PM2 API status.
- Bridge logs.

### Prisma EPERM During Generate

Stop API/bridge workers that hold Prisma client DLL, then regenerate:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npx prisma generate
```

Restart affected services after generation.

## 23. Release And Verification Procedure

For Phase 1 changes:

1. Run focused backend tests.
2. Build backend.
3. Build frontend.
4. Apply Prisma schema changes if needed.
5. Generate Prisma client.
6. Restart API.
7. Restart frontend if UI changed.
8. Save PM2.
9. Check PM2 status.
10. Check `/health/features`.

Commands:

```powershell
cd C:\Dev\runnercommercequen35plus\backend
npm test -- phase1.service.spec.ts --runInBand
npm run build

cd C:\Dev\runnercommercequen35plus\frontend
npm run build

cd C:\Dev\runnercommercequen35plus\backend
npm run pm2:start:api
npm run pm2:start:frontend
npm run pm2:save
npm run pm2:status
```

## 24. Current Implementation Notes

Implemented Phase 1 endpoints include:

```text
GET    /runner/phase1/status
GET    /runner/phase1/shops
POST   /runner/phase1/shops
DELETE /runner/phase1/shops/:shopId
POST   /runner/phase1/submitted-shop-links
POST   /runner/phase1/reposting-groups
PATCH  /runner/phase1/reposting-groups/:groupId/admin-confirmed
POST   /runner/phase1/commands
POST   /phase1-bot/webhook/messages
GET    /admin/phase1/runners
PATCH  /admin/phase1/runners/:runnerId/access
PATCH  /admin/phase1/reposting-groups/:groupId/verify
PATCH  /admin/phase1/submitted-shop-links/:linkId/review
```

Frontend API wrappers are in:

```text
frontend/lib/api.ts
```

Runner UI:

```text
frontend/app/runner/phase1/page.tsx
```

Admin runner UI:

```text
frontend/app/admin/runners/page.tsx
```

Bridge bot routing:

```text
backend/scripts/whatsapp-session-bridge.js
```

Focused tests:

```text
backend/src/modules/phase1/phase1.service.spec.ts
```

## 25. Operator Scripts

Start local hybrid stack:

```powershell
cd C:\Dev\runnercommercequen35plus
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\start-hybrid-local.ps1
```

Stop local hybrid stack:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\stop-hybrid-local.ps1
```

Start bridge 1:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\start-whatsapp-bridge-001.ps1
```

Start bridge 2:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\start-whatsapp-bridge-002.ps1
```

Watch bridges:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\watch-whatsapp-bridges.ps1
```

Back up system:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\ops\backup-runner-commerce.ps1
```

## 26. What Operators Must Not Do

- Do not mark a group ready just because an invite link was submitted.
- Do not expose raw WhatsApp group IDs to ordinary runner screens.
- Do not promise full order management as part of Phase 1.
- Do not bypass subscription limits for posting groups without admin/business approval.
- Do not start posting until the group is verified ready and the runner intentionally starts or resumes reposting.
- Do not run multiple bridge workers against the same WhatsApp session folder.
- Do not delete WhatsApp session folders unless deliberately unlinking/rebuilding a bridge.
- Do not use `docker compose down -v` unless permanent database volume deletion is intended.

## 27. Quick Reference

Runner is ready to repost when:

```text
Runner active
Trial/subscription active
At least one approved selected shop
At least one READY_FOR_REPOSTING group
Bot joined group
Bot posting/admin access verified
Admin/system verified group, with manual operator verification only as fallback
```

Posting group limit:

```text
According to active runner subscription
```

Fallback when no active subscription:

```text
1 posting group
```

Most useful support command:

```text
STATUS
```
