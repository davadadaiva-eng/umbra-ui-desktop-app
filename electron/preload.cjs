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
  screenCapture: () => ipcRenderer.invoke('umbra:screen-capture'),
  desktopAction: (action, params) => ipcRenderer.invoke('umbra:desktop-action', action, params),
  readImageFile: (filePath) => ipcRenderer.invoke('umbra:read-image-file', filePath),
  smartthingsFetch: (method, path, body) => ipcRenderer.invoke('umbra:smartthings-fetch', method, path, body),
  consentRequest: (reason) => ipcRenderer.invoke('umbra:consent-request', reason),
});