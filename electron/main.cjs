const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = !!DEV_URL;

// ── Backend process ──────────────────────────────────────────────
// The backend lives in the sibling `umbra` folder and exposes the API at
// port 8787. (Older builds pointed at `umbra - Copia (2)` — a stale backup
// copy that drifted out of sync; the real backend is `../umbra`.)
const BACKEND_DIR = path.join(__dirname, '..', '..', 'umbra');
const BACKEND_ENTRY = path.join(BACKEND_DIR, 'dist', 'index.js');
const BACKEND_DEV_ENTRY = path.join(BACKEND_DIR, 'src', 'index.ts');
const BACKEND_PORT = 8787;
let backendProcess = null;

// Prefer the well-known install location, fall back to `node` on PATH so the
// app still starts the backend on machines with a non-standard Node install
// (nvm-windows, scoop, portable builds, ...).
function resolveNodeExe() {
  const fs = require('fs');
  const candidates = [
    'C:\\Program Files\\nodejs\\node.exe',
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs', 'node.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs', 'node.exe'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (typeof c === 'string' && fs.existsSync(c)) return c;
  }
  return 'node'; // resolve from PATH
}

async function isPortInUse(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createConnection({ port, host: '127.0.0.1' });
    server.on('connect', () => { server.destroy(); resolve(true); });
    server.on('error', () => { server.destroy(); resolve(false); });
    server.setTimeout(1500, () => { server.destroy(); resolve(false); });
  });
}

async function startBackend() {
  if (backendProcess) return; // already spawned by us
  // Check if something is already listening on port 8787
  const alreadyRunning = await isPortInUse(BACKEND_PORT);
  if (alreadyRunning) {
    console.log(`[umbra] backend already running on port ${BACKEND_PORT}`);
    return;
  }
  const fs = require('fs');
  if (!fs.existsSync(BACKEND_DIR)) {
    console.error(`[umbra] backend folder not found: ${BACKEND_DIR} — run the backend manually (npm run dev:backend)`);
    return;
  }
  const useCompiled = fs.existsSync(BACKEND_ENTRY);
  const nodeExe = resolveNodeExe();
  const args = useCompiled ? [BACKEND_ENTRY] : [path.join(BACKEND_DIR, 'node_modules', '.bin', 'ts-node'), BACKEND_DEV_ENTRY];
  const cwd = BACKEND_DIR;

  console.log(`[umbra] starting backend from ${cwd} (${useCompiled ? 'compiled' : 'dev'})`);
  try {
    // Full desktop mode (NOT UMBRA_HEADLESS=1): the app's Screen 2 / ghost /
    // Desktop 2 / meetings panels need the Windows-native subsystems
    // (screen reader, real-desktop control, Chrome, preview streamer).
    backendProcess = spawn(nodeExe, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, UMBRA_ROLE: 'desktop', PATH: `${path.dirname(nodeExe)};${process.env.PATH || ''}` },
    });
    backendProcess.stdout?.on('data', (d) => {
      const line = d.toString().trim();
      if (line) console.log(`[backend] ${line}`);
    });
    backendProcess.stderr?.on('data', (d) => {
      const line = d.toString().trim();
      if (line) console.error(`[backend] ${line}`);
    });
    backendProcess.on('exit', (code) => {
      console.log(`[umbra] backend exited with code ${code}`);
      backendProcess = null;
    });
    backendProcess.on('error', (err) => {
      console.error(`[umbra] backend spawn error: ${err.message}`);
      backendProcess = null;
    });
  } catch (err) {
    console.error(`[umbra] failed to start backend: ${err.message}`);
  }
}

function stopBackend() {
  if (!backendProcess) return;
  try {
    backendProcess.kill('SIGTERM');
  } catch { /* ignore */ }
  backendProcess = null;
}

let mainWin = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#050608',
    title: 'UmbraOS',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  mainWin = win;

  win.once('ready-to-show', () => win.show());

  win.on('closed', () => {
    if (mainWin === win) mainWin = null;
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Live-edit support, also in the packaged app:
  // F12 / Ctrl+Shift+I toggle DevTools, Ctrl+R / F5 reload.
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (input.key === 'F12' || (ctrl && input.shift && (input.key === 'I' || input.key === 'i'))) {
      win.webContents.toggleDevTools();
    } else if (ctrl && (input.key === 'R' || input.key === 'r')) {
      win.webContents.reload();
    }
  });

  if (isDev) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ── AI / STT / local-voice fetch bridge ───────────────────────────────────────
// These helpers run in the main process and use Node's fetch so Chromium's
// QUIC/HTTP3 quirks do not affect AI/STT/provider calls. Renderer code should
// prefer these IPC routes when umbraDesktop is available; a direct browser
// fetch is kept as a fallback for web/dev where IPC is not present.

// ── Node fetch helpers for AI / STT / local-voice IPC paths ───────────────────────────────────────
// These helpers run in the main process and use Node's fetch so Chromium's
// QUIC/HTTP3 quirks do not affect AI/STT/provider calls. Renderer code should
// prefer these IPC routes when umbraDesktop is available; a direct browser
// fetch is kept as a fallback for web/dev where IPC is not present.

async function nodeFetchResponseJson(res) {
  const headers = {};
  for (const [k, v] of res.headers.entries()) {
    if (v) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }
  try {
    const ct = res.headers.get ? res.headers.get('content-type') : (res.headers['content-type'] || '');
    if ((ct && ct.includes('audio/')) || (ct && ct.includes('octet-stream'))) {
      const blob = await res.blob();
      return { ok: res.ok, status: res.status, headers, body: blob };
    }
  } catch { /* ignore */ }
  let body = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, headers, body };
}

function serializeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.join(', ');
  }
  return out;
}

async function nodeFetchProxy(providerId, url, method, headers, body, signalToken) {
  const req = {
    method: method || 'GET',
    headers: serializeHeaders(headers),
  };
  if (body !== undefined && body !== null) {
    req.body = body instanceof FormData ? body : body;
  }
  if (signalToken) {
    req.signal = AbortSignal.timeout(60000);
  }
  const response = await fetch(url, req);
  return nodeFetchResponseJson(response);
}

// ── SmartThings API bridge ───────────────────────────────────────
// api.smartthings.com does not send CORS headers, so the renderer cannot call
// it directly. The token lives in the main-process environment (never bundled)
// and requests are performed here with Node's https module.
function smartthingsRequest(method, requestPath, body) {
  const https = require('https');
  const token = process.env.SMARTTHINGS_TOKEN || process.env.VITE_SMARTTHINGS_TOKEN || '';
  const base = (process.env.SMARTTHINGS_URL || 'https://api.smartthings.com').replace(/\/+$/, '');
  return new Promise((resolve, reject) => {
    if (!token) {
      reject(new Error('SmartThings token not configured (set SMARTTHINGS_TOKEN in the environment)'));
      return;
    }
    const url = new URL(base + requestPath);
    const payload = body === undefined ? null : JSON.stringify(body);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 15000,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('SmartThings request timed out')); });
    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

function registerIpc() {
  ipcMain.handle('umbra:smartthings-fetch', async (_event, method, requestPath, body) => {
    try {
      return await smartthingsRequest(String(method || 'GET'), String(requestPath || '/'), body);
    } catch (err) {
      return { status: 0, body: { message: err instanceof Error ? err.message : String(err) } };
    }
  });

  ipcMain.handle('umbra:take-over', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.focus();
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
    }
    return true;
  });

  ipcMain.handle('umbra:analyze-screen', async () => {
    try {
      if (!mainWin || mainWin.isDestroyed()) return null;
      if (mainWin.isMinimized()) mainWin.restore();
      const image = await mainWin.webContents.capturePage();
      if (!image || image.isEmpty()) return null;
      return image.resize({ width: 960 }).toDataURL();
    } catch {
      return null;
    }
  });

  ipcMain.handle('umbra:screen-capture', async () => {
    try {
      const http = require('http');
      return await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:8787/api/ghost/capture', (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve(null); }
          });
        }).on('error', () => resolve(null));
      });
    } catch { return null; }
  });

  ipcMain.handle('umbra:desktop-action', async (_event, action, params) => {
    try {
      const http = require('http');
      const body = JSON.stringify({ action, params: params || {} });
      return await new Promise((resolve, reject) => {
        const req = http.request('http://127.0.0.1:8787/api/desktop2/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.write(body);
        req.end();
      });
    } catch { return null; }
  });

  ipcMain.handle('umbra:read-image-file', async (_event, filePath) => {
    try {
      const fs = require('fs');
      const p = String(filePath || '');
      if (!p || !/^[a-zA-Z]:\\.*(\\[^\\/:*?"<>|]+)*\.(png|jpe?g|gif|webp)$/i.test(p) || !fs.existsSync(p)) return null;
      const buf = await fs.promises.readFile(p);
      const ext = path.extname(p).toLowerCase().replace('.', '');
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      return `data:image/${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle('umbra:ai-fetch', async (_event, providerId, url, method, headers, body, signalToken) => {
    try {
      const res = await nodeFetchProxy(String(providerId || ''), String(url || ''), String(method || 'GET'), headers, body, signalToken);
      return res;
    } catch (err) {
      return { ok: false, status: 0, headers: {}, body: { message: err instanceof Error ? err.message : String(err) } };
    }
  });

  ipcMain.handle('umbra:stt-fetch', async (_event, providerId, url, method, headers, body) => {
    try {
      const res = await nodeFetchProxy(String(providerId || ''), String(url || ''), String(method || 'POST'), headers, body);
      return res;
    } catch (err) {
      return { ok: false, status: 0, headers: {}, body: { message: err instanceof Error ? err.message : String(err) } };
    }
  });

  ipcMain.handle('umbra:local-voice-probe', async (_event, url, timeoutMs, signalToken) => {
    try {
      const req = { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs || 1500) };
      const res = await fetch(String(url || ''), req);
      return res.ok;
    } catch {
      return false;
    }
  });

  ipcMain.handle('umbra:local-voice-fetch', async (_event, url, init) => {
    try {
      const res = await fetch(String(url || ''), init ? JSON.parse(JSON.stringify(init)) : undefined);
      return nodeFetchResponseJson(res);
    } catch (err) {
      return { ok: false, status: 0, headers: {}, body: { message: err instanceof Error ? err.message : String(err) } };
    }
  });

  ipcMain.handle('umbra:local-voice-fetch-stream', async (_event, url, init) => {
    try {
      const res = await fetch(String(url || ''), init ? JSON.parse(JSON.stringify(init)) : undefined);
      const headers = {};
      for (const [k, v] of res.headers.entries()) {
        if (v) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
      }
      return { ok: res.ok, status: res.status, headers, body: await res.blob() };
    } catch (err) {
      return { ok: false, status: 0, headers: {}, body: { message: err instanceof Error ? err.message : String(err) } };
    }
  });

  ipcMain.handle('umbra:ai-fetch-stream', async (_event, providerId, url, method, headers, body, signalToken) => {
    try {
      const req = {
        method: method || 'GET',
        headers: serializeHeaders(headers),
      };
      if (body !== undefined && body !== null) {
        req.body = body instanceof FormData ? body : body;
      }
      if (signalToken) {
        req.signal = AbortSignal.timeout(60000);
      }
      const res = await fetch(url, req);
      return nodeFetchResponseJson(res);
    } catch (err) {
      return { ok: false, status: 0, headers: {}, body: { message: err instanceof Error ? err.message : String(err) } };
    }
  });

  ipcMain.handle('umbra:stt-fetch-stream', async (_event, providerId, url, method, headers, body) => {
    try {
      const req = {
        method: method || 'POST',
        headers: serializeHeaders(headers),
      };
      if (body !== undefined && body !== null) {
        req.body = body instanceof FormData ? body : body;
      }
      const res = await fetch(url, req);
      return nodeFetchResponseJson(res);
    } catch (err) {
      return { ok: false, status: 0, headers: {}, body: { message: err instanceof Error ? err.message : String(err) } };
    }
  });

  ipcMain.handle('umbra:local-voice-probe-stream', async (_event, url, timeoutMs, signalToken) => {
    try {
      const req = { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs || 1500) };
      const res = await fetch(String(url || ''), req);
      return res.ok;
    } catch {
      return false;
    }
  });

  ipcMain.handle('umbra:consent-request', async (_event, reason) => {
    try {
      const http = require('http');
      const body = JSON.stringify({ action: 'request', reason: reason || 'UI request' });
      return await new Promise((resolve) => {
        const req = http.request('http://127.0.0.1:8787/api/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.write(body);
        req.end();
      });
    } catch { return null; }
  });
}

const template = [
  ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
  { role: 'fileMenu' },
  { role: 'editMenu' },
  { role: 'viewMenu' },
  { role: 'windowMenu' },
];

app.whenReady().then(async () => {
  // Start the backend API server before opening any windows
  await startBackend();

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopBackend();
});