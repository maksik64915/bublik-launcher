const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bublik', {
  checkInstalled: () => ipcRenderer.invoke('bublik:checkInstalled'),
  downloadLegendary: () => ipcRenderer.invoke('bublik:downloadLegendary'),
  authStatus: () => ipcRenderer.invoke('bublik:authStatus'),
  getLoginUrl: () => ipcRenderer.invoke('bublik:getLoginUrl'),
  openLoginPage: () => ipcRenderer.invoke('bublik:openLoginPage'),
  submitLoginCode: (code) => ipcRenderer.invoke('bublik:submitLoginCode', code),
  logout: () => ipcRenderer.invoke('bublik:logout'),
  clearEpicSession: () => ipcRenderer.invoke('bublik:clearEpicSession'),
  listLibrary: () => ipcRenderer.invoke('bublik:listLibrary'),
  listInstalled: () => ipcRenderer.invoke('bublik:listInstalled'),
  install: (appName, basePath) => ipcRenderer.invoke('bublik:install', appName, basePath),
  launch: (appName) => ipcRenderer.invoke('bublik:launch', appName),
  closeGame: (appName) => ipcRenderer.invoke('bublik:closeGame', appName),
  getPlaytime: () => ipcRenderer.invoke('bublik:getPlaytime'),
  uninstall: (appName) => ipcRenderer.invoke('bublik:uninstall', appName),
  getGameSettings: (appName) => ipcRenderer.invoke('bublik:getGameSettings', appName),
  saveGameSettings: (appName, mainPatch, envVars) =>
    ipcRenderer.invoke('bublik:saveGameSettings', appName, mainPatch, envVars),
  downloadEacRuntime: () => ipcRenderer.invoke('bublik:downloadEacRuntime'),
  detectSteamPath: () => ipcRenderer.invoke('bublik:detectSteamPath'),
  autoConfigure: (appName) => ipcRenderer.invoke('bublik:autoConfigure', appName),
  browsePath: (isDirectory) => ipcRenderer.invoke('bublik:browsePath', isDirectory),
  onLog: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on('bublik:log', handler);
    return () => ipcRenderer.removeListener('bublik:log', handler);
  },
  onGameStarted: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on('bublik:game-started', handler);
    return () => ipcRenderer.removeListener('bublik:game-started', handler);
  },
  onGameStopped: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on('bublik:game-stopped', handler);
    return () => ipcRenderer.removeListener('bublik:game-stopped', handler);
  },
});
