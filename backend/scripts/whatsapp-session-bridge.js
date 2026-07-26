require('dotenv/config');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);

const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
const ingestSecret = process.env.WHATSAPP_INGEST_SECRET;
const sessionName =
  process.env.WHATSAPP_SESSION_NAME || 'runner-commerce-session-bridge';
const sessionAuthPath = path.resolve(
  process.env.WHATSAPP_SESSION_AUTH_PATH ||
    path.join(__dirname, '..', '.wwebjs_auth'),
);
const bridgeAccountId = String(
  process.env.WHATSAPP_BRIDGE_ACCOUNT_ID || '',
).trim();
const bridgeWorkerKey = String(
  process.env.WHATSAPP_BRIDGE_WORKER_KEY || '',
).trim();
const bridgeTaskLogName =
  process.env.WHATSAPP_BRIDGE_TASK_LOG ||
  (bridgeWorkerKey === 'bridge-002'
    ? 'task-whatsapp-bridge-002.log'
    : 'task-whatsapp-bridge-001.log');
const bridgeTaskLogPath = path.join(__dirname, '..', 'logs', bridgeTaskLogName);
const bridgeRole = String(
  process.env.WHATSAPP_BRIDGE_ROLE ||
    (bridgeWorkerKey === 'bridge-001'
      ? 'RUNNER_COMMUNICATION'
      : bridgeWorkerKey === 'bridge-002'
        ? 'ORDER_MANAGEMENT'
        : 'COMBINED'),
)
  .trim()
  .toUpperCase();
const groupShopMap = parseJsonMap(process.env.WHATSAPP_SESSION_GROUP_SHOP_MAP);
let persistedGroupMappingsCache = null;
let persistedGroupMappingsFetchedAt = 0;
let bridgeRestartRequested = false;
const headless = process.env.WHATSAPP_SESSION_HEADLESS === 'true';
const executablePath =
  process.env.WHATSAPP_SESSION_BROWSER_PATH || findInstalledBrowser();
const reuseBrowser =
  args.has('--reuse-browser') ||
  process.env.WHATSAPP_SESSION_REUSE_BROWSER === 'true';
const browserDebugUrl =
  process.env.WHATSAPP_SESSION_BROWSER_URL || 'http://127.0.0.1:9222';
const orderIntakePhone =
  process.env.WHATSAPP_ORDER_INTAKE_PHONE ||
  process.env.WHATSAPP_SYSTEM_ORDER_PHONE ||
  '';
const orderInboxGroups = parseConfiguredGroupList(
  process.env.WHATSAPP_ORDER_INBOX_GROUPS ||
    process.env.WHATSAPP_ORDER_INBOX_GROUP ||
    '',
);
const webVersion = process.env.WHATSAPP_SESSION_WEB_VERSION || undefined;
const webVersionCacheType =
  process.env.WHATSAPP_SESSION_WEB_VERSION_CACHE || 'local';
const protocolTimeout = Number(
  process.env.WHATSAPP_SESSION_PROTOCOL_TIMEOUT_MS || 180000,
);
const authTimeoutMs = Number(
  process.env.WHATSAPP_SESSION_AUTH_TIMEOUT_MS || 180000,
);
const configuredQrMaxRetries = Number(
  process.env.WHATSAPP_SESSION_QR_MAX_RETRIES || 180,
);
const qrMaxRetries =
  Number.isFinite(configuredQrMaxRetries) && configuredQrMaxRetries >= 0
    ? configuredQrMaxRetries
    : 180;
const mediaPairingWindowMs =
  Number(process.env.WHATSAPP_SESSION_MEDIA_PAIRING_MINUTES || 10) * 60 * 1000;
const mediaClusterGapMs =
  Number(process.env.WHATSAPP_SESSION_MEDIA_CLUSTER_GAP_SECONDS || 90) * 1000;
const maxBufferedMedia = Number(
  process.env.WHATSAPP_SESSION_MAX_BUFFERED_MEDIA || 8,
);
const repostOutboxRoot = path.resolve(
  process.env.WHATSAPP_REPOST_OUTBOX_DIR || './whatsapp-outbox',
);
const captureOutboxRoot = path.resolve(
  process.env.WHATSAPP_CAPTURE_OUTBOX_DIR || './whatsapp-capture-outbox',
);
const repostPollMs = Number(process.env.WHATSAPP_REPOST_POLL_MS || 5000);
const capturePollMs = Number(process.env.WHATSAPP_CAPTURE_POLL_MS || 5000);
const outboundMessagePollMs = Number(
  process.env.WHATSAPP_OUTBOUND_MESSAGE_POLL_MS || 10000,
);
const repostImagesPerListing = argNumber(
  'images-per-listing',
  Number(process.env.WHATSAPP_REPOST_IMAGES_PER_LISTING || 0),
);
const autoCaptureIntervalMs =
  Number(process.env.WHATSAPP_AUTO_CAPTURE_INTERVAL_MINUTES || 30) * 60 * 1000;
const autoPipelineIntervalMs =
  Number(process.env.WHATSAPP_AUTO_PIPELINE_INTERVAL_MINUTES || 10) * 60 * 1000;
const autoRepostIntervalMs =
  Math.max(
    Number(process.env.WHATSAPP_AUTO_REPOST_INTERVAL_MINUTES || 30),
    30,
  ) *
  60 *
  1000;
const groupDiscoveryIntervalMs =
  Number(process.env.WHATSAPP_GROUP_DISCOVERY_INTERVAL_MINUTES || 30) *
  60 *
  1000;
const autoPipelineMaxImports = Number(
  process.env.WHATSAPP_AUTO_PIPELINE_MAX_IMPORTS || 100,
);
const autoRepostMaxListings = Number(
  process.env.WHATSAPP_AUTO_REPOST_MAX_LISTINGS_PER_RUN || 10,
);
const whatsappRepostingEnabledKey = 'whatsappRepostingEnabled';
let whatsappRepostingEnabledCache = null;
let whatsappRepostingEnabledFetchedAt = 0;
const repostListingTimeoutMs = Number(
  process.env.WHATSAPP_REPOST_LISTING_TIMEOUT_MS || 150000,
);
const repostMaxRetryCount = Number(
  process.env.WHATSAPP_REPOST_MAX_RETRY_COUNT || 3,
);
const shopCaptureEnabled =
  process.env.WHATSAPP_SHOP_CAPTURE_ENABLED !== 'false';
const autoPipelineEnabled =
  process.env.WHATSAPP_AUTO_PIPELINE_ENABLED !== 'false';
const orderTrackingEnabled =
  bridgeRole === 'ORDER_MANAGEMENT' ||
  (process.env.WHATSAPP_ORDER_TRACKING_ENABLED !== 'false' &&
    bridgeRole !== 'RUNNER_COMMUNICATION');
const phase1BotEnabled =
  process.env.WHATSAPP_PHASE1_BOT_ENABLED !== 'false' &&
  bridgeRole !== 'ORDER_MANAGEMENT';
const shopOwnerRepostEnabled =
  process.env.WHATSAPP_SHOP_OWNER_REPOST_ENABLED !== 'false';
const showRunnerPriceOnRepost =
  process.env.WHATSAPP_REPOST_SHOW_RUNNER_PRICE !== 'false';
const analyzeLimit = Number(process.env.WHATSAPP_SESSION_ANALYZE_LIMIT || 80);
const backfillLimit = argNumber(
  'limit',
  Number(process.env.WHATSAPP_SESSION_BACKFILL_LIMIT || 300),
);
const maxBackfillProducts = argNumber(
  'max-products',
  Number(process.env.WHATSAPP_SESSION_BACKFILL_MAX_PRODUCTS || 0),
);
const pendingMediaByKey = new Map();
const pendingTextByKey = new Map();
const groupChatLookupWarningByGroupId = new Map();
const groupChatLookupWarningIntervalMs = Number(
  process.env.WHATSAPP_GROUP_CHAT_LOOKUP_WARNING_INTERVAL_MS || 10 * 60 * 1000,
);
const uploadRoot = path.resolve(process.env.UPLOAD_PATH || './uploads');
const groupProfileImageUploadDir = path.join(uploadRoot, 'whatsapp-groups');
const groupProfileImagePublicBase =
  process.env.WHATSAPP_GROUP_PROFILE_IMAGE_PUBLIC_BASE ||
  `${backendUrl.replace(/\/+$/, '')}/uploads/whatsapp-groups`;
const groupProfileImageSyncLimit = Number(
  process.env.WHATSAPP_GROUP_PROFILE_IMAGE_SYNC_LIMIT || 40,
);
const syncGroupProfileImagesDuringDiscovery =
  process.env.WHATSAPP_GROUP_PROFILE_IMAGE_SYNC_DURING_DISCOVERY === 'true';
const bridgeControlPollMs = Number(
  process.env.WHATSAPP_BRIDGE_CONTROL_POLL_MS || 2000,
);
const bridgeControlRequestTimeoutMs = Number(
  process.env.WHATSAPP_BRIDGE_CONTROL_REQUEST_TIMEOUT_MS || 180000,
);
const bridgeControlAttachTimeoutMs = Number(
  process.env.WHATSAPP_BRIDGE_CONTROL_ATTACH_TIMEOUT_MS || 15000,
);
let sessionLockFile = null;
let bridgeRuntimeConfigCache = null;
let bridgeRuntimeConfigFetchedAt = 0;
let heavyBridgeOperation = null;
let runnerBotProcessing = false;
const runnerBotQueue = [];
let autoRepostDue = false;

function writeBridgeTaskLog(message) {
  try {
    fs.mkdirSync(path.dirname(bridgeTaskLogPath), { recursive: true });
    const now = new Date();
    const stamp =
      [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-') +
      ' ' +
      [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join(':');
    fs.appendFileSync(bridgeTaskLogPath, `[${stamp}] ${message}\n`, 'utf8');
  } catch {
    // Health logging must never interrupt the WhatsApp bridge.
  }
}

function beginHeavyBridgeOperation(name) {
  if (heavyBridgeOperation) return false;
  heavyBridgeOperation = name;
  return true;
}

function endHeavyBridgeOperation(name) {
  if (heavyBridgeOperation === name) heavyBridgeOperation = null;
}

function bridgeCycleMinute(now = new Date()) {
  return now.getMinutes() % 30;
}

function isCaptureWindow(now = new Date()) {
  return bridgeCycleMinute(now) < 15;
}

function isRepostWindow(now = new Date()) {
  return !isCaptureWindow(now);
}

function msUntilNextCaptureWindow(now = new Date()) {
  const next = new Date(now);
  next.setSeconds(0, 0);
  const minute = now.getMinutes();
  const remainder = minute % 30;
  if (remainder < 15) return 0;
  next.setMinutes(minute + (30 - remainder));
  return Math.max(1000, next.getTime() - now.getTime());
}

function msUntilNextRepostWindow(now = new Date()) {
  const next = new Date(now);
  next.setSeconds(0, 0);
  const minute = now.getMinutes();
  const remainder = minute % 30;
  if (remainder >= 15) return 0;
  next.setMinutes(minute + (15 - remainder));
  return Math.max(1000, next.getTime() - now.getTime());
}

function currentBridgeWindow(now = new Date()) {
  return isCaptureWindow(now) ? 'capture' : 'repost';
}

async function waitForRunnerBotPriority(label) {
  if (runnerBotQueue.length === 0 && !runnerBotProcessing) return;
  writeBridgeTaskLog(
    `RunnerBot priority preempted ${label}; pending=${runnerBotQueue.length} processing=${runnerBotProcessing}.`,
  );
  while (runnerBotQueue.length > 0 || runnerBotProcessing) {
    await sleep(250);
  }
}

if (args.has('--help')) {
  console.log(`WhatsApp session bridge

Usage:
  npm run whatsapp:session:open-web
  npm run whatsapp:session:list-groups
  npm run whatsapp:session:list-channels
  npm run whatsapp:session:sync-groups
  npm run whatsapp:session:sync-channels
  npm run whatsapp:session:analyze
  npm run whatsapp:session:sync-shops -- --include=STYLE
  npm run whatsapp:session:sync-shops -- --group="DOREEN'S STYLE HUB🛍🛍" --apply --update-env
  npm run whatsapp:session:backfill -- --since-last-capture --limit=500
  npm run whatsapp:session:backfill -- --from=2026-06-01T08:00 --to=2026-06-01T18:00 --limit=1000
  npm run whatsapp:session:backfill -- --limit=500 --max-products=50
  npm run whatsapp:session:post-listings -- --group="Runner Group" --listing-ids=id1,id2
  npm run whatsapp:session:bridge

Environment:
  WHATSAPP_INGEST_SECRET              Required webhook secret
  BACKEND_URL                         Defaults to http://localhost:3001
  WHATSAPP_SESSION_GROUP_SHOP_MAP     JSON map of group id/name to shop id
  WHATSAPP_SESSION_NAME               Local session name
  WHATSAPP_BRIDGE_ACCOUNT_ID          Optional bridge account id; limits auto-posting to assigned runners
  WHATSAPP_BRIDGE_WORKER_KEY          Optional worker key used for bridge health assignment
  WHATSAPP_SESSION_HEADLESS           false to show Chromium window
  WHATSAPP_SESSION_REUSE_BROWSER      true to connect to an existing debug Chrome
  WHATSAPP_SESSION_BROWSER_URL        Debug Chrome URL, default http://127.0.0.1:9222
  WHATSAPP_SESSION_BACKFILL_LIMIT     WhatsApp messages to scan in backfill
  WHATSAPP_REPOST_IMAGES_PER_LISTING  0 posts all cleaned images
  WHATSAPP_AUTO_CAPTURE_INTERVAL_MINUTES    Defaults to 15
  WHATSAPP_AUTO_PIPELINE_INTERVAL_MINUTES   Defaults to 10
  WHATSAPP_AUTO_REPOST_INTERVAL_MINUTES     Defaults to 30

Reusable Chrome:
  powershell -NoProfile -Command "& 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' --remote-debugging-port=9222 --user-data-dir='$env:TEMP\\runner-commerce-whatsapp-chrome' https://web.whatsapp.com/"
  npm run whatsapp:session:bridge -- --reuse-browser
`);
  process.exit(0);
}

if (args.has('--validate-config')) {
  validateConfig({ requireGroupMap: false });
  console.log(`WhatsApp session bridge config OK on Node ${process.version}`);
  process.exit(0);
}

exitIfSessionOwnedByRunningBridge();

validateConfig({
  requireGroupMap: false,
});

const { Client, LocalAuth, MessageMedia, Buttons } = require('whatsapp-web.js');
const Message = require('whatsapp-web.js/src/structures/Message');
const qrcode = require('qrcode-terminal');

let client;
let bridgePupPage = null;

if (args.has('--open-web')) {
  openWhatsAppWebDiagnostic().catch((error) => {
    console.error(`WhatsApp Web diagnostic failed: ${errorMessage(error)}`);
    process.exit(1);
  });
  return;
}

try {
  acquireSessionLock();
} catch (error) {
  console.error(`WhatsApp session lock failed: ${errorMessage(error)}`);
  process.exit(2);
}
writeBridgeTaskLog(
  `Starting WhatsApp bridge worker ${bridgeWorkerKey || sessionName} for ${sessionName}`,
);

bootstrap().catch(async (error) => {
  writeBridgeTaskLog(
    `WhatsApp session failed to start: ${errorMessage(error)}`,
  );
  console.error(`WhatsApp session failed to start: ${errorMessage(error)}`);
  await cleanupClientBrowser();
  console.error(
    'Close any WhatsApp Web tabs for this account, wait a few seconds, and rerun the command. If this repeats, use Node.js 20 or 22 LTS instead of Node.js 24.',
  );
  releaseSessionLock();
  process.exit(1);
});

async function bootstrap() {
  const maxAttempts = Number(process.env.WHATSAPP_SESSION_START_ATTEMPTS || 3);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const puppeteerOptions = await buildPuppeteerOptions();
    client = createWhatsAppClient(puppeteerOptions);
    registerClientHandlers();

    try {
      await startClient();
      return;
    } catch (error) {
      if (isFatalWhatsAppSessionError(error) && attempt < maxAttempts) {
        console.warn(
          `WhatsApp Web reloaded during startup; retrying bridge initialization (${attempt + 1}/${maxAttempts})...`,
        );
        await cleanupClientBrowser();
        await sleep(5000);
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `WhatsApp session failed to start after ${maxAttempts} attempts`,
  );
}

function createWhatsAppClient(puppeteerOptions) {
  return new Client({
    authStrategy: new LocalAuth({
      clientId: sessionName,
      dataPath: sessionAuthPath,
    }),
    ...(webVersion ? { webVersion } : {}),
    webVersionCache: { type: webVersionCacheType },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 5000,
    authTimeoutMs,
    qrMaxRetries,
    userAgent:
      process.env.WHATSAPP_SESSION_USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    deviceName: 'Runner Commerce Bridge',
    browserName: 'Chrome',
    puppeteer: puppeteerOptions,
  });
}

function registerClientHandlers() {
  client.on('qr', (qr) => {
    writeBridgeTaskLog(
      `WhatsApp QR awaiting scan for ${sessionName}; retries allowed=${qrMaxRetries}`,
    );
    console.log(
      'Scan this QR code with the WhatsApp account allowed to read the target groups:',
    );
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    writeBridgeTaskLog(`WhatsApp session authenticated for ${sessionName}`);
    console.log('WhatsApp session authenticated');
  });

  client.on('ready', async () => {
    writeBridgeTaskLog(`WhatsApp session bridge ready as "${sessionName}"`);
    console.log(`WhatsApp session bridge ready as "${sessionName}"`);
    await updateBridgeAccountHeartbeat('ONLINE');
    startBridgeHeartbeatScheduler();
    startBridgeControlRequestWatcher();

    if (args.has('--list-groups')) {
      await listGroupsAndExit();
      return;
    }

    if (args.has('--list-channels')) {
      await listChannelsAndExit();
      return;
    }

    if (args.has('--sync-groups')) {
      await syncGroupsAndExit();
      return;
    }

    if (args.has('--sync-channels')) {
      await syncChannelsAndExit();
      return;
    }

    if (args.has('--analyze')) {
      await analyzeMappedGroupsAndExit();
      return;
    }

    if (args.has('--sync-shops')) {
      await syncShopsFromGroupsAndExit();
      return;
    }

    if (args.has('--backfill')) {
      await backfillMappedGroupsAndExit();
      return;
    }

    if (args.has('--post-runner-listings')) {
      await postRunnerListingsAndExit();
      return;
    }

    try {
      await syncDiscoveredGroupsWithBackend();
      await syncDiscoveredChannelsWithBackend();
    } catch (error) {
      console.error(
        `Initial WhatsApp discovery sync failed: ${errorMessage(error)}`,
      );
    }

    const initialCapabilities = await getBridgeCapabilities({
      forceRefresh: true,
    });

    if (shopCaptureEnabled && initialCapabilities.canCapture) {
      let mappedGroups = [];
      try {
        mappedGroups = await getMappedGroupEntries();
      } catch (error) {
        console.error(
          `Initial persisted group mapping fetch failed: ${errorMessage(error)}`,
        );
        mappedGroups = Object.entries(groupShopMap).map(
          ([groupIdOrName, shopId]) => ({
            groupIdOrName,
            groupId: groupIdOrName.endsWith('@g.us')
              ? groupIdOrName
              : undefined,
            sourceGroup: groupIdOrName.endsWith('@g.us')
              ? undefined
              : groupIdOrName,
            shopId,
          }),
        );
      }
      console.log(
        `Capturing ${mappedGroups.length} mapped group(s). Press Ctrl+C to stop.`,
      );
    } else {
      console.log('Shop group product capture is disabled for this bridge.');
    }
    console.log(
      `Watching runner repost outbox at ${repostOutboxRoot}. Captions attach to the last image; order codes are written onto every image.`,
    );
    if (orderTrackingEnabled) {
      console.log(
        'Incoming private WhatsApp order tracking active. Customer messages with RC order codes will be captured.',
      );
    } else {
      console.log('Incoming WhatsApp order tracking is disabled.');
    }
    if (phase1BotEnabled) {
      console.log('Incoming private Phase 1 runner bot messages are active.');
    } else {
      console.log('Incoming private Phase 1 runner bot messages are disabled.');
    }
    if (orderTrackingEnabled && orderInboxGroups.length > 0) {
      console.log(
        `Incoming WhatsApp order inbox group tracking active for ${orderInboxGroups.length} group(s).`,
      );
    }
    if (shopCaptureEnabled && initialCapabilities.canCapture) {
      console.log(`Watching manual capture outbox at ${captureOutboxRoot}.`);
    }
    startRepostOutboxWatcher();
    startOutboundMessageWatcher();
    if (shopCaptureEnabled) {
      startCaptureOutboxWatcher();
    }
    startGroupDiscoveryScheduler();
    if (shopCaptureEnabled) {
      startHourlyCaptureScheduler();
    }
    if (shopCaptureEnabled && !initialCapabilities.canCapture) {
      console.log(
        `Shop capture scheduler is running but currently paused by bridge mode/status: ${initialCapabilities.reason}`,
      );
    }
    if (autoPipelineEnabled) {
      startAutoPipelineScheduler();
    } else {
      console.log('Automatic import/listing pipeline is disabled.');
    }
    startAutoRepostScheduler();
    if (!initialCapabilities.canPost) {
      console.log(
        `Auto repost scheduler is running but currently paused by bridge mode/status: ${initialCapabilities.reason}`,
      );
    }
  });

  client.on('auth_failure', (message) => {
    writeBridgeTaskLog(`WhatsApp authentication failed: ${message}`);
    console.error(`WhatsApp authentication failed: ${message}`);
    requestBridgeRestart(`authentication failed: ${message}`);
  });

  client.on('disconnected', (reason) => {
    writeBridgeTaskLog(`WhatsApp session disconnected: ${reason}`);
    console.warn(`WhatsApp session disconnected: ${reason}`);
    updateBridgeAccountHeartbeat('OFFLINE').catch(() => undefined);
    requestBridgeRestart(`session disconnected: ${reason}`);
  });

  client.on('message', async (message) => {
    try {
      let chat = null;
      let chatLookupError = null;
      try {
        chat = await message.getChat();
      } catch (error) {
        chatLookupError = error;
      }

      const senderRef = String(
        message.from ||
          message.author ||
          message.to ||
          message.id?._serialized ||
          '',
      );
      const isGroupMessage =
        Boolean(chat?.isGroup) || /@g\.us\b/i.test(senderRef);

      if (chatLookupError && isGroupMessage) {
        const fallbackGroupId = groupIdFromIncomingMessage(message);
        if (!fallbackGroupId) {
          throw chatLookupError;
        }
        chat = directSourceGroupChat(fallbackGroupId, fallbackGroupId);
        warnGroupChatLookupFallback(fallbackGroupId, chatLookupError);
      } else if (chatLookupError) {
        console.warn(
          `Could not resolve private WhatsApp chat; continuing with direct message handlers: ${errorMessage(chatLookupError)}`,
        );
      }

      if (!isGroupMessage) {
        let directOrderResult = null;
        if (orderTrackingEnabled) {
          directOrderResult = await processDirectOrderMessage(message, chat);
        }
        if (directOrderResult?.customerReply) return;
        if (
          !message.fromMe &&
          phase1BotEnabled &&
          (hasPhase1BotText(message.body || '') || message.hasMedia)
        ) {
          await enqueuePhase1BotMessage(message, chat);
        }
        return;
      }

      if (!chat?.isGroup) return;

      const groupId = chat.id?._serialized || message.from;
      if (isOrderInboxGroup(chat, groupId)) {
        if (orderTrackingEnabled) {
          await processDirectOrderMessage(message, chat);
        }
        return;
      }

      if (!shopCaptureEnabled) return;
      const capabilities = await getBridgeCapabilities();
      if (!capabilities.canCapture) return;

      const shopId = await resolveShopIdForChat(chat, groupId);

      if (!shopId) return;

      const capture = await buildCaptureFromMessage(
        message,
        chat,
        groupId,
        shopId,
      );
      if (!capture) return;

      if (capture.buffered) {
        console.log(
          `Buffered media from ${chat.name || groupId}: ${capture.mediaCount} item(s) waiting for description`,
        );
        return;
      }

      const result = await queuePost(shopId, {
        caption: capture.caption,
        sourceGroup: chat.name || groupId,
        senderPhone: normalizeSender(message.author || message.from),
        messageId: capture.messageId,
        mediaUrls: capture.mediaUrls,
        receivedAt: message.timestamp
          ? new Date(Number(message.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
      });

      console.log(
        `Queued ${chat.name || groupId}: parsed=${result.parsed} needsReview=${result.needsReview} images=${capture.mediaCount}`,
      );

      await repostShopCaptureToDestinations({
        shopId,
        sourceGroupId: groupId,
        sourceGroupName: chat.name || groupId,
        capture,
      });
    } catch (error) {
      const isPrivate = !(message.from || '').endsWith('@g.us');
      console.error(
        `Failed to process WhatsApp message type=${isPrivate ? 'private' : 'group'} from=${maskPhone(message.from || message.author)} id=${message.id?._serialized || message.id?.id || 'unknown'}: ${diagnosticError(error)}`,
      );
    }
  });

  process.on('SIGINT', async () => {
    console.log('Stopping WhatsApp session bridge...');
    await client.destroy();
    releaseSessionLock();
    process.exit(0);
  });

  process.on('unhandledRejection', (error) => {
    console.error(`Unhandled WhatsApp bridge error: ${errorMessage(error)}`);
  });
}

function acquireSessionLock() {
  fs.mkdirSync(sessionAuthPath, { recursive: true });
  sessionLockFile = getSessionLockFile();

  try {
    const fd = fs.openSync(sessionLockFile, 'wx');
    fs.writeFileSync(
      fd,
      JSON.stringify(
        {
          pid: process.pid,
          sessionName,
          bridgeAccountId: bridgeAccountId || null,
          workerKey: bridgeWorkerKey || null,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    fs.closeSync(fd);
    process.once('exit', releaseSessionLock);
    return;
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
  }

  const existingLock = readExistingSessionLock();
  if (existingLock?.pid && isProcessRunning(existingLock.pid)) {
    throw new Error(
      `another bridge worker is already running for session "${sessionName}" with PID ${existingLock.pid}`,
    );
  }

  try {
    fs.unlinkSync(sessionLockFile);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  return acquireSessionLock();
}

function getSessionLockFile() {
  const safeSessionName = sessionName.replace(/[^a-zA-Z0-9_.-]/g, '-');
  return path.join(sessionAuthPath, `${safeSessionName}.bridge.lock`);
}

function readExistingSessionLock() {
  try {
    if (!sessionLockFile) sessionLockFile = getSessionLockFile();
    return JSON.parse(fs.readFileSync(sessionLockFile, 'utf8'));
  } catch {
    return null;
  }
}

function activeBridgeCommand() {
  if (args.has('--list-groups')) return 'list-groups';
  if (args.has('--sync-groups')) return 'sync-groups';
  if (args.has('--analyze')) return 'analyze';
  if (args.has('--list-channels')) return 'list-channels';
  if (args.has('--sync-channels')) return 'sync-channels';
  return null;
}

function exitIfSessionOwnedByRunningBridge() {
  const command = activeBridgeCommand();
  if (!command || args.has('--force-session-start')) {
    return;
  }

  sessionLockFile = getSessionLockFile();
  const activeLocks = findActiveSessionLocks();
  if (activeLocks.length === 0) {
    return;
  }

  const currentSessionLock =
    activeLocks.find((lock) => lock.sessionName === sessionName) ||
    activeLocks[0];
  try {
    submitBridgeControlRequestSync(command, currentSessionLock);
    process.exit(0);
  } catch (error) {
    console.error(
      `WhatsApp bridge control request failed: ${errorMessage(error)}`,
    );
    process.exit(2);
  }
}

function getBridgeControlDir() {
  const safeSessionName = sessionName.replace(/[^a-zA-Z0-9_.-]/g, '-');
  return path.join(sessionAuthPath, `${safeSessionName}.bridge-control`);
}

function getBridgeControlDirs() {
  const root = getBridgeControlDir();
  return {
    root,
    pending: path.join(root, 'pending'),
    processing: path.join(root, 'processing'),
    responses: path.join(root, 'responses'),
    state: path.join(root, 'state.json'),
  };
}

function ensureBridgeControlDirsSync() {
  const dirs = getBridgeControlDirs();
  for (const dir of [
    dirs.root,
    dirs.pending,
    dirs.processing,
    dirs.responses,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dirs;
}

async function ensureBridgeControlDirs() {
  const dirs = getBridgeControlDirs();
  await Promise.all(
    [dirs.root, dirs.pending, dirs.processing, dirs.responses].map((dir) =>
      fsp.mkdir(dir, { recursive: true }),
    ),
  );
  return dirs;
}

function submitBridgeControlRequestSync(command, activeLock) {
  const dirs = ensureBridgeControlDirsSync();
  waitForBridgeControlStateSync(dirs.state, activeLock);
  const requestId = `${Date.now()}-${process.pid}-${crypto
    .randomBytes(4)
    .toString('hex')}`;
  const request = {
    id: requestId,
    command,
    sessionName,
    requesterPid: process.pid,
    requestedAt: new Date().toISOString(),
    args: rawArgs,
  };
  const pendingPath = path.join(dirs.pending, `${requestId}.json`);
  const tempPath = `${pendingPath}.tmp`;
  const responsePath = path.join(dirs.responses, `${requestId}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(request, null, 2), 'utf8');
  fs.renameSync(tempPath, pendingPath);

  console.error(
    `Submitted ${command} to running WhatsApp bridge PID ${activeLock.pid}; waiting for response...`,
  );

  const startedAt = Date.now();
  while (Date.now() - startedAt < bridgeControlRequestTimeoutMs) {
    if (!isProcessRunning(activeLock.pid)) {
      throw new Error(
        `active bridge PID ${activeLock.pid} stopped before responding`,
      );
    }
    if (fs.existsSync(responsePath)) {
      const response = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
      try {
        fs.unlinkSync(responsePath);
      } catch {
        // The response can be left for log inspection if cleanup races.
      }
      if (!response.ok) {
        throw new Error(response.error || `${command} failed`);
      }
      console.log(JSON.stringify(response.result, null, 2));
      return;
    }
    sleepSync(1000);
  }

  throw new Error(
    `timed out after ${Math.round(
      bridgeControlRequestTimeoutMs / 1000,
    )}s waiting for bridge response`,
  );
}

function waitForBridgeControlStateSync(statePath, activeLock) {
  const startedAt = Date.now();
  let lastState = null;

  while (Date.now() - startedAt < bridgeControlAttachTimeoutMs) {
    lastState = readBridgeControlStateSync(statePath);
    if (
      lastState?.pid === activeLock.pid &&
      lastState?.ready === true &&
      Date.now() - Date.parse(lastState.updatedAt || '') < 30000
    ) {
      return;
    }
    sleepSync(1000);
  }

  const detail =
    lastState?.pid && lastState.pid !== activeLock.pid
      ? ` Last control heartbeat came from PID ${lastState.pid}.`
      : '';
  throw new Error(
    `running bridge PID ${activeLock.pid} is not accepting control requests yet.${detail} Restart the WhatsApp bridge so it loads the latest control watcher, then wait for it to authenticate. If it shows QR retries, relink WhatsApp Web first.`,
  );
}

function readBridgeControlStateSync(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function startBridgeControlRequestWatcher() {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await writeBridgeControlState();
      await processBridgeControlRequests();
    } catch (error) {
      console.error(
        `Bridge control request processing failed: ${errorMessage(error)}`,
      );
    } finally {
      running = false;
    }
  };

  tick();
  setInterval(tick, bridgeControlPollMs).unref?.();
}

async function writeBridgeControlState() {
  const dirs = await ensureBridgeControlDirs();
  await fsp.writeFile(
    dirs.state,
    JSON.stringify(
      {
        ready: true,
        pid: process.pid,
        sessionName,
        bridgeAccountId: bridgeAccountId || null,
        workerKey: bridgeWorkerKey || null,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
}

async function processBridgeControlRequests() {
  const dirs = await ensureBridgeControlDirs();
  const files = (await fsp.readdir(dirs.pending))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  for (const fileName of files) {
    const pendingPath = path.join(dirs.pending, fileName);
    const processingPath = path.join(dirs.processing, fileName);
    try {
      await fsp.rename(pendingPath, processingPath);
    } catch {
      continue;
    }

    const responsePath = path.join(dirs.responses, fileName);
    let request = null;
    try {
      request = JSON.parse(await fsp.readFile(processingPath, 'utf8'));
      const result = await runBridgeControlCommand(request.command);
      await fsp.writeFile(
        responsePath,
        JSON.stringify(
          {
            ok: true,
            requestId: request.id,
            command: request.command,
            processedByPid: process.pid,
            processedAt: new Date().toISOString(),
            result,
          },
          null,
          2,
        ),
        'utf8',
      );
    } catch (error) {
      await fsp.writeFile(
        responsePath,
        JSON.stringify(
          {
            ok: false,
            requestId: request?.id || path.basename(fileName, '.json'),
            command: request?.command || null,
            processedByPid: process.pid,
            processedAt: new Date().toISOString(),
            error: errorMessage(error),
          },
          null,
          2,
        ),
        'utf8',
      );
    } finally {
      await fsp.unlink(processingPath).catch(() => undefined);
    }
  }
}

async function runBridgeControlCommand(command) {
  if (command === 'list-groups') {
    return retry(
      () => listGroupsFromPageStore(),
      4,
      15000,
      'loading WhatsApp groups',
    );
  }

  if (command === 'sync-groups') {
    const payload = await syncDiscoveredGroupsWithBackend();
    return {
      mode: 'sync-groups',
      synced: payload.synced,
      skipped: payload.skipped,
      bridgeAccountId: payload.bridgeAccountId,
      syncedAt: payload.syncedAt,
      message:
        'Authenticated WhatsApp groups synced by the running bridge. Use Refresh Groups in the app to reload the stored list.',
    };
  }

  if (command === 'analyze') {
    return analyzeMappedGroups();
  }

  if (command === 'list-channels') {
    return retry(
      () => listChannelsFromClient(),
      4,
      15000,
      'loading WhatsApp channels',
    );
  }

  if (command === 'sync-channels') {
    const payload = await syncDiscoveredChannelsWithBackend();
    return {
      mode: 'sync-channels',
      synced: payload.synced,
      skipped: payload.skipped,
      bridgeAccountId: payload.bridgeAccountId,
      syncedAt: payload.syncedAt,
      message:
        'Authenticated WhatsApp channels synced by the running bridge. Use Reload Stored Channels in the app to reload the stored list.',
    };
  }

  throw new Error(
    `Unsupported bridge control command: ${command || 'unknown'}`,
  );
}

function findActiveSessionLocks() {
  const authRoot = path.dirname(sessionAuthPath);
  const lockFiles = new Set([getSessionLockFile()]);

  try {
    for (const entry of fs.readdirSync(authRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('.wwebjs_auth')) {
        continue;
      }
      const authDir = path.join(authRoot, entry.name);
      for (const file of fs.readdirSync(authDir)) {
        if (file.endsWith('.bridge.lock')) {
          lockFiles.add(path.join(authDir, file));
        }
      }
    }
  } catch {
    // Best-effort lock discovery. The current session lock is still checked.
  }

  const activeLocks = [];
  for (const lockFile of lockFiles) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (lock?.pid && isProcessRunning(lock.pid)) {
        activeLocks.push({ ...lock, lockFile });
      }
    } catch {
      // Ignore malformed or concurrently removed lock files.
    }
  }

  return activeLocks.sort((a, b) =>
    String(a.sessionName || '').localeCompare(String(b.sessionName || '')),
  );
}

function isProcessRunning(pid) {
  const numericPid = Number(pid);
  if (!Number.isFinite(numericPid) || numericPid <= 0) return false;
  if (numericPid === process.pid) return false;

  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function releaseSessionLock() {
  if (!sessionLockFile) return;

  try {
    const existingLock = readExistingSessionLock();
    if (existingLock?.pid && Number(existingLock.pid) !== process.pid) {
      return;
    }
    fs.unlinkSync(sessionLockFile);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(
        `Could not release WhatsApp session lock: ${errorMessage(error)}`,
      );
    }
  } finally {
    sessionLockFile = null;
  }
}

async function buildPuppeteerOptions() {
  const launchOptions = {
    headless,
    executablePath,
    protocolTimeout,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu',
      '--disable-quic',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=UseDnsHttpsSvcb,UseDnsHttpsHttpsSvcb,AsyncDns,QuicProtocol',
      '--window-size=1280,900',
    ],
  };

  if (!reuseBrowser) return launchOptions;

  const available = await isDebugBrowserAvailable(browserDebugUrl);
  if (!available) {
    console.warn(
      `No reusable Chrome debug endpoint found at ${browserDebugUrl}; launching a new browser instead.`,
    );
    return launchOptions;
  }

  console.log(`Reusing existing Chrome debug browser at ${browserDebugUrl}`);
  return {
    browserURL: browserDebugUrl,
    protocolTimeout,
  };
}

async function startClient() {
  try {
    const browserLabel =
      reuseBrowser && client?.options?.puppeteer?.browserURL
        ? `existing Chrome at ${client.options.puppeteer.browserURL}`
        : executablePath || 'Puppeteer browser';
    console.log(
      `Starting WhatsApp session bridge on Node ${process.version} with ${browserLabel} (${headless ? 'headless' : 'visible'} mode)`,
    );
    await client.initialize();
  } catch (error) {
    const message = errorMessage(error);
    console.error(`WhatsApp session failed to start: ${message}`);
    if (message.includes('ERR_NAME_NOT_RESOLVED')) {
      console.error(
        'This machine cannot resolve web.whatsapp.com right now. Check internet, DNS, VPN/proxy, or firewall settings, then rerun the command.',
      );
    }
    if (message.includes('ERR_QUIC_PROTOCOL_ERROR')) {
      console.error(
        'Chrome hit a QUIC/HTTP3 network error. The bridge now disables QUIC; rerun the command after closing old bridge Chrome windows.',
      );
    }
    if (message.toLowerCase().includes('auth timeout')) {
      console.error(
        'WhatsApp Web did not finish authentication before the timeout. Close bridge Chrome windows, wait 10 seconds, then rerun. If the account was unlinked, run npm run whatsapp:session:open-web and scan the QR again.',
      );
    }
    throw error;
  }
}

async function cleanupClientBrowser() {
  try {
    if (client?.pupBrowser) await client.pupBrowser.close();
  } catch {
    // Browser may already be gone after a target/context failure.
  }
  try {
    if (client) await client.destroy();
  } catch {
    // Best-effort cleanup; the supervisor can still start a fresh process.
  }
}

function requestBridgeRestart(reason) {
  if (bridgeRestartRequested) return;
  bridgeRestartRequested = true;
  const message = errorMessage(reason);
  writeBridgeTaskLog(`Restarting WhatsApp bridge worker: ${message}`);
  console.error(`Restarting WhatsApp bridge worker: ${message}`);
  updateBridgeAccountHeartbeat('OFFLINE').catch(() => undefined);
  setTimeout(() => process.exit(1), 1000).unref?.();
}

async function listGroupsAndExit() {
  const groups = await retry(
    () => listGroupsFromPageStore(),
    4,
    15000,
    'loading WhatsApp groups',
  );

  console.log(JSON.stringify(groups, null, 2));
  await client.destroy();
  process.exit(0);
}

async function listChannelsAndExit() {
  const channels = await retry(
    () => listChannelsFromClient(),
    4,
    15000,
    'loading WhatsApp channels',
  );

  console.log(JSON.stringify(channels, null, 2));
  await client.destroy();
  process.exit(0);
}

async function syncGroupsAndExit() {
  const payload = await syncDiscoveredGroupsWithBackend();
  console.log(
    JSON.stringify(
      {
        mode: 'sync-groups',
        synced: payload.synced,
        skipped: payload.skipped,
        bridgeAccountId: payload.bridgeAccountId,
        syncedAt: payload.syncedAt,
        message:
          'Authenticated WhatsApp groups synced. Use Refresh Groups in the app to reload the stored list.',
      },
      null,
      2,
    ),
  );
  await client.destroy();
  process.exit(0);
}

async function syncChannelsAndExit() {
  const payload = await syncDiscoveredChannelsWithBackend();
  console.log(
    JSON.stringify(
      {
        mode: 'sync-channels',
        synced: payload.synced,
        skipped: payload.skipped,
        bridgeAccountId: payload.bridgeAccountId,
        syncedAt: payload.syncedAt,
        message:
          'Authenticated WhatsApp channels synced. Use Reload Stored Channels in the app to reload the stored list.',
      },
      null,
      2,
    ),
  );
  await client.destroy();
  process.exit(0);
}

async function listGroupsFromPageStore() {
  const groups = await client.pupPage.evaluate(() => {
    const chatModels = window.require('WAWebCollections').Chat.getModelsArray();
    const serializedId = (chat) =>
      chat?.id?._serialized || chat?.id?.serialized || '';
    const groupName = (chat) =>
      String(
        chat?.formattedTitle ||
          chat?.name ||
          chat?.__x_formattedTitle ||
          chat?.contact?.formattedName ||
          '',
      ).trim();
    const hasGroupMetadata = (chat) =>
      Boolean(chat?.groupMetadata || chat?.__x_groupMetadata);
    const participantCount = (chat) =>
      chat?.groupMetadata?.participants?.length ||
      chat?.__x_groupMetadata?.participants?.length ||
      chat?.participants?.length ||
      0;
    const participantPhones = (chat) => {
      const participants =
        chat?.groupMetadata?.participants ||
        chat?.__x_groupMetadata?.participants ||
        chat?.participants ||
        [];
      return Array.from(
        new Set(
          participants
            .map((participant) => {
              const raw =
                participant?.id?._serialized ||
                participant?.id?.serialized ||
                participant?._serialized ||
                participant?.user ||
                participant?.id?.user ||
                '';
              const digits = String(raw).split('@')[0].replace(/[^\d]/g, '');
              return digits.length >= 8 && digits.length <= 15
                ? `+${digits}`
                : null;
            })
            .filter(Boolean),
        ),
      );
    };
    const isRawGroupIdName = (id, name) =>
      !name || name === id || /^120\d+@g\.us$/i.test(name);
    const isRealGroupChat = (chat) => {
      const id = serializedId(chat);
      const name = groupName(chat);
      if (!id.endsWith('@g.us')) return false;
      if (chat?.isGroup === false) return false;
      if (chat?.isUser || chat?.isBroadcast || chat?.id?.server === 'c.us') {
        return false;
      }
      if (isRawGroupIdName(id, name) && participantCount(chat) === 0) {
        return false;
      }
      return (
        chat?.isGroup === true || hasGroupMetadata(chat) || id.includes('-')
      );
    };

    return chatModels
      .filter(isRealGroupChat)
      .map((chat) => {
        const id = serializedId(chat);
        const name = groupName(chat) || id;
        const owner =
          chat.groupMetadata?.owner || chat.__x_groupMetadata?.owner || null;
        return {
          name,
          id,
          creatorId: owner?._serialized || owner?.user || null,
          creatorPhone: owner?.user || null,
          participants: participantCount(chat),
          participantPhones: participantPhones(chat),
        };
      })
      .filter(
        (group) =>
          group.id &&
          group.name &&
          group.id.endsWith('@g.us') &&
          !(group.name === group.id && Number(group.participants || 0) === 0),
      );
  });

  return groups.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function listChannelsFromClient() {
  if (typeof client.getChannels !== 'function') {
    throw new Error(
      'Installed whatsapp-web.js version does not expose client.getChannels()',
    );
  }

  const channels = await client.getChannels();
  return channels
    .map((channel) => ({
      name: String(channel?.name || '').trim() || channel?.id?._serialized,
      id: channel?.id?._serialized || null,
      description: String(channel?.description || '').trim() || null,
      isChannel: Boolean(channel?.isChannel),
      isGroup: Boolean(channel?.isGroup),
      isReadOnly: Boolean(channel?.isReadOnly),
      unreadCount: Number(channel?.unreadCount || 0),
      subscriberCount:
        Number(
          channel?.channelMetadata?.subscribersCount ||
            channel?.channelMetadata?.subscribers ||
            0,
        ) || null,
      inviteLink:
        String(channel?.channelMetadata?.inviteLink || '').trim() || null,
      timestamp: channel?.timestamp || null,
      isMuted: Boolean(channel?.isMuted),
    }))
    .filter((channel) => channel.id && channel.isChannel)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function analyzeMappedGroupsAndExit() {
  const results = await analyzeMappedGroups();
  console.log(JSON.stringify(results, null, 2));
  await client.destroy();
  process.exit(0);
}

async function analyzeMappedGroups() {
  const groupEntries = await getMappedGroupEntries();

  if (groupEntries.length === 0) {
    throw new Error('No mapped groups to analyze');
  }

  const results = [];
  for (const mapping of groupEntries) {
    const { groupIdOrName, shopId } = mapping;
    const chat = await resolveMappedChat(groupIdOrName);

    if (!chat) {
      console.warn(`Could not find mapped group: ${groupIdOrName}`);
      continue;
    }

    const messages = await retry(
      () => chat.fetchMessages({ limit: analyzeLimit }),
      3,
      10000,
      `fetching recent messages for ${chat.name || groupIdOrName}`,
    );
    const analysis = analyzeMessages(messages, chat);

    results.push({
      group: chat.name,
      groupId: chat.id?._serialized || groupIdOrName,
      shopId,
      scannedMessages: messages.length,
      summary: analysis.summary,
      likelyProducts: analysis.likelyProducts.slice(0, 12),
      recentTextSamples: analysis.samples,
    });
  }

  return results;
}

async function syncShopsFromGroupsAndExit() {
  const groups = await retry(
    () => listGroupsFromPageStore(),
    4,
    15000,
    'loading WhatsApp groups for shop sync',
  );
  const selectedGroups = filterGroupsForShopSync(groups);
  const applyChanges = args.has('--apply');
  const updateEnv = args.has('--update-env');
  const explicitOwnerRequested = hasExplicitOwnerArgs();

  if (selectedGroups.length === 0) {
    console.log(
      JSON.stringify(
        {
          mode: 'sync-shops',
          apply: applyChanges,
          matchedGroups: 0,
          message:
            'No WhatsApp groups matched. Use --group="Exact Group Name" or --include=partial.',
        },
        null,
        2,
      ),
    );
    await client.destroy();
    process.exit(0);
  }

  if (
    applyChanges &&
    selectedGroups.length === groups.length &&
    !args.has('--all')
  ) {
    throw new Error(
      'Refusing to create shops for every WhatsApp group without --all. Use --group or --include to target specific groups.',
    );
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const created = [];
    const reused = [];
    const ownerResults = [];
    const mapping = { ...groupShopMap };

    for (const group of selectedGroups) {
      const shopLookup = shopDraftFromGroup(group, 'pending-owner');
      const existing = await prisma.shop.findFirst({
        where: {
          OR: [{ name: shopLookup.name }, { phone: shopLookup.phone }],
        },
        select: {
          id: true,
          name: true,
          phone: true,
          ownerId: true,
          owner: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
        },
      });
      const owner = existing
        ? {
            ...existing.owner,
            created: false,
            groupCreatorPhone: groupCreatorPhone(group),
            dryRun: false,
          }
        : explicitOwnerRequested
          ? await resolveShopOwner(prisma)
          : await resolveOrCreateGroupShopOwner(prisma, group, applyChanges);
      const shopDraft = shopDraftFromGroup(group, owner.id);
      const shop = existing
        ? existing
        : applyChanges
          ? await prisma.shop.create({
              data: shopDraft,
              select: {
                id: true,
                name: true,
                phone: true,
                ownerId: true,
              },
            })
          : {
              id: null,
              name: shopDraft.name,
              phone: shopDraft.phone,
              ownerId: owner.id,
            };

      if (shop.id) {
        mapping[group.id] = shop.id;
      }

      const result = {
        groupName: group.name,
        groupId: group.id,
        groupCreatorPhone: owner.groupCreatorPhone || null,
        participants: group.participants,
        shopId: shop.id,
        shopName: shop.name,
        shopPhone: shop.phone,
        ownerName: owner.name,
        ownerPhone: owner.phone,
        ownerMismatch: Boolean(shop.ownerId && shop.ownerId !== owner.id),
      };

      if (existing) {
        reused.push(result);
      } else {
        created.push(result);
      }

      ownerResults.push(owner);
    }

    if (updateEnv) {
      if (!applyChanges) {
        throw new Error('--update-env requires --apply so the shop ids exist');
      }
      await updateSessionGroupShopMap(mapping);
    }

    console.log(
      JSON.stringify(
        {
          mode: 'sync-shops',
          apply: applyChanges,
          updateEnv,
          owners: ownerResults.map((owner) => ({
            id: owner.id,
            name: owner.name,
            phone: owner.phone,
            email: owner.email,
            created: owner.created,
            temporaryPassword: owner.temporaryPassword,
            groupCreatorPhone: owner.groupCreatorPhone,
            dryRun: owner.dryRun,
          })),
          matchedGroups: selectedGroups.length,
          created,
          reused,
          nextGroupShopMap: mapping,
          envUpdated: updateEnv,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }

  await client.destroy();
  process.exit(0);
}

async function postRunnerListingsAndExit() {
  const groupIdOrName = argValue('group') || argValue('group-id');
  const listingIds = listingIdsFromArgs();
  const runnerId = argValue('runner-id');

  if (!groupIdOrName) {
    throw new Error('--group is required');
  }

  if (listingIds.length === 0) {
    throw new Error('--listing-ids or --listing-id is required');
  }

  const result = await processRepostJob({
    id: `manual-${Date.now()}`,
    groupIdOrName,
    runnerId,
    listingIds,
  });

  console.log(JSON.stringify(result, null, 2));
  await client.destroy();
  process.exit(result.failed > 0 ? 1 : 0);
}

function startRepostOutboxWatcher() {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processRepostOutbox();
    } catch (error) {
      console.error(`WhatsApp repost outbox failed: ${errorMessage(error)}`);
      if (isFatalWhatsAppSessionError(error)) requestBridgeRestart(error);
    } finally {
      running = false;
    }
  };

  tick();
  setInterval(tick, repostPollMs);
}

function startOutboundMessageWatcher() {
  if (!bridgeAccountId) {
    console.log(
      'Direct WhatsApp message outbox disabled: WHATSAPP_BRIDGE_ACCOUNT_ID is not set.',
    );
    return;
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processOutboundMessages();
    } catch (error) {
      console.error(
        `WhatsApp direct message outbox failed: ${errorMessage(error)}`,
      );
      if (isFatalWhatsAppSessionError(error)) requestBridgeRestart(error);
    } finally {
      running = false;
    }
  };

  tick();
  setInterval(tick, outboundMessagePollMs);
  console.log(
    `Direct WhatsApp message outbox active every ${Math.round(outboundMessagePollMs / 1000)} second(s).`,
  );
}

async function processOutboundMessages() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const now = new Date();
  const staleClaim = new Date(Date.now() - 2 * 60 * 1000);

  try {
    await prisma.whatsAppOutboundMessage.deleteMany({
      where: { bridgeAccountId, expiresAt: { lte: now } },
    });
    await prisma.whatsAppOutboundMessage.updateMany({
      where: {
        bridgeAccountId,
        status: 'PROCESSING',
        claimedAt: { lt: staleClaim },
      },
      data: { status: 'PENDING', claimedAt: null },
    });

    const message = await prisma.whatsAppOutboundMessage.findFirst({
      where: {
        bridgeAccountId,
        status: 'PENDING',
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!message) return;

    const claimed = await prisma.whatsAppOutboundMessage.updateMany({
      where: { id: message.id, status: 'PENDING' },
      data: {
        status: 'PROCESSING',
        claimedAt: now,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return;

    try {
      if (message.messageType === 'GROUP_JOIN') {
        const joinResult = await joinWhatsAppGroupFromInvite(
          message.messageText,
        );
        await recordGroupJoinOutcome(prisma, message, {
          status: 'JOINED',
          groupId: joinResult?.groupId || joinResult || null,
        });
      } else if (message.messageType === 'DOCUMENT') {
        await sendWhatsAppDocumentToPhone(message);
      } else {
        await sendWhatsAppTextToPhone(
          message.recipientPhone,
          message.messageText,
        );
      }
      await prisma.whatsAppOutboundMessage.delete({
        where: { id: message.id },
      });
      console.log(
        message.messageType === 'GROUP_JOIN'
          ? `Joined WhatsApp invite group through bridge ${bridgeAccountId}.`
          : `Sent ${message.messageType} message to ${maskPhone(message.recipientPhone)} through bridge ${bridgeAccountId}.`,
      );
    } catch (error) {
      const attempts = Number(message.attempts || 0) + 1;
      if (message.messageType === 'GROUP_JOIN') {
        await recordGroupJoinOutcome(prisma, message, {
          status: attempts >= 3 ? 'FAILED' : 'RETRYING',
          error: errorMessage(error).slice(0, 1000),
        });
      }
      await prisma.whatsAppOutboundMessage.update({
        where: { id: message.id },
        data: {
          status: attempts >= 3 ? 'FAILED' : 'PENDING',
          claimedAt: null,
          lastError: errorMessage(error).slice(0, 1000),
        },
      });
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

function maskPhone(value) {
  const digits = whatsappDigits(value);
  if (digits.length <= 4) return digits || 'unknown';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function startCaptureOutboxWatcher() {
  if (!shopCaptureEnabled) {
    console.log('Manual capture outbox watcher is disabled.');
    return;
  }

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processCaptureOutbox();
    } catch (error) {
      console.error(`Manual capture outbox failed: ${errorMessage(error)}`);
      if (isFatalWhatsAppSessionError(error)) requestBridgeRestart(error);
    } finally {
      running = false;
    }
  };

  tick();
  setInterval(tick, capturePollMs);
}

async function processCaptureOutbox() {
  const capabilities = await getBridgeCapabilities();
  if (!capabilities.canCapture) {
    console.log(`Manual capture outbox skipped: ${capabilities.reason}`);
    return;
  }

  const pendingDir = path.join(captureOutboxRoot, 'pending');
  const processingDir = path.join(captureOutboxRoot, 'processing');
  const processedDir = path.join(captureOutboxRoot, 'processed');
  const failedDir = path.join(captureOutboxRoot, 'failed');

  await Promise.all([
    fsp.mkdir(pendingDir, { recursive: true }),
    fsp.mkdir(processingDir, { recursive: true }),
    fsp.mkdir(processedDir, { recursive: true }),
    fsp.mkdir(failedDir, { recursive: true }),
  ]);

  const files = (await fsp.readdir(pendingDir))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  for (const fileName of files) {
    if (!(await isWhatsAppRepostingEnabled({ forceRefresh: true }))) {
      console.log('Repost outbox paused before next job.');
      return;
    }

    const pendingPath = path.join(pendingDir, fileName);
    const processingPath = path.join(processingDir, fileName);

    let previewJob = null;
    try {
      previewJob = JSON.parse(await fsp.readFile(pendingPath, 'utf8'));
    } catch {
      // Invalid jobs are still claimed so they move to failed with diagnostics.
    }

    if (previewJob && !shouldCurrentBridgeProcessCaptureJob(previewJob)) {
      continue;
    }

    try {
      await fsp.rename(pendingPath, processingPath);
    } catch {
      continue;
    }

    try {
      const job = JSON.parse(await fsp.readFile(processingPath, 'utf8'));
      const result = await captureMappedGroupsSinceLastCapture(job.shopIds);
      await fsp.writeFile(
        path.join(processedDir, fileName),
        JSON.stringify(
          { job, result, processedAt: new Date().toISOString() },
          null,
          2,
        ),
        'utf8',
      );
      await fsp.unlink(processingPath);
      console.log(
        `Processed manual capture job ${job.id}: queued=${result.queued} failed=${result.failed}`,
      );
    } catch (error) {
      if (/global whatsapp reposting is paused/i.test(errorMessage(error))) {
        await fsp.rename(processingPath, pendingPath).catch(() => undefined);
        console.log(
          `Repost job ${fileName} returned to pending: reposting is paused.`,
        );
        return;
      }
      await fsp.writeFile(
        path.join(failedDir, fileName),
        JSON.stringify(
          {
            error: errorMessage(error),
            failedAt: new Date().toISOString(),
            source: await safeReadText(processingPath),
          },
          null,
          2,
        ),
        'utf8',
      );
      await fsp.unlink(processingPath).catch(() => undefined);
      console.error(
        `Failed manual capture job ${fileName}: ${errorMessage(error)}`,
      );
    }
  }
}

function shouldCurrentBridgeProcessCaptureJob(job) {
  const targetBridgeAccountId = String(
    job.targetBridgeAccountId || job.bridgeAccountId || '',
  ).trim();
  const targetBridgeWorkerKey = String(
    job.targetBridgeWorkerKey || job.bridgeWorkerKey || '',
  ).trim();

  if (targetBridgeAccountId && targetBridgeAccountId !== bridgeAccountId) {
    return false;
  }

  if (targetBridgeWorkerKey && targetBridgeWorkerKey !== bridgeWorkerKey) {
    return false;
  }

  return true;
}

function startAutoRepostScheduler() {
  if (autoRepostIntervalMs <= 0) {
    console.log('Hourly runner auto-posting is disabled.');
    return;
  }

  let running = false;
  let boundaryTimer = null;

  let catchUpTimer = null;
  const scheduleCatchUp = () => {
    if (catchUpTimer) return;
    const delay = isRepostWindow()
      ? 60_000
      : msUntilNextRepostWindow(new Date());
    catchUpTimer = setTimeout(() => {
      catchUpTimer = null;
      tick();
    }, delay);
    catchUpTimer.unref?.();
    console.log(
      `Runner auto-post catch-up scheduled for repost window in ${Math.ceil(delay / 60000)} minute(s).`,
    );
  };

  const scheduleNextBoundary = () => {
    if (boundaryTimer) clearTimeout(boundaryTimer);
    const now = new Date();
    const nextBoundary = new Date(now);
    const remainder = now.getMinutes() % 30;
    const minutesUntilNextRepost =
      remainder < 15 ? 15 - remainder : 45 - remainder;
    nextBoundary.setMinutes(now.getMinutes() + minutesUntilNextRepost, 0, 0);
    const delay = Math.max(1000, nextBoundary.getTime() - now.getTime());
    boundaryTimer = setTimeout(async () => {
      boundaryTimer = null;
      await tick();
      scheduleNextBoundary();
    }, delay);
    boundaryTimer.unref?.();
    console.log(
      `Next runner auto-post repost-window check: ${nextBoundary.toLocaleString()}`,
    );
  };

  const tick = async () => {
    if (running) return;
    if (!isRepostWindow()) {
      console.log(
        `Runner auto-post deferred: current bridge window=${currentBridgeWindow()}; repost resumes in ${Math.ceil(msUntilNextRepostWindow() / 60000)} minute(s).`,
      );
      scheduleCatchUp();
      return;
    }
    await waitForRunnerBotPriority('auto-repost start');
    autoRepostDue = true;
    if (!beginHeavyBridgeOperation('auto-repost')) {
      console.log(
        `Runner auto-post waiting for ${heavyBridgeOperation || 'bridge work'} to finish.`,
      );
      scheduleCatchUp();
      return;
    }
    running = true;
    try {
      autoRepostDue = false;
      const result = await processApprovedAutoReposts();
      if (result.backlog > 0 && result.sent < result.target) scheduleCatchUp();
    } catch (error) {
      console.error(`Runner auto-post failed: ${diagnosticError(error)}`);
      if (isFatalWhatsAppSessionError(error)) requestBridgeRestart(error);
      scheduleCatchUp();
    } finally {
      running = false;
      endHeavyBridgeOperation('auto-repost');
    }
  };

  console.log(
    'Runner auto-post scheduler active in the 15-minute repost half of each 30-minute cycle.',
  );
  if (isRepostWindow()) setTimeout(tick, 1000).unref?.();
  scheduleNextBoundary();
}

function runnerWallClockSlot(intervalMinutes, now = new Date()) {
  const requestedInterval = Number(intervalMinutes);
  const interval = [30, 60].includes(requestedInterval)
    ? requestedInterval
    : 30;
  const minuteNumber = Math.floor(now.getTime() / 60_000);
  if (minuteNumber % interval !== 0) return null;
  return new Date(minuteNumber * 60_000);
}

function latestRunnerWallClockSlot(intervalMinutes, now = new Date()) {
  const requestedInterval = Number(intervalMinutes);
  const interval = [30, 60].includes(requestedInterval)
    ? requestedInterval
    : 30;
  const minuteNumber = Math.floor(now.getTime() / 60_000);
  const slotMinute = Math.floor(minuteNumber / interval) * interval;
  return new Date(slotMinute * 60_000);
}

function startBridgeHeartbeatScheduler() {
  if (!bridgeAccountId && !bridgeWorkerKey) return;

  setInterval(() => {
    updateBridgeAccountHeartbeat('ONLINE').catch((error) =>
      console.warn(`Bridge heartbeat failed: ${errorMessage(error)}`),
    );
  }, 60_000).unref?.();
}

async function updateBridgeAccountHeartbeat(status) {
  if (!bridgeAccountId && !bridgeWorkerKey) return;

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const data = {
      status,
      lastSeenAt: new Date(),
      sessionName,
      ...(bridgeWorkerKey ? { workerKey: bridgeWorkerKey } : {}),
    };

    if (bridgeAccountId) {
      const current = await prisma.whatsAppBridgeAccount.findUnique({
        where: { id: bridgeAccountId },
        select: { verificationStatus: true, status: true },
      });
      if (
        status === 'ONLINE' &&
        (current?.verificationStatus === 'MISMATCHED' ||
          current?.status === 'MISMATCHED')
      ) {
        data.status = 'MISMATCHED';
      }
      await prisma.whatsAppBridgeAccount.update({
        where: { id: bridgeAccountId },
        data,
      });
      return;
    }

    await prisma.whatsAppBridgeAccount.upsert({
      where: { workerKey: bridgeWorkerKey },
      create: {
        name: sessionName,
        workerKey: bridgeWorkerKey,
        sessionName,
        status,
        lastSeenAt: new Date(),
      },
      update: data,
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function getBridgeRuntimeConfig({ forceRefresh = false } = {}) {
  if (!bridgeAccountId && !bridgeWorkerKey) return null;
  const cacheMs = 30_000;
  if (
    !forceRefresh &&
    bridgeRuntimeConfigCache &&
    Date.now() - bridgeRuntimeConfigFetchedAt < cacheMs
  ) {
    return bridgeRuntimeConfigCache;
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const where = bridgeAccountId
      ? { id: bridgeAccountId }
      : { workerKey: bridgeWorkerKey };
    bridgeRuntimeConfigCache = await prisma.whatsAppBridgeAccount.findUnique({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        mode: true,
        status: true,
        expectedPhone: true,
        verifiedPhone: true,
        verificationStatus: true,
        mismatchReason: true,
        archivedAt: true,
        runtimeSettings: true,
        maxPostsPerRun: true,
      },
    });
    bridgeRuntimeConfigFetchedAt = Date.now();
    return bridgeRuntimeConfigCache;
  } finally {
    await prisma.$disconnect();
  }
}

async function getBridgeCapabilities(options = {}) {
  const config = await getBridgeRuntimeConfig(options);
  const repostingEnabled = await isWhatsAppRepostingEnabled(options);
  if (!config) {
    return {
      canCapture: shopCaptureEnabled,
      canPost: repostingEnabled,
      reason: repostingEnabled
        ? 'no registered bridge account'
        : 'global WhatsApp reposting is paused',
    };
  }

  const mode = String(config.mode || 'CAPTURE_AND_POST').toUpperCase();
  const expectedPhone = whatsappDigits(config.expectedPhone || config.phone);
  const verifiedPhone = whatsappDigits(config.verifiedPhone);
  const missingPhoneVerification = Boolean(bridgeAccountId) && !expectedPhone;
  const phoneMismatch =
    Boolean(bridgeAccountId) &&
    Boolean(expectedPhone) &&
    verifiedPhone !== expectedPhone;
  const unsafe =
    config.archivedAt ||
    config.status === 'MISMATCHED' ||
    config.verificationStatus === 'MISMATCHED' ||
    missingPhoneVerification ||
    phoneMismatch;
  const reason = unsafe
    ? config.mismatchReason ||
      (missingPhoneVerification
        ? 'bridge expected phone is not configured'
        : phoneMismatch
          ? 'bridge verified phone does not match expected phone'
          : 'bridge is archived or mismatched')
    : `mode=${mode} status=${config.status}`;

  return {
    canCapture:
      !unsafe &&
      shopCaptureEnabled &&
      (mode === 'CAPTURE_ONLY' || mode === 'CAPTURE_AND_POST'),
    canPost:
      !unsafe &&
      repostingEnabled &&
      mode !== 'PAUSED' &&
      (mode === 'POST_ONLY' || mode === 'CAPTURE_AND_POST'),
    reason: repostingEnabled ? reason : 'global WhatsApp reposting is paused',
  };
}

async function isWhatsAppRepostingEnabled({ forceRefresh = false } = {}) {
  const cacheMs = 5_000;
  if (
    !forceRefresh &&
    whatsappRepostingEnabledCache !== null &&
    Date.now() - whatsappRepostingEnabledFetchedAt < cacheMs
  ) {
    return whatsappRepostingEnabledCache;
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: whatsappRepostingEnabledKey },
      select: { value: true },
    });
    whatsappRepostingEnabledCache =
      String(setting?.value || '').toLowerCase() === 'true';
    whatsappRepostingEnabledFetchedAt = Date.now();
    return whatsappRepostingEnabledCache;
  } catch (error) {
    console.warn(
      `Could not read WhatsApp reposting setting; pausing reposts: ${errorMessage(error)}`,
    );
    whatsappRepostingEnabledCache = false;
    whatsappRepostingEnabledFetchedAt = Date.now();
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

function runtimeSettings() {
  const settings = bridgeRuntimeConfigCache?.runtimeSettings;
  return settings && typeof settings === 'object' ? settings : {};
}

function runtimeBooleanSetting(key, fallback) {
  const value = runtimeSettings()[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

function runtimeNumberSetting(key, fallback, min, max) {
  const value = Number(runtimeSettings()[key] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.round(value), max));
}

function runtimeStringSetting(key, fallback) {
  const value = String(runtimeSettings()[key] ?? '').trim();
  return value || fallback;
}

function repostMaxPostsPerJob() {
  return runtimeNumberSetting(
    'repostMaxPostsPerJob',
    Number(process.env.WHATSAPP_REPOST_MAX_POSTS_PER_JOB || 10),
    1,
    10,
  );
}

function shopRepostMaxDestinationsPerCapture() {
  return runtimeNumberSetting(
    'shopRepostMaxDestinationsPerCapture',
    Number(process.env.WHATSAPP_SHOP_REPOST_MAX_DESTINATIONS_PER_CAPTURE || 2),
    1,
    10,
  );
}

function bridgeDailyRepostLimit() {
  return runtimeNumberSetting(
    'bridgeDailyRepostLimit',
    Number(process.env.WHATSAPP_BRIDGE_DAILY_REPOST_LIMIT || 80),
    1,
    500,
  );
}

async function processApprovedAutoReposts() {
  const capabilities = await getBridgeCapabilities();
  if (!capabilities.canPost) {
    console.log(`Auto-post skipped: ${capabilities.reason}`);
    return { target: autoRepostMaxListings, sent: 0, failed: 0, backlog: 0 };
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const cycle = {
      target: 0,
      sent: 0,
      failed: 0,
      backlog: 0,
    };
    const scheduleNow = new Date();
    await prisma.runnerListing.updateMany({
      where: {
        status: 'SCHEDULED',
        autoPostApproved: true,
        scheduledStartAt: { lte: scheduleNow },
      },
      data: { status: 'ACTIVE', startedAt: scheduleNow },
    });
    await prisma.runnerListing.updateMany({
      where: {
        status: 'ACTIVE',
        expiryDate: { lte: scheduleNow },
      },
      data: { status: 'EXPIRED', autoPostApproved: false },
    });
    const links = await prisma.runnerShopLink.findMany({
      where: {
        autoPostEnabled: true,
        OR: [{ selectedForTest: true }, { selectedForLive: true }],
        status: 'APPROVED',
        runner: {
          status: 'ACTIVE',
          repostingStatus: 'ACTIVE',
          autoPostEnabled: true,
          ...(bridgeAccountId ? { bridgeAccountId } : {}),
        },
      },
      select: {
        id: true,
        runnerId: true,
        shopId: true,
        selectedForTest: true,
        selectedForLive: true,
        destinationGroup: true,
        maxPostsPerRun: true,
        runner: {
          select: {
            id: true,
            whatsappGroup: true,
            repostingStatus: true,
            autoPostEnabled: true,
            autoPostIntervalMinutes: true,
            maxPostsPerRun: true,
            lastAutoPostAt: true,
            trialStartsAt: true,
            repostingGroups: {
              where: { status: 'READY_FOR_REPOSTING' },
              select: {
                isTestGroup: true,
                whatsappGroupId: true,
                groupName: true,
                discoveredGroup: { select: { groupId: true, name: true } },
              },
            },
          },
        },
      },
    });

    const destinationQueues = new Map();
    for (const link of links) {
      const requestedRunnerInterval = Number(
        link.runner.autoPostIntervalMinutes,
      );
      const runnerIntervalMinutes = [30, 60].includes(requestedRunnerInterval)
        ? requestedRunnerInterval
        : 30;
      const runnerSlot = latestRunnerWallClockSlot(
        runnerIntervalMinutes,
        scheduleNow,
      );
      if (!runnerSlot) continue;
      if (
        link.runner.lastAutoPostAt &&
        new Date(link.runner.lastAutoPostAt).getTime() >= runnerSlot.getTime()
      ) {
        continue;
      }
      const destinationGroups = runnerLinkDestinationGroups(link);
      if (destinationGroups.length === 0) continue;

      const seenDestinationKeys = new Set();
      for (const groupIdOrName of destinationGroups) {
        let chat = null;
        try {
          chat = await resolvePostDestinationChat(groupIdOrName);
        } catch (error) {
          console.warn(
            `Auto-post skipped: could not resolve group ${groupIdOrName}: ${diagnosticError(error)}`,
          );
          continue;
        }
        if (!chat) {
          console.warn(
            `Auto-post skipped: could not find group ${groupIdOrName}`,
          );
          continue;
        }
        const groupAliases = repostGroupAliases(groupIdOrName, chat);
        const destinationKey =
          chat.id?._serialized || groupAliases[0] || groupIdOrName;
        if (seenDestinationKeys.has(destinationKey)) continue;
        seenDestinationKeys.add(destinationKey);
        const reservationConflict =
          await findDestinationReservationForAnotherRunner(
            prisma,
            link.runnerId,
            groupAliases,
          );
        if (reservationConflict) {
          console.warn(
            `Auto-post skipped: destination ${destinationKey} is reserved by runner ${reservationConflict.runnerId} via ${reservationConflict.source}`,
          );
          continue;
        }
        const now = new Date();
        const candidates = await prisma.runnerListing.findMany({
          where: {
            runnerId: link.runnerId,
            shopId: link.shopId,
            status: 'ACTIVE',
            autoPostApproved: true,
          },
          select: {
            id: true,
            createdAt: true,
            repostFrequencyMinutes: true,
            maximumListingAgeDays: true,
            product: {
              select: {
                sourceRefreshedAt: true,
                whatsappImports: {
                  select: { receivedAt: true },
                  orderBy: { receivedAt: 'desc' },
                  take: 1,
                },
              },
            },
            repostLogs: {
              where: { groupIdOrName: { in: groupAliases } },
              orderBy: { postedAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'asc' },
          take: 1000,
        });

        const expiredIds = [];
        const listings = candidates.filter((listing) => {
          const sourceDate = listingSourceDate(listing);
          const maxAgeMs =
            Math.max(1, Number(listing.maximumListingAgeDays || 14)) *
            24 *
            60 *
            60 *
            1000;
          if (!sourceDate || now.getTime() - sourceDate.getTime() > maxAgeMs) {
            expiredIds.push(listing.id);
            return false;
          }
          const log = listing.repostLogs[0];
          if (!log) return true;
          if (
            listing.product.sourceRefreshedAt &&
            new Date(listing.product.sourceRefreshedAt).getTime() >
              new Date(log.postedAt).getTime()
          ) {
            return true;
          }
          if (log.status === 'FAILED') {
            return (
              Number(log.retryCount || 0) < bridgeRepostMaxRetryCount() &&
              (!log.nextRetryAt || log.nextRetryAt <= now)
            );
          }
          // Automatic backlog draining is once per destination. Successfully
          // posted products only repeat through an explicit manual repost.
          return false;
        });
        if (expiredIds.length > 0) {
          await prisma.runnerListing.updateMany({
            where: { id: { in: expiredIds } },
            data: { status: 'EXPIRED', autoPostApproved: false },
          });
        }

        if (listings.length === 0) continue;
        const queue = destinationQueues.get(destinationKey) || {
          groupIdOrName,
          backlog: 0,
          items: [],
        };
        queue.backlog += listings.length;
        queue.items.push(
          ...listings.map((listing) => ({
            link,
            listingId: listing.id,
            capturedAt: listingSourceDate(listing) || listing.createdAt,
          })),
        );
        destinationQueues.set(destinationKey, queue);
      }
    }

    for (const [destinationKey, queue] of destinationQueues) {
      const configuredBridgeLimit = Number(
        bridgeRuntimeConfigCache?.maxPostsPerRun || autoRepostMaxListings,
      );
      const destinationTarget = Math.max(
        1,
        Math.min(10, configuredBridgeLimit, repostMaxPostsPerJob()),
      );
      cycle.target += destinationTarget;
      cycle.backlog += queue.backlog;
      let destinationSent = 0;
      let destinationFailed = 0;
      console.log(
        `Auto-post destination ${destinationKey}: backlog=${queue.backlog} target=${destinationTarget}`,
      );

      const linkCounts = new Map();
      const selectedItems = queue.items
        .sort(
          (left, right) =>
            new Date(left.capturedAt).getTime() -
            new Date(right.capturedAt).getTime(),
        )
        .filter((item) => {
          if (destinationSent >= destinationTarget) return false;
          const linkKey = item.link.id;
          const current = linkCounts.get(linkKey) || 0;
          const runnerLimit = Math.max(
            1,
            Math.min(10, Number(item.link.runner.maxPostsPerRun || 10)),
          );
          const linkLimit = Math.max(
            1,
            Math.min(
              destinationTarget,
              runnerLimit,
              Number(item.link.maxPostsPerRun || destinationTarget),
            ),
          );
          if (current >= linkLimit) return false;
          linkCounts.set(linkKey, current + 1);
          destinationSent += 1;
          return true;
        });
      destinationSent = 0;

      const entries = [];
      for (const item of selectedItems) {
        const previous = entries[entries.length - 1];
        if (previous?.link.id === item.link.id) {
          previous.listingIds.push(item.listingId);
        } else {
          entries.push({ link: item.link, listingIds: [item.listingId] });
        }
      }

      for (const entry of entries) {
        await waitForRunnerBotPriority('auto-repost batch');
        if (!isRepostWindow()) {
          console.log(
            `Runner auto-post paused at repost window boundary: destination=${destinationKey} sent=${destinationSent} failed=${destinationFailed} remainingBacklog=${Math.max(0, queue.backlog - destinationSent)}`,
          );
          break;
        }
        if (destinationSent >= destinationTarget) break;
        const listingIds = entry.listingIds.slice(
          0,
          destinationTarget - destinationSent,
        );
        if (listingIds.length === 0) continue;
        console.log(
          `Auto-posting ${listingIds.length} approved listing(s) for runner ${entry.link.runnerId} shop ${entry.link.shopId} to ${queue.groupIdOrName}`,
        );
        const result = await processRepostJob({
          id: `auto-${entry.link.runnerId}-${entry.link.shopId}-${Date.now()}`,
          runnerId: entry.link.runnerId,
          groupIdOrName: queue.groupIdOrName,
          listingIds,
          mode: 'auto',
          forceRepost: true,
        });
        destinationSent += result.sent;
        destinationFailed += result.failed;
        cycle.sent += result.sent;
        cycle.failed += result.failed;
        await prisma.runner.update({
          where: { id: entry.link.runnerId },
          data: { lastAutoPostAt: new Date() },
        });
        console.log(
          `Auto-post result runner=${entry.link.runnerId} shop=${entry.link.shopId} group=${queue.groupIdOrName}: sent=${result.sent} failed=${result.failed}`,
        );
      }
      queue.sent = destinationSent;
      queue.failed = destinationFailed;
      console.log(
        `Auto-post destination complete ${destinationKey}: target=${destinationTarget} sent=${destinationSent} failed=${destinationFailed} remainingBacklog=${Math.max(0, queue.backlog - destinationSent)}`,
      );
    }
    cycle.backlog = Math.max(0, cycle.backlog - cycle.sent);
    console.log(
      `Runner auto-post cycle complete: target=${cycle.target} sent=${cycle.sent} failed=${cycle.failed} remainingBacklog=${cycle.backlog}`,
    );
    return cycle;
  } finally {
    await prisma.$disconnect();
  }
}

function parseConfiguredDestinationGroups(value) {
  const clean = String(value || '').trim();
  if (!clean) return [];

  if (clean.startsWith('[')) {
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(
            parsed.map((group) => String(group || '').trim()).filter(Boolean),
          ),
        ).slice(0, 2);
      }
    } catch {
      return [clean];
    }
  }

  return Array.from(
    new Set(
      clean
        .split(',')
        .map((group) => group.trim())
        .filter(Boolean),
    ),
  ).slice(0, 2);
}

function mergeConfiguredDestinationGroups(...values) {
  return Array.from(
    new Set(values.flatMap((value) => parseConfiguredDestinationGroups(value))),
  )
    .filter(Boolean)
    .slice(0, 2);
}

function parseConfiguredGroupList(value) {
  const clean = String(value || '').trim();
  if (!clean) return [];

  if (clean.startsWith('[')) {
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(
            parsed.map((group) => String(group || '').trim()).filter(Boolean),
          ),
        );
      }
    } catch {
      return [clean];
    }
  }

  return Array.from(
    new Set(
      clean
        .split(',')
        .map((group) => group.trim())
        .filter(Boolean),
    ),
  );
}

function startAutoPipelineScheduler() {
  if (!autoPipelineEnabled) {
    console.log('Automatic import/listing pipeline is disabled.');
    return;
  }

  if (autoPipelineIntervalMs <= 0) {
    console.log('Automatic import/listing pipeline is disabled.');
    return;
  }

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processAutoPipeline();
    } catch (error) {
      console.error(
        `Automatic import/listing pipeline failed: ${errorMessage(error)}`,
      );
    } finally {
      running = false;
    }
  };

  console.log(
    `Automatic import/listing pipeline active every ${Math.round(autoPipelineIntervalMs / 60000)} minute(s).`,
  );
  setTimeout(tick, 45_000);
  setInterval(tick, autoPipelineIntervalMs);
}

async function processAutoPipeline() {
  const response = await fetch(
    `${backendUrl}/whatsapp-imports/webhook/automation/process`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-whatsapp-ingest-secret': ingestSecret,
      },
      body: JSON.stringify({
        limit: autoPipelineMaxImports,
      }),
    },
  );
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  const result = JSON.parse(body);
  console.log(
    [
      'Automatic pipeline result:',
      `scanned=${result.scanned}`,
      `enriched=${result.enriched}`,
      `imported=${result.imported}`,
      `skipped=${result.skipped}`,
      `failed=${result.failed}`,
      `listingsCreated=${result.listingsCreated}`,
      `listingsUpdated=${result.listingsUpdated}`,
      `listingsAutoApproved=${result.listingsAutoApproved}`,
      `runnersEnabled=${result.runnersEnabled}`,
    ].join(' '),
  );
  return result;
}

async function processRepostOutbox() {
  const capabilities = await getBridgeCapabilities();
  if (!capabilities.canPost) {
    console.log(`Repost outbox skipped: ${capabilities.reason}`);
    return;
  }

  const pendingDir = path.join(repostOutboxRoot, 'pending');
  const processingDir = path.join(repostOutboxRoot, 'processing');
  const processedDir = path.join(repostOutboxRoot, 'processed');
  const failedDir = path.join(repostOutboxRoot, 'failed');

  await Promise.all([
    fsp.mkdir(pendingDir, { recursive: true }),
    fsp.mkdir(processingDir, { recursive: true }),
    fsp.mkdir(processedDir, { recursive: true }),
    fsp.mkdir(failedDir, { recursive: true }),
  ]);

  const files = (await fsp.readdir(pendingDir))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();

  for (const fileName of files) {
    const pendingPath = path.join(pendingDir, fileName);
    const processingPath = path.join(processingDir, fileName);

    let previewJob = null;
    try {
      previewJob = JSON.parse(await fsp.readFile(pendingPath, 'utf8'));
    } catch {
      // Invalid jobs are still claimed so they move to failed with diagnostics.
    }

    if (previewJob && !shouldCurrentBridgeProcessCaptureJob(previewJob)) {
      continue;
    }

    try {
      await fsp.rename(pendingPath, processingPath);
    } catch {
      continue;
    }

    try {
      const job = JSON.parse(await fsp.readFile(processingPath, 'utf8'));
      const result = await processRepostJob(job);
      await fsp.writeFile(
        path.join(processedDir, fileName),
        JSON.stringify(
          { job, result, processedAt: new Date().toISOString() },
          null,
          2,
        ),
        'utf8',
      );
      await fsp.unlink(processingPath);
      console.log(
        `Posted WhatsApp repost job ${job.id}: sent=${result.sent} failed=${result.failed}`,
      );
    } catch (error) {
      await fsp.writeFile(
        path.join(failedDir, fileName),
        JSON.stringify(
          {
            error: errorMessage(error),
            failedAt: new Date().toISOString(),
            source: await safeReadText(processingPath),
          },
          null,
          2,
        ),
        'utf8',
      );
      await fsp.unlink(processingPath).catch(() => undefined);
      console.error(
        `Failed WhatsApp repost job ${fileName}: ${errorMessage(error)}`,
      );
    }
  }
}

async function processRepostJob(job) {
  const listingIds = [...new Set(job.listingIds || [])].filter(Boolean);
  const groupIdOrName = String(job.groupIdOrName || job.group || '').trim();

  if (!groupIdOrName) throw new Error('Repost job missing groupIdOrName');
  if (listingIds.length === 0) throw new Error('Repost job missing listingIds');
  if (!(await isWhatsAppRepostingEnabled({ forceRefresh: true }))) {
    throw new Error('Global WhatsApp reposting is paused');
  }

  const chat = await resolvePostDestinationChat(groupIdOrName);
  if (!chat) throw new Error(`Could not find WhatsApp group: ${groupIdOrName}`);
  const groupAliases = repostGroupAliases(groupIdOrName, chat);
  const canonicalGroup = canonicalRepostGroup(groupIdOrName, chat);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const listings = await prisma.runnerListing.findMany({
      where: {
        id: { in: listingIds },
        ...(job.runnerId ? { runnerId: job.runnerId } : {}),
        status: 'ACTIVE',
        ...(job.mode === 'auto'
          ? {
              runner: {
                status: 'ACTIVE',
                repostingStatus: 'ACTIVE',
                autoPostEnabled: true,
                ...(bridgeAccountId ? { bridgeAccountId } : {}),
              },
            }
          : {}),
      },
      include: {
        product: {
          include: {
            shop: {
              select: {
                id: true,
                name: true,
              },
            },
            whatsappImports: {
              select: {
                caption: true,
                mediaUrls: true,
                parsedDraft: true,
                receivedAt: true,
              },
              orderBy: { receivedAt: 'desc' },
              take: 1,
            },
          },
        },
        runner: {
          include: {
            user: {
              select: {
                name: true,
                phone: true,
              },
            },
            subscriptions: {
              where: { audience: 'RUNNER', status: 'ACTIVE' },
              select: {
                audience: true,
                status: true,
                priceEditingAddonEnabled: true,
                shopPriceImageAddonEnabled: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 3,
            },
          },
        },
        repostLogs: {
          where: {
            groupIdOrName: { in: groupAliases },
            status: 'POSTED',
          },
          select: {
            id: true,
            groupIdOrName: true,
            postedAt: true,
          },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (listings.length === 0) {
      throw new Error('No active runner listings found for repost job');
    }
    const runnerIds = [...new Set(listings.map((listing) => listing.runnerId))];
    if (runnerIds.length !== 1) {
      throw new Error('Repost job must contain listings for one runner');
    }
    const reservationConflict =
      await findDestinationReservationForAnotherRunner(
        prisma,
        runnerIds[0],
        groupAliases,
      );
    if (reservationConflict) {
      throw new Error(
        `Destination group is reserved by another runner (${reservationConflict.runnerId}); posting is blocked to prevent duplicate adverts`,
      );
    }

    let sent = 0;
    let failed = 0;
    let skippedAlreadyPosted = 0;
    const failures = [];

    for (let index = 0; index < listings.length; index += 1) {
      await waitForRunnerBotPriority('repost listing');
      if (job.mode === 'auto' && !isRepostWindow()) {
        console.log(
          `Repost job ${job.id} paused at repost window boundary: sent=${sent} failed=${failed} remaining=${listings.length - index}`,
        );
        break;
      }
      if (sent >= repostMaxPostsPerJob()) {
        console.log(
          `Repost job ${job.id} paused at safe per-job limit: sent=${sent} remaining=${listings.length - index}`,
        );
        break;
      }
      if (!(await bridgeCanSendRepostToday(prisma, 'Runner repost'))) {
        break;
      }
      const listing = await ensureListingOrderCode(prisma, listings[index]);
      if (!job.forceRepost && listing.repostLogs?.length > 0) {
        skippedAlreadyPosted += 1;
        console.log(
          `Skipping already posted listing ${listing.id} for ${canonicalGroup}`,
        );
        continue;
      }

      try {
        const delivery = await withTimeout(
          sendListingToChat(
            chat,
            listing,
            job.captionOverrides?.[listing.id],
            job.imageOverrides?.[listing.id],
          ),
          repostListingTimeoutMs,
          `Reposting listing ${listing.id}`,
        );
        const repostLog = await markListingPosted(
          prisma,
          listing,
          canonicalGroup,
          job.id,
          delivery.captionStatus,
          delivery.captionFallbackSent,
        );
        await logStampedRepostMedia(
          prisma,
          listing,
          canonicalGroup,
          job.id,
          repostLog?.id,
          delivery.sentMedia,
        );
        sent += 1;
        const separatorMessage = repostProductSeparatorMessage();
        if (separatorMessage) {
          try {
            await chat.sendMessage(separatorMessage);
          } catch (separatorError) {
            console.warn(
              `Product posted but divider failed for ${listing.id}: ${errorMessage(separatorError)}`,
            );
          }
        }
        console.log(
          `Repost progress job=${job.id}: sent=${sent} failed=${failed} of ${listings.length}`,
        );
        await sleep(repostSendDelayMs());
      } catch (error) {
        await markListingRepostFailed(
          prisma,
          listing,
          canonicalGroup,
          job.id,
          error,
        );
        failed += 1;
        failures.push({ listingId: listing.id, error: errorMessage(error) });
        console.warn(
          `Could not repost listing ${listing.id}: ${errorMessage(error)}`,
        );
        if (isFatalWhatsAppSessionError(error)) {
          console.error(
            'WhatsApp Web session became unresponsive; restarting the supervised bridge worker.',
          );
          setTimeout(() => process.exit(1), 1000).unref?.();
          throw error;
        }
      }
    }

    return {
      jobId: job.id,
      group: chat.name,
      groupId: chat.id?._serialized || groupIdOrName,
      requested: listingIds.length,
      found: listings.length,
      sent,
      failed,
      skippedAlreadyPosted,
      failures,
    };
  } finally {
    await prisma.$disconnect();
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

function isFatalWhatsAppSessionError(error) {
  return /target closed|detached frame|execution context was destroyed|session closed|browser has disconnected/i.test(
    errorMessage(error),
  );
}

function repostDayStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

async function countBridgeRepostsToday(prisma) {
  const postedAt = { gte: repostDayStart() };
  const runnerWhere = { status: 'POSTED', postedAt };
  if (bridgeAccountId) runnerWhere.bridgeAccountId = bridgeAccountId;

  const runnerCount = await prisma.whatsAppRepostLog.count({
    where: runnerWhere,
  });

  if (!bridgeAccountId) return runnerCount;

  const presences = await prisma.whatsAppBridgeGroupPresence.findMany({
    where: { bridgeAccountId, isAvailable: true, archivedAt: null },
    select: { groupId: true },
  });
  const groupIds = presences
    .map((presence) => String(presence.groupId || '').trim())
    .filter(Boolean);
  if (groupIds.length === 0) return runnerCount;

  const shopCount = await prisma.shopWhatsAppRepostLog.count({
    where: {
      status: 'POSTED',
      postedAt,
      OR: [
        { destinationGroupId: { in: groupIds } },
        { destinationMapping: { groupId: { in: groupIds } } },
      ],
    },
  });

  return runnerCount + shopCount;
}

async function bridgeCanSendRepostToday(prisma, label) {
  const limit = bridgeDailyRepostLimit();
  const sentToday = await countBridgeRepostsToday(prisma);
  if (sentToday < limit) return true;

  console.warn(
    `${label} paused: bridge daily repost limit reached (${sentToday}/${limit}).`,
  );
  return false;
}

async function repostShopCaptureToDestinations({
  shopId,
  sourceGroupId,
  sourceGroupName,
  capture,
}) {
  if (!shopOwnerRepostEnabled || !shopCaptureEnabled) return;
  if (!capture || capture.buffered) return;
  if (!Array.isArray(capture.mediaUrls) || capture.mediaUrls.length === 0) {
    return;
  }

  const sourceMessageId = String(capture.messageId || '').trim();
  if (!sourceMessageId) return;

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const sourceMapping = await prisma.whatsAppGroupMapping.findFirst({
      where: {
        shopId,
        groupRole: 'SOURCE',
        status: 'ACTIVE',
        OR: [
          { groupId: sourceGroupId },
          ...(sourceGroupName ? [{ sourceGroup: sourceGroupName }] : []),
        ],
      },
      select: { id: true, groupId: true, sourceGroup: true },
    });

    const destinations = await prisma.whatsAppGroupMapping.findMany({
      where: {
        shopId,
        groupRole: 'SHOP_REPOST_DESTINATION',
        status: 'ACTIVE',
        NOT: { groupId: sourceGroupId },
      },
      select: {
        id: true,
        groupId: true,
        sourceGroup: true,
      },
      orderBy: { sourceGroup: 'asc' },
    });

    if (destinations.length === 0) return;

    let shopReposted = 0;
    for (const destination of destinations) {
      const existing = await prisma.shopWhatsAppRepostLog.findUnique({
        where: {
          destinationMappingId_sourceMessageId: {
            destinationMappingId: destination.id,
            sourceMessageId,
          },
        },
        select: { id: true, status: true },
      });

      if (existing?.status === 'POSTED') {
        continue;
      }
      if (shopReposted >= shopRepostMaxDestinationsPerCapture()) {
        console.log(
          `Shop repost paused at safe destination limit: source=${sourceGroupName || sourceGroupId} sent=${shopReposted} remaining destination(s) skipped`,
        );
        break;
      }
      if (!(await bridgeCanSendRepostToday(prisma, 'Shop repost'))) {
        break;
      }

      const now = new Date();
      const log = await prisma.shopWhatsAppRepostLog.upsert({
        where: {
          destinationMappingId_sourceMessageId: {
            destinationMappingId: destination.id,
            sourceMessageId,
          },
        },
        create: {
          shopId,
          sourceMappingId: sourceMapping?.id || null,
          destinationMappingId: destination.id,
          sourceGroupId,
          sourceGroupName: sourceGroupName || null,
          destinationGroupId: destination.groupId,
          destinationGroupName: destination.sourceGroup,
          sourceMessageId,
          status: 'PROCESSING',
          lastAttemptAt: now,
        },
        update: {
          status: 'PROCESSING',
          error: null,
          retryCount: { increment: 1 },
          lastAttemptAt: now,
        },
        select: { id: true },
      });

      try {
        const chat = await resolveMappedChat(destination.groupId);
        if (!chat) {
          throw new Error(
            `Could not find shop destination group ${destination.sourceGroup || destination.groupId}`,
          );
        }

        await sendOriginalCaptureToChat(chat, capture);
        await prisma.shopWhatsAppRepostLog.update({
          where: { id: log.id },
          data: {
            status: 'POSTED',
            error: null,
            destinationGroupId: chat.id?._serialized || destination.groupId,
            destinationGroupName: chat.name || destination.sourceGroup,
            postedAt: new Date(),
            lastAttemptAt: new Date(),
          },
        });
        shopReposted += 1;
        console.log(
          `Shop reposted ${sourceGroupName || sourceGroupId} -> ${chat.name || destination.sourceGroup}: images=${capture.mediaUrls.length}`,
        );
        await sleep(shopRepostSendDelayMs());
      } catch (error) {
        await prisma.shopWhatsAppRepostLog.update({
          where: { id: log.id },
          data: {
            status: 'FAILED',
            error: errorMessage(error).slice(0, 1000),
            lastAttemptAt: new Date(),
          },
        });
        console.warn(
          `Shop repost failed ${sourceGroupName || sourceGroupId} -> ${destination.sourceGroup}: ${errorMessage(error)}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function sendOriginalCaptureToChat(chat, capture) {
  const mediaUrls = selectedRepostImages(capture.mediaUrls);
  const caption = String(capture.caption || '').trim();

  if (mediaUrls.length === 0) {
    if (caption) await chat.sendMessage(caption);
    return;
  }

  for (let index = 0; index < mediaUrls.length; index += 1) {
    const media = await messageMediaFromUrl(mediaUrls[index]);
    await chat.sendMessage(
      media,
      index === mediaUrls.length - 1 && caption ? { caption } : undefined,
    );
    await sleep(500);
  }
}

function listingSourceDate(listing) {
  const values = [
    listing?.product?.sourceRefreshedAt,
    listing?.product?.whatsappImports?.[0]?.receivedAt,
    listing?.createdAt,
  ];
  return (
    values
      .map((value) => (value ? new Date(value) : null))
      .filter((value) => value && !Number.isNaN(value.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())[0] || null
  );
}
function repostGroupAliases(groupIdOrName, chat) {
  return Array.from(
    new Set(
      [groupIdOrName, chat?.id?._serialized, chat?.name, chat?.formattedTitle]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );
}

function runnerLinkDestinationGroups(link) {
  if (link.selectedForTest && !runnerTestWindowActive(link.runner)) {
    return [];
  }
  const readyGroups = Array.isArray(link?.runner?.repostingGroups)
    ? link.runner.repostingGroups
    : [];
  const phase1Groups = readyGroups
    .filter(() => link.selectedForLive || link.selectedForTest)
    .map(
      (group) =>
        group.whatsappGroupId ||
        group.discoveredGroup?.groupId ||
        group.discoveredGroup?.name ||
        group.groupName,
    )
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (phase1Groups.length > 0) {
    return [...new Set(phase1Groups)];
  }

  if (link.selectedForLive) {
    return mergeConfiguredDestinationGroups(
      link.runner?.whatsappGroup || '',
      link.destinationGroup || '',
    );
  }

  return [];
}

function runnerTestWindowActive(runner) {
  if (!runner?.trialStartsAt) return true;
  const startsAt = new Date(runner.trialStartsAt);
  if (Number.isNaN(startsAt.getTime())) return true;
  const endsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  return endsAt >= new Date();
}

const RESERVED_REPOSTING_GROUP_STATUSES = [
  'GROUP_LINK_RECEIVED',
  'JOIN_ATTEMPT_STARTED',
  'JOINED_GROUP',
  'ADMIN_STATUS_PENDING',
  'RUNNER_CONFIRMED_ADMIN',
  'ADMIN_VERIFIED',
  'BOT_NOT_ADMIN',
  'READY_FOR_REPOSTING',
];

function normalizedDestination(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

async function findDestinationReservationForAnotherRunner(
  prisma,
  runnerId,
  groupAliases,
) {
  const requested = new Set(
    (groupAliases || []).map(normalizedDestination).filter(Boolean),
  );
  if (requested.size === 0) return null;

  const [activeLinks, repostingGroups] = await Promise.all([
    prisma.runnerShopLink.findMany({
      where: {
        runnerId: { not: runnerId },
        status: 'APPROVED',
        autoPostEnabled: true,
        destinationGroup: { not: null },
        runner: { status: 'ACTIVE' },
      },
      select: { runnerId: true, destinationGroup: true },
    }),
    prisma.runnerRepostingGroup.findMany({
      where: {
        runnerId: { not: runnerId },
        status: { in: RESERVED_REPOSTING_GROUP_STATUSES },
      },
      select: {
        runnerId: true,
        whatsappGroupId: true,
        groupName: true,
        discoveredGroup: { select: { groupId: true, name: true } },
      },
    }),
  ]);

  for (const link of activeLinks) {
    const destinations = mergeConfiguredDestinationGroups(
      '',
      link.destinationGroup,
    );
    if (
      destinations.some((group) => requested.has(normalizedDestination(group)))
    ) {
      return { runnerId: link.runnerId, source: 'shop automation' };
    }
  }

  for (const group of repostingGroups) {
    const aliases = [
      group.whatsappGroupId,
      group.discoveredGroup?.groupId,
      group.discoveredGroup?.name,
      group.groupName,
    ].filter(Boolean);
    if (aliases.some((alias) => requested.has(normalizedDestination(alias)))) {
      return { runnerId: group.runnerId, source: 'Phase 1 reposting group' };
    }
  }

  return null;
}

function canonicalRepostGroup(groupIdOrName, chat) {
  return String(
    chat?.id?._serialized || groupIdOrName || chat?.name || '',
  ).trim();
}

async function markListingPosted(
  prisma,
  listing,
  groupIdOrName,
  jobId,
  captionStatus = 'UNKNOWN',
  captionFallbackSent = false,
) {
  const now = new Date();
  const repostLog = await prisma.whatsAppRepostLog.upsert({
    where: {
      runnerId_listingId_groupIdOrName: {
        runnerId: listing.runnerId,
        listingId: listing.id,
        groupIdOrName,
      },
    },
    create: {
      runnerId: listing.runnerId,
      listingId: listing.id,
      groupIdOrName,
      bridgeAccountId: bridgeAccountId || null,
      jobId,
      status: 'POSTED',
      retryCount: 0,
      lastAttemptAt: now,
      nextRetryAt: null,
      failedAt: null,
      captionStatus,
      captionVerifiedAt: new Date(),
      captionFallbackSent,
      postedAt: now,
    },
    update: {
      bridgeAccountId: bridgeAccountId || null,
      jobId,
      status: 'POSTED',
      error: null,
      lastAttemptAt: now,
      nextRetryAt: null,
      captionStatus,
      captionVerifiedAt: new Date(),
      captionFallbackSent,
      postedAt: now,
    },
  });

  await prisma.runnerListing.update({
    where: { id: listing.id },
    data: {
      lastPostedAt: new Date(),
      postCount: { increment: 1 },
    },
  });

  return repostLog;
}

async function logStampedRepostMedia(
  prisma,
  listing,
  groupIdOrName,
  jobId,
  repostLogId,
  sentMedia,
) {
  if (!Array.isArray(sentMedia) || sentMedia.length === 0) return;

  await prisma.whatsAppStampedMediaLog.createMany({
    data: sentMedia.map((item) => ({
      runnerId: listing.runnerId,
      listingId: listing.id,
      repostLogId: repostLogId || null,
      orderCode: listing.orderCode || null,
      groupIdOrName,
      bridgeAccountId: bridgeAccountId || null,
      jobId,
      sourceImageUrl: item.sourceImageUrl,
      imageIndex: item.imageIndex,
      mimetype: item.mimetype || null,
      sourceImageHash: item.sourceImageHash || null,
      stampedImageHash: item.stampedImageHash || null,
      sourceImagePerceptualHash: item.sourceImagePerceptualHash || null,
      stampedImagePerceptualHash: item.stampedImagePerceptualHash || null,
      sentAt: new Date(),
    })),
    skipDuplicates: true,
  });
}

async function markListingRepostFailed(
  prisma,
  listing,
  groupIdOrName,
  jobId,
  error,
) {
  const now = new Date();
  const retryDelayMinutes = runtimeNumberSetting(
    'repostRetryDelayMinutes',
    Number(process.env.WHATSAPP_REPOST_RETRY_DELAY_MINUTES || 30),
    1,
    1440,
  );
  const nextRetryAt = new Date(
    now.getTime() + Math.max(1, retryDelayMinutes) * 60 * 1000,
  );
  const message = errorMessage(error).slice(0, 1000);

  await prisma.whatsAppRepostLog.upsert({
    where: {
      runnerId_listingId_groupIdOrName: {
        runnerId: listing.runnerId,
        listingId: listing.id,
        groupIdOrName,
      },
    },
    create: {
      runnerId: listing.runnerId,
      listingId: listing.id,
      groupIdOrName,
      bridgeAccountId: bridgeAccountId || null,
      jobId,
      status: 'FAILED',
      error: message,
      retryCount: 1,
      lastAttemptAt: now,
      nextRetryAt,
      failedAt: now,
      captionStatus: 'FAILED',
      captionVerifiedAt: null,
      captionFallbackSent: false,
      postedAt: now,
    },
    update: {
      bridgeAccountId: bridgeAccountId || null,
      jobId,
      status: 'FAILED',
      error: message,
      retryCount: { increment: 1 },
      lastAttemptAt: now,
      nextRetryAt,
      failedAt: now,
      captionStatus: 'FAILED',
      captionVerifiedAt: null,
      captionFallbackSent: false,
    },
  });
}

async function sendListingToChat(
  chat,
  listing,
  captionOverride,
  imageOverride,
) {
  const originalPost = originalPostForListing(listing);
  const sourceCaption = String(
    captionOverride || originalPost?.caption || '',
  ).trim();
  const caption = runnerListingCaption(listing, captionOverride);
  const originalPriceCaption =
    shouldAttachOriginalPricePerImage(listing) && sourceCaption
      ? originalPriceOnlyCaption(listing, sourceCaption)
      : '';
  const sourceImages =
    Array.isArray(imageOverride) && imageOverride.length > 0
      ? imageOverride
      : productImages(originalPost?.mediaUrls).length > 0
        ? productImages(originalPost.mediaUrls)
        : productImages(listing.product?.images);
  const images = selectedRepostImages(sourceImages);

  if (images.length === 0) {
    await chat.sendMessage(caption);
    return {
      sentMedia: [],
      captionStatus: 'TEXT_ONLY_VERIFIED',
      captionFallbackSent: false,
    };
  }

  const sentMedia = [];
  let captionStatus = 'UNKNOWN';
  let captionFallbackSent = false;
  for (let index = 0; index < images.length; index += 1) {
    const media = await messageMediaFromUrl(images[index]);
    const sourceFingerprint = await imageFingerprintFromMedia(media);
    const mediaWithOrderCode = await addOrderCodeWatermark(
      media,
      listing.orderCode,
    );
    const stampedFingerprint =
      mediaWithOrderCode === media
        ? sourceFingerprint
        : await imageFingerprintFromMedia(mediaWithOrderCode);
    const sentMessage = await chat.sendMessage(
      mediaWithOrderCode,
      index === images.length - 1
        ? { caption }
        : originalPriceCaption
          ? { caption: originalPriceCaption }
          : undefined,
    );
    if (index === images.length - 1 && caption) {
      const deliveredCaption = String(
        sentMessage?.body || sentMessage?._data?.caption || '',
      ).trim();
      if (!deliveredCaption) {
        console.warn(
          `WhatsApp caption could not be verified for ${listing.orderCode || listing.id}; sending text fallback`,
        );
        await chat.sendMessage(caption);
        captionStatus = 'FALLBACK_SENT';
        captionFallbackSent = true;
      } else {
        captionStatus = 'ATTACHED_VERIFIED';
      }
    }
    sentMedia.push({
      sourceImageUrl: images[index],
      imageIndex: index,
      mimetype: mediaWithOrderCode.mimetype || media.mimetype || null,
      sourceImageHash: sourceFingerprint.sha256,
      sourceImagePerceptualHash: sourceFingerprint.perceptualHash,
      stampedImageHash: stampedFingerprint.sha256,
      stampedImagePerceptualHash: stampedFingerprint.perceptualHash,
    });
    await sleep(500);
  }

  return { sentMedia, captionStatus, captionFallbackSent };
}

function selectedRepostImages(images) {
  const cleanImages = Array.from(
    new Set((images || []).filter((image) => typeof image === 'string')),
  );
  const imagesPerListing = runtimeNumberSetting(
    'repostImagesPerListing',
    repostImagesPerListing,
    0,
    20,
  );
  const cappedImages =
    imagesPerListing <= 0
      ? cleanImages
      : cleanImages.slice(0, Math.max(1, imagesPerListing));
  return cappedImages;
}

function repostProductSeparatorMessage() {
  return runtimeStringSetting(
    'repostProductSeparator',
    process.env.WHATSAPP_REPOST_PRODUCT_SEPARATOR || '━━━━━━━━━━━━',
  );
}

function runnerListingCaption(listing, captionOverride) {
  const sourceCaption = String(
    captionOverride || originalPostForListing(listing)?.caption || '',
  ).trim();
  if (!sourceCaption) {
    throw new Error(
      `Original shop caption is missing for listing ${listing.id}; repost held for review`,
    );
  }
  return appendRunnerOrderDetails(listing, sourceCaption);
}

function activeRunnerSubscriptions(runner) {
  const now = new Date();
  return (runner?.subscriptions || []).filter((subscription) => {
    const start = subscription.currentPeriodStart
      ? new Date(subscription.currentPeriodStart)
      : null;
    const end = subscription.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd)
      : null;
    return (
      subscription.audience === 'RUNNER' &&
      subscription.status === 'ACTIVE' &&
      (!start || start <= now) &&
      (!end || end >= now)
    );
  });
}

function runnerHasActiveAddon(runner, addonKey) {
  return activeRunnerSubscriptions(runner).some((subscription) =>
    Boolean(subscription?.[addonKey]),
  );
}

function effectiveRunnerRepostPriceMode(listing) {
  const mode = String(
    listing?.runner?.repostPriceMode || 'ORIGINAL',
  ).toUpperCase();
  if (mode === 'ORIGINAL') return mode;

  const hasPriceAddon = runnerHasActiveAddon(
    listing?.runner,
    'priceEditingAddonEnabled',
  );
  if (!hasPriceAddon) return 'ORIGINAL';

  if (mode === 'FEE_BREAKDOWN') {
    const runnerPrice = Number(listing?.runnerPrice || 0);
    return Number.isFinite(runnerPrice) && runnerPrice > 0
      ? 'TOTAL_ONLY'
      : 'ORIGINAL';
  }

  return mode;
}
function shouldAttachOriginalPricePerImage(listing) {
  const setup = listing?.runner?.phase1Setup;
  return Boolean(
    runnerHasActiveAddon(listing?.runner, 'shopPriceImageAddonEnabled') &&
    setup &&
    typeof setup === 'object' &&
    setup.repostOriginalPricePerImageEnabled === true,
  );
}

function originalPriceOnlyCaption(listing, sourceCaption) {
  const pricing = parseCaptionPricing(sourceCaption);
  const lines = [];
  const money = (value) => `R${Number(value).toFixed(2)}`;
  const pushPrice = (label, value) => {
    const amount = Number(value || 0);
    if (Number.isFinite(amount) && amount > 0) {
      lines.push(`${label}: ${money(amount)}`);
    }
  };

  if (
    pricing.stockIsBulkPrice &&
    (pricing.bulkUnitPrice || pricing.stockPrice) &&
    (pricing.regularUnitPrice || pricing.eachPrice) &&
    !pricing.bulkQuantity
  ) {
    pushPrice(
      'Original stock/bulk price',
      pricing.bulkUnitPrice || pricing.stockPrice,
    );
    pushPrice(
      'Original each/retail price',
      pricing.regularUnitPrice || pricing.eachPrice,
    );
  } else if (pricing.bulkQuantity && pricing.bulkTotal) {
    if (pricing.regularUnitPrice) {
      pushPrice('Original unit price', pricing.regularUnitPrice);
    }
    lines.push(
      `Original bulk price: ${pricing.bulkQuantity} for ${money(pricing.bulkTotal)}`,
    );
    pushPrice('Original bulk each', pricing.bulkUnitPrice);
  } else {
    pushPrice(
      'Original price',
      pricing.basePrice || listing?.product?.basePrice || 0,
    );
  }

  return lines.join('\n');
}

function compactRunnerFeeCaption(listing, sourceCaption) {
  const markup = Math.max(0, Number(listing?.markup || 0));
  const multiplier = 1 + markup;
  const feePercent = Math.round(markup * 100);
  const runnerPrice = Number(listing?.runnerPrice || 0);
  const pricing = parseCaptionPricing(sourceCaption);
  const lines = [`*${listing?.product?.name || 'Item'}*`];

  if (
    pricing.stockIsBulkPrice &&
    pricing.bulkUnitPrice &&
    pricing.regularUnitPrice &&
    !pricing.bulkQuantity
  ) {
    const stockPrice =
      runnerPrice > 0 ? runnerPrice : pricing.bulkUnitPrice * multiplier;
    const retailPrice = pricing.regularUnitPrice * multiplier;
    lines.push(
      `Stock: R ${stockPrice.toFixed(2)} | Each: R ${retailPrice.toFixed(2)}`,
    );
  } else if (
    pricing.bulkQuantity &&
    pricing.bulkTotal &&
    pricing.bulkUnitPrice
  ) {
    const unitBase = pricing.regularUnitPrice || pricing.bulkUnitPrice;
    const runnerUnit = unitBase * multiplier;
    const runnerBulkTotal = pricing.bulkTotal * multiplier;
    const runnerBulkUnit = pricing.bulkUnitPrice * multiplier;
    const money = (value) => `R${value.toFixed(2).replace(/\.00$/, '')}`;
    lines.push(
      '',
      `1 for ${money(unitBase)}`,
      `Runner price: ${money(runnerUnit)}`,
      feePercent > 0 ? `(+${feePercent}% runner fee)` : '',
      '',
      `${pricing.bulkQuantity} for ${money(pricing.bulkTotal)}`,
      pricing.bulkSavings > 0
        ? `Bulk Save: R${pricing.bulkSavings.toFixed(2)}`
        : '',
      `Runner price: ${money(runnerBulkTotal)}`,
      `(${money(runnerBulkUnit)} each${feePercent > 0 ? `, +${feePercent}% runner fee` : ''})`,
    );
  } else if (runnerPrice > 0) {
    lines.push(`Price: R ${runnerPrice.toFixed(2)}`);
  }

  if (!pricing.bulkQuantity) {
    lines.push(
      feePercent > 0
        ? `Runner fee: ${feePercent}% included`
        : 'Final runner price',
    );
  }
  const sizeLine = String(sourceCaption || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^(?:free\s+size|sizes?\b)/i.test(line));
  if (sizeLine) lines.push(sizeLine.replace(/^sizes?\s*[:=-]?\s*/i, 'Size: '));

  return lines.filter(Boolean).join('\n');
}

function appendCapturedPricingSummary(caption) {
  const cleanCaption = String(caption || '').trim();
  if (/\bbulk price\s*:/i.test(cleanCaption)) return cleanCaption;

  const pricing = parseCaptionPricing(cleanCaption);
  if (
    pricing.stockIsBulkPrice &&
    pricing.regularUnitPrice &&
    pricing.bulkUnitPrice &&
    !pricing.bulkQuantity
  ) {
    const lines = [
      `Each/Retail price: R ${pricing.regularUnitPrice.toFixed(2)}`,
      `Stock/Bulk price: R ${pricing.bulkUnitPrice.toFixed(2)} per item`,
    ];
    if (pricing.bulkSavingsPerItem > 0) {
      lines.push(
        `Stock/Bulk saving: R ${pricing.bulkSavingsPerItem.toFixed(2)} per item (${pricing.bulkSavingsPercent}% off)`,
      );
    }
    return [cleanCaption, lines.join('\n')].filter(Boolean).join('\n\n');
  }

  if (!pricing.bulkQuantity || !pricing.bulkTotal || !pricing.bulkUnitPrice) {
    return cleanCaption;
  }

  const lines = [];
  if (pricing.regularUnitPrice) {
    lines.push(`Unit price: R ${pricing.regularUnitPrice.toFixed(2)}`);
  } else {
    lines.push(`Bulk unit price: R ${pricing.bulkUnitPrice.toFixed(2)} each`);
  }
  lines.push(
    `Bulk price: ${pricing.bulkQuantity} for R ${pricing.bulkTotal.toFixed(2)} (R ${pricing.bulkUnitPrice.toFixed(2)} each)`,
  );
  if (pricing.bulkSavings > 0) {
    lines.push(
      `Save R ${pricing.bulkSavings.toFixed(2)} when buying ${pricing.bulkQuantity} (R ${pricing.bulkSavingsPerItem.toFixed(2)} each, ${pricing.bulkSavingsPercent}% off)`,
    );
  }

  return [cleanCaption, lines.join('\n')].filter(Boolean).join('\n\n');
}

function appendRunnerFinalPrice(listing, caption) {
  if (
    !runtimeBooleanSetting('showRunnerPriceOnRepost', showRunnerPriceOnRepost)
  ) {
    return caption;
  }

  const runnerPrice = Number(listing?.runnerPrice);
  if (!Number.isFinite(runnerPrice) || runnerPrice <= 0) return caption;

  const markup = Number(listing?.markup || 0);
  const pricing = parseCaptionPricing(caption);
  if (
    Number.isFinite(markup) &&
    markup > 0 &&
    pricing.stockIsBulkPrice &&
    pricing.bulkUnitPrice &&
    !pricing.bulkQuantity
  ) {
    const runnerRetailPrice =
      Math.round(pricing.regularUnitPrice * (1 + markup) * 100) / 100;
    const lines = [
      `Runner stock/bulk price: R ${runnerPrice.toFixed(2)} per item (Includes runner fee: ${Math.round(markup * 100)}%; original stock/bulk price: R ${pricing.bulkUnitPrice.toFixed(2)})`,
      `Runner each/retail price: R ${runnerRetailPrice.toFixed(2)} per item (Includes runner fee: ${Math.round(markup * 100)}%; original each/retail price: R ${pricing.regularUnitPrice.toFixed(2)})`,
    ];
    const missingLines = lines.filter(
      (line) => !String(caption || '').includes(line),
    );
    if (missingLines.length === 0) return caption;
    return [String(caption || '').trim(), missingLines.join('\n')]
      .filter(Boolean)
      .join('\n');
  }

  if (
    Number.isFinite(markup) &&
    markup > 0 &&
    pricing.bulkQuantity &&
    pricing.bulkTotal &&
    pricing.bulkUnitPrice
  ) {
    if (/\bbulk with runner fee\s*:/i.test(caption)) return caption;

    const multiplier = 1 + markup;
    const runnerBulkTotal =
      Math.round(pricing.bulkTotal * multiplier * 100) / 100;
    const runnerBulkUnit =
      Math.round(pricing.bulkUnitPrice * multiplier * 100) / 100;
    const lines = [];
    if (pricing.regularUnitPrice) {
      const runnerRegularUnit =
        Math.round(pricing.regularUnitPrice * multiplier * 100) / 100;
      lines.push(
        `Unit price with runner fee: R ${runnerRegularUnit.toFixed(2)}`,
      );
    }
    lines.push(
      `Bulk with runner fee: ${pricing.bulkQuantity} for R ${runnerBulkTotal.toFixed(2)} (R ${runnerBulkUnit.toFixed(2)} each, includes ${Math.round(markup * 100)}% runner fee)`,
    );
    if (pricing.bulkSavings > 0) {
      const runnerSavings =
        Math.round(pricing.bulkSavings * multiplier * 100) / 100;
      lines.push(`Bulk saving with runner fee: R ${runnerSavings.toFixed(2)}`);
    }

    return [String(caption || '').trim(), lines.join('\n')]
      .filter(Boolean)
      .join('\n');
  }

  const feeText =
    Number.isFinite(markup) && markup > 0
      ? `Includes runner fee: ${Math.round(markup * 100)}%`
      : 'Final runner price';
  const line = `Runner price: R ${runnerPrice.toFixed(2)} (${feeText})`;

  if (String(caption || '').includes(line)) return caption;
  return [String(caption || '').trim(), line].filter(Boolean).join('\n');
}

function repostSendDelayMs() {
  return runtimeNumberSetting(
    'repostSendDelayMs',
    Number(process.env.WHATSAPP_REPOST_SEND_DELAY_MS || 90000),
    250,
    30000,
  );
}

function shopRepostSendDelayMs() {
  return runtimeNumberSetting(
    'shopRepostSendDelayMs',
    Number(process.env.WHATSAPP_SHOP_REPOST_SEND_DELAY_MS || 90000),
    250,
    30000,
  );
}

function bridgeRepostMaxRetryCount() {
  return runtimeNumberSetting(
    'repostMaxRetryCount',
    repostMaxRetryCount,
    0,
    20,
  );
}

function originalPostForListing(listing) {
  return Array.isArray(listing.product?.whatsappImports)
    ? listing.product.whatsappImports[0]
    : null;
}

function orderPromptFields(listing) {
  return [];
}

function customerOrderTemplate(listing) {
  return orderPromptFields(listing).join('\n');
}

function stripCustomerOrderPrompts(caption) {
  return String(caption || '')
    .split('\n')
    .filter((line) => {
      const clean = line.trim();

      return (
        !/^to order,\s*fill and send:?$/i.test(clean) &&
        !/^size\s*:/i.test(clean) &&
        !/^color\s*:/i.test(clean) &&
        !/^quantity\s*:/i.test(clean) &&
        !/^(?:base price|total price)\s*:/i.test(clean.replace(/\*/g, '')) &&
        !/^runner fee\s*:\s*R\s*\d/i.test(clean) &&
        !/^order code\s*:/i.test(clean) &&
        !/^order\s*:\s*https?:\/\/wa\.me\/\d+/i.test(clean) &&
        !/^[-_=─━]{10,}$/.test(clean) &&
        !/^order(?:\s+RC-[A-Z0-9-]+)?\s*:/i.test(clean) &&
        !/^forward your order with code\s*:/i.test(clean) &&
        !/^forward your order (?:to|here):\s*https?:\/\/wa\.me\/\d+/i.test(
          clean,
        )
      );
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function whatsappDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function bridgeAccountPhone() {
  return (
    client?.info?.wid?._serialized ||
    client?.info?.me?._serialized ||
    client?.info?.wid?.user ||
    ''
  );
}

function orderIntakeDigits(listing) {
  return (
    whatsappDigits(
      listing.runner?.phone || listing.runner?.user?.phone || '',
    ) ||
    whatsappDigits(orderIntakePhone) ||
    whatsappDigits(bridgeAccountPhone())
  );
}

function runnerOrderLine(listing, sourceCaption = '') {
  const digits = orderIntakeDigits(listing);
  const code = String(listing?.orderCode || '').trim();
  const link = digits
    ? `https://wa.me/${digits}${
        code ? `?text=${encodeURIComponent(`Order code: ${code}`)}` : ''
      }`
    : '';
  const basePrice = Number(listing?.product?.basePrice || 0);
  const totalPrice = Number(listing?.runnerPrice || 0);
  const runnerFee = Math.max(0, totalPrice - basePrice);
  const feePercent =
    basePrice > 0
      ? Math.round((runnerFee / basePrice) * 100)
      : Math.round(Math.max(0, Number(listing?.markup || 0)) * 100);
  const priceMode = effectiveRunnerRepostPriceMode(listing);
  const showOrderDetails = listing?.runner?.repostOrderDetailsEnabled !== false;
  const showFeePercentage =
    runnerHasActiveAddon(listing?.runner, 'priceEditingAddonEnabled') &&
    listing?.runner?.repostFeePercentageEnabled !== false;
  const sections = [];

  if (priceMode === 'STOCK_EACH_TOTALS') {
    const pricing = parseCaptionPricing(sourceCaption);
    const stockBase = Number(pricing.bulkUnitPrice || pricing.stockPrice || 0);
    const eachBase = Number(pricing.regularUnitPrice || pricing.eachPrice || 0);
    const markup = Math.max(0, Number(listing?.markup || 0));
    const multiplier = 1 + markup;

    if (
      (pricing.stockIsBulkPrice || pricing.bulkQuantity) &&
      stockBase > 0 &&
      eachBase > 0
    ) {
      const explicitBulk = Number(pricing.bulkQuantity || 0) > 0;
      const bulkBase = explicitBulk
        ? Number(pricing.bulkTotal || stockBase * pricing.bulkQuantity)
        : stockBase;
      const stockRunnerPrice = Math.round(bulkBase * multiplier * 100) / 100;
      const eachRunnerPrice = Math.round(eachBase * multiplier * 100) / 100;
      const bulkLabel = explicitBulk ? `${pricing.bulkQuantity} FOR` : 'STOCK';
      sections.push(
        [
          showFeePercentage && feePercent > 0
            ? `(Including ${feePercent}% Runner Fee)`
            : '(Including Runner Fee)',
          '---------------------',
          `*${bulkLabel} R${stockRunnerPrice.toFixed(2)}*`,
          `*EACH R${eachRunnerPrice.toFixed(2)}*`,
          '---------------------',
        ].join('\n'),
      );
    } else if (totalPrice > 0) {
      sections.push(
        [
          '---------------------',
          `*Runner Price: R${totalPrice.toFixed(2)}*`,
          showFeePercentage && feePercent > 0
            ? `(Including ${feePercent}% Runner Fee)`
            : '(Including Runner Fee)',
          '---------------------',
        ].join('\n'),
      );
    }
  } else if (priceMode === 'TOTAL_ONLY' && totalPrice > 0) {
    sections.push(
      [
        '---------------------',
        `*Runner Price: R${totalPrice.toFixed(2)}*`,
        '(Includes Runner Fee)',
        '---------------------',
      ].join('\n'),
    );
  }

  if (showOrderDetails) {
    sections.push(
      [
        priceMode === 'ORIGINAL' ? '---------------------' : '',
        code ? `Order code: ${code}` : '',
        link ? `Order: ${link}` : 'Order: Contact your runner on WhatsApp',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return sections.filter(Boolean).join('\n');
}

function appendRunnerOrderDetails(listing, caption) {
  const text = String(caption || '').trim();
  const runnerLine = runnerOrderLine(listing, text);
  return [text, runnerLine].filter(Boolean).join('\n\n');
}

async function ensureListingOrderCode(prisma, listing) {
  if (listing.orderCode) return listing;

  let lastError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.runnerListing.update({
        where: { id: listing.id },
        data: { orderCode: createOrderCode() },
        include: {
          product: {
            include: {
              shop: {
                select: {
                  id: true,
                  name: true,
                },
              },
              whatsappImports: {
                select: {
                  caption: true,
                  mediaUrls: true,
                  parsedDraft: true,
                  receivedAt: true,
                },
                orderBy: { receivedAt: 'desc' },
                take: 1,
              },
            },
          },
          runner: {
            include: {
              user: {
                select: {
                  name: true,
                  phone: true,
                },
              },
              subscriptions: {
                where: { audience: 'RUNNER', status: 'ACTIVE' },
                select: {
                  audience: true,
                  status: true,
                  priceEditingAddonEnabled: true,
                  shopPriceImageAddonEnabled: true,
                  currentPeriodStart: true,
                  currentPeriodEnd: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 3,
              },
            },
          },
        },
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function createOrderCode() {
  return `RC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function messageMediaFromUrl(mediaUrl) {
  const localPath = localUploadPathFromUrl(mediaUrl);

  if (localPath && fs.existsSync(localPath)) {
    return MessageMedia.fromFilePath(localPath);
  }

  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(
      `Could not fetch image ${mediaUrl}: HTTP ${response.status}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mimetype = response.headers.get('content-type') || 'image/jpeg';
  const filename = path.basename(new URL(mediaUrl).pathname) || 'product.jpg';
  return new MessageMedia(mimetype, buffer.toString('base64'), filename);
}

async function addOrderCodeWatermark(media, orderCode) {
  const code = String(orderCode || '').trim();
  const mimetype = String(media?.mimetype || '').toLowerCase();

  if (!code || !mimetype.startsWith('image/')) return media;
  if (mimetype.includes('gif') || mimetype.includes('svg')) return media;

  try {
    const input = Buffer.from(media.data, 'base64');
    const metadata = await sharp(input).metadata();
    const width = metadata.width || 1080;
    const height = metadata.height || 1080;
    const fontSize = Math.max(30, Math.round(Math.min(width, height) * 0.045));
    const horizontalPadding = Math.round(fontSize * 0.65);
    const verticalPadding = Math.round(fontSize * 0.45);
    const margin = Math.max(18, Math.round(fontSize * 0.55));
    const estimatedTextWidth = Math.round(fontSize * (code.length * 0.62));
    const boxWidth = Math.min(
      width - margin * 2,
      estimatedTextWidth + horizontalPadding * 2,
    );
    const boxHeight = fontSize + verticalPadding * 2;
    const x = Math.max(margin, width - boxWidth - margin);
    const y = Math.max(margin, height - boxHeight - margin);
    const escapedCode = escapeSvgText(code);

    const svg = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="${Math.round(fontSize * 0.35)}" fill="rgba(0,0,0,0.72)"/>
        <text x="${x + horizontalPadding}" y="${y + verticalPadding + fontSize * 0.78}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff">${escapedCode}</text>
      </svg>
    `);

    const pipeline = sharp(input)
      .rotate()
      .composite([{ input: svg }]);
    const outputMime = mimetype.includes('png')
      ? 'image/png'
      : mimetype.includes('webp')
        ? 'image/webp'
        : 'image/jpeg';
    const outputBuffer =
      outputMime === 'image/png'
        ? await pipeline.png().toBuffer()
        : outputMime === 'image/webp'
          ? await pipeline.webp({ quality: 92 }).toBuffer()
          : await pipeline.jpeg({ quality: 92 }).toBuffer();

    return new MessageMedia(
      outputMime,
      outputBuffer.toString('base64'),
      media.filename || `runner-commerce-${code}.jpg`,
    );
  } catch (error) {
    console.warn(
      `Could not add order code watermark ${code}: ${error.message}`,
    );
    return media;
  }
}

async function imageFingerprintFromMedia(media) {
  const mimetype = String(media?.mimetype || '').toLowerCase();
  const buffer = media?.data
    ? Buffer.from(media.data, 'base64')
    : Buffer.alloc(0);
  const sha256 = buffer.length
    ? crypto.createHash('sha256').update(buffer).digest('hex')
    : null;

  if (
    !buffer.length ||
    !mimetype.startsWith('image/') ||
    mimetype.includes('svg')
  ) {
    return { sha256, perceptualHash: null };
  }

  try {
    const raw = await sharp(buffer)
      .rotate()
      .resize(8, 8, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer();
    const average =
      raw.reduce((total, value) => total + Number(value || 0), 0) / raw.length;
    const bits = Array.from(raw, (value) => (value >= average ? '1' : '0'));
    const perceptualHash = BigInt(`0b${bits.join('')}`)
      .toString(16)
      .padStart(16, '0');
    return { sha256, perceptualHash };
  } catch {
    return { sha256, perceptualHash: null };
  }
}

function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function localUploadPathFromUrl(mediaUrl) {
  const clean = String(mediaUrl || '').trim();
  if (clean.startsWith('/uploads/')) {
    return path.join(
      uploadRoot,
      decodeURIComponent(clean.replace(/^\/uploads\//, '')),
    );
  }
  try {
    const parsed = new URL(clean);
    if (!parsed.pathname.startsWith('/uploads/')) return null;
    return path.join(
      uploadRoot,
      decodeURIComponent(parsed.pathname.replace(/^\/uploads\//, '')),
    );
  } catch {
    return null;
  }
}

function productImages(images) {
  if (!images) return [];
  if (Array.isArray(images))
    return images.filter((image) => typeof image === 'string');
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed)
        ? parsed.filter((image) => typeof image === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function listingIdsFromArgs() {
  const fromCsv = String(argValue('listing-ids') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([...fromCsv, ...argValues('listing-id')])];
}

async function safeReadText(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function startGroupDiscoveryScheduler() {
  if (groupDiscoveryIntervalMs <= 0) {
    console.log('WhatsApp group discovery sync is disabled.');
    return;
  }

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await syncDiscoveredGroupsWithBackend();
      await syncDiscoveredChannelsWithBackend();
    } catch (error) {
      console.error(`WhatsApp discovery sync failed: ${errorMessage(error)}`);
      if (isFatalWhatsAppSessionError(error)) requestBridgeRestart(error);
    } finally {
      running = false;
    }
  };

  console.log(
    `WhatsApp group discovery sync active every ${Math.round(groupDiscoveryIntervalMs / 60000)} minute(s).`,
  );
  setInterval(tick, groupDiscoveryIntervalMs);
}

async function syncDiscoveredGroupsWithBackend() {
  const groups = await retry(
    () => listGroupsFromPageStore(),
    3,
    10000,
    'syncing authenticated WhatsApp groups',
  );

  if (
    groups.length === 0 &&
    process.env.WHATSAPP_ALLOW_EMPTY_GROUP_SYNC !== 'true'
  ) {
    throw new Error(
      'WhatsApp group discovery returned 0 groups; refusing to sync an empty group list because the session may be logged out or WhatsApp Web may not be fully loaded.',
    );
  }

  const shouldSyncProfileImages = runtimeBooleanSetting(
    'syncGroupProfileImagesDuringDiscovery',
    syncGroupProfileImagesDuringDiscovery,
  );
  const profileImageSyncLimit = runtimeNumberSetting(
    'groupProfileImageSyncLimit',
    groupProfileImageSyncLimit,
    0,
    500,
  );
  const groupsWithProfileImages = shouldSyncProfileImages
    ? await addGroupProfileImages(groups, profileImageSyncLimit)
    : groups;
  const response = await fetch(
    `${backendUrl}/whatsapp-imports/webhook/discovered-groups`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-whatsapp-ingest-secret': ingestSecret,
      },
      body: JSON.stringify({
        bridgeAccountId: bridgeAccountId || undefined,
        authenticatedPhone: bridgeAccountPhone() || undefined,
        authenticatedName:
          client?.info?.pushname || client?.info?.displayName || undefined,
        groups: groupsWithProfileImages.map((group) => ({
          groupId: group.id,
          name: group.name || group.id,
          creatorId: group.creatorId,
          creatorPhone: group.creatorPhone,
          participants: group.participants || 0,
          participantPhones: group.participantPhones || [],
          profileImageUrl: group.profileImageUrl || undefined,
        })),
      }),
    },
  );
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Could not sync discovered groups: HTTP ${response.status} ${body}`,
    );
  }

  const payload = JSON.parse(body);
  console.log(
    `Synced ${payload.synced || groups.length} authenticated WhatsApp group(s).`,
  );
  return payload;
}

async function syncDiscoveredChannelsWithBackend() {
  const channels = await retry(
    () => listChannelsFromClient(),
    3,
    10000,
    'syncing authenticated WhatsApp channels',
  );

  const response = await fetch(
    `${backendUrl}/whatsapp-imports/webhook/discovered-channels`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-whatsapp-ingest-secret': ingestSecret,
      },
      body: JSON.stringify({
        bridgeAccountId: bridgeAccountId || undefined,
        channels: channels.map((channel) => ({
          channelId: channel.id,
          name: channel.name || channel.id,
          description: channel.description || undefined,
          isReadOnly: Boolean(channel.isReadOnly),
          unreadCount: channel.unreadCount || 0,
          subscriberCount: channel.subscriberCount || undefined,
          inviteLink: channel.inviteLink || undefined,
          timestamp: channel.timestamp || undefined,
        })),
      }),
    },
  );
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Could not sync discovered channels: HTTP ${response.status} ${body}`,
    );
  }

  const payload = JSON.parse(body);
  console.log(
    `Synced ${payload.synced || channels.length} authenticated WhatsApp channel(s).`,
  );
  return payload;
}

async function addGroupProfileImages(
  groups,
  syncLimit = groupProfileImageSyncLimit,
) {
  const limit = Math.max(0, syncLimit);
  if (!limit || !Array.isArray(groups) || groups.length === 0) {
    return groups;
  }

  await fsp.mkdir(groupProfileImageUploadDir, { recursive: true });
  const enriched = [];

  for (const group of groups) {
    if (enriched.length >= limit) {
      enriched.push(group);
      continue;
    }

    try {
      const profileImageUrl = await downloadGroupProfileImage(group.id);
      enriched.push({ ...group, profileImageUrl });
    } catch (error) {
      console.warn(
        `Could not fetch group profile image for ${group.name || group.id}: ${errorMessage(error)}`,
      );
      enriched.push(group);
    }
  }

  return enriched;
}

async function downloadGroupProfileImage(groupId) {
  if (!groupId || !String(groupId).endsWith('@g.us')) return null;

  const remoteUrl = await client.getProfilePicUrl(groupId);
  if (!remoteUrl) return null;

  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading group avatar`);
  }

  const contentType = response.headers.get('content-type') || '';
  const extension = contentType.includes('png')
    ? 'png'
    : contentType.includes('webp')
      ? 'webp'
      : 'jpg';
  const fileName = `${safeFilePart(groupId)}.${extension}`;
  const filePath = path.join(groupProfileImageUploadDir, fileName);
  const bytes = Buffer.from(await response.arrayBuffer());

  await fsp.writeFile(filePath, bytes);

  return `${groupProfileImagePublicBase.replace(/\/+$/, '')}/${fileName}`;
}

function safeFilePart(value) {
  return String(value || 'group')
    .replace(/@/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 180);
}

function startHourlyCaptureScheduler() {
  if (!shopCaptureEnabled) {
    console.log('Hourly shop capture catch-up is disabled.');
    return;
  }

  if (autoCaptureIntervalMs <= 0) {
    console.log('Hourly shop capture catch-up is disabled.');
    return;
  }

  let running = false;

  const tick = async () => {
    if (running) return;
    if (!isCaptureWindow()) {
      console.log(
        `Shop capture deferred: current bridge window=${currentBridgeWindow()}; capture resumes in ${Math.ceil(msUntilNextCaptureWindow() / 60000)} minute(s).`,
      );
      return;
    }
    await waitForRunnerBotPriority('scheduled-capture start');
    if (!beginHeavyBridgeOperation('scheduled-capture')) {
      console.log(
        `Shop capture deferred: ${heavyBridgeOperation || 'bridge work'} is active.`,
      );
      return;
    }
    running = true;
    try {
      await captureMappedGroupsSinceLastCapture();
    } catch (error) {
      console.error(`Hourly shop capture failed: ${errorMessage(error)}`);
      if (isFatalWhatsAppSessionError(error)) requestBridgeRestart(error);
    } finally {
      running = false;
      endHeavyBridgeOperation('scheduled-capture');
    }
  };

  console.log(
    'Shop capture scheduler active in the 15-minute capture half of each 30-minute cycle.',
  );
  const scheduleCaptureTick = () => {
    const now = new Date();
    const nextBoundary = new Date(now);
    const remainder = now.getMinutes() % 30;
    nextBoundary.setMinutes(now.getMinutes() + (30 - remainder), 0, 0);
    const delay = Math.max(1000, nextBoundary.getTime() - now.getTime());
    setTimeout(async () => {
      await tick();
      scheduleCaptureTick();
    }, delay).unref?.();
  };
  if (isCaptureWindow()) setTimeout(tick, 1000).unref?.();
  scheduleCaptureTick();
}

async function captureMappedGroupsSinceLastCapture(shopIds = null) {
  const capabilities = await getBridgeCapabilities();
  if (!capabilities.canCapture) {
    console.log(`Shop capture skipped: ${capabilities.reason}`);
    return {
      groups: 0,
      scanned: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
      disabled: true,
      reason: capabilities.reason,
    };
  }

  const selectedShopIds =
    Array.isArray(shopIds) && shopIds.length > 0 ? new Set(shopIds) : null;
  const groupEntries = (await getMappedGroupEntries()).filter((mapping) =>
    selectedShopIds ? selectedShopIds.has(mapping.shopId) : true,
  );
  const summary = {
    groups: groupEntries.length,
    scanned: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
  };

  if (groupEntries.length === 0) {
    return summary;
  }

  for (const mapping of groupEntries) {
    await waitForRunnerBotPriority('scheduled-capture group');
    if (!isCaptureWindow()) {
      console.log(
        `Hourly shop capture paused at capture window boundary: groups=${summary.groups} scanned=${summary.scanned} queued=${summary.queued} skipped=${summary.skipped} failed=${summary.failed}`,
      );
      break;
    }
    const { groupIdOrName, shopId } = mapping;
    pendingMediaByKey.clear();
    pendingTextByKey.clear();

    let chat;
    try {
      chat = await resolveMappedChat(groupIdOrName);
    } catch (error) {
      const message = errorMessage(error);
      console.warn(
        `Could not resolve mapped group for hourly capture: ${groupIdOrName}: ${message}`,
      );
      await updateCaptureState(shopId, {
        groupId: groupIdOrName,
        sourceGroup: groupIdOrName,
        status: 'FAILED',
        lastScanCompletedAt: new Date().toISOString(),
        lastError: message,
        messagesScanned: 0,
        productsCaptured: 0,
        productsSkipped: 0,
        productsFailed: 1,
      });
      summary.failed += 1;
      continue;
    }
    if (!chat) {
      console.warn(
        `Could not find mapped group for hourly capture: ${groupIdOrName}`,
      );
      await updateCaptureState(shopId, {
        groupId: groupIdOrName,
        sourceGroup: groupIdOrName,
        status: 'FAILED',
        lastScanCompletedAt: new Date().toISOString(),
        lastError: 'Mapped WhatsApp group was not found',
        messagesScanned: 0,
        productsCaptured: 0,
        productsSkipped: 0,
        productsFailed: 1,
      });
      summary.failed += 1;
      continue;
    }

    const groupId = chat.id?._serialized || groupIdOrName;
    const sourceGroup = chat.name || groupId;
    const state = await fetchCaptureState(shopId, groupId);
    const from = state.lastCapturedAt ? new Date(state.lastCapturedAt) : null;
    const toMs = Date.now();
    const fromMs = from ? from.getTime() : null;

    await updateCaptureState(shopId, {
      groupId,
      sourceGroup,
      status: 'SCANNING',
      lastScanStartedAt: new Date().toISOString(),
    });

    let messages;
    try {
      messages = await retry(
        () =>
          chat.fetchMessages({
            limit: Math.max(
              1,
              Math.min(
                Number(mapping.captureLimitPerRun || backfillLimit),
                backfillLimit,
              ),
            ),
          }),
        3,
        10000,
        `hourly capture messages for ${sourceGroup}`,
      );
    } catch (error) {
      const message = errorMessage(error);
      console.error(`Hourly capture skipped ${sourceGroup}: ${message}`);
      await updateCaptureState(shopId, {
        groupId,
        sourceGroup,
        status: 'FAILED',
        lastScanCompletedAt: new Date().toISOString(),
        lastError: message,
        messagesScanned: 0,
        productsCaptured: 0,
        productsSkipped: 0,
        productsFailed: 1,
      });
      summary.failed += 1;
      continue;
    }

    let scanned = 0;
    let queued = 0;
    let skipped = 0;
    let failed = 0;
    let latestScannedTimestampMs = null;
    let latestScannedMessageId = null;
    const checkpointCandidates = [];
    const unresolvedMediaKeys = new Set();
    const sortedMessages = messages.sort(
      (a, b) => messageTimestampMs(a) - messageTimestampMs(b),
    );
    const oldestFetchedMs = sortedMessages[0]
      ? messageTimestampMs(sortedMessages[0])
      : null;
    const backlogMayExceedFetchLimit =
      Boolean(fromMs) &&
      messages.length >= backfillLimit &&
      oldestFetchedMs !== null &&
      oldestFetchedMs > fromMs + mediaPairingWindowMs;

    for (const message of sortedMessages) {
      const timestampMs = messageTimestampMs(message);

      if (timestampMs > toMs) {
        skipped += 1;
        continue;
      }

      const isPreWindowMedia =
        fromMs &&
        timestampMs < fromMs &&
        message.hasMedia &&
        timestampMs >= fromMs - mediaPairingWindowMs;

      if (fromMs && timestampMs < fromMs && !isPreWindowMedia) {
        skipped += 1;
        continue;
      }

      scanned += 1;

      try {
        const capture = await buildCaptureFromMessage(
          message,
          chat,
          groupId,
          shopId,
        );

        checkpointCandidates.push({
          timestampMs,
          messageId: messageIdFromMessage(message),
          bufferKey: capture?.bufferKey || null,
        });

        if (capture?.buffered) {
          unresolvedMediaKeys.add(capture.bufferKey);
          console.log(
            `Capture pending ${sourceGroup}: media=${capture.mediaCount} ` +
              `message=${messageIdFromMessage(message) || 'unknown'} ` +
              `caption=${JSON.stringify(String(message.body || '').slice(0, 160))}`,
          );
          continue;
        }

        if (capture?.bufferKey) {
          unresolvedMediaKeys.delete(capture.bufferKey);
        }

        if (!capture) continue;
        if (fromMs && timestampMs < fromMs) continue;

        await queuePost(shopId, {
          caption: capture.caption,
          sourceGroup,
          senderPhone: normalizeSender(message.author || message.from),
          messageId: capture.messageId,
          mediaUrls: capture.mediaUrls,
          receivedAt: new Date(timestampMs).toISOString(),
        });
        await repostShopCaptureToDestinations({
          shopId,
          sourceGroupId: groupId,
          sourceGroupName: sourceGroup,
          capture,
        });
        queued += 1;
      } catch (error) {
        failed += 1;
        console.error(
          `Hourly capture failed for ${sourceGroup}: ${errorMessage(error)}`,
        );
      }
    }

    const flushedTextFirst = await flushPendingTextCaptures({
      shopId,
      sourceGroup,
      groupId,
      fromMs,
      toMs,
    });
    queued += flushedTextFirst.queued;
    failed += flushedTextFirst.failed;
    for (const key of flushedTextFirst.resolvedKeys) {
      unresolvedMediaKeys.delete(key);
    }

    const earliestUnresolvedTimestampMs = checkpointCandidates
      .filter((candidate) => unresolvedMediaKeys.has(candidate.bufferKey))
      .reduce(
        (earliest, candidate) =>
          earliest === null
            ? candidate.timestampMs
            : Math.min(earliest, candidate.timestampMs),
        null,
      );
    const safeCheckpoint = [...checkpointCandidates]
      .reverse()
      .find(
        (candidate) =>
          earliestUnresolvedTimestampMs === null ||
          candidate.timestampMs < earliestUnresolvedTimestampMs,
      );
    latestScannedTimestampMs = safeCheckpoint?.timestampMs ?? null;
    latestScannedMessageId = safeCheckpoint?.messageId ?? null;

    console.log(
      `Hourly capture ${sourceGroup}: scanned=${scanned} queued=${queued} skipped=${skipped} failed=${failed}`,
    );

    const completedAt = new Date().toISOString();
    if (failed > 0) {
      await updateCaptureState(shopId, {
        groupId,
        sourceGroup,
        status: 'FAILED',
        lastScanCompletedAt: completedAt,
        lastError: `${failed} message(s) failed during capture`,
        messagesScanned: scanned,
        productsCaptured: queued,
        productsSkipped: skipped,
        productsFailed: failed,
      });
    } else if (unresolvedMediaKeys.size > 0) {
      await updateCaptureState(shopId, {
        groupId,
        sourceGroup,
        status: 'PARTIAL',
        lastScanCompletedAt: completedAt,
        lastError: `${unresolvedMediaKeys.size} media cluster(s) still waiting for a matching product description`,
        messagesScanned: scanned,
        productsCaptured: queued,
        productsSkipped: skipped,
        productsFailed: failed,
      });
    } else if (backlogMayExceedFetchLimit) {
      await updateCaptureState(shopId, {
        groupId,
        sourceGroup,
        status: 'PARTIAL',
        lastScanCompletedAt: completedAt,
        lastError:
          'Backlog may exceed fetch limit; increase WHATSAPP_SESSION_BACKFILL_LIMIT and rerun capture',
        messagesScanned: scanned,
        productsCaptured: queued,
        productsSkipped: skipped,
        productsFailed: failed,
      });
    } else {
      await updateCaptureState(shopId, {
        groupId,
        sourceGroup,
        status: 'COMPLETED',
        lastScanCompletedAt: completedAt,
        lastFullyCapturedAt: latestScannedTimestampMs
          ? new Date(latestScannedTimestampMs).toISOString()
          : undefined,
        lastFullyCapturedMessageId: latestScannedMessageId,
        messagesScanned: scanned,
        productsCaptured: queued,
        productsSkipped: skipped,
        productsFailed: failed,
      });
    }

    summary.scanned += scanned;
    summary.queued += queued;
    summary.skipped += skipped;
    summary.failed += failed;
  }

  console.log(
    `Hourly shop capture sweep completed: groups=${summary.groups} scanned=${summary.scanned} queued=${summary.queued} skipped=${summary.skipped} failed=${summary.failed}`,
  );

  return summary;
}

async function backfillMappedGroupsAndExit() {
  const groupEntries = await getMappedGroupEntries();
  const fromArg = argValue('from') || argValue('since');
  const toArg = argValue('to') || argValue('until');
  let totalFetched = 0;
  let totalScanned = 0;
  let totalQueued = 0;
  let totalBuffered = 0;
  let totalFailed = 0;
  let stoppedAtMax = false;

  if (groupEntries.length === 0) {
    throw new Error('No mapped groups to backfill');
  }

  if (backfillLimit < 1) {
    throw new Error('--limit must be at least 1');
  }

  console.log(
    `Backfill mode scanning up to ${backfillLimit} WhatsApp message(s) per mapped group.`,
  );

  for (const mapping of groupEntries) {
    const { groupIdOrName, shopId } = mapping;
    pendingMediaByKey.clear();
    pendingTextByKey.clear();

    const chat = await resolveMappedChat(groupIdOrName);

    if (!chat) {
      console.warn(`Could not find mapped group: ${groupIdOrName}`);
      continue;
    }

    const groupId = chat.id?._serialized || groupIdOrName;
    const sourceGroup = chat.name || groupId;
    const window = await buildBackfillWindow(shopId, groupId, fromArg, toArg);

    console.log(
      `Backfilling ${sourceGroup} for shop ${shopId} (${describeBackfillWindow(window)}).`,
    );

    const messages = await retry(
      () => chat.fetchMessages({ limit: backfillLimit }),
      3,
      10000,
      `fetching backfill messages for ${sourceGroup}`,
    );
    totalFetched += messages.length;

    let scanned = 0;
    let queued = 0;
    let buffered = 0;
    let failed = 0;
    let skipped = 0;

    for (const message of messages.sort(
      (a, b) => messageTimestampMs(a) - messageTimestampMs(b),
    )) {
      if (maxBackfillProducts > 0 && totalQueued >= maxBackfillProducts) {
        stoppedAtMax = true;
        break;
      }

      const timestampMs = messageTimestampMs(message);

      if (window.toMs && timestampMs > window.toMs) {
        skipped += 1;
        continue;
      }

      const isPreWindowMedia =
        window.fromMs &&
        timestampMs < window.fromMs &&
        message.hasMedia &&
        timestampMs >= window.fromMs - mediaPairingWindowMs;

      if (window.fromMs && timestampMs < window.fromMs && !isPreWindowMedia) {
        skipped += 1;
        continue;
      }

      scanned += 1;

      try {
        const capture = await buildCaptureFromMessage(
          message,
          chat,
          groupId,
          shopId,
        );

        if (!capture) continue;

        if (capture.buffered) {
          buffered += 1;
          continue;
        }

        if (window.fromMs && timestampMs < window.fromMs) continue;

        const result = await queuePost(shopId, {
          caption: capture.caption,
          sourceGroup,
          senderPhone: normalizeSender(message.author || message.from),
          messageId: capture.messageId,
          mediaUrls: capture.mediaUrls,
          receivedAt: new Date(timestampMs).toISOString(),
        });

        queued += 1;
        totalQueued += 1;
        console.log(
          `Backfilled ${sourceGroup}: parsed=${result.parsed} needsReview=${result.needsReview} images=${capture.mediaCount}`,
        );
      } catch (error) {
        failed += 1;
        console.error(
          `Failed to backfill ${sourceGroup}: ${errorMessage(error)}`,
        );
      }
    }

    const flushedTextFirst = await flushPendingTextCaptures({
      shopId,
      sourceGroup,
      groupId,
      fromMs: window.fromMs,
      toMs: window.toMs || Date.now(),
    });
    queued += flushedTextFirst.queued;
    failed += flushedTextFirst.failed;

    totalScanned += scanned;
    totalBuffered += buffered;
    totalFailed += failed;

    console.log(
      JSON.stringify(
        {
          group: sourceGroup,
          groupId,
          shopId,
          fetched: messages.length,
          scanned,
          skipped,
          buffered,
          queued,
          failed,
          window: {
            from: window.from ? window.from.toISOString() : null,
            to: window.to ? window.to.toISOString() : null,
          },
        },
        null,
        2,
      ),
    );

    if (stoppedAtMax) break;
  }

  console.log(
    JSON.stringify(
      {
        backfillComplete: true,
        fetched: totalFetched,
        scanned: totalScanned,
        buffered: totalBuffered,
        queued: totalQueued,
        failed: totalFailed,
        stoppedAtMax,
      },
      null,
      2,
    ),
  );

  await client.destroy();
  process.exit(totalFailed > 0 ? 1 : 0);
}

async function buildBackfillWindow(shopId, groupId, fromArg, toArg) {
  let from = fromArg ? parseDateArg(fromArg, '--from') : null;
  const to = toArg ? parseDateArg(toArg, '--to') : null;

  if (!from && args.has('--since-last-capture')) {
    const state = await fetchCaptureState(shopId, groupId);
    from = state.lastCapturedAt ? new Date(state.lastCapturedAt) : null;
  }

  if (from && to && from.getTime() > to.getTime()) {
    throw new Error('--from must be before --to');
  }

  return {
    from,
    to,
    fromMs: from ? from.getTime() : null,
    toMs: to ? to.getTime() : null,
  };
}

async function getMappedGroupEntries({ forceRefresh = false } = {}) {
  const persistedMappings = await fetchPersistedGroupMappings(forceRefresh);

  if (persistedMappings.length > 0) {
    return persistedMappings.map((mapping) => ({
      groupIdOrName: mapping.groupId || mapping.sourceGroup,
      groupId: mapping.groupId,
      sourceGroup: mapping.sourceGroup,
      shopId: mapping.shopId,
      captureEnabled: mapping.captureEnabled !== false,
      postingEnabled: mapping.postingEnabled === true,
      captureLimitPerRun: mapping.captureLimitPerRun,
      listingLimitPerRun: mapping.listingLimitPerRun,
    }));
  }

  return Object.entries(groupShopMap).map(([groupIdOrName, shopId]) => ({
    groupIdOrName,
    groupId: groupIdOrName.endsWith('@g.us') ? groupIdOrName : undefined,
    sourceGroup: groupIdOrName.endsWith('@g.us') ? undefined : groupIdOrName,
    shopId,
  }));
}

async function resolveShopIdForChat(chat, groupId) {
  const groupName = chat.name || '';
  const mappings = await getMappedGroupEntries();
  const match = mappings.find(
    (mapping) =>
      mapping.groupId === groupId ||
      mapping.groupIdOrName === groupId ||
      mapping.sourceGroup === groupName ||
      mapping.groupIdOrName === groupName,
  );

  return match?.shopId || groupShopMap[groupId] || groupShopMap[groupName];
}

async function fetchPersistedGroupMappings(forceRefresh = false) {
  const cacheMs = 60_000;
  if (
    !forceRefresh &&
    persistedGroupMappingsCache &&
    Date.now() - persistedGroupMappingsFetchedAt < cacheMs
  ) {
    return persistedGroupMappingsCache;
  }

  try {
    const response = await fetch(
      `${backendUrl}/whatsapp-imports/webhook/group-mappings`,
      {
        headers: {
          'x-whatsapp-ingest-secret': ingestSecret,
          ...(bridgeAccountId
            ? { 'x-whatsapp-bridge-account-id': bridgeAccountId }
            : {}),
        },
      },
    );
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    const payload = JSON.parse(body);
    persistedGroupMappingsCache = Array.isArray(payload.data)
      ? payload.data
      : [];
    persistedGroupMappingsFetchedAt = Date.now();

    return persistedGroupMappingsCache;
  } catch (error) {
    if (!persistedGroupMappingsCache) {
      console.warn(
        `Could not load persisted WhatsApp group mappings; falling back to env map: ${errorMessage(error)}`,
      );
      persistedGroupMappingsCache = [];
      persistedGroupMappingsFetchedAt = Date.now();
    }

    return persistedGroupMappingsCache;
  }
}

async function fetchCaptureState(shopId, groupId) {
  const url = new URL(
    `${backendUrl}/whatsapp-imports/webhook/shops/${shopId}/capture-state`,
  );
  if (groupId) url.searchParams.set('groupId', groupId);

  const response = await fetch(url, {
    headers: {
      'x-whatsapp-ingest-secret': ingestSecret,
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Could not read capture state: HTTP ${response.status} ${body}`,
    );
  }

  return JSON.parse(body);
}

async function updateCaptureState(shopId, state) {
  const response = await fetch(
    `${backendUrl}/whatsapp-imports/webhook/shops/${shopId}/capture-state`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-whatsapp-ingest-secret': ingestSecret,
      },
      body: JSON.stringify(state),
    },
  );
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Could not update capture checkpoint: HTTP ${response.status} ${body}`,
    );
  }

  return JSON.parse(body);
}

function describeBackfillWindow(window) {
  const from = window.from ? window.from.toISOString() : 'oldest fetched';
  const to = window.to ? window.to.toISOString() : 'now';
  return `${from} to ${to}`;
}

function messageTimestampMs(message) {
  return Number(message.timestamp || Math.floor(Date.now() / 1000)) * 1000;
}

function messageIdFromMessage(message) {
  return message.id?._serialized || message.id?.id || null;
}

function filterGroupsForShopSync(groups) {
  const exactGroups = argValues('group').map((value) => value.toLowerCase());
  const includes = argValues('include').map((value) => value.toLowerCase());
  const allowAll = args.has('--all');

  if (allowAll && exactGroups.length === 0 && includes.length === 0) {
    return groups;
  }

  return groups.filter((group) => {
    const name = String(group.name || '');
    const id = String(group.id || '');
    const searchable = `${name} ${id}`.toLowerCase();

    return (
      exactGroups.includes(name.toLowerCase()) ||
      exactGroups.includes(id.toLowerCase()) ||
      includes.some((needle) => searchable.includes(needle))
    );
  });
}

async function resolveShopOwner(prisma) {
  const ownerId =
    argValue('owner-id') || process.env.WHATSAPP_SESSION_SHOP_OWNER_ID;
  const ownerEmail =
    argValue('owner-email') || process.env.WHATSAPP_SESSION_SHOP_OWNER_EMAIL;
  const ownerPhone =
    argValue('owner-phone') ||
    process.env.WHATSAPP_SESSION_SHOP_OWNER_PHONE ||
    '+10000000004';

  const owner = await prisma.user.findFirst({
    where: {
      ...(ownerId
        ? { id: ownerId }
        : ownerEmail
          ? { email: ownerEmail }
          : { phone: { in: phoneCandidates(ownerPhone) } }),
      role: { name: 'SHOP_OWNER' },
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  });

  if (!owner) {
    throw new Error(
      'Could not find an active SHOP_OWNER. Pass --owner-phone, --owner-email, or --owner-id.',
    );
  }

  return owner;
}

async function resolveOrCreateGroupShopOwner(prisma, group, applyChanges) {
  const creatorPhone = groupCreatorPhone(group);

  if (!creatorPhone) {
    throw new Error(
      `Could not determine a group creator for "${group.name}". Pass --owner-phone, --owner-email, or --owner-id for this group.`,
    );
  }

  const existing = await prisma.user.findFirst({
    where: {
      phone: { in: phoneCandidates(creatorPhone) },
      role: { name: 'SHOP_OWNER' },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  });

  if (existing) {
    return {
      ...existing,
      created: false,
      groupCreatorPhone: creatorPhone,
      dryRun: false,
    };
  }

  const ownerName = group.creatorName || `${cleanShopName(group.name)} Owner`;
  const temporaryPassword = createTemporaryPassword();

  if (!applyChanges) {
    return {
      id: null,
      name: ownerName,
      phone: creatorPhone,
      email: null,
      created: true,
      temporaryPassword,
      groupCreatorPhone: creatorPhone,
      dryRun: true,
    };
  }

  const bcrypt = require('bcrypt');
  const shopOwnerRole = await prisma.role.findUnique({
    where: { name: 'SHOP_OWNER' },
    select: { id: true },
  });

  if (!shopOwnerRole) {
    throw new Error('SHOP_OWNER role is missing. Run the role seed first.');
  }

  const created = await prisma.user.create({
    data: {
      name: ownerName,
      phone: creatorPhone,
      passwordHash: await bcrypt.hash(temporaryPassword, 10),
      roleId: shopOwnerRole.id,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  });

  return {
    ...created,
    created: true,
    temporaryPassword,
    groupCreatorPhone: creatorPhone,
    dryRun: false,
  };
}

function hasExplicitOwnerArgs() {
  return Boolean(
    argValue('owner-id') ||
    argValue('owner-email') ||
    argValue('owner-phone') ||
    process.env.WHATSAPP_SESSION_SHOP_OWNER_ID ||
    process.env.WHATSAPP_SESSION_SHOP_OWNER_EMAIL ||
    process.env.WHATSAPP_SESSION_SHOP_OWNER_PHONE,
  );
}

function groupCreatorPhone(group) {
  const explicit =
    group.creatorPhone ||
    group.creatorId ||
    group.ownerPhone ||
    group.ownerId ||
    creatorPhoneFromGroupId(group.id);
  const normalized = normalizePhone(explicit);

  return normalized || null;
}

function creatorPhoneFromGroupId(groupId) {
  const match = String(groupId || '').match(/^(\d{8,})-\d+@g\.us$/);
  const candidate = match?.[1];

  if (!candidate || candidate.startsWith('120363')) return null;
  return candidate;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.startsWith('120363')) return null;
  return `+${digits}`;
}

function createTemporaryPassword() {
  return (
    process.env.WHATSAPP_CREATED_SHOP_OWNER_PASSWORD ||
    `Shop-${crypto.randomBytes(5).toString('hex')}`
  );
}

function phoneCandidates(value) {
  const raw = String(value || '').trim();
  const compact = raw.replace(/\s+/g, '');
  const withoutPlus = compact.replace(/^\+/, '');
  return [...new Set([raw, compact, withoutPlus, `+${withoutPlus}`])].filter(
    Boolean,
  );
}

function shopDraftFromGroup(group, ownerId) {
  const name = cleanShopName(group.name) || `WhatsApp Shop ${group.id}`;
  const phone = phoneFromGroupId(group.id);

  return {
    name,
    description: `Products captured from WhatsApp group "${group.name}"`,
    phone,
    address: 'WhatsApp Group',
    ownerId,
    status: 'ACTIVE',
  };
}

function cleanShopName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}'&()., -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phoneFromGroupId(groupId) {
  const numeric = String(groupId || '').match(/^(\d+)/)?.[1];
  if (numeric) return `+${numeric}`;

  return `+${String(Date.now()).slice(-10)}`;
}

async function updateSessionGroupShopMap(nextMap) {
  const envPath = path.resolve(
    process.env.WHATSAPP_SESSION_ENV_PATH || path.join(__dirname, '..', '.env'),
  );
  const envText = await fsp.readFile(envPath, 'utf8');
  const nextLine = `WHATSAPP_SESSION_GROUP_SHOP_MAP=${JSON.stringify(nextMap)}`;

  if (/^WHATSAPP_SESSION_GROUP_SHOP_MAP=/m.test(envText)) {
    await fsp.writeFile(
      envPath,
      envText.replace(/^WHATSAPP_SESSION_GROUP_SHOP_MAP=.*$/m, nextLine),
    );
    return;
  }

  const separator = envText.endsWith('\n') ? '' : '\n';
  await fsp.writeFile(envPath, `${envText}${separator}${nextLine}\n`);
}

async function resolveMappedChat(groupIdOrName) {
  const wanted = String(groupIdOrName || '').trim();
  if (!wanted) return null;
  const wantedLower = wanted.toLowerCase();
  const isDirectGroupId = wantedLower.endsWith('@g.us');

  try {
    const groups = await listGroupsFromPageStore();
    const match = groups.find((group) => {
      const groupId = String(group.id || '')
        .trim()
        .toLowerCase();
      const groupName = String(group.name || '')
        .trim()
        .toLowerCase();
      return groupId === wantedLower || groupName === wantedLower;
    });
    if (match?.id) {
      console.log(
        `Resolved mapped WhatsApp group from page store: ${wanted} -> ${match.id}`,
      );
      return directSourceGroupChat(match.id, match.name);
    }
  } catch (error) {
    console.warn(
      `WhatsApp page-store group lookup failed for ${wanted}: ${diagnosticError(error)}`,
    );
  }

  if (isDirectGroupId) {
    return directSourceGroupChat(wanted, wanted);
  }

  try {
    const chats = await client.getChats();
    const match = chats.find((chat) => {
      const chatId = String(chat?.id?._serialized || '').trim();
      const chatName = String(chat?.name || chat?.formattedTitle || '').trim();
      return (
        chatId.toLowerCase() === wantedLower ||
        chatName.toLowerCase() === wantedLower
      );
    });
    if (match) return match;
  } catch (error) {
    console.warn(
      `WhatsApp chat-list lookup failed for ${wanted}: ${diagnosticError(error)}`,
    );
  }

  return null;
}

function warnGroupChatLookupFallback(groupId, error) {
  const now = Date.now();
  const previous = groupChatLookupWarningByGroupId.get(groupId) || {
    warnedAt: 0,
    suppressed: 0,
  };

  if (now - previous.warnedAt < groupChatLookupWarningIntervalMs) {
    groupChatLookupWarningByGroupId.set(groupId, {
      warnedAt: previous.warnedAt,
      suppressed: previous.suppressed + 1,
    });
    return;
  }

  const suppressedSuffix = previous.suppressed
    ? `; suppressed=${previous.suppressed}`
    : '';
  console.warn(
    `Could not resolve WhatsApp group chat via getChat; using group id fallback ${groupId}${suppressedSuffix}: ${errorMessage(error)}`,
  );
  groupChatLookupWarningByGroupId.set(groupId, {
    warnedAt: now,
    suppressed: 0,
  });
}
function groupIdFromIncomingMessage(message) {
  return [
    message?.from,
    message?.to,
    message?.id?.remote,
    message?.id?._serialized,
    message?._data?.id?.remote,
    message?._data?.id?._serialized,
  ]
    .map((value) => String(value || '').trim())
    .map((value) => value.match(/\b\d+@g\.us\b/i)?.[0] || '')
    .find(Boolean);
}
function directSourceGroupChat(groupId, groupName) {
  return {
    id: { _serialized: groupId },
    isGroup: true,
    name: groupName || groupId,
    formattedTitle: groupName || groupId,
    fetchMessages: async (searchOptions) => {
      let messages;
      try {
        messages = await client.pupPage.evaluate(
          async (chatId, options) => {
            const serializedId = (chat) =>
              chat?.id?._serialized || chat?.id?.serialized || '';
            const chatCollection = window.require('WAWebCollections').Chat;
            const chat =
              chatCollection.get?.(chatId) ||
              chatCollection
                .getModelsArray()
                .find((candidate) => serializedId(candidate) === chatId);
            if (!chat) {
              throw new Error(`WhatsApp group ${chatId} is not loaded`);
            }

            const msgFilter = (message) => {
              if (message.isNotification) return false;
              if (
                options &&
                options.fromMe !== undefined &&
                message.id.fromMe !== options.fromMe
              ) {
                return false;
              }
              return true;
            };
            let msgs = chat.msgs.getModelsArray().filter(msgFilter);
            if (options && options.limit > 0) {
              while (msgs.length < options.limit) {
                const loadedMessages = await window
                  .require('WAWebChatLoadMessages')
                  .loadEarlierMsgs({ chat });
                if (!loadedMessages || !loadedMessages.length) break;
                msgs = [...loadedMessages.filter(msgFilter), ...msgs];
              }
              if (msgs.length > options.limit) {
                msgs.sort((left, right) => (left.t > right.t ? 1 : -1));
                msgs = msgs.splice(msgs.length - options.limit);
              }
            }
            return msgs.map((message) =>
              window.WWebJS.getMessageModel(message),
            );
          },
          groupId,
          searchOptions,
        );
      } catch (error) {
        console.warn(
          `Direct source group fetch failed for ${groupName || groupId}: ${diagnosticError(error)}`,
        );
        throw error;
      }
      return messages.map((message) => new Message(client, message));
    },
    sendMessage: (content, options) =>
      client.sendMessage(groupId, content, options),
  };
}

async function resolvePostDestinationChat(groupIdOrName) {
  const wanted = String(groupIdOrName || '').trim();
  if (wanted.endsWith('@g.us')) return directPostDestinationChat(wanted);
  return resolveMappedChat(wanted);
}

function directPostDestinationChat(groupId) {
  return {
    id: { _serialized: groupId },
    name: groupId,
    formattedTitle: groupId,
    sendMessage: (content, options) =>
      client.sendMessage(groupId, content, options),
  };
}

function analyzeMessages(messages, chat) {
  const clusters = [];
  const buffers = new Map();
  const samples = [];
  let mediaOnlyCount = 0;
  let textMessageCount = 0;
  let pricedTextCount = 0;

  for (const message of messages.sort(
    (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0),
  )) {
    const groupId = chat.id?._serialized || message.from;
    const key = mediaBufferKey(groupId, message.author || message.from);
    const text = normalizePostText((message.body || '').trim());
    const timestamp = message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : undefined;

    if (text) {
      textMessageCount += 1;
      samples.push({
        timestamp,
        hasMedia: Boolean(message.hasMedia),
        type: message.type,
        price: suggestPrice(text),
        text: text.slice(0, 280),
      });
    }

    if (message.hasMedia && !isLikelyProductText(text)) {
      mediaOnlyCount += 1;
      const buffer = buffers.get(key) || [];
      buffer.push({
        id: message.id?._serialized || message.id?.id,
        type: message.type,
        timestamp,
      });
      buffers.set(key, buffer.slice(-maxBufferedMedia));
      continue;
    }

    if (!isLikelyProductText(text)) continue;

    pricedTextCount += 1;
    const media = buffers.get(key) || [];
    buffers.set(key, []);

    const messageId = message.id?._serialized || message.id?.id;

    clusters.push({
      score: productScore(text, media.length),
      sender: normalizeSender(message.author || message.from),
      timestamp,
      mediaCount: media.length + (message.hasMedia ? 1 : 0),
      text,
      suggestedName: suggestName(text, messageId),
      suggestedPrice: suggestPrice(text),
      messageId,
    });
  }

  return {
    summary: {
      mediaOnlyCount,
      textMessageCount,
      pricedTextCount,
      bufferedMediaGroups: Array.from(buffers.values()).filter(
        (items) => items.length > 0,
      ).length,
    },
    samples: samples.slice(-12),
    likelyProducts: clusters.sort((a, b) => b.score - a.score),
  };
}

async function retry(action, attempts, delayMs, label) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (attempt > 1) {
        console.log(`Retrying ${label} (${attempt}/${attempts})...`);
      }
      return await action();
    } catch (error) {
      lastError = error;
      console.warn(`${label} failed: ${errorMessage(error)}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildCaptureFromMessage(message, chat, groupId, shopId) {
  const rawText = (message.body || '').trim();
  const text = normalizePostText(rawText);
  const key = mediaBufferKey(groupId, message.author || message.from);
  const messageId = message.id?._serialized || message.id?.id;
  const timestampMs =
    Number(message.timestamp || Math.floor(Date.now() / 1000)) * 1000;

  purgeExpiredMedia(key, timestampMs);
  purgeExpiredText(key, timestampMs);

  if (message.hasMedia && !isProductMediaMessage(message)) {
    clearMediaBuffer(key);
    return null;
  }

  if (
    message.hasMedia &&
    isProductMediaMessage(message) &&
    !isLikelyProductText(text)
  ) {
    bufferMedia(key, message, timestampMs);
    return {
      buffered: true,
      bufferKey: key,
      mediaCount: pendingMediaByKey.get(key)?.length || 0,
    };
  }

  if (!isLikelyProductText(text)) {
    if (text) clearMediaBuffer(key);
    return null;
  }

  const pairedMedia = drainMedia(key, timestampMs);
  if (message.hasMedia && isProductMediaMessage(message)) {
    pairedMedia.push(mediaDescriptor(message, timestampMs));
  }

  const mediaUrls = await saveMediaFiles(pairedMedia, shopId);

  if (mediaUrls.length === 0) {
    bufferText(key, {
      caption: rawText,
      messageId,
      senderPhone: normalizeSender(message.author || message.from),
      timestampMs,
    });
    return {
      buffered: true,
      bufferKey: key,
      mediaCount: 0,
      pendingText: true,
    };
  }

  return {
    buffered: false,
    bufferKey: key,
    caption: rawText,
    messageId,
    mediaUrls,
    mediaCount: pairedMedia.length,
  };
}

async function flushPendingTextCaptures({
  shopId,
  sourceGroup,
  groupId,
  fromMs,
  toMs,
}) {
  const summary = {
    queued: 0,
    failed: 0,
    resolvedKeys: [],
  };

  for (const [key, textEntry] of pendingTextByKey.entries()) {
    if (fromMs && textEntry.timestampMs < fromMs) {
      pendingTextByKey.delete(key);
      continue;
    }

    const pairedMedia = drainMediaAfterText(key, textEntry.timestampMs, toMs);
    if (pairedMedia.length === 0) continue;

    try {
      const mediaUrls = await saveMediaFiles(pairedMedia, shopId);
      if (mediaUrls.length === 0) continue;

      const capture = {
        buffered: false,
        bufferKey: key,
        caption: textEntry.caption,
        messageId: textEntry.messageId,
        mediaUrls,
        mediaCount: pairedMedia.length,
      };

      await queuePost(shopId, {
        caption: capture.caption,
        sourceGroup,
        senderPhone: textEntry.senderPhone,
        messageId: capture.messageId,
        mediaUrls: capture.mediaUrls,
        receivedAt: new Date(textEntry.timestampMs).toISOString(),
      });
      await repostShopCaptureToDestinations({
        shopId,
        sourceGroupId: groupId,
        sourceGroupName: sourceGroup,
        capture,
      });

      pendingTextByKey.delete(key);
      summary.resolvedKeys.push(key);
      summary.queued += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(
        `Text-first capture failed for ${sourceGroup}: ${errorMessage(error)}`,
      );
    }
  }

  return summary;
}

function bufferText(key, textEntry) {
  pendingTextByKey.set(key, textEntry);
}

function bufferMedia(key, message, timestampMs) {
  const current = pendingMediaByKey.get(key) || [];
  const last = current.at(-1);
  const next =
    last && timestampMs - last.timestampMs > mediaClusterGapMs ? [] : current;
  next.push(mediaDescriptor(message, timestampMs));
  pendingMediaByKey.set(key, next.slice(-maxBufferedMedia));
}

function drainMedia(key, timestampMs) {
  const current = pendingMediaByKey.get(key) || [];
  const candidates = current.filter(
    (item) => timestampMs - item.timestampMs <= mediaPairingWindowMs,
  );
  const paired = latestContiguousMediaCluster(candidates);
  pendingMediaByKey.set(key, []);
  return paired;
}

function drainMediaAfterText(key, textTimestampMs, toMs) {
  const current = pendingMediaByKey.get(key) || [];
  const candidates = current.filter(
    (item) =>
      item.timestampMs >= textTimestampMs &&
      item.timestampMs - textTimestampMs <= mediaPairingWindowMs &&
      (!toMs || item.timestampMs <= toMs),
  );
  const paired = earliestContiguousMediaCluster(candidates);
  pendingMediaByKey.set(
    key,
    current.filter((item) => !paired.includes(item)),
  );
  return paired;
}

function latestContiguousMediaCluster(mediaItems) {
  const cluster = [];
  const ordered = [...mediaItems].sort((a, b) => a.timestampMs - b.timestampMs);

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const item = ordered[index];
    const nextNewer = cluster[0];

    if (
      nextNewer &&
      nextNewer.timestampMs - item.timestampMs > mediaClusterGapMs
    ) {
      break;
    }

    cluster.unshift(item);
  }

  return cluster;
}

function earliestContiguousMediaCluster(mediaItems) {
  const cluster = [];
  const ordered = [...mediaItems].sort((a, b) => a.timestampMs - b.timestampMs);

  for (const item of ordered) {
    const previous = cluster.at(-1);

    if (
      previous &&
      item.timestampMs - previous.timestampMs > mediaClusterGapMs
    ) {
      break;
    }

    cluster.push(item);
  }

  return cluster;
}

function purgeExpiredMedia(key, timestampMs) {
  const current = pendingMediaByKey.get(key) || [];
  const fresh = current.filter(
    (item) => timestampMs - item.timestampMs <= mediaPairingWindowMs,
  );

  if (fresh.length === current.length) return;
  pendingMediaByKey.set(key, fresh);
}

function purgeExpiredText(key, timestampMs) {
  const current = pendingTextByKey.get(key);
  if (!current) return;
  if (timestampMs - current.timestampMs <= mediaPairingWindowMs) return;
  pendingTextByKey.delete(key);
}

function clearMediaBuffer(key) {
  pendingMediaByKey.delete(key);
}

function isProductMediaMessage(message) {
  return ['image', 'video'].includes(String(message.type || '').toLowerCase());
}

function mediaMessageIdCandidates(item) {
  const message = item?.message || item || {};
  const data = message?._data || {};
  return [
    item?.id,
    message?.id?._serialized,
    message?.id?.serialized,
    data?.id?._serialized,
    data?.id?.serialized,
    message?.id?.id,
    data?.id?.id,
  ]
    .map((value) =>
      value === undefined || value === null ? '' : String(value),
    )
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function serializedMediaMessageId(item) {
  return mediaMessageIdCandidates(item)[0] || '';
}

function mediaDescriptor(message, timestampMs) {
  const item = { message };
  return {
    id: serializedMediaMessageId(item) || 'unknown',
    type: message.type || 'media',
    timestampMs,
    message,
    client,
  };
}

function mediaBufferKey(groupId, sender) {
  return `${groupId}|${sender || 'unknown'}`;
}

function isLikelyProductText(text) {
  if (!text) return false;
  if (suggestPrice(text) !== null) return true;
  return false;
}

function productScore(text, mediaCount) {
  let score = 0;
  if (isLikelyProductText(text)) score += 4;
  if (mediaCount > 0) score += Math.min(mediaCount, 4);
  if (/\b(stock|qty|available|left|sizes?|colou?rs?)\b/i.test(text)) score += 1;
  if (/\b(category|cat)\b/i.test(text)) score += 1;
  if (text.length > 20) score += 1;
  return score;
}

function suggestPrice(text) {
  const normalized = normalizeCurrencyText(text);
  const captionPricing = parseCaptionPricing(normalized);
  if (captionPricing.basePrice !== null) return captionPricing.basePrice;

  const match =
    normalized.match(
      /(?:\b(?:R|ZAR|E|SZL)|\$)\s*\.?\s*(\d+(?:[.,]\d{1,2})?)/i,
    ) ||
    normalized.match(
      /(\d+(?:[.,]\d{1,2})?)\s*(?:rand|rands|emalangeni|lilangeni|each|only|ea)\b/i,
    ) ||
    normalized.match(
      /\b(?:price|now|sale|special|was|from)\D{0,16}(\d{2,5})(?:[.,]\d{1,2})?\b/i,
    ) ||
    normalized.match(
      /(?:^|\n|\s)(\d{2,5})(?:[.,]\d{1,2})?\s*(?:\/-|\.00)?(?:\s|$)/,
    );
  return match ? parseMoneyToken(match[1]) : null;
}

function parseCaptionPricing(text) {
  const segments = captionSegments(normalizeCurrencyText(text));
  const stockPrice = priceForLabel(segments, ['stock', 'cost']);
  const standardPrice = priceForLabel(segments, [
    'price',
    'now',
    'sale',
    'special',
    'from',
  ]);
  const eachPrice = priceForLabel(segments, ['each', 'ea', 'retail']);
  const bulkSpecials = extractBulkSpecials(segments);
  const strongestBulk = bulkSpecials[0];
  const packQuantity = extractPackQuantity(segments);
  const stockIsBulkPrice = Boolean(
    stockPrice && eachPrice && stockPrice < eachPrice && !strongestBulk,
  );
  const regularUnitPrice =
    eachPrice ??
    standardPrice ??
    (!strongestBulk && !packQuantity ? stockPrice : null);
  const bulkQuantity =
    strongestBulk?.quantity ??
    (stockPrice && packQuantity ? packQuantity : null);
  const bulkUnitPrice =
    strongestBulk?.unitPrice ??
    (stockPrice && (bulkQuantity || stockIsBulkPrice) ? stockPrice : null);
  const bulkTotal =
    strongestBulk?.totalPrice ??
    (bulkUnitPrice && bulkQuantity
      ? Math.round(bulkUnitPrice * bulkQuantity * 100) / 100
      : null);
  const regularBulkTotal =
    regularUnitPrice && bulkQuantity
      ? Math.round(regularUnitPrice * bulkQuantity * 100) / 100
      : null;
  const bulkSavings =
    regularBulkTotal && bulkTotal
      ? Math.round(Math.max(0, regularBulkTotal - bulkTotal) * 100) / 100
      : 0;
  const bulkSavingsPerItem =
    bulkSavings > 0 && bulkQuantity
      ? Math.round((bulkSavings / bulkQuantity) * 100) / 100
      : stockIsBulkPrice && regularUnitPrice && bulkUnitPrice
        ? Math.round(Math.max(0, regularUnitPrice - bulkUnitPrice) * 100) / 100
        : 0;
  const bulkSavingsPercent =
    bulkSavings > 0 && regularBulkTotal
      ? Math.round((bulkSavings / regularBulkTotal) * 100)
      : bulkSavingsPerItem > 0 && regularUnitPrice
        ? Math.round((bulkSavingsPerItem / regularUnitPrice) * 100)
        : 0;

  return {
    stockPrice,
    standardPrice,
    eachPrice,
    stockIsBulkPrice,
    bulkSpecials,
    regularUnitPrice,
    bulkQuantity,
    bulkUnitPrice,
    bulkTotal,
    bulkSavings,
    bulkSavingsPerItem,
    bulkSavingsPercent,
    basePrice:
      strongestBulk?.totalPrice ??
      (stockPrice && packQuantity ? bulkTotal : null) ??
      stockPrice ??
      eachPrice ??
      standardPrice ??
      bulkUnitPrice ??
      null,
  };
}

function extractPackQuantity(segments) {
  const packSegment = segments.find((segment) =>
    /^\d+\s*(?:pcs?|pieces?|pc)\b/i.test(segment),
  );
  const quantity = Number(
    String(packSegment || '').match(/^(\d{1,3})/)?.[1] || 0,
  );
  return quantity > 1 ? quantity : null;
}

function captionSegments(text) {
  const segments = [];
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const starred = Array.from(line.matchAll(/\*+([^*]+)\*+/g))
      .map((match) => String(match[1] || '').trim())
      .filter(Boolean);
    if (starred.length > 0) {
      segments.push(...starred);
      continue;
    }

    segments.push(
      ...line
        .split(/\s{2,}|\s*[|•]\s*/)
        .map((part) =>
          part
            .replace(/^[-•*]\s*/, '')
            .replace(/\*/g, '')
            .trim(),
        )
        .filter(Boolean),
    );
  }
  return segments;
}

function priceForLabel(segments, labels) {
  const labelPattern = labels.join('|');
  const regex = new RegExp(
    `\\b(?:${labelPattern})\\b\\s*[:=.\\-]?\\s*(?:(?:R|ZAR|E|SZL)|\\$)?\\s*(\\d+(?:[.,]\\d{1,2})?)`,
    'i',
  );

  for (const segment of segments) {
    const match = segment.match(regex);
    if (match) {
      const remainder = segment.slice((match.index || 0) + match[0].length);
      if (/^\s*(?:for|x|@)\b/i.test(remainder)) continue;
      return parseMoneyToken(match[1]);
    }
  }

  return null;
}

function extractBulkSpecials(segments) {
  const specials = [];
  const pushSpecial = (quantityToken, priceToken, source) => {
    const quantity = String(quantityToken || '')
      .split('+')
      .map((part) => Number(part.trim()))
      .reduce((total, part) => total + (Number.isFinite(part) ? part : 0), 0);
    const totalPrice = parseMoneyToken(priceToken);
    if (!quantity || !totalPrice) return;
    specials.push({
      quantity,
      totalPrice,
      unitPrice: Math.round((totalPrice / quantity) * 100) / 100,
      source,
    });
  };

  for (const segment of segments) {
    for (const match of segment.matchAll(
      /\b(\d{1,3})\s*(?:for|x|@)\s*(?:[^\w\s]{0,6}\s*)?(?:(?:R|ZAR|E|SZL)|\$)?\s*(\d+(?:[.,]\d{1,2})?)\b/gi,
    )) {
      pushSpecial(match[1], match[2], segment);
    }

    for (const match of segment.matchAll(
      /\b(?:\d+\s*)?packs?\s*\(\s*(\d{1,3})\s*(?:pcs?|pieces?|pc)\s*inside\s*\)(?:[^\dA-Za-z]{0,12}\s*)?(?:(?:R|ZAR|E|SZL)|\$)?\s*(\d+(?:[.,]\d{1,2})?)\b/gi,
    )) {
      pushSpecial(match[1], match[2], segment);
    }

    for (const match of segment.matchAll(
      /\b(\d{1,2}(?:\s*\+\s*\d{1,2})+)(?:[^\dA-Za-z]{0,12}\s*)?(?:(?:R|ZAR|E|SZL)|\$)?\s*(\d+(?:[.,]\d{1,2})?)\b/gi,
    )) {
      pushSpecial(match[1], match[2], segment);
    }
  }

  const unique = new Map();
  for (const special of specials) {
    const key = `${special.quantity}:${special.totalPrice}:${String(
      special.source || '',
    ).toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, special);
  }
  return [...unique.values()];
}

function normalizeCurrencyText(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ŘŔŖ]/g, 'R')
    .replace(/[řŕŗ]/g, 'r')
    .replace(/[🅡Ⓡ®]/g, 'R')
    .replace(/\uFE0F/g, '')
    .replace(/\p{Emoji_Modifier}/gu, '')
    .replace(/[\uDFFB-\uDFFF]/g, '')
    .replace(/[👉➡➜➔→]+/g, ' ')
    .replace(/\bR\s*R\s*(\d)/gi, 'R $1')
    .replace(/\bR\s*[.:]\s*(\d)/gi, 'R $1')
    .replace(/\bR\s+(\d)/gi, 'R $1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseMoneyToken(value) {
  const clean = String(value || '')
    .replace(/\s+/g, '')
    .replace(',', '.');
  if (!clean) return 0;
  if (clean.includes('.')) return Number(clean);

  const digits = clean.replace(/\D/g, '');
  if (digits.length === 4 && digits.endsWith('00')) return Number(digits);
  if (digits.length >= 4) return Number(digits) / 100;
  return Number(digits);
}

function suggestName(text, messageId) {
  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return null;

  const name = firstLine
    .replace(/(?:\b(?:R|ZAR|E|SZL)|\$)\s*\d+(?:[.,]\d{1,2})?/gi, '')
    .replace(/\b(?:stock|qty|quantity|available)\D*\d+/gi, '')
    .replace(/\s[-|]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const normalizedName = name.toLowerCase().replace(/\s+/g, ' ').trim();
  const genericNames = new Set([
    'new arrive',
    'new arrival',
    'new arrivals',
    'new stock',
    'available',
  ]);

  if (!genericNames.has(normalizedName)) return name;

  const suffix = String(messageId || Date.now())
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-6)
    .toUpperCase();
  const price = suggestPrice(text);

  return `New Arrival${price !== null ? ` R ${price.toFixed(2)}` : ''} ${suffix}`;
}

function mediaDiagnostic(item) {
  const data = item.message?._data || {};
  const idCandidates = mediaMessageIdCandidates(item);
  return {
    type: item.type || null,
    id: idCandidates[0] || null,
    idCandidates: idCandidates.slice(0, 8),
    timestamp: item.timestampMs
      ? new Date(item.timestampMs).toISOString()
      : null,
    hasMedia: Boolean(item.message?.hasMedia),
    mediaKey: Boolean(data.mediaKey),
    directPath: Boolean(data.directPath),
    mimetype: item.message?.mimetype || data.mimetype || null,
    mediaStage: data.mediaData?.mediaStage || data.mediaStage || null,
    messageHasClient: Boolean(item.message?.client),
    messageClientHasPupPage: Boolean(item.message?.client?.pupPage?.evaluate),
    itemHasClient: Boolean(item.client),
    itemClientHasPupPage: Boolean(item.client?.pupPage?.evaluate),
    globalClientHasPupPage: Boolean(client?.pupPage?.evaluate),
    bridgePupPageReady: Boolean(bridgePupPage?.evaluate),
    itemKeys: Object.keys(item || {}).slice(0, 20),
    messageKeys: Object.keys(item.message || {}).slice(0, 30),
  };
}

async function getBridgePupPage() {
  if (bridgePupPage?.evaluate) return bridgePupPage;
  if (client?.pupPage?.evaluate) {
    bridgePupPage = client.pupPage;
    return bridgePupPage;
  }
  if (client?.pupBrowser?.pages) {
    const pages = await client.pupBrowser.pages().catch(() => []);
    bridgePupPage = pages.find((page) => page?.evaluate) || null;
    if (bridgePupPage?.evaluate) return bridgePupPage;
  }
  return null;
}
async function downloadProductMedia(item) {
  const msgId = serializedMediaMessageId(item);
  const msgIdCandidates = mediaMessageIdCandidates(item);
  const page =
    item.message?.client?.pupPage ||
    item.client?.pupPage ||
    (await getBridgePupPage());

  if (!msgId || !page?.evaluate) {
    try {
      return await item.message.downloadMedia();
    } catch (error) {
      const fallbackError = new Error(
        `WhatsApp media download failed without pupPage: ${errorMessage(error)}`,
      );
      fallbackError.downloadDiagnostic = {
        __downloadDiagnostic: true,
        phase: !msgId ? 'missing-message-id' : 'missing-pupPage',
        messageId: msgId || null,
        messageIdCandidates: msgIdCandidates.slice(0, 8),
        error: {
          name: error?.name || null,
          message: error?.message || String(error || ''),
          status: error?.status || null,
        },
        message: mediaDiagnostic(item),
      };
      throw fallbackError;
    }
  }

  let directResult;
  try {
    directResult = await page.evaluate(
      async ({ messageId, messageIdCandidates }) => {
        const errorSummary = (error) => ({
          name: error?.name || null,
          message: error?.message || String(error || ''),
          status: error?.status || null,
          stack: error?.stack
            ? String(error.stack).split('\n').slice(0, 3)
            : [],
        });

        const summarizeMsg = (msg, phase, error) => {
          const downloadManager = window.require(
            'WAWebDownloadManager',
          )?.downloadManager;
          const mediaData = msg?.mediaData || {};
          return {
            __downloadDiagnostic: true,
            phase,
            error: error ? errorSummary(error) : null,
            message: {
              exists: Boolean(msg),
              type: msg?.type || null,
              mimetype: msg?.mimetype || null,
              directPath: Boolean(msg?.directPath),
              mediaKey: Boolean(msg?.mediaKey),
              mediaKeyTimestamp: msg?.mediaKeyTimestamp || null,
              encFilehash: Boolean(msg?.encFilehash),
              filehash: Boolean(msg?.filehash),
              size: msg?.size || null,
              mediaStage: mediaData?.mediaStage || msg?.mediaStage || null,
              hasBlob: Boolean(mediaData?.blob || mediaData?.mediaBlob),
              mediaDataKeys: Object.keys(mediaData || {}).slice(0, 30),
            },
            downloadManager: {
              keys: Object.keys(downloadManager || {}).slice(0, 30),
              downloadAndMaybeDecrypt:
                typeof downloadManager?.downloadAndMaybeDecrypt,
              downloadAndDecrypt: typeof downloadManager?.downloadAndDecrypt,
              download: typeof downloadManager?.download,
            },
          };
        };

        try {
          const ids = (
            Array.isArray(messageIdCandidates) && messageIdCandidates.length
              ? messageIdCandidates
              : [messageId]
          )
            .map((value) =>
              value === undefined || value === null ? '' : String(value),
            )
            .filter(Boolean)
            .filter((value, index, values) => values.indexOf(value) === index);
          const collections = window.require('WAWebCollections');
          const msgStore = collections?.Msg;
          let msg = null;

          for (const id of ids) {
            try {
              msg = msgStore?.get?.(id) || null;
            } catch (_) {
              msg = null;
            }
            if (msg) break;
          }

          if (!msg && msgStore?.getMessagesById) {
            try {
              const result = await msgStore.getMessagesById(ids);
              msg = result?.messages?.[0] || null;
            } catch (_) {
              msg = null;
            }
          }

          if (!msg) {
            const loadedMessages =
              typeof msgStore?.getModelsArray === 'function'
                ? msgStore.getModelsArray()
                : Array.isArray(msgStore?.models)
                  ? msgStore.models
                  : [];
            msg =
              loadedMessages.find((candidate) => {
                const candidateIds = [
                  candidate?.id?._serialized,
                  candidate?.id?.serialized,
                  candidate?.id?.id,
                ]
                  .map((value) =>
                    value === undefined || value === null ? '' : String(value),
                  )
                  .filter(Boolean);
                return candidateIds.some((id) => ids.includes(id));
              }) || null;
          }

          if (!msg) {
            const diagnostic = summarizeMsg(null, 'lookup');
            diagnostic.lookup = {
              ids: ids.slice(0, 8),
              loadedCount: msgStore?.getModelsArray
                ? msgStore.getModelsArray().length
                : null,
            };
            return diagnostic;
          }
          if (msg.mediaData?.mediaStage === 'REUPLOADING') {
            return summarizeMsg(msg, 'reuploading');
          }

          if (msg.mediaData?.mediaStage !== 'RESOLVED' && msg.downloadMedia) {
            try {
              await msg.downloadMedia({
                downloadEvenIfExpensive: true,
                rmrReason: 1,
              });
            } catch (error) {
              return summarizeMsg(msg, 'resolve-media', error);
            }
          }

          if (!msg?.directPath || !msg?.mediaKey) {
            return summarizeMsg(msg, 'missing-direct-media-fields');
          }

          const mockQpl = {
            addAnnotations: function () {
              return this;
            },
            addPoint: function () {
              return this;
            },
          };

          const downloadManager = window.require(
            'WAWebDownloadManager',
          )?.downloadManager;
          const payload = {
            directPath: msg.directPath,
            encFilehash: msg.encFilehash,
            filehash: msg.filehash,
            mediaKey: msg.mediaKey,
            mediaKeyTimestamp: msg.mediaKeyTimestamp,
            type: msg.type,
            signal: new AbortController().signal,
          };

          const attempts = [
            {
              phase: 'downloadAndMaybeDecrypt-with-qpl',
              fn: () =>
                downloadManager.downloadAndMaybeDecrypt({
                  ...payload,
                  downloadQpl: mockQpl,
                }),
            },
            {
              phase: 'downloadAndMaybeDecrypt-without-qpl',
              fn: () => downloadManager.downloadAndMaybeDecrypt(payload),
            },
          ];

          if (typeof downloadManager?.downloadAndDecrypt === 'function') {
            attempts.push({
              phase: 'downloadAndDecrypt',
              fn: () => downloadManager.downloadAndDecrypt(payload),
            });
          }

          let lastDiagnostic = null;
          for (const attempt of attempts) {
            try {
              const decryptedMedia = await attempt.fn();
              const data =
                await window.WWebJS.arrayBufferToBase64Async(decryptedMedia);
              return {
                data,
                mimetype: msg.mimetype,
                filename: msg.filename,
                filesize: msg.size,
              };
            } catch (error) {
              lastDiagnostic = summarizeMsg(msg, attempt.phase, error);
            }
          }

          return lastDiagnostic || summarizeMsg(msg, 'download-no-attempt');
        } catch (error) {
          return {
            __downloadDiagnostic: true,
            phase: 'evaluate',
            error: errorSummary(error),
          };
        }
      },
      { messageId: msgId, messageIdCandidates: msgIdCandidates },
    );
  } catch (error) {
    const outerError = new Error(
      `WhatsApp media download failed at page-evaluate: ${errorMessage(error)}`,
    );
    outerError.downloadDiagnostic = {
      __downloadDiagnostic: true,
      phase: 'page-evaluate',
      error: {
        name: error?.name || null,
        message: error?.message || String(error || ''),
        status: error?.status || null,
        stack: error?.stack
          ? String(error.stack).split(/\r?\n/).slice(0, 4)
          : [],
      },
      message: mediaDiagnostic(item),
    };
    throw outerError;
  }

  if (directResult?.__downloadDiagnostic) {
    try {
      const fallback = await item.message.downloadMedia();
      if (fallback?.data) return fallback;
    } catch (error) {
      directResult.fallbackError = {
        name: error?.name || null,
        message: error?.message || String(error || ''),
        status: error?.status || null,
      };
    }

    const error = new Error(
      `WhatsApp media download failed at ${directResult.phase}: ${
        directResult.error?.message || 'no media returned'
      }`,
    );
    error.downloadDiagnostic = directResult;
    throw error;
  }

  return directResult;
}
async function saveMediaFiles(mediaItems, shopId) {
  const urls = [];
  const targetDir = path.join(uploadRoot, 'whatsapp-session', shopId);
  await fsp.mkdir(targetDir, { recursive: true });

  for (const item of mediaItems.slice(0, maxBufferedMedia)) {
    if (!item.message?.downloadMedia) continue;

    try {
      const media = await retry(
        () => downloadProductMedia(item),
        1,
        0,
        `downloading WhatsApp media ${item.id}`,
      );
      if (!media?.data || !isSupportedProductMediaMime(media.mimetype))
        continue;

      const extension = extensionForMime(media.mimetype);
      const fileName = `${safeFilePart(item.id)}.${extension}`;
      await fsp.writeFile(
        path.join(targetDir, fileName),
        Buffer.from(media.data, 'base64'),
      );
      urls.push(`${backendUrl}/uploads/whatsapp-session/${shopId}/${fileName}`);
    } catch (error) {
      console.warn(
        `Could not save WhatsApp media ${item.id} ${JSON.stringify(mediaDiagnostic(item))}: ${diagnosticError(error)}`,
      );
    }
  }

  return urls;
}

async function saveCustomerOrderMediaFiles(mediaItems, customerKey) {
  const urls = [];
  const hashes = [];
  if (!mediaItems.length) return { urls, hashes };

  const targetDir = path.join(
    uploadRoot,
    'customer-reference',
    safeFilePart(customerKey || 'unknown'),
  );
  await fsp.mkdir(targetDir, { recursive: true });

  for (const item of mediaItems.slice(0, 6)) {
    if (!item.message?.downloadMedia) continue;

    try {
      const media = await item.message.downloadMedia();
      if (!media?.data || !isSupportedCustomerReferenceMime(media.mimetype)) {
        continue;
      }

      const extension = extensionForMime(media.mimetype);
      const fileName = `${safeFilePart(item.id)}.${extension}`;
      const fingerprint = await imageFingerprintFromMedia(media);
      await fsp.writeFile(
        path.join(targetDir, fileName),
        Buffer.from(media.data, 'base64'),
      );
      const url = `${backendUrl}/uploads/customer-reference/${safeFilePart(customerKey || 'unknown')}/${fileName}`;
      urls.push(url);
      hashes.push({
        url,
        sha256: fingerprint.sha256,
        perceptualHash: fingerprint.perceptualHash,
        mimetype: media.mimetype,
      });
    } catch (error) {
      console.warn(
        `Could not save customer reference image ${item.id}: ${errorMessage(error)}`,
      );
    }
  }

  return { urls, hashes };
}

async function saveRunnerBotPaymentProofMediaFiles(mediaItems, runnerKey) {
  const urls = [];
  if (!mediaItems.length) return urls;

  const targetDir = path.join(
    uploadRoot,
    'billing-payment-proofs',
    'runner-bot',
    safeFilePart(runnerKey || 'unknown'),
  );
  await fsp.mkdir(targetDir, { recursive: true });

  for (const item of mediaItems.slice(0, 6)) {
    if (!item.message?.downloadMedia) continue;

    try {
      const media = await item.message.downloadMedia();
      if (!media?.data || !String(media.mimetype || '').startsWith('image/')) {
        continue;
      }

      const extension = extensionForMime(media.mimetype);
      const fileName = `${safeFilePart(item.id)}.${extension}`;
      await fsp.writeFile(
        path.join(targetDir, fileName),
        Buffer.from(media.data, 'base64'),
      );
      urls.push(
        `${backendUrl}/uploads/billing-payment-proofs/runner-bot/${safeFilePart(runnerKey || 'unknown')}/${fileName}`,
      );
    } catch (error) {
      console.warn(
        `Could not save RunnerBot payment proof ${item.id}: ${errorMessage(error)}`,
      );
    }
  }

  return urls;
}

function extensionForMime(mimetype) {
  if (mimetype.includes('png')) return 'png';
  if (mimetype.includes('webp')) return 'webp';
  if (mimetype.includes('gif')) return 'gif';
  if (mimetype.includes('mp4')) return 'mp4';
  if (mimetype.includes('webm')) return 'webm';
  if (mimetype.includes('quicktime')) return 'mov';
  return 'jpg';
}

function isSupportedProductMediaMime(mimetype) {
  const value = String(mimetype || '').toLowerCase();
  return value.startsWith('image/') || value.startsWith('video/');
}

function isSupportedCustomerReferenceMime(mimetype) {
  return String(mimetype || '')
    .toLowerCase()
    .startsWith('image/');
}

function safeFilePart(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 160);
}

function normalizePostText(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ŘŔŖ]/g, 'R')
    .replace(/[řŕŗ]/g, 'r')
    .replace(/[ĚËÈÉÊ]/g, 'E')
    .replace(/[ěëèéê]/g, 'e')
    .replace(/[ÏÍÌÎ]/g, 'I')
    .replace(/[ïíìî]/g, 'i')
    .replace(/[ÅÄÁÀÂÃ]/g, 'A')
    .replace(/[åäáàâã]/g, 'a')
    .replace(/[ČĆĈĊ]/g, 'C')
    .replace(/[čćĉċ]/g, 'c')
    .replace(/[ŜŠŚ]/g, 'S')
    .replace(/[ŝšś]/g, 's')
    .replace(/[ẄŴ]/g, 'W')
    .replace(/[ẅŵ]/g, 'w')
    .replace(/[Ť]/g, 'T')
    .replace(/[ť]/g, 't')
    .replace(/[ĽŁ]/g, 'L')
    .replace(/[ľł]/g, 'l')
    .replace(/[ẒŽŹ]/g, 'Z')
    .replace(/[ẓžź]/g, 'z');
}

async function queuePost(shopId, post) {
  const response = await fetch(`${backendUrl}/whatsapp-imports/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-whatsapp-ingest-secret': ingestSecret,
    },
    body: JSON.stringify({ shopId, posts: [post] }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  return JSON.parse(body);
}

async function processDirectOrderMessage(message, chat) {
  if (message.fromMe) return;

  const interactiveReply =
    message.selectedButtonId || message.selectedRowId || '';
  const rawMessageText = String(interactiveReply || message.body || '').trim();
  if (!rawMessageText && !message.hasMedia) return;
  const messageText = rawMessageText || '[Customer sent a reference image]';
  const orderCode = extractOrderCode(messageText);
  if (isSystemGeneratedOrderMessage(messageText)) return;

  const isGroup = Boolean(chat?.isGroup);
  if (!orderCode && isGroup) return;

  const customer = await resolveOrderCustomer(message, chat, isGroup);
  const customerMedia = await saveCustomerOrderMediaFiles(
    message.hasMedia
      ? [
          {
            message,
            id: message.id?._serialized || message.id?.id || Date.now(),
          },
        ]
      : [],
    customer.phone || customer.rawSender || 'unknown',
  );
  const result = await queueOrderRequest({
    messageText,
    messageId: message.id?._serialized || message.id?.id,
    customerPhone: customer.phone,
    customerName: customer.name,
    customerImageUrls: customerMedia.urls,
    customerImageHashes: customerMedia.hashes,
    recipientPhone: normalizeSender(
      isGroup ? chat.id?._serialized : message.to,
    ),
    receivedAt: message.timestamp
      ? new Date(Number(message.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
  });

  await sendOrderWorkflowFeedback({ message, chat, result, isGroup });

  console.log(
    `Captured customer order request ${result.status} code=${orderCode || result.orderCode || 'follow-up'} customer=${customer.phone || customer.rawSender || 'unknown'}`,
  );
  return result;
}

async function resolveOrderCustomer(message, chat, isGroup) {
  const rawSender = isGroup ? message.author || message.from : message.from;
  const contact = await resolveMessageContact(message, rawSender);
  const customerPhone = firstNormalizedPhone([
    contact?.number,
    contact?.id?._serialized,
    contact?.id?.user,
    message?._data?.author,
    message?._data?.participant,
    rawSender,
  ]);

  const customerName =
    contact?.pushname ||
    contact?.name ||
    contact?.shortName ||
    (isGroup ? message?._data?.notifyName : chat?.name) ||
    undefined;

  return {
    phone: customerPhone,
    name: customerName,
    rawSender,
  };
}

async function resolveMessageContact(message, rawSender) {
  try {
    const contact = await message.getContact();
    if (contact) return contact;
  } catch {
    // Fall through to client lookup.
  }

  if (!rawSender || typeof client?.getContactById !== 'function') return null;

  try {
    return await client.getContactById(rawSender);
  } catch {
    return null;
  }
}

function firstNormalizedPhone(values) {
  for (const value of values) {
    const phone = normalizeWhatsAppPhone(value);
    if (phone) return phone;
  }

  return undefined;
}

function isSystemGeneratedOrderMessage(value) {
  const text = String(value || '').toLowerCase();

  return [
    'thanks, your order request has been received',
    'the runner has been notified',
    'new runner commerce order request',
    'captured order request',
    'runner notification queued',
    'request id:',
    'customer message:',
    'before i notify the runner',
    'please reply with the size',
    'please reply with the color',
    'please reply with the quantity',
    'please confirm your order details',
    'what would you like to change',
    'reply confirm to send it to the runner',
    'the runner is notified only after confirmation',
    'your new runner commerce customer account has been initiated',
  ].some((marker) => text.includes(marker));
}

async function sendOrderWorkflowFeedback({ message, chat, result, isGroup }) {
  if (!isGroup && result.matchedProductPost) {
    try {
      await sendMatchedProductPost(chat, result.matchedProductPost);
    } catch (error) {
      console.warn(
        `Could not return matched product post to customer: ${errorMessage(error)}`,
      );
    }
  }

  if (result.customerReply) {
    try {
      const groupReply =
        `Captured order request ${result.orderCode || ''}. Runner notification ${result.runnerNotification ? 'queued' : 'not available'}.`.trim();
      if (!isGroup && result.customerInteraction?.type === 'buttons') {
        try {
          const interaction = result.customerInteraction;
          if (interaction.alwaysSendText) {
            await message.reply(result.customerReply);
          }
          const buttons = new Buttons(
            interaction.alwaysSendText
              ? 'Tap Start order below, or use the link above.'
              : result.customerReply,
            (interaction.buttons || []).slice(0, 3).map((button) => ({
              id: button.id,
              body: button.title,
            })),
            interaction.title || 'Runner Commerce',
            interaction.footer || 'You can also reply by typing your answer.',
          );
          await message.reply(buttons);
        } catch (interactiveError) {
          console.warn(
            `Interactive WhatsApp reply unavailable; using text fallback: ${errorMessage(interactiveError)}`,
          );
          await message.reply(result.customerReply);
        }
      } else {
        await message.reply(isGroup ? groupReply : result.customerReply);
      }
    } catch (error) {
      console.warn(
        `Could not send customer order acknowledgement: ${errorMessage(error)}`,
      );
    }
  }

  if (result.runnerNotification?.phone && result.runnerNotification?.message) {
    try {
      await sendRunnerOrderNotification(result.runnerNotification);
    } catch (error) {
      console.warn(
        `Could not notify runner for order ${result.orderCode || result.orderRequestId}: ${errorMessage(error)}`,
      );
    }
  }
}

async function sendMatchedProductPost(chat, matchedProductPost) {
  const listing = matchedProductPost.listing;
  const caption = runnerListingCaption(listing, matchedProductPost.caption);
  const mediaUrls = productImages(matchedProductPost.mediaUrls);

  if (mediaUrls.length === 0) {
    await chat.sendMessage(caption);
    return;
  }

  for (let index = 0; index < mediaUrls.length; index += 1) {
    const media = await messageMediaFromUrl(mediaUrls[index]);
    const isLast = index === mediaUrls.length - 1;
    const sent = await chat.sendMessage(
      media,
      isLast ? { caption } : undefined,
    );
    if (isLast && !String(sent?.body || sent?._data?.caption || '').trim()) {
      await chat.sendMessage(caption);
    }
    await sleep(500);
  }
}

async function sendRunnerOrderNotification(notification) {
  const imageUrl = notification.imageUrl || notification.image;

  if (imageUrl) {
    try {
      const media = await messageMediaFromUrl(imageUrl);
      await sendWhatsAppMediaToPhone(
        notification.phone,
        media,
        notification.message,
      );
      return;
    } catch (error) {
      console.warn(
        `Could not send runner order image, falling back to text link: ${errorMessage(error)}`,
      );
    }
  }

  const fallbackMessage = imageUrl
    ? `${notification.message}\nImage: ${imageUrl}`
    : notification.message;
  await sendWhatsAppTextToPhone(notification.phone, fallbackMessage);
}

async function sendWhatsAppTextToPhone(phone, text) {
  const digits = whatsappDigits(phone);
  if (!digits) throw new Error('Runner phone is missing');

  await client.sendMessage(`${digits}@c.us`, text);
}

async function sendWhatsAppDocumentToPhone(message) {
  const digits = whatsappDigits(message.recipientPhone);
  if (!digits) throw new Error('Runner phone is missing');
  if (!message.mediaUrl) throw new Error('Document media URL is missing');

  const media = await messageMediaFromUrl(message.mediaUrl);
  if (message.mimeType) media.mimetype = message.mimeType;
  if (message.filename) media.filename = message.filename;
  await client.sendMessage(`${digits}@c.us`, media, {
    caption: message.messageText || message.filename || 'Document',
  });
}

async function joinWhatsAppGroupFromInvite(inviteLink) {
  const code = whatsappInviteCode(inviteLink);
  if (!code) throw new Error('WhatsApp group invite link is invalid');

  console.log(`Accepting WhatsApp group invite ${code.slice(0, 6)}...`);
  const groupId = await client.acceptInvite(code);
  await sleep(3000);
  try {
    await syncDiscoveredGroupsWithBackend();
  } catch (error) {
    console.warn(
      `Joined group but discovery sync failed: ${errorMessage(error)}`,
    );
  }
  return { groupId };
}

function whatsappInviteCode(value) {
  const match = String(value || '').match(
    /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i,
  );
  return match?.[1] || null;
}

async function recordGroupJoinOutcome(prisma, message, outcome) {
  const runnerSubmittedShopLinkId = phase1RunnerSubmittedShopLinkId(
    message.recipientPhone,
  );
  if (runnerSubmittedShopLinkId) {
    await recordRunnerSubmittedShopLinkJoinOutcome(
      prisma,
      runnerSubmittedShopLinkId,
      message,
      outcome,
    );
    return;
  }

  const runnerRepostingGroupId = phase1RunnerRepostingGroupId(
    message.recipientPhone,
  );
  if (runnerRepostingGroupId) {
    await recordRunnerRepostingGroupJoinOutcome(
      prisma,
      runnerRepostingGroupId,
      message,
      outcome,
    );
    return;
  }

  const sessionId = phase1ProspectSessionId(message.recipientPhone);
  if (!sessionId) return;

  const session = await prisma.botSession.findUnique({
    where: { id: sessionId },
    select: { context: true },
  });
  if (!session) return;

  const context =
    session.context && typeof session.context === 'object'
      ? session.context
      : {};
  const approvals = Array.isArray(context.bridgeJoinApprovals)
    ? context.bridgeJoinApprovals
    : [];
  const nowIso = new Date().toISOString();
  const nextApprovals = approvals.map((approval) => {
    if (
      !approval ||
      typeof approval !== 'object' ||
      (approval.queuedMessageId !== message.id &&
        approval.inviteLink !== message.messageText)
    ) {
      return approval;
    }
    return {
      ...approval,
      status: outcome.status,
      ...(outcome.groupId ? { groupId: outcome.groupId } : {}),
      ...(outcome.error ? { lastError: outcome.error } : {}),
      ...(outcome.status === 'JOINED'
        ? { joinedAt: nowIso }
        : { lastAttemptAt: nowIso }),
    };
  });

  await prisma.botSession.update({
    where: { id: sessionId },
    data: {
      context: {
        ...context,
        bridgeJoinApprovals: nextApprovals,
      },
    },
  });
}

async function recordRunnerSubmittedShopLinkJoinOutcome(
  prisma,
  linkId,
  message,
  outcome,
) {
  const link = await prisma.runnerSubmittedShopLink.findUnique({
    where: { id: linkId },
    include: {
      runner: {
        select: {
          phone: true,
          serviceArea: true,
          phase1Setup: true,
          user: { select: { phone: true, name: true } },
        },
      },
    },
  });
  if (!link) return;

  const destination = runnerShoppingDestination(link.runner);
  const status =
    outcome.status === 'JOINED' ? 'JOINED_PENDING_REVIEW' : 'JOIN_FAILED';
  const note = [
    outcome.status === 'JOINED'
      ? `Joined WhatsApp group id: ${outcome.groupId || 'unknown'}`
      : `Bridge join failed: ${outcome.error || 'unknown error'}`,
    destination ? `Shopping destination: ${destination}` : '',
    message.bridgeAccountId
      ? `Bridge account used: ${message.bridgeAccountId}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  await prisma.runnerSubmittedShopLink.update({
    where: { id: link.id },
    data: {
      status,
      notes: appendNote(link.notes, note),
    },
  });
}

async function recordRunnerRepostingGroupJoinOutcome(
  prisma,
  groupId,
  message,
  outcome,
) {
  const group = await prisma.runnerRepostingGroup.findUnique({
    where: { id: groupId },
    include: {
      runner: {
        select: {
          phone: true,
          trialEndsAt: true,
          user: { select: { phone: true, name: true } },
        },
      },
    },
  });
  if (!group) return;

  if (outcome.status === 'JOINED') {
    let discoveredGroup = outcome.groupId
      ? await prisma.whatsAppDiscoveredGroup.findUnique({
          where: { groupId: outcome.groupId },
        })
      : null;
    const discoveredName = String(discoveredGroup?.name || '').trim();
    const currentName = String(group.groupName || '').trim();
    const groupName =
      discoveredName ||
      (currentName &&
      !/^(pending advertising group|posting group)$/i.test(currentName)
        ? currentName
        : outcome.groupId || 'Pending advertising group');
    const trialEndsLine = group.runner?.trialEndsAt
      ? 'Trial ends: ' + formatShortDate(group.runner.trialEndsAt) + '.'
      : 'Trial ends after your 2-week Starter Runner trial.';

    if (outcome.groupId) {
      discoveredGroup = await prisma.whatsAppDiscoveredGroup.upsert({
        where: { groupId: outcome.groupId },
        create: {
          groupId: outcome.groupId,
          name: groupName,
          groupPurpose: 'RUNNER_ADVERTISING',
          importedRunnerAdvertisingAt: new Date(),
          archivedAt: null,
          lastSeenAt: new Date(),
        },
        update: {
          name: groupName,
          groupPurpose: 'RUNNER_ADVERTISING',
          importedRunnerAdvertisingAt:
            discoveredGroup?.importedRunnerAdvertisingAt || new Date(),
          archivedAt: null,
          lastSeenAt: new Date(),
        },
      });
    }

    await prisma.runnerRepostingGroup.update({
      where: { id: group.id },
      data: {
        groupName,
        whatsappGroupId: outcome.groupId || group.whatsappGroupId,
        discoveredGroupId: discoveredGroup?.id || group.discoveredGroupId,
        bridgeAccountId: message.bridgeAccountId || group.bridgeAccountId,
        botJoinStatus: 'JOINED_GROUP',
        botAdminStatus: 'ADMIN_VERIFIED',
        runnerConfirmedAdminAt: group.runnerConfirmedAdminAt || new Date(),
        adminVerifiedAt: group.adminVerifiedAt || new Date(),
        status: 'READY_FOR_REPOSTING',
        notes: appendNote(
          group.notes,
          `Bridge joined invite${outcome.groupId ? ` as ${outcome.groupId}` : ''}; trusted automatically for reposting.`,
        ),
      },
    });

    await queueRunnerRepostingGroupNotice(
      prisma,
      group,
      message.bridgeAccountId,
      [
        '------------------',
        'POSTING GROUP READY',
        '------------------',
        '',
        `Runner Commerce bot joined ${groupName}.`,
        'Open the group, make the bot an admin, and keep it there.',
        '',
        [
          'Customer advertising posting group saved.',
          '',
          'Posting stays paused until START or RESUME.',
          'Options: STATUS, START, PAUSE, RESUME, STOP.',
          'Reply GROUPS to review saved posting groups.',
          'Reply MENU for all options.',
        ].join('\n'),
      ].join('\n'),
    );
    return;
  }

  if (outcome.status === 'FAILED') {
    await queueRunnerRepostingGroupNotice(
      prisma,
      group,
      message.bridgeAccountId,
      [
        `Runner Commerce could not join ${group.groupName || 'your reposting group'}.`,
        'Please add the bot number back to the WhatsApp group or send a fresh invite link, then make the bot an admin.',
        'After that, reply GROUPS to check the group or resend the link.',
        outcome.error ? `Last error: ${outcome.error}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
    await prisma.runnerRepostingGroup.delete({
      where: { id: group.id },
    });
    return;
  }

  await prisma.runnerRepostingGroup.update({
    where: { id: group.id },
    data: {
      botJoinStatus: 'JOIN_ATTEMPT_STARTED',
      status: 'JOIN_ATTEMPT_STARTED',
      notes: appendNote(
        group.notes,
        outcome.error
          ? `Bridge join ${outcome.status.toLowerCase()}: ${outcome.error}`
          : `Bridge join ${outcome.status.toLowerCase()}.`,
      ),
    },
  });
}

function appendNote(existing, note) {
  return [existing, note].filter(Boolean).join('\n');
}

function runnerShoppingDestination(runner) {
  const setup =
    runner?.phase1Setup && typeof runner.phase1Setup === 'object'
      ? runner.phase1Setup
      : {};
  return (
    cleanText(setup.shopTown) ||
    cleanText(setup.shoppingDestination) ||
    cleanText(runner?.serviceArea)
  );
}

function cleanText(value) {
  const clean = String(value || '').trim();
  return clean || null;
}

function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'date to be confirmed';
  return date.toLocaleDateString('en-SZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

async function queueRunnerRepostingGroupNotice(
  prisma,
  group,
  bridgeAccountId,
  messageText,
) {
  const recipientPhone =
    group?.runner?.phone || group?.runner?.user?.phone || null;
  if (!bridgeAccountId || !recipientPhone || !messageText) return;

  await prisma.whatsAppOutboundMessage.create({
    data: {
      bridgeAccountId,
      recipientPhone,
      messageType: 'TEXT',
      messageText,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

function phase1ProspectSessionId(value) {
  const text = String(value || '');
  return text.startsWith('PHASE1_PROSPECT:')
    ? text.slice('PHASE1_PROSPECT:'.length)
    : null;
}

function phase1RunnerRepostingGroupId(value) {
  const text = String(value || '');
  return text.startsWith('RUNNER_REPOSTING_GROUP:')
    ? text.slice('RUNNER_REPOSTING_GROUP:'.length)
    : null;
}

function phase1RunnerSubmittedShopLinkId(value) {
  const text = String(value || '');
  return text.startsWith('RUNNER_SUBMITTED_SHOP_LINK:')
    ? text.slice('RUNNER_SUBMITTED_SHOP_LINK:'.length)
    : null;
}

async function sendWhatsAppMediaToPhone(phone, media, caption) {
  const digits = whatsappDigits(phone);
  if (!digits) throw new Error('Runner phone is missing');

  await client.sendMessage(`${digits}@c.us`, media, { caption });
}

function isOrderInboxGroup(chat, groupId) {
  if (!orderInboxGroups.length) return false;

  const candidates = new Set(
    [groupId, chat?.id?._serialized, chat?.name]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase()),
  );

  return orderInboxGroups.some((group) =>
    candidates.has(
      String(group || '')
        .trim()
        .toLowerCase(),
    ),
  );
}

async function queueOrderRequest(orderRequest) {
  const response = await fetch(
    `${backendUrl}/whatsapp-imports/webhook/order-requests`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-whatsapp-ingest-secret': ingestSecret,
      },
      body: JSON.stringify(orderRequest),
    },
  );
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  return JSON.parse(body);
}

function hasPhase1BotText(value) {
  const text = String(value || '').trim();
  return text.length > 0;
}

function runnerBotReplyTexts(result) {
  if (!result || typeof result !== 'object') return [];
  const values = [];
  if (Array.isArray(result.messages)) values.push(...result.messages);
  values.push(result.message, result.replyText, result.text);
  return Array.from(
    new Set(values.map((value) => String(value || '').trim()).filter(Boolean)),
  );
}

async function enqueuePhase1BotMessage(message, chat) {
  return new Promise((resolve, reject) => {
    const sender = message.from || message.author;
    runnerBotQueue.push({ message, chat, sender, resolve, reject });
    writeBridgeTaskLog(
      `RunnerBot private message queued from ${maskPhone(sender)}; pending=${runnerBotQueue.length}.`,
    );
    void processRunnerBotQueue();
  });
}

async function processRunnerBotQueue() {
  if (runnerBotProcessing) return;
  runnerBotProcessing = true;
  try {
    while (runnerBotQueue.length > 0) {
      const item = runnerBotQueue.shift();
      try {
        const result = await processPhase1BotMessage(item.message);
        const replies = runnerBotReplyTexts(result);
        writeBridgeTaskLog(
          `RunnerBot backend result from ${maskPhone(item.sender)}; command=${result?.command || 'none'} replies=${replies.length}.`,
        );
        for (const replyText of replies) {
          await sendRunnerBotReplyText(
            item.chat,
            replyText,
            item.sender,
            item.message,
          );
        }
        if (replies.length > 0) {
          writeBridgeTaskLog(
            `RunnerBot reply sent to ${maskPhone(item.sender)}; messages=${replies.length}.`,
          );
        } else {
          writeBridgeTaskLog(
            `RunnerBot backend returned no reply text for ${maskPhone(item.sender)}; command=${result?.command || 'none'}.`,
          );
        }
        item.resolve(result);
      } catch (error) {
        writeBridgeTaskLog(
          `RunnerBot reply failed for ${maskPhone(item.sender)}: ${diagnosticError(error)}`,
        );
        item.reject(error);
      }
    }
  } finally {
    runnerBotProcessing = false;
    if (runnerBotQueue.length > 0) void processRunnerBotQueue();
  }
}

async function sendRunnerBotReplyText(chat, replyText, sender, message) {
  const send = async () => {
    if (chat?.sendMessage) {
      await chat.sendMessage(replyText);
      return;
    }
    if (message?.reply) {
      await message.reply(replyText);
      return;
    }
    const digits = whatsappDigits(sender);
    if (!digits) throw new Error('RunnerBot reply target phone is missing');
    await client.sendMessage(`${digits}@c.us`, replyText);
  };

  try {
    await send();
  } catch (error) {
    writeBridgeTaskLog(
      `RunnerBot reply send retry for ${maskPhone(sender)} after error: ${errorMessage(error)}`,
    );
    await sleep(10_000);
    await send();
  }
}

async function processPhase1BotMessage(message) {
  const rawSender = message.from || message.author;
  const contact = await resolveMessageContact(message, rawSender);
  const senderPhone =
    firstNormalizedPhone([
      contact?.number,
      contact?.id?._serialized,
      contact?.id?.user,
      message?._data?.author,
      message?._data?.participant,
      rawSender,
    ]) || normalizeSender(rawSender);
  const mediaUrls = message.hasMedia
    ? await saveRunnerBotPaymentProofMediaFiles(
        [
          {
            id: message.id?._serialized || message.id?.id || Date.now(),
            message,
          },
        ],
        senderPhone,
      )
    : [];
  const response = await fetch(`${backendUrl}/phase1-bot/webhook/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-whatsapp-ingest-secret': ingestSecret,
    },
    body: JSON.stringify({
      whatsappNumber: senderPhone,
      messageText: message.body || '',
      messageId: message.id?._serialized || message.id?.id,
      mediaUrls,
      bridgeAccountId: bridgeAccountId || undefined,
      receivedAt: message.timestamp
        ? new Date(Number(message.timestamp) * 1000).toISOString()
        : new Date().toISOString(),
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Phase 1 bot HTTP ${response.status}: ${body}`);
  }
  const result = JSON.parse(body);
  writeBridgeTaskLog(
    `Phase 1 bot accepted private message from ${maskPhone(senderPhone)}; response command=${result?.command || 'none'}.`,
  );
  return result;
}

function extractOrderCode(value) {
  const match = String(value || '').match(/\bRC-[A-Z0-9]{6,10}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function validateConfig({ requireGroupMap }) {
  if (!ingestSecret) {
    throw new Error('WHATSAPP_INGEST_SECRET is required');
  }

  if (requireGroupMap && Object.keys(groupShopMap).length === 0) {
    throw new Error(
      'WHATSAPP_SESSION_GROUP_SHOP_MAP must map at least one group id/name to a shop id',
    );
  }
}

function argValue(name) {
  const longName = name.startsWith('--') ? name : `--${name}`;
  const equalsArg = rawArgs.find((item) => item.startsWith(`${longName}=`));

  if (equalsArg) return equalsArg.slice(longName.length + 1);

  const index = rawArgs.indexOf(longName);
  if (
    index >= 0 &&
    rawArgs[index + 1] &&
    !rawArgs[index + 1].startsWith('--')
  ) {
    return rawArgs[index + 1];
  }

  return undefined;
}

function argValues(name) {
  const longName = name.startsWith('--') ? name : `--${name}`;
  const values = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const item = rawArgs[index];

    if (item.startsWith(`${longName}=`)) {
      values.push(item.slice(longName.length + 1));
      continue;
    }

    if (
      item === longName &&
      rawArgs[index + 1] &&
      !rawArgs[index + 1].startsWith('--')
    ) {
      values.push(rawArgs[index + 1]);
      index += 1;
    }
  }

  return values.filter(Boolean);
}

function argNumber(name, defaultValue) {
  const value = argValue(name);
  if (value === undefined) return defaultValue;

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`--${name.replace(/^--/, '')} must be a number`);
  }

  return number;
}

function parseDateArg(value, label) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    throw new Error(
      `${label} must be a valid date/time, for example 2026-06-01T08:00`,
    );
  }

  return new Date(timestamp);
}

function parseJsonMap(value) {
  if (!value) return {};

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(
      `WHATSAPP_SESSION_GROUP_SHOP_MAP must be valid JSON: ${errorMessage(error)}`,
    );
  }
}

function findInstalledBrowser() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function openWhatsAppWebDiagnostic() {
  const puppeteer = require('puppeteer');
  console.log(
    `Opening WhatsApp Web diagnostic on Node ${process.version} with ${executablePath || 'Puppeteer browser'}`,
  );
  const debugPort = getBrowserDebugPort(browserDebugUrl);
  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    protocolTimeout,
    defaultViewport: null,
    ...(reuseBrowser
      ? {
          userDataDir: path.join(
            process.env.TEMP || process.env.TMP || '.',
            'runner-commerce-whatsapp-chrome',
          ),
        }
      : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-quic',
      '--disable-features=UseDnsHttpsSvcb,UseDnsHttpsHttpsSvcb,AsyncDns,QuicProtocol',
      '--window-size=1280,900',
      ...(reuseBrowser ? [`--remote-debugging-port=${debugPort}`] : []),
    ],
  });
  const page = await browser.newPage();
  await page.goto('https://web.whatsapp.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  console.log('WhatsApp Web opened. Leave this window open to inspect it.');
  if (reuseBrowser) {
    console.log(
      `Reusable Chrome debug endpoint is available at ${browserDebugUrl}. In another terminal run: npm run whatsapp:session:bridge -- --reuse-browser`,
    );
  }
  console.log('Press Ctrl+C in this terminal to close the diagnostic browser.');

  await new Promise(() => {});
}

async function isDebugBrowserAvailable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/json/version`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getBrowserDebugPort(url) {
  try {
    return new URL(url).port || '9222';
  } catch {
    return '9222';
  }
}

function normalizeSender(value) {
  if (!value) return undefined;

  const raw = String(value).trim();
  if (/@(?:lid|g\.us)$/i.test(raw)) return undefined;

  const clean = raw
    .replace(/@c\.us$/i, '')
    .replace(/@s\.whatsapp\.net$/i, '')
    .trim();

  return clean || undefined;
}

function normalizeWhatsAppPhone(value) {
  if (!value) return undefined;

  const raw = String(value).trim();
  if (!raw || /@(?:lid|g\.us)$/i.test(raw)) return undefined;

  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 12) return undefined;
  if (digits.startsWith('120363')) return undefined;

  if (digits.length === 8) return `+268${digits}`;
  if (digits.startsWith('268') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10)
    return `+27${digits.slice(1)}`;
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`;

  return undefined;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function diagnosticError(error) {
  if (!(error instanceof Error)) return String(error);
  const structuredDiagnostic = error.downloadDiagnostic
    ? ` diagnostic=${JSON.stringify(error.downloadDiagnostic)}`
    : '';
  return [
    error.name || 'Error',
    `${error.message}${structuredDiagnostic}`,
    error.stack ? error.stack.split(/\r?\n/).slice(1, 4).join(' | ') : '',
  ]
    .filter(Boolean)
    .join(': ');
}
