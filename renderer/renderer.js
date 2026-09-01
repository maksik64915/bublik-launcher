(() => {
  const state = {
    library: [],
    installed: new Map(), // appName -> installed info
    progress: new Map(),  // appName -> { pct, status: 'downloading'|'installed'|'idle' }
    running: new Set(),   // appNames currently running
    playtime: new Map(),  // appName -> total seconds played
    loggedIn: false,
    account: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- View switching ----------
  function ensureStoreLoaded() {
    const webview = $('#storeWebview');
    if (webview.dataset.loaded) return;
    webview.dataset.loaded = '1';
    webview.src = 'https://store.epicgames.com/';
  }

  $$('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.nav-item').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const view = btn.dataset.view;
      $$('.view').forEach((v) => v.classList.add('hidden'));
      $(`#view-${view}`).classList.remove('hidden');
      if (view === 'store') ensureStoreLoaded();
    });
  });

  // Store lives in the same persisted session/cookies as the login webview
  // (partition="persist:bublik-epic"), so once you're logged in once, the
  // store tab is already signed in too.
  (() => {
    const webview = $('#storeWebview');
    const urlLabel = $('#storeUrl');
    const updateUrl = () => {
      try {
        const u = new URL(webview.getURL());
        urlLabel.textContent = u.hostname + u.pathname;
      } catch {
        // not ready yet / about:blank
      }
    };
    webview.addEventListener('did-navigate', updateUrl);
    webview.addEventListener('did-navigate-in-page', updateUrl);
    $('#storeBack').addEventListener('click', () => webview.canGoBack() && webview.goBack());
    $('#storeForward').addEventListener('click', () => webview.canGoForward() && webview.goForward());
    $('#storeReload').addEventListener('click', () => webview.reload());
  })();

  // ---------- Console drawer ----------
  const consoleDrawer = $('#consoleDrawer');
  const consoleBody = $('#consoleBody');
  const consoleDot = $('#consoleDot');
  $('#consoleToggle').addEventListener('click', () => {
    consoleDrawer.classList.toggle('is-open');
  });
  $('#consoleClear').addEventListener('click', () => {
    consoleBody.innerHTML = '';
  });

  function logLine(appName, line, isErr) {
    consoleDot.classList.add('is-active');
    const row = document.createElement('div');
    const tag = appName ? `<span class="console-line-appname">[${appName}]</span> ` : '';
    row.innerHTML = tag + escapeHtml(line);
    if (isErr) row.classList.add('console-line-err');
    consoleBody.appendChild(row);
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  window.bublik.onLog(({ appName, line, isErr }) => {
    logLine(appName, line, isErr);
    const match = line.match(/Progress:\s*([\d.]+)%/i);
    if (match) {
      const pct = parseFloat(match[1]);
      state.progress.set(appName, { pct, status: 'downloading' });
      renderLibrary();
    }
  });

  // ---------- Account / login ----------
  const accountArea = $('#accountArea');
  const loginModal = $('#loginModal');
  const legendaryMissingBanner = $('#legendaryMissingBanner');

  async function performLogout() {
    await window.bublik.logout();
    // Fixes: without this, the login webview's cookies stayed valid, so
    // opening "Увійти" again silently re-used the same Epic account with no
    // way to pick a different one.
    await window.bublik.clearEpicSession();
    state.loggedIn = false;
    state.account = null;
    state.library = [];
    renderAccount();
    renderSettings();
    renderLibrary();
    // Store shares the same session — reload it so it reflects being logged out.
    const storeWebview = $('#storeWebview');
    if (storeWebview.dataset.loaded) storeWebview.reload();
  }

  function renderAccount() {
    if (state.loggedIn && state.account) {
      const initial = (state.account[0] || '?').toUpperCase();
      accountArea.innerHTML = `
        <div class="account-chip">
          <span class="avatar">${initial}</span>
          <span>${escapeHtml(state.account)}</span>
        </div>
        <button class="btn btn-ghost" id="logoutBtn">${t('account.logout')}</button>
      `;
      $('#logoutBtn').addEventListener('click', performLogout);
    } else {
      accountArea.innerHTML = `<button class="btn btn-primary" id="loginBtn">${t('account.login')}</button>`;
      $('#loginBtn').addEventListener('click', openLoginModal);
    }
  }

  function renderSettings() {
    $('#settingsAccountHint').textContent = state.loggedIn
      ? t('settings.loggedInAs', { account: state.account })
      : t('settings.notLoggedIn');
    $('#settingsAuthBtn').textContent = state.loggedIn ? t('account.logout') : t('account.login');
    $('#settingsAuthBtn').onclick = async () => {
      if (state.loggedIn) {
        await performLogout();
      } else {
        openLoginModal();
      }
    };
  }

  // The redirect page Epic sends the browser to once login succeeds — its
  // body is raw JSON containing "authorizationCode". We watch the embedded
  // webview's navigation and scrape that page automatically.
  const REDIRECT_PREFIX = 'https://www.epicgames.com/id/api/redirect';
  let loginHandled = false;
  let webviewWired = false;

  async function openLoginModal() {
    $('#authCodeInput').value = '';
    $('#loginError').classList.add('hidden');
    $('#manualLoginBlock').classList.add('hidden');
    loginHandled = false;
    loginModal.classList.remove('hidden');

    const webview = $('#loginWebview');
    const status = $('#webviewStatus');
    status.textContent = t('login.loadingPage');
    status.classList.remove('hidden');

    const url = await window.bublik.getLoginUrl();
    webview.src = url;

    if (!webviewWired) {
      webviewWired = true;
      const tryExtractCode = async () => {
        if (loginHandled) return;
        let currentUrl = '';
        try { currentUrl = webview.getURL(); } catch { return; }
        if (!currentUrl || !currentUrl.startsWith(REDIRECT_PREFIX)) return;
        status.textContent = t('login.codeReceived');
        try {
          const text = await webview.executeJavaScript('document.body.innerText');
          const data = JSON.parse(text.trim());
          if (data && data.authorizationCode) {
            loginHandled = true;
            await completeLogin(data.authorizationCode);
          }
        } catch {
          // Couldn't parse automatically (unexpected page shape) — leave the
          // manual fallback available instead of failing silently.
          status.textContent = t('login.autoFailed');
          $('#manualLoginBlock').classList.remove('hidden');
        }
      };
      webview.addEventListener('did-navigate', tryExtractCode);
      webview.addEventListener('did-navigate-in-page', tryExtractCode);
      webview.addEventListener('did-finish-load', tryExtractCode);
      webview.addEventListener('did-finish-load', () => {
        if (!loginHandled) status.classList.add('hidden');
      });
    }
  }

  function closeLoginModal() {
    loginModal.classList.add('hidden');
    const webview = $('#loginWebview');
    webview.src = 'about:blank';
  }

  async function completeLogin(code) {
    const res = await window.bublik.submitLoginCode(code);
    if (res.ok) {
      closeLoginModal();
      await refreshAuth();
      await refreshLibrary();
    } else {
      const errBox = $('#loginError');
      errBox.textContent = res.message || t('login.failed');
      errBox.classList.remove('hidden');
      $('#manualLoginBlock').classList.remove('hidden');
    }
  }

  $('#closeLoginBtn').addEventListener('click', closeLoginModal);
  $('#toggleManualLogin').addEventListener('click', () => {
    $('#manualLoginBlock').classList.toggle('hidden');
  });

  $('#submitLoginBtn').addEventListener('click', async () => {
    const code = $('#authCodeInput').value.trim();
    const errBox = $('#loginError');
    errBox.classList.add('hidden');
    if (!code) {
      errBox.textContent = t('login.emptyCode');
      errBox.classList.remove('hidden');
      return;
    }
    const submitBtn = $('#submitLoginBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = t('login.submitting');
    loginHandled = true;
    await completeLogin(code);
    submitBtn.disabled = false;
    submitBtn.textContent = t('login.submit');
  });

  // ---------- Library / installed rendering ----------
  const libraryGrid = $('#libraryGrid');
  const installedGrid = $('#installedGrid');

  function escapeAttr(s) {
    return (s || '').replace(/["'<>]/g, (c) => ({ '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function tileTemplate(game, { installedInfo }) {
    const progress = state.progress.get(game.appName);
    const isRunning = state.running.has(game.appName);
    let tileState = 'not-installed';
    if (progress && progress.status === 'downloading') tileState = 'downloading';
    else if (isRunning) tileState = 'running';
    else if (installedInfo) tileState = 'installed';

    const initials = game.title.slice(0, 2).toUpperCase();
    const pct = progress ? progress.pct.toFixed(1) : null;

    let actionHtml;
    if (tileState === 'downloading') {
      actionHtml = `<button class="btn btn-ghost" disabled>${t('tile.downloading')}</button>`;
    } else if (tileState === 'running') {
      actionHtml = `<button class="btn btn-stop" data-action="close" data-app="${game.appName}">${t('tile.closeGame')}</button>`;
    } else if (tileState === 'installed') {
      actionHtml = `
        <button class="btn btn-primary" data-action="launch" data-app="${game.appName}">${t('tile.play')}</button>
        <button class="btn btn-icon-danger" data-action="uninstall" data-app="${game.appName}" title="${t('tile.deleteTitle')}">✕</button>
      `;
    } else {
      actionHtml = `<button class="btn btn-primary" data-action="install" data-app="${game.appName}">${t('tile.install')}</button>`;
    }

    const artClass = game.coverUrl ? 'tile-art has-art' : 'tile-art';
    const artStyle = game.coverUrl ? ` style="background-image:url('${escapeAttr(game.coverUrl)}')"` : '';
    const artContent = game.coverUrl ? '' : escapeHtml(initials);

    const playtimeSeconds = state.playtime.get(game.appName);
    const playtimeHtml = playtimeSeconds
      ? `<div class="tile-playtime">${escapeHtml(t('tile.playtimeLabel', { duration: formatDuration(playtimeSeconds) }))}</div>`
      : '';

    return `
      <div class="tile" data-state="${tileState}" data-app="${game.appName}">
        <div class="${artClass}"${artStyle}>${artContent}</div>
        <div class="tile-body">
          <div class="tile-title">${escapeHtml(game.title)}</div>
          <div class="tile-meta">
            <span>${escapeHtml(game.version || '')}</span>
            ${pct ? `<span>${pct}%</span>` : ''}
          </div>
          ${playtimeHtml}
          ${tileState === 'downloading' ? `
            <div class="tile-progress"><div class="tile-progress-fill" style="width:${pct}%"></div></div>
          ` : ''}
          <div class="tile-actions">${actionHtml}</div>
        </div>
      </div>
    `;
  }

  function renderLibrary() {
    const q = $('#searchInput').value.trim().toLowerCase();
    const items = state.library.filter((g) => g.title.toLowerCase().includes(q));
    $('#libraryCount').textContent = state.library.length ? formatGameCount(state.library.length) : '';
    libraryGrid.innerHTML = items
      .map((g) => tileTemplate(g, { installedInfo: state.installed.get(g.appName) }))
      .join('');
    $('#libraryEmpty').classList.toggle('hidden', state.library.length !== 0);
    wireTileActions(libraryGrid);
  }

  function renderInstalled() {
    const items = [...state.installed.values()];
    $('#installedCount').textContent = items.length ? formatGameCount(items.length) : '';
    installedGrid.innerHTML = items
      .map((g) => {
        const libEntry = state.library.find((l) => l.appName === g.appName);
        return tileTemplate(
          { appName: g.appName, title: g.title, version: g.version, coverUrl: libEntry ? libEntry.coverUrl : null },
          { installedInfo: g }
        );
      })
      .join('');
    $('#installedEmpty').classList.toggle('hidden', items.length !== 0);
    wireTileActions(installedGrid);
  }

  function wireTileActions(container) {
    container.querySelectorAll('[data-action="install"]').forEach((btn) => {
      btn.addEventListener('click', () => openInstallLocationModal(btn.dataset.app));
    });
    container.querySelectorAll('[data-action="launch"]').forEach((btn) => {
      btn.addEventListener('click', () => launchGame(btn.dataset.app));
    });
    container.querySelectorAll('[data-action="close"]').forEach((btn) => {
      btn.addEventListener('click', () => closeGame(btn.dataset.app));
    });
    container.querySelectorAll('[data-action="uninstall"]').forEach((btn) => {
      btn.addEventListener('click', () => uninstallGame(btn.dataset.app));
    });
    // Right-click → Proton/Wine settings menu. Shown for any tile; the item
    // itself is disabled with a hint if the game isn't installed yet.
    container.querySelectorAll('.tile').forEach((tileEl) => {
      tileEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const isInstalled = tileEl.dataset.state === 'installed' || tileEl.dataset.state === 'running';
        openContextMenu(e.clientX, e.clientY, tileEl.dataset.app, isInstalled);
      });
    });
  }

  async function installGame(appName, basePath) {
    state.progress.set(appName, { pct: 0, status: 'downloading' });
    renderLibrary();
    renderInstalled();
    consoleDrawer.classList.add('is-open');
    const res = await window.bublik.install(appName, basePath || undefined);
    state.progress.delete(appName);
    if (res.code === 0) {
      await refreshInstalled();
    }
    renderLibrary();
    renderInstalled();
  }

  // ---------- Install location picker ----------
  let pendingInstallAppName = null;

  function openInstallLocationModal(appName) {
    pendingInstallAppName = appName;
    $('#installPathInput').value = '';
    $('#installLocationModal').classList.remove('hidden');
  }
  function closeInstallLocationModal() {
    $('#installLocationModal').classList.add('hidden');
    pendingInstallAppName = null;
  }

  $('#installLocationCancelBtn').addEventListener('click', closeInstallLocationModal);
  $('#installPathBrowse').addEventListener('click', async () => {
    const picked = await window.bublik.browsePath(true);
    if (picked) $('#installPathInput').value = picked;
  });
  $('#installLocationConfirmBtn').addEventListener('click', () => {
    const appName = pendingInstallAppName;
    const basePath = $('#installPathInput').value.trim();
    closeInstallLocationModal();
    if (appName) installGame(appName, basePath);
  });

  async function launchGame(appName) {
    consoleDrawer.classList.add('is-open');
    const res = await window.bublik.launch(appName);
    if (!res.ok) {
      logLine(appName, res.message || t('game.launchFailed'), true);
    }
    // 'running' tile state is driven by the game-started/game-stopped events below.
  }

  async function closeGame(appName) {
    const res = await window.bublik.closeGame(appName);
    if (!res.ok) {
      logLine(appName, res.message || t('game.closeFailed'), true);
    }
  }

  async function uninstallGame(appName) {
    const info = state.installed.get(appName);
    const title = info ? info.title : appName;
    if (!window.confirm(t('uninstall.confirm', { title }))) return;
    consoleDrawer.classList.add('is-open');
    const res = await window.bublik.uninstall(appName);
    if (res.code === 0) {
      state.installed.delete(appName);
    } else {
      logLine(appName, t('game.uninstallFailed'), true);
    }
    renderLibrary();
    renderInstalled();
  }

  window.bublik.onGameStarted(({ appName }) => {
    state.running.add(appName);
    renderLibrary();
    renderInstalled();
  });

  window.bublik.onGameStopped(({ appName, totalPlaytime }) => {
    state.running.delete(appName);
    if (typeof totalPlaytime === 'number') state.playtime.set(appName, totalPlaytime);
    renderLibrary();
    renderInstalled();
  });

  $('#searchInput').addEventListener('input', renderLibrary);

  // ---------- Context menu (right-click on a downloaded game) ----------
  const contextMenu = $('#tileContextMenu');
  const ctxSettingsBtn = $('#ctxSettings');
  const ctxAutoConfigBtn = $('#ctxAutoConfig');
  let ctxAppName = null;

  // Positioned with position:fixed → must use viewport-relative coordinates
  // (clientX/clientY), not pageX/pageY (document-relative). Using pageX/Y
  // placed the menu off-screen as soon as the grid was scrolled, which
  // looked like right-click "doing nothing".
  function openContextMenu(x, y, appName, installed) {
    ctxAppName = appName;
    ctxSettingsBtn.disabled = !installed;
    ctxSettingsBtn.textContent = installed ? t('ctx.settingsEnabled') : t('ctx.settingsDisabled');
    ctxAutoConfigBtn.disabled = !installed;
    contextMenu.classList.remove('hidden');
    // Measure after it's visible so we can keep it on-screen near the edges.
    const menuRect = contextMenu.getBoundingClientRect();
    const maxX = window.innerWidth - menuRect.width - 8;
    const maxY = window.innerHeight - menuRect.height - 8;
    contextMenu.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
  }
  function closeContextMenu() {
    contextMenu.classList.add('hidden');
    ctxAppName = null;
  }
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) closeContextMenu();
  });
  ctxSettingsBtn.addEventListener('click', () => {
    const appName = ctxAppName;
    closeContextMenu();
    if (appName) openGameSettingsModal(appName);
  });

  // ---------- One-click Proton + anti-cheat auto-configure ----------
  // Finds/downloads GE-Proton (a real open-source project with public GitHub
  // releases), makes a prefix folder, locates Steam, and preps the EAC
  // runtime — then writes it all via the normal saveGameSettings path, same
  // as if you'd filled the fields in by hand.
  async function runAutoConfigure(appName) {
    consoleDrawer.classList.add('is-open');
    logLine(appName, 'Починаю автоналаштування Proton + анти-чит...', false);
    const res = await window.bublik.autoConfigure(appName);
    if (!res.ok) {
      logLine(appName, res.message || 'Автоналаштування не вдалося.', true);
      return false;
    }

    const mainPatch = {
      bublik_mode: 'proton',
      bublik_proton_path: res.protonPath,
      no_wine: 'true',
      wrapper: `"${res.protonPath}/proton" waitforexitandrun`,
      wine_executable: '',
      wine_prefix: '',
    };
    const envVars = {
      STEAM_COMPAT_DATA_PATH: res.prefixPath,
      STEAM_COMPAT_CLIENT_INSTALL_PATH: res.steamClientPath,
    };
    if (res.eacPath) envVars.PROTON_EAC_RUNTIME = res.eacPath;

    const saveRes = await window.bublik.saveGameSettings(appName, mainPatch, envVars);
    if (saveRes.ok) {
      logLine(appName, 'Готово — Proton і анти-чит runtime налаштовано. Спробуй запустити гру.', false);
    } else {
      logLine(appName, saveRes.message || 'Не вдалося зберегти налаштування.', true);
    }
    return saveRes.ok;
  }

  $('#ctxAutoConfig').addEventListener('click', () => {
    const appName = ctxAppName;
    closeContextMenu();
    if (appName) runAutoConfigure(appName);
  });

  $('#gsAutoConfigBtn').addEventListener('click', async () => {
    const appName = gameSettingsModal.dataset.app;
    const btn = $('#gsAutoConfigBtn');
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '⚡ Налаштовую…';
    await runAutoConfigure(appName);
    btn.disabled = false;
    btn.textContent = originalText;
    // Reload the form so the fields reflect what auto-configure just saved.
    await openGameSettingsModal(appName);
  });


  // ---------- Game settings modal (Proton/Wine, wraps legendary's config.ini) ----------
  const gameSettingsModal = $('#gameSettingsModal');

  function setSettingsMode(mode) {
    $('#gsWineFields').classList.toggle('hidden', mode !== 'wine');
    $('#gsProtonFields').classList.toggle('hidden', mode !== 'proton');
    $('#gsNativeFields').classList.toggle('hidden', mode !== 'native');
    $('#gsAnticheatWineWarning').classList.toggle('hidden', mode === 'proton');
  }
  $$('input[name="gsMode"]').forEach((radio) => {
    radio.addEventListener('change', () => setSettingsMode(radio.value));
  });

  $('#gsDetectSteam').addEventListener('click', async () => {
    const found = await window.bublik.detectSteamPath();
    if (found) $('#gsSteamClientPath').value = found;
  });

  // Best-effort: pull a proton path out of an existing wrapper string like
  // `"gamemoderun" "/path/to/proton" waitforexitandrun` (only used as a
  // fallback when our own bookkeeping key isn't present, e.g. settings
  // written by hand or by another tool).
  function guessProtonPathFromWrapper(wrapper) {
    if (!wrapper) return '';
    const match = wrapper.match(/"([^"]+\/proton)"|'([^']+\/proton)'|(\S+\/proton)/);
    if (!match) return '';
    const full = match[1] || match[2] || match[3] || '';
    return full.replace(/\/proton$/, '');
  }

  async function openGameSettingsModal(appName) {
    const info = state.installed.get(appName) || state.library.find((g) => g.appName === appName);
    $('#gameSettingsTitle').textContent = t('gs.titlePrefix') + (info ? info.title : appName);
    $('#gameSettingsError').classList.add('hidden');
    gameSettingsModal.dataset.app = appName;

    const settings = await window.bublik.getGameSettings(appName);
    const main = settings.main || {};
    const env = settings.env || {};

    // Our own bookkeeping keys (bublik_mode / bublik_proton_path) let us
    // remember the exact mode reliably; legendary ignores keys it doesn't
    // recognize, so storing these alongside the real ones is harmless.
    let mode = main.bublik_mode;
    if (!mode) mode = main.no_wine === 'true' ? 'native' : 'wine'; // best-effort for pre-existing configs

    $(`#gsMode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`).checked = true;
    setSettingsMode(mode);

    $('#gsWineExecutable').value = mode === 'wine' ? (main.wine_executable || '') : '';
    $('#gsWinePrefix').value = mode === 'wine' ? (main.wine_prefix || '') : '';

    $('#gsProtonPath').value = main.bublik_proton_path || guessProtonPathFromWrapper(main.wrapper);
    $('#gsCompatDataPath').value = env.STEAM_COMPAT_DATA_PATH || '';
    $('#gsSteamClientPath').value = env.STEAM_COMPAT_CLIENT_INSTALL_PATH || '';

    // The generic wrapper field only shows the EXTRA part (e.g. gamemoderun),
    // not the proton invocation itself, which is reconstructed on save.
    let extraWrapper = main.wrapper || '';
    if (mode === 'proton' && main.bublik_proton_path) {
      extraWrapper = extraWrapper.replace(`"${main.bublik_proton_path}/proton" waitforexitandrun`, '').trim();
    }
    $('#gsWrapper').value = extraWrapper;

    $('#gsStartParams').value = main.start_params || '';
    $('#gsOffline').checked = main.offline === 'true';
    $('#gsSkipUpdate').checked = main.skip_update_check === 'true';

    const eacPath = env.PROTON_EAC_RUNTIME || '';
    const bePath = env.PROTON_BATTLEYE_RUNTIME || '';
    $('#gsEacEnabled').checked = !!eacPath;
    $('#gsEacPath').value = eacPath;
    $('#gsBattlEyeEnabled').checked = !!bePath;
    $('#gsBattlEyePath').value = bePath;

    const reservedEnvKeys = ['PROTON_EAC_RUNTIME', 'PROTON_BATTLEYE_RUNTIME', 'STEAM_COMPAT_DATA_PATH', 'STEAM_COMPAT_CLIENT_INSTALL_PATH'];
    $('#gsEnvVars').value = Object.entries(env)
      .filter(([k]) => !reservedEnvKeys.includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    gameSettingsModal.classList.remove('hidden');
  }

  function closeGameSettingsModal() {
    gameSettingsModal.classList.add('hidden');
  }

  $('#gsCancelBtn').addEventListener('click', closeGameSettingsModal);

  $$('[data-browse]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const isDir = btn.dataset.browse === 'dir';
      const picked = await window.bublik.browsePath(isDir);
      if (picked) $(`#${btn.dataset.target}`).value = picked;
    });
  });

  $('#gsEacAutoDownload').addEventListener('click', async () => {
    const btn = $('#gsEacAutoDownload');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';
    const res = await window.bublik.downloadEacRuntime();
    btn.disabled = false;
    btn.textContent = originalText;
    if (res.ok) {
      $('#gsEacPath').value = res.path;
      $('#gsEacEnabled').checked = true;
    } else {
      const err = $('#gameSettingsError');
      err.textContent = res.message || t('gs.eacDownloadFailed');
      err.classList.remove('hidden');
    }
  });

  $('#gsSaveBtn').addEventListener('click', async () => {
    const appName = gameSettingsModal.dataset.app;
    const mode = $('input[name="gsMode"]:checked').value;
    const extraWrapper = $('#gsWrapper').value.trim();

    const mainPatch = {
      start_params: $('#gsStartParams').value.trim(),
      offline: $('#gsOffline').checked ? 'true' : '',
      skip_update_check: $('#gsSkipUpdate').checked ? 'true' : '',
      bublik_mode: mode,
      // Cleared per-mode below, set only where relevant.
      wine_executable: '',
      wine_prefix: '',
      no_wine: '',
      bublik_proton_path: '',
    };

    const envVars = {};
    $('#gsEnvVars').value.split('\n').forEach((line) => {
      const t2 = line.trim();
      if (!t2 || t2.startsWith('#')) return;
      const eq = t2.indexOf('=');
      if (eq <= 0) return;
      envVars[t2.slice(0, eq).trim()] = t2.slice(eq + 1).trim();
    });

    if (mode === 'wine') {
      mainPatch.wine_executable = $('#gsWineExecutable').value.trim();
      mainPatch.wine_prefix = $('#gsWinePrefix').value.trim();
      mainPatch.wrapper = extraWrapper;
    } else if (mode === 'proton') {
      const protonPath = $('#gsProtonPath').value.trim();
      mainPatch.no_wine = 'true';
      mainPatch.bublik_proton_path = protonPath;
      const protonInvocation = protonPath ? `"${protonPath}/proton" waitforexitandrun` : '';
      mainPatch.wrapper = [extraWrapper, protonInvocation].filter(Boolean).join(' ');
      const compatData = $('#gsCompatDataPath').value.trim();
      const steamClient = $('#gsSteamClientPath').value.trim();
      if (compatData) envVars.STEAM_COMPAT_DATA_PATH = compatData;
      if (steamClient) envVars.STEAM_COMPAT_CLIENT_INSTALL_PATH = steamClient;
    } else {
      // native
      mainPatch.no_wine = 'true';
      mainPatch.wrapper = extraWrapper;
    }

    if ($('#gsEacEnabled').checked) {
      const p = $('#gsEacPath').value.trim();
      if (p) envVars.PROTON_EAC_RUNTIME = p;
    }
    if ($('#gsBattlEyeEnabled').checked) {
      const p = $('#gsBattlEyePath').value.trim();
      if (p) envVars.PROTON_BATTLEYE_RUNTIME = p;
    }

    const saveBtn = $('#gsSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = t('common.saving');
    const res = await window.bublik.saveGameSettings(appName, mainPatch, envVars);
    saveBtn.disabled = false;
    saveBtn.textContent = t('common.save');

    if (res.ok) {
      closeGameSettingsModal();
    } else {
      const err = $('#gameSettingsError');
      err.textContent = res.message || t('gs.saveFailed');
      err.classList.remove('hidden');
    }
  });

  // ---------- Data refresh ----------
  async function refreshAuth() {
    const status = await window.bublik.authStatus();
    state.loggedIn = !!status.loggedIn;
    state.account = status.account || null;
    renderAccount();
    renderSettings();
  }

  async function refreshLibrary() {
    if (!state.loggedIn) {
      state.library = [];
      renderLibrary();
      return;
    }
    state.library = await window.bublik.listLibrary();
    renderLibrary();
  }

  async function refreshInstalled() {
    const list = await window.bublik.listInstalled();
    state.installed = new Map(list.map((g) => [g.appName, g]));
    renderInstalled();
  }

  async function refreshAppState() {
    const playtimeData = await window.bublik.getPlaytime();
    state.playtime = new Map(Object.entries(playtimeData || {}));
    await refreshAuth();
    await refreshInstalled();
    await refreshLibrary();
  }

  async function boot() {
    const check = await window.bublik.checkInstalled();
    if (!check.installed) {
      legendaryMissingBanner.classList.remove('hidden');
    }
    await refreshAppState();
  }

  $('#downloadLegendaryBtn').addEventListener('click', async () => {
    const btn = $('#downloadLegendaryBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = t('banner.downloading');
    consoleDrawer.classList.add('is-open');
    const res = await window.bublik.downloadLegendary();
    btn.disabled = false;
    btn.textContent = originalText;
    if (res.ok) {
      logLine(null, `legendary ${res.version || ''} готовий.`, false);
      legendaryMissingBanner.classList.add('hidden');
      // Trust the download's own just-completed verification instead of
      // immediately re-spawning the binary via boot()'s checkInstalled —
      // that redundant back-to-back re-check was flaky (a fresh success
      // could get contradicted a few milliseconds later) and would silently
      // pop the banner back up right after confirming everything worked.
      await refreshAppState();
    } else {
      logLine(null, res.message || t('banner.downloadFailed'), true);
    }
  });

  // ---------- Localization ----------
  const languageSelect = $('#languageSelect');
  languageSelect.value = getLang();
  languageSelect.addEventListener('change', () => {
    setLang(languageSelect.value);
    applyI18n();
    // Re-render everything that builds its own text in JS (buttons, counts,
    // titles) rather than through static data-i18n attributes.
    renderAccount();
    renderSettings();
    renderLibrary();
    renderInstalled();
  });

  // ---------- Theme ----------
  function refreshThemeSwatches() {
    const active = getTheme();
    $$('.theme-swatch').forEach((el) => el.classList.toggle('is-active', el.dataset.theme === active));
  }
  $$('.theme-swatch').forEach((el) => {
    el.addEventListener('click', () => {
      setTheme(el.dataset.theme);
      refreshThemeSwatches();
    });
  });
  setTheme(getTheme());
  refreshThemeSwatches();

  applyI18n();
  boot();
})();
