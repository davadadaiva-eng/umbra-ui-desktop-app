const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('umbraDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  takeOver: () => ipcRenderer.invoke('umbra:take-over'),
  analyzeScreen: () => ipcRenderer.invoke('umbra:analyze-screen'),
  toggleBar: () => ipcRenderer.invoke('umbra:toggle-bar'),
});