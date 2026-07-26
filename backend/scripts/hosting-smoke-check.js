const { execFileSync } = require('node:child_process');

const PM2_HOME = process.env.PM2_HOME || 'C:\\Dev\\runnercommercequen35plus\\.pm2';
const PUBLIC_FRONTEND_URL = requiredUrl('PUBLIC_FRONTEND_URL');
const PUBLIC_BACKEND_URL = requiredUrl('PUBLIC_BACKEND_URL');
const RUNNER_CODE = String(process.env.RUNNER_CODE || '').trim();
const ORDER_CODE = String(process.env.ORDER_CODE || '').trim();

function requiredUrl(name) {
  const value = String(process.env[name] || '').trim().replace(/\/$/, '');
  if (!value) {
    console.error(name + " is required");
    process.exit(1);
  }
  return value;
}

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
  if (process.platform !== 'win32') return run('ps', ['-eo', 'pid,args']).split(/\r?\n/);
  return run('powershell.exe', [
    '-NoProfile',
    '-Command',
    'Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }',
  ]).split(/\r?\n/);
}

async function probe(label, url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().then((text) => text.slice(0, 180)).catch(() => '');
  return { label, url, ok: response.ok, status: response.status, body };
}

(async () => {
  const probes = [
    await probe('public backend health', PUBLIC_BACKEND_URL + '/health'),
    await probe('public frontend home', PUBLIC_FRONTEND_URL),
  ];

  if (RUNNER_CODE) {
    const runnerPath = '/r/' + encodeURIComponent(RUNNER_CODE);
    const query = ORDER_CODE ? '?code=' + encodeURIComponent(ORDER_CODE) : '';
    probes.push(await probe('runner storefront', PUBLIC_FRONTEND_URL + runnerPath + query));
    probes.push(
      await probe(
        'public runner api',
        PUBLIC_BACKEND_URL + '/runner/public/' + encodeURIComponent(RUNNER_CODE) + query,
      ),
    );
  }

  const apps = pm2List();
  const statusByName = Object.fromEntries(
    apps.map((app) => [app.name, app.pm2_env?.status || 'unknown']),
  );
  const manualBridgeProcessCount = nodeProcesses().filter((line) =>
    /whatsapp-session-bridge\.js|whatsapp:session:bridge/i.test(line),
  ).length;

  const result = {
    probes,
    pm2: {
      api: statusByName['runner-commerce-api'] || 'missing',
      frontend: statusByName['runner-commerce-frontend'] || 'missing',
      whatsappMonitor: statusByName['runner-commerce-whatsapp-monitor'] || 'missing',
    },
    manualBridgeProcessCount,
  };

  console.log(JSON.stringify(result, null, 2));

  const failedProbe = probes.find((item) => !item.ok);
  const repostingOk =
    statusByName['runner-commerce-whatsapp-monitor'] === 'online' &&
    manualBridgeProcessCount > 0;
  if (failedProbe || !repostingOk) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
