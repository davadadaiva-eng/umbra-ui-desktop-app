const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = !!DEV_URL;

let mainWin = null;
let barWin = null;

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

function createBarWindow() {
  if (barWin && !barWin.isDestroyed()) return;
  const bar = new BrowserWindow({
    width: 428,
    height: 148,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    focusable: true,
    title: 'Umbra Bar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  barWin = bar;
  bar.setAlwaysOnTop(true, 'floating');
  bar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
  if (isDev) {
    bar.loadURL(`${DEV_URL}?view=bar`);
  } else {
    bar.loadFile(indexHtml, { query: { view: 'bar' } });
  }

  bar.on('closed', () => {
    if (barWin === bar) barWin = null;
  });
}

function registerIpc() {
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

  ipcMain.handle('umbra:toggle-bar', () => {
    if (barWin && !barWin.isDestroyed()) {
      if (barWin.isVisible()) barWin.hide();
      else barWin.showInactive();
    } else {
      createBarWindow();
    }
    return true;
  });
}

const template = [
  ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
  { role: 'fileMenu' },
  { role: 'editMenu' },
  { role: 'viewMenu' },
  { role: 'windowMenu' },
];

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  registerIpc();
  createWindow();
  createBarWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createBarWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});