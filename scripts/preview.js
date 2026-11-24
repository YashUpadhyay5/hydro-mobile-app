// `npm run preview`: the app against a local copy of backend/ (features the production server does not have yet),
// on a private scratch database. Nothing to configure: this PC's Wi-Fi address is found here and handed to Expo.
// Plain `npx expo start` is unaffected and keeps using EXPO_PUBLIC_API_URL from .env.local.
//
//   npm run preview                 backend + `expo start --tunnel --clear`
//   npm run preview -- --lan        backend + `expo start --lan` (any args replace the default Expo flags)
const { spawn, execSync } = require('child_process');
const os = require('os');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.PREVIEW_PORT) || 8101;
// This file lives in <project>/scripts, so the project folder is one level up from it.
const projectDir = path.resolve(path.dirname(process.argv[1]), '..');
const backendDir = path.join(projectDir, 'backend');

// The address a phone on the same Wi-Fi reaches this PC on: a private IPv4 address, preferring the Wi-Fi
// adapter and skipping virtual ones (WSL, Hyper-V, VirtualBox, VMware, Docker).
function lanAddress() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (/vethernet|virtual|vmware|vbox|docker|wsl|loopback/i.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) continue;
      candidates.push({ address: a.address, rank: /wi-?fi|wlan|wireless/i.test(name) ? 0 : 1 });
    }
  }
  candidates.sort((x, y) => x.rank - y.rank);
  return candidates[0]?.address ?? null;
}

const isUp = () =>
  new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/leaves/categories', timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });

const killTree = (child) => {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    else child.kill('SIGTERM');
  } catch { /* already gone */ }
};

async function main() {
  const ip = lanAddress();
  if (!ip) {
    console.error('[preview] No Wi-Fi/LAN address found. Connect this PC to the same Wi-Fi as your phone and try again.');
    process.exit(1);
  }
  const apiUrl = `http://${ip}:${PORT}/api`;

  let backend = null;
  if (await isUp()) {
    console.log(`[preview] A preview backend is already running on port ${PORT}; using it.`);
  } else {
    console.log('[preview] Starting the preview backend (private database in backend/.preview-db) ...');
    backend = spawn(process.execPath, ['scripts/preview-server.js'], { cwd: backendDir, stdio: ['ignore', 'pipe', 'pipe'] });
    // Only the preview's own lines and real errors; the backend's routine startup chatter stays out of Expo's way.
    const relay = (stream, out) => stream.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) if (/\[preview\]|error|fault/i.test(line)) out.write(line + '\n');
    });
    relay(backend.stdout, process.stdout);
    relay(backend.stderr, process.stderr);
    backend.on('exit', (code) => { if (code) console.error(`[preview] Preview backend stopped (exit ${code}).`); });

    for (let i = 0; i < 120 && !(await isUp()); i++) {
      if (backend.exitCode !== null) process.exit(1);
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!(await isUp())) {
      console.error('[preview] The preview backend did not start within 2 minutes.');
      killTree(backend);
      process.exit(1);
    }
  }

  console.log(`[preview] App will use ${apiUrl}  (your phone must be on the same Wi-Fi as this PC)`);
  const expoArgs = process.argv.slice(2).length ? process.argv.slice(2) : ['--tunnel', '--clear'];
  // A variable already set in the environment wins over .env.local, so .env.local itself is left alone.
  const expo = spawn('npx', ['expo', 'start', ...expoArgs], {
    cwd: projectDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl },
  });

  const shutdown = () => { killTree(expo); killTree(backend); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  expo.on('exit', () => { killTree(backend); process.exit(0); });
}

main();
