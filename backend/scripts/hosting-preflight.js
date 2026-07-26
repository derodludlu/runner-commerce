const { execFileSync } = require('node:child_process');

const PM2_HOME = process.env.PM2_HOME || 'C:\\Dev\\runnercommercequen35plus\\.pm2';
const LOCAL_BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
  } catch (error) {
    return error.stdout?.toString() || error.stderr?.toString() || error.message;
  }
}

function pm2List() {
  const output = run('npx', ['pm2', 'jlist'], { env: { ...process.env, PM2_HOME } });
  try {
    return JSON.parse(output);
  } catch {
    return [];
  }
}

function nodeProcesses() {
  if (process.platform !== 'win32') {
    return run('ps', ['-eo', 'pid,args']).split(/\r?\n/).filter(Boolean);
  }
  return run('powershell.exe', [
    '-NoProfile',
    '-Command',
    'Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }',
  ]).split(/\r?\n/).filter(Boolean);
}

async function checkHealth() {
  const response = await fetch(LOCAL_BACKEND_URL + '/health');
  return { ok: response.ok, status: response.status };
}

(async () => {
  const apps = pm2List();
  const statusByName = Object.fromEntries(
    apps.map((app) => [app.name, app.pm2_env?.status || 'unknown']),
  );
  const processes = nodeProcesses();
  const manualBridgeProcesses = processes.filter((line) =>
    /whatsapp-session-bridge\.js|whatsapp:session:bridge/i.test(line),
  );
  const health = await checkHealth().catch((error) => ({
    ok: false,
    status: 'error',
    error: error.message,
  }));

  const result = {
    pm2Home: PM2_HOME,
    backendHealth: health,
    pm2: {
      api: statusByName['runner-commerce-api'] || 'missing',
      frontend: statusByName['runner-commerce-frontend'] || 'missing',
      whatsappMonitor: statusByName['runner-commerce-whatsapp-monitor'] || 'missing',
      whatsappBridge: statusByName['runner-commerce-whatsapp-bridge'] || 'not-managed-by-pm2',
    },
    manualBridgeProcessCount: manualBridgeProcesses.length,
    repostingUndisturbed: Boolean(
      health.ok &&
        statusByName['runner-commerce-api'] === 'online' &&
        statusByName['runner-commerce-whatsapp-monitor'] === 'online' &&
        manualBridgeProcesses.length > 0,
    ),
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.repostingUndisturbed) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
