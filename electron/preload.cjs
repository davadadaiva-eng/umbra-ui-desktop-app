const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('umbraDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
