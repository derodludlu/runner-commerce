const path = require('node:path');

const cwd = __dirname;
const rootDir = path.resolve(cwd, '..');
const frontendCwd = path.join(rootDir, 'frontend');
const logsDir = path.join(cwd, 'logs');
const nodeExe = path.join(cwd, 'node_modules', 'node', 'bin', 'node.exe');

module.exports = {
  apps: [
    {
      name: 'runner-commerce-frontend',
      cwd: frontendCwd,
      script: path.join(
        frontendCwd,
        'node_modules',
        'next',
        'dist',
        'bin',
        'next',
      ),
      args: 'start',
      interpreter: nodeExe,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.FRONTEND_PORT || '3000',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      out_file: path.join(logsDir, 'pm2-frontend.out.log'),
      error_file: path.join(logsDir, 'pm2-frontend.err.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'runner-commerce-frontend-dev',
      cwd: frontendCwd,
      script: path.join(
        frontendCwd,
        'node_modules',
        'next',
        'dist',
        'bin',
        'next',
      ),
      args: 'dev',
      interpreter: nodeExe,
      env: {
        NODE_ENV: 'development',
        PORT: process.env.FRONTEND_DEV_PORT || '3002',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      out_file: path.join(logsDir, 'pm2-frontend-dev.out.log'),
      error_file: path.join(logsDir, 'pm2-frontend-dev.err.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'runner-commerce-api',
      cwd,
      script: path.join(cwd, 'dist', 'main.js'),
      interpreter: nodeExe,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '3001',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      out_file: path.join(logsDir, 'pm2-api.out.log'),
      error_file: path.join(logsDir, 'pm2-api.err.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'runner-commerce-whatsapp-bridge',
      cwd,
      script: 'scripts/whatsapp-session-bridge.js',
      interpreter: nodeExe,
      env: {
        NODE_ENV: 'development',
        BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:3001',
        WHATSAPP_SESSION_NAME: 'runner-commerce-bridge-001',
        WHATSAPP_SESSION_AUTH_PATH: path.join(cwd, '.wwebjs_auth_bridge_001'),
        WHATSAPP_SESSION_HEADLESS: 'true',
        WHATSAPP_SESSION_AUTH_TIMEOUT_MS:
          process.env.WHATSAPP_SESSION_AUTH_TIMEOUT_MS || '3600000',
        WHATSAPP_SESSION_PROTOCOL_TIMEOUT_MS:
          process.env.WHATSAPP_SESSION_PROTOCOL_TIMEOUT_MS || '600000',
        WHATSAPP_SESSION_QR_MAX_RETRIES:
          process.env.WHATSAPP_SESSION_QR_MAX_RETRIES || '180',
        WHATSAPP_BRIDGE_TASK_LOG:
          process.env.WHATSAPP_BRIDGE_TASK_LOG ||
          'task-whatsapp-bridge-001.log',
        WHATSAPP_BRIDGE_ACCOUNT_ID:
          process.env.WHATSAPP_BRIDGE_ACCOUNT_ID ||
          'c153058c-375f-475b-93ea-86d1bc1dcc42',
        WHATSAPP_BRIDGE_WORKER_KEY:
          process.env.WHATSAPP_BRIDGE_WORKER_KEY || 'bridge-001',
        WHATSAPP_BRIDGE_ROLE:
          process.env.WHATSAPP_BRIDGE_ROLE || 'RUNNER_COMMUNICATION',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      out_file: path.join(logsDir, 'pm2-whatsapp-bridge.out.log'),
      error_file: path.join(logsDir, 'pm2-whatsapp-bridge.err.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'runner-commerce-whatsapp-monitor',
      cwd,
      script: 'scripts/whatsapp-bridge-monitor.js',
      interpreter: nodeExe,
      env: {
        NODE_ENV: 'development',
        WHATSAPP_MONITOR_POLL_SECONDS:
          process.env.WHATSAPP_MONITOR_POLL_SECONDS || '60',
        WHATSAPP_MONITOR_FAILURE_THRESHOLD:
          process.env.WHATSAPP_MONITOR_FAILURE_THRESHOLD || '4',
        WHATSAPP_MONITOR_COOLDOWN_SECONDS:
          process.env.WHATSAPP_MONITOR_COOLDOWN_SECONDS || '300',
        WHATSAPP_MONITOR_STALE_MINUTES:
          process.env.WHATSAPP_MONITOR_STALE_MINUTES || '45',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      out_file: path.join(logsDir, 'pm2-whatsapp-monitor.out.log'),
      error_file: path.join(logsDir, 'pm2-whatsapp-monitor.err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
