const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const root = path.resolve(backendRoot, '..');
const logDir = path.join(backendRoot, 'logs');
const monitorLog = path.join(logDir, 'task-whatsapp-bridge-monitor.log');

const pollSeconds = Number(process.env.WHATSAPP_MONITOR_POLL_SECONDS || 60);
const failureThreshold = Number(
  process.env.WHATSAPP_MONITOR_FAILURE_THRESHOLD || 4,
);
const cooldownSeconds = Number(
  process.env.WHATSAPP_MONITOR_COOLDOWN_SECONDS || 300,
);
const staleMinutes = Number(process.env.WHATSAPP_MONITOR_STALE_MINUTES || 45);
const tailLines = Number(process.env.WHATSAPP_MONITOR_TAIL_LINES || 180);

const bridges = [
  {
    name: 'WhatsApp Bridge 1',
    bridgeAccountId: 'c153058c-375f-475b-93ea-86d1bc1dcc42',
    sessionName: 'runner-commerce-bridge-001',
    authPath: path.join(backendRoot, '.wwebjs_auth_bridge_001'),
    logName: 'task-whatsapp-bridge-001.log',
  },
  {
    name: 'WhatsApp Bridge 2',
    bridgeAccountId: '246622ad-dd30-4adf-aef6-f2ea41e6d17d',
    sessionName: 'runner-commerce-bridge-002',
    authPath: path.join(backendRoot, '.wwebjs_auth_bridge_002'),
    logName: 'task-whatsapp-bridge-002.log',
  },
];

const failurePatterns = [
  /Attempted to use detached Frame/i,
  /Runtime\.callFunctionOn timed out/i,
  /Execution context was destroyed/i,
  /Protocol error/i,
  /auth timeout/i,
  /Target closed/i,
  /net::ERR/i,
  /Runner auto-post failed/i,
  /Hourly shop capture failed/i,
  /WhatsApp group discovery sync failed/i,
];

const workerStartPattern = /Starting WhatsApp bridge worker/i;

const healthyPatterns = [
  workerStartPattern,
  /WhatsApp QR awaiting scan/i,
  /WhatsApp session bridge ready/i,
  /WhatsApp session authenticated/i,
  /Synced .* authenticated WhatsApp group/i,
  /Capturing .* mapped group/i,
  /Auto-post result .* sent=.* failed=0/i,
  /Hourly capture .* failed=0/i,
  /Hourly shop capture sweep completed/i,
  /Runner auto-post scheduler active/i,
];

const lastRestartByBridge = new Map();

function writeMonitorLog(message) {
  fs.mkdirSync(logDir, { recursive: true });
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
  const line = `[${stamp}] ${message}`;
  fs.appendFileSync(monitorLog, `${line}\n`, 'utf8');
  console.log(line);
}

function decodeLog(buffer) {
  const hasUtf16LeBom = buffer[0] === 0xff && buffer[1] === 0xfe;
  return buffer
    .toString(hasUtf16LeBom ? 'utf16le' : 'utf8')
    .replace(/\u0000/g, '');
}

function matchesAny(line, patterns) {
  return patterns.some((pattern) => pattern.test(line));
}

function getBridgeSignal(bridge) {
  const logFile = path.join(logDir, bridge.logName);
  if (!fs.existsSync(logFile)) {
    return {
      state: 'UNKNOWN',
      issueCount: 0,
      lastIssue: null,
      lastHealthy: null,
      reason: 'log file not found',
    };
  }

  const stats = fs.statSync(logFile);
  const lines = decodeLog(fs.readFileSync(logFile))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-tailLines);

  const latestWorkerStartIndex = lines.findLastIndex((line) =>
    workerStartPattern.test(line),
  );
  const currentWorkerLines =
    latestWorkerStartIndex >= 0 ? lines.slice(latestWorkerStartIndex) : lines;

  let lastHealthyIndex = -1;
  let lastIssueIndex = -1;
  for (const [index, line] of currentWorkerLines.entries()) {
    if (matchesAny(line, healthyPatterns)) lastHealthyIndex = index;
    if (matchesAny(line, failurePatterns)) lastIssueIndex = index;
  }

  const issueLines = currentWorkerLines
    .slice(lastHealthyIndex + 1)
    .filter((line) => matchesAny(line, failurePatterns));

  const staleAfter = Date.now() - staleMinutes * 60 * 1000;
  if (
    issueLines.length >= failureThreshold &&
    lastIssueIndex > lastHealthyIndex
  ) {
    return {
      state: 'BROKEN',
      issueCount: issueLines.length,
      lastIssue: currentWorkerLines[lastIssueIndex] || null,
      lastHealthy:
        lastHealthyIndex >= 0 ? currentWorkerLines[lastHealthyIndex] : null,
      reason: `${issueLines.length} repeated runtime issue(s) after last healthy line`,
    };
  }

  if (stats.mtimeMs < staleAfter) {
    return {
      state: 'STALE',
      issueCount: issueLines.length,
      lastIssue:
        lastIssueIndex >= 0 ? currentWorkerLines[lastIssueIndex] : null,
      lastHealthy:
        lastHealthyIndex >= 0 ? currentWorkerLines[lastHealthyIndex] : null,
      reason: `log has not changed since ${stats.mtime.toISOString()}`,
    };
  }

  return {
    state: 'OK',
    issueCount: issueLines.length,
    lastIssue: lastIssueIndex >= 0 ? currentWorkerLines[lastIssueIndex] : null,
    lastHealthy:
      lastHealthyIndex >= 0 ? currentWorkerLines[lastHealthyIndex] : null,
    reason: 'healthy',
  };
}

function restartBridgeWorker(bridge, signal) {
  const lockFile = path.join(
    bridge.authPath,
    `${bridge.sessionName}.bridge.lock`,
  );
  if (!fs.existsSync(lockFile)) {
    writeMonitorLog(
      `${bridge.name}: cannot restart because lock file was not found at ${lockFile}`,
    );
    return;
  }

  try {
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const pid = Number(lock.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      writeMonitorLog(`${bridge.name}: lock file does not contain a valid pid`);
      return;
    }

    writeMonitorLog(
      `${bridge.name}: restarting worker pid ${pid} because ${signal.reason}. Last issue: ${signal.lastIssue || 'none'}`,
    );
    process.kill(pid, 'SIGTERM');
    setTimeout(() => {
      try {
        process.kill(pid, 0);
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process has already exited.
      }
    }, 3000).unref();
  } catch (error) {
    writeMonitorLog(`${bridge.name}: restart failed: ${error.message}`);
  }
}

function checkBridge(bridge) {
  const signal = getBridgeSignal(bridge);
  if (!['BROKEN', 'STALE'].includes(signal.state)) return;

  const lastRestart = lastRestartByBridge.get(bridge.bridgeAccountId) || 0;
  const cooldownOpen = lastRestart < Date.now() - cooldownSeconds * 1000;
  if (!cooldownOpen) {
    writeMonitorLog(
      `${bridge.name}: ${signal.state} detected but restart is cooling down. Reason: ${signal.reason}`,
    );
    return;
  }

  lastRestartByBridge.set(bridge.bridgeAccountId, Date.now());
  restartBridgeWorker(bridge, signal);
}

writeMonitorLog(
  `WhatsApp bridge monitor started from ${root}. Poll=${pollSeconds}s threshold=${failureThreshold} cooldown=${cooldownSeconds}s stale=${staleMinutes}m`,
);

setInterval(() => {
  for (const bridge of bridges) {
    try {
      checkBridge(bridge);
    } catch (error) {
      writeMonitorLog(`${bridge.name}: monitor check failed: ${error.message}`);
    }
  }
}, pollSeconds * 1000);
