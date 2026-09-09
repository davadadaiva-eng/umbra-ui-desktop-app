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
  aiFetch: (providerId, url, method, headers, body, signalToken) =>
    ipcRenderer.invoke('umbra:ai-fetch', providerId, url, method, headers, body, signalToken),
  sttFetch: (providerId, url, method, headers, body) =>
    ipcRenderer.invoke('umbra:stt-fetch', providerId, url, method, headers, body),
  localVoiceProbe: (url, timeoutMs, signalToken) =>
    ipcRenderer.invoke('umbra:local-voice-probe', url, timeoutMs, signalToken),
  localVoiceFetch: (url, init) => ipcRenderer.invoke('umbra:local-voice-fetch', url, init),
  aiFetchStream: (providerId, url, method, headers, body, signalToken) =>
    ipcRenderer.invoke('umbra:ai-fetch-stream', providerId, url, method, headers, body, signalToken),
  sttFetchStream: (providerId, url, method, headers, body) =>
    ipcRenderer.invoke('umbra:stt-fetch-stream', providerId, url, method, headers, body),
  localVoiceProbeStream: (url, timeoutMs, signalToken) =>
    ipcRenderer.invoke('umbra:local-voice-probe-stream', url, timeoutMs, signalToken),
  localVoiceFetchStream: (url, init) => ipcRenderer.invoke('umbra:local-voice-fetch-stream', url, init),
});