const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('path');
const legendary = require('./legendary');

app.setName('Bublik Launcher');
// Matches StartupWMClass in the .desktop file we generate (see
// legendary.js/ensureDesktopIntegration) — on Linux, Electron's taskbar/dock
// icon resolution keys off this class matching a known .desktop entry.
// Setting it here means it's correct even if the AppImage is launched by
// double-clicking the file directly, not just via the menu entry.
app.commandLine.appendSwitch('class', 'bublik-launcher');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0B0C10',
    // Without this, Linux taskbars/window-lists fall back to a generic
    // placeholder (looks like a gear icon in a lot of DEs) since Electron
    // has no icon to show otherwise. Windows/macOS pick up the icon from
    // the packaged executable itself, but Linux needs it set here explicitly.
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Lets us embed Epic's real login page (and the store) as an inline
      // <webview> inside our own window, instead of a separate popup.
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  legendary.ensureDesktopIntegration();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: everything routes through legendary.js, which shells out to the
// external `legendary` CLI. Main process never touches Epic's servers or the
// user's credentials directly. ----

ipcMain.handle('bublik:checkInstalled', () => legendary.checkInstalled());
ipcMain.handle('bublik:downloadLegendary', async (event) => {
  const sender = event.sender;
  const onLine = (line) => {
    if (!sender.isDestroyed()) sender.send('bublik:log', { appName: null, line, isErr: false });
  };
  return legendary.downloadLegendaryBinary(onLine);
});
ipcMain.handle('bublik:authStatus', () => legendary.checkAuthStatus());
// Used by the embedded <webview> login flow (sets its src to this).
ipcMain.handle('bublik:getLoginUrl', () => legendary.getEpicLoginUrl());
// Kept as a fallback in case the user wants to log in in their real browser instead.
ipcMain.handle('bublik:openLoginPage', () => {
  shell.openExternal(legendary.getEpicLoginUrl());
});
ipcMain.handle('bublik:submitLoginCode', (_e, code) => legendary.loginWithCode(code));
ipcMain.handle('bublik:logout', () => legendary.logout());
// The login/store webview uses a persistent session (partition:
// "persist:bublik-epic") so the store stays signed in too. That's convenient
// while logged in, but it means legendary's own logout doesn't touch Epic's
// actual browser session — the webview cookie is still valid, so re-opening
// the login page silently auto-redirects back into the same account with no
// picker. Clearing this session on logout is the actual fix.
ipcMain.handle('bublik:clearEpicSession', async () => {
  const ses = session.fromPartition('persist:bublik-epic');
  await ses.clearStorageData();
  return { ok: true };
});
ipcMain.handle('bublik:listLibrary', () => legendary.listLibrary());
ipcMain.handle('bublik:listInstalled', () => legendary.listInstalled());

// Tracks currently-running games so we can actually stop them later —
// `legendary launch` alone doesn't give us that, see legendary.js.
const runningGames = new Map(); // appName -> ChildProcess

ipcMain.handle('bublik:install', async (event, appName, basePath) => {
  const sender = event.sender;
  const onLine = (line, isErr) => {
    if (sender.isDestroyed()) return;
    sender.send('bublik:log', { appName, line, isErr });
  };
  return legendary.installGame(appName, onLine, basePath);
});

ipcMain.handle('bublik:launch', async (event, appName) => {
  const sender = event.sender;
  const onLine = (line, isErr) => {
    if (sender.isDestroyed()) return;
    sender.send('bublik:log', { appName, line, isErr });
  };

  if (runningGames.has(appName)) {
    return { ok: false, message: 'Гра вже запущена.' };
  }

  onLine('Отримую параметри запуску...', false);
  const paramsRes = await legendary.getLaunchParams(appName, onLine);
  if (!paramsRes.ok) {
    return { ok: false, message: paramsRes.message };
  }

  let child;
  try {
    child = legendary.spawnGameProcess(paramsRes.params);
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }

  runningGames.set(appName, child);
  const startedAt = Date.now();
  onLine('Гру запущено.', false);
  if (!sender.isDestroyed()) sender.send('bublik:game-started', { appName });

  // Previously only the started/stopped events were shown, so an actual
  // crash reason (e.g. a Proton/Python traceback) never reached the console
  // panel — just a bare exit code. Forward the real output too.
  const forwardLines = (buf, isErr) => {
    buf
      .toString('utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => onLine(line, isErr));
  };
  if (child.stdout) child.stdout.on('data', (buf) => forwardLines(buf, false));
  if (child.stderr) child.stderr.on('data', (buf) => forwardLines(buf, true));

  child.on('exit', (code) => {
    runningGames.delete(appName);
    onLine(`Гру завершено (код ${code}).`, false);
    const sessionSeconds = (Date.now() - startedAt) / 1000;
    const totalPlaytime = legendary.addPlaytime(appName, sessionSeconds);
    if (!sender.isDestroyed()) sender.send('bublik:game-stopped', { appName, code, totalPlaytime });
  });
  child.on('error', (err) => {
    runningGames.delete(appName);
    onLine(`Помилка процесу гри: ${err.message}`, true);
    const sessionSeconds = (Date.now() - startedAt) / 1000;
    const totalPlaytime = legendary.addPlaytime(appName, sessionSeconds);
    if (!sender.isDestroyed()) sender.send('bublik:game-stopped', { appName, code: -1, totalPlaytime });
  });

  return { ok: true };
});

ipcMain.handle('bublik:getPlaytime', () => legendary.getPlaytime());

ipcMain.handle('bublik:closeGame', (event, appName) => {
  const proc = runningGames.get(appName);
  if (!proc) return { ok: false, message: 'Гра не запущена.' };
  legendary.killProcessTree(proc);
  return { ok: true };
});

ipcMain.handle('bublik:uninstall', async (event, appName) => {
  const sender = event.sender;
  const onLine = (line, isErr) => {
    if (sender.isDestroyed()) return;
    sender.send('bublik:log', { appName, line, isErr });
  };
  return legendary.uninstallGame(appName, onLine);
});

ipcMain.handle('bublik:getGameSettings', (_e, appName) => legendary.getGameSettings(appName));
ipcMain.handle('bublik:saveGameSettings', (_e, appName, mainPatch, envVars) =>
  legendary.saveGameSettings(appName, mainPatch, envVars)
);
ipcMain.handle('bublik:downloadEacRuntime', () => legendary.downloadEacRuntime());
ipcMain.handle('bublik:detectSteamPath', () => legendary.detectSteamPath());

ipcMain.handle('bublik:autoConfigure', async (event, appName) => {
  const sender = event.sender;
  const onLine = (line) => {
    if (!sender.isDestroyed()) sender.send('bublik:log', { appName, line, isErr: false });
  };
  return legendary.autoConfigureAntiCheat(appName, onLine);
});
ipcMain.handle('bublik:browsePath', async (_e, isDirectory) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: [isDirectory ? 'openDirectory' : 'openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Don't leave games orphaned if the launcher window closes.
app.on('before-quit', () => {
  for (const proc of runningGames.values()) legendary.killProcessTree(proc);
});
