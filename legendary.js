// legendary.js
//
// Thin wrapper around the `legendary` command-line tool.
// Bublik Launcher does NOT talk to Epic's servers itself, does NOT store or
// see the user's password, and does NOT implement any private Epic protocol.
// Every login / library / download / launch action is delegated to the
// `legendary` binary — either one already on the user's PATH, or one we
// fetch on their behalf straight from legendary's own official GitHub
// releases (see downloadLegendaryBinary below). This module only spawns
// that process and parses its stdout.
//
// Docs / source of the underlying tool: https://github.com/derrod/legendary

const { spawn, spawnSync } = require('child_process');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Resolve which executable to call, checked fresh on every invocation (not
// once at startup) so it picks up a binary we just auto-downloaded without
// needing a restart. Priority: explicit override env var > our own managed
// copy (see downloadLegendaryBinary below) > whatever's on PATH.
const LEGENDARY_BIN_DIR = path.join(os.homedir(), '.config', 'bublik-launcher', 'bin');

// Some distros put pip's `--user` console scripts in a bin dir we don't
// scan, or don't place a script at all in some edge configurations, even
// though the `legendary` *package* itself installed fine and is fully
// importable. Rather than declare defeat, we remember "the direct binary
// didn't work but `python3 -m legendary` did" here and use that mode from
// then on. Delete this file to make bublik-launcher re-probe from scratch.
const LEGENDARY_MODE_FILE = path.join(os.homedir(), '.config', 'bublik-launcher', 'legendary-mode.json');

function readLegendaryMode() {
  try { return JSON.parse(fs.readFileSync(LEGENDARY_MODE_FILE, 'utf8')); } catch { return null; }
}

function writeLegendaryMode(mode) {
  try {
    fs.mkdirSync(path.dirname(LEGENDARY_MODE_FILE), { recursive: true });
    fs.writeFileSync(LEGENDARY_MODE_FILE, JSON.stringify(mode), 'utf8');
  } catch { /* best effort — worst case we just re-probe next run */ }
}

function getManagedLegendaryPath() {
  const name = process.platform === 'win32' ? 'legendary.exe' : 'legendary';
  return path.join(LEGENDARY_BIN_DIR, name);
}

function resolveLegendaryBin() {
  if (process.env.BUBLIK_LEGENDARY_BIN) return process.env.BUBLIK_LEGENDARY_BIN;
  const managed = getManagedLegendaryPath();
  if (fs.existsSync(managed)) return managed;
  // GUI-launched apps (double-clicked AppImage, .desktop entry) often
  // inherit a slimmer PATH than an interactive shell — a `pip install
  // --user` binary lands in ~/.local/bin, which shells add via .bashrc/
  // .profile but a desktop session frequently does not. `legendary
  // --version` working fine in a terminal while this app still can't find
  // it is usually exactly this, not a real "not installed" situation.
  if (process.platform !== 'win32') {
    const commonPaths = [
      path.join(os.homedir(), '.local', 'bin', 'legendary'),
      '/usr/local/bin/legendary',
      '/usr/bin/legendary',
      path.join(os.homedir(), '.local', 'share', 'pipx', 'venvs', 'legendary-gl', 'bin', 'legendary'),
    ];
    for (const candidate of commonPaths) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return 'legendary';
}

function run(args, { onLine } = {}) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      const mode = readLegendaryMode();
      if (mode && mode.type === 'module' && mode.python) {
        proc = spawn(mode.python, ['-c', 'from legendary.cli import main; main()', ...args], { windowsHide: true });
      } else {
        proc = spawn(resolveLegendaryBin(), args, { windowsHide: true });
      }
    } catch (err) {
      reject(err);
      return;
    }

    let stdout = '';
    let stderr = '';

    const handleChunk = (buf, isErr) => {
      const text = buf.toString('utf8');
      if (isErr) stderr += text; else stdout += text;
      if (onLine) {
        text.split(/\r?\n/).filter(Boolean).forEach((line) => onLine(line, isErr));
      }
    };

    proc.stdout.on('data', (b) => handleChunk(b, false));
    proc.stderr.on('data', (b) => handleChunk(b, true));

    proc.on('error', (err) => {
      // ENOENT etc — most commonly "legendary isn't installed / on PATH"
      reject(err);
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function checkInstalled() {
  try {
    const { code, stdout } = await run(['--version']);
    if (code === 0) return { installed: true, version: stdout.trim() };
    return { installed: false };
  } catch {
    return { installed: false };
  }
}

// ---------------------------------------------------------------------------
// Auto-download legendary itself. Its own README explicitly recommends this
// exact path for people without Python: "Download the legendary or
// legendary.exe binary from the latest release" — these are official
// PyInstaller-built standalone binaries, not a third-party mirror.
// The project moved from derrod/legendary to legendary-gl/legendary (org
// transfer, 2026) alongside a build-tooling overhaul — asset naming has
// shifted between releases before and may again, so we match by pattern
// instead of requiring one exact filename.
const LEGENDARY_RELEASES_API = 'https://api.github.com/repos/legendary-gl/legendary/releases/latest';

function pickLegendaryAsset(assets) {
  const notPackaging = (name) => !/\.(whl|tar\.gz|zip|sha256|asc|txt|sig)$/i.test(name);
  const notArm = (name) => !/aarch64|arm64|[-_]arm(?:[^a-z0-9]|$)/i.test(name);
  if (process.platform === 'win32') {
    return assets.find((a) => /legendary.*\.exe$/i.test(a.name) && notArm(a.name));
  }
  if (process.platform === 'darwin') {
    return (
      assets.find((a) => /legendary.*mac/i.test(a.name) && notPackaging(a.name) && notArm(a.name)) ||
      assets.find((a) => /^legendary$/i.test(a.name))
    );
  }
  // linux — a release can ship both x86_64 and arm64 builds; picking the
  // first "starts with legendary" match once grabbed an arm64 file on a
  // normal x86_64 machine ("Exec format error"-class bug), so architecture
  // exclusion has to apply at every fallback tier, not just the loosest one.
  return (
    assets.find((a) => /^legendary$/i.test(a.name)) ||
    assets.find((a) => /^legendary[-_](linux[-_]?)?(x86[-_]?64|amd64)/i.test(a.name) && notPackaging(a.name)) ||
    assets.find((a) => /^legendary[-_]linux/i.test(a.name) && notPackaging(a.name) && notArm(a.name)) ||
    assets.find((a) => /^legendary/i.test(a.name) && notPackaging(a.name) && notArm(a.name) && !/mac|win|exe/i.test(a.name))
  );
}

// Actually runs the binary (--version) rather than just checking it exists —
// a file can be present on disk and still be non-functional (wrong
// architecture, missing native deps, etc, as happened with a 0.21.0 zipapp
// asset missing a compiled Cryptodome module for one user's Python ABI).
// Without this check, a broken cached copy would report "ready" forever.
// Returns { ok, stderr } instead of a bare boolean — a failure's actual
// error text (e.g. a Python traceback from a broken upstream build) is what
// makes the next bug report diagnosable instead of another guessing round.
function verifyLegendaryBinary(binPath) {
  return new Promise((resolve) => {
    let proc;
    let settled = false;
    let stderr = '';
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (proc && proc.exitCode === null && !proc.killed) {
        try { proc.kill(); } catch { /* already gone */ }
      }
      resolve({ ok, stderr: stderr.trim() });
    };
    try {
      proc = spawn(binPath, ['--version'], { windowsHide: true });
    } catch (err) {
      resolve({ ok: false, stderr: String((err && err.message) || err) });
      return;
    }
    if (proc.stderr) proc.stderr.on('data', (buf) => { stderr += buf.toString('utf8'); });
    proc.on('error', (err) => finish(false, err));
    proc.on('close', (code) => finish(code === 0));
    setTimeout(() => finish(false), 15000);
  });
}

// Same idea as verifyLegendaryBinary, but for `python -m legendary` — used
// after a pip install when no working console-script binary can be found on
// disk. pip installing the package successfully (exit code 0) does NOT
// guarantee a working `legendary` command afterwards: on some distros the
// `--user` scripts dir isn't where we expect, or (as seen in the wild) pip
// fails to write the console-script file at all if that scripts dir didn't
// already exist — but the package itself still lands in site-packages fine.
// legendary-gl has no `legendary/__main__.py`, so `python -m legendary`
// does NOT work ("package and cannot be directly executed") — its actual
// console-script entry point is `legendary.cli:main`, so we call that
// directly instead, exactly like the generated script would.
function verifyPythonModule(python) {
  return new Promise((resolve) => {
    let proc;
    let settled = false;
    let stderr = '';
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (proc && proc.exitCode === null && !proc.killed) {
        try { proc.kill(); } catch { /* already gone */ }
      }
      resolve({ ok, stderr: stderr.trim() });
    };
    try {
      proc = spawn(python, ['-c', 'from legendary.cli import main; main()', '--version'], { windowsHide: true });
    } catch (err) {
      resolve({ ok: false, stderr: String((err && err.message) || err) });
      return;
    }
    if (proc.stderr) proc.stderr.on('data', (buf) => { stderr += buf.toString('utf8'); });
    proc.on('error', (err) => finish(false, err));
    proc.on('close', (code) => finish(code === 0));
    setTimeout(() => finish(false), 15000);
  });
}

// Tries `pip install --user legendary-gl` (a few command/flag combos) as an
// automatic fallback when the standalone binary doesn't work. This installs
// a build matched to the system's actual Python instead of a generic
// prebuilt binary — closes exactly the gap the 0.21.0 Linux binary's own
// packaging bug leaves open, without the user ever touching a terminal.
async function tryPipInstall(onLine) {
  const log = onLine || (() => {});
  const pipCmds = process.platform === 'win32' ? ['pip', 'pip3'] : ['pip3', 'pip'];
  // Some distros (Debian/Ubuntu 23.04+, Fedora) block plain `pip install
  // --user` under PEP 668 ("externally managed environment") unless told
  // otherwise — try the plain form first, then with the override flag.
  const flagSets = [['--user'], ['--user', '--break-system-packages']];

  // `pip install --user` writes its console-script (the `legendary`
  // command) straight into ~/.local/bin — and on a system where that
  // directory has never been created (no prior --user installs), pip can
  // fail deep into the install with a raw OSError ("No such file or
  // directory") on that exact path, even though the package itself already
  // unpacked into site-packages fine. Make sure the target exists first so
  // that specific failure mode can't happen.
  if (process.platform !== 'win32') {
    try { fs.mkdirSync(path.join(os.homedir(), '.local', 'bin'), { recursive: true }); } catch { /* best effort */ }
  }

  for (const cmd of pipCmds) {
    for (const flags of flagSets) {
      log(`Пробую: ${cmd} install ${flags.join(' ')} legendary-gl`);
      const ok = await new Promise((resolve) => {
        let proc;
        try {
          proc = spawn(cmd, ['install', ...flags, 'legendary-gl'], { windowsHide: true });
        } catch {
          resolve(false);
          return;
        }
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
      });
      if (ok) return { ok: true, via: `${cmd} ${flags.join(' ')}` };
    }
  }
  return { ok: false };
}

async function downloadLegendaryBinary(onProgress) {
  const log = onProgress || (() => {});
  const targetPath = getManagedLegendaryPath();
  let binaryFailureMessage = null;

  if (fs.existsSync(targetPath)) {
    log('Перевіряю вже завантажений legendary...');
    const cachedCheck = await verifyLegendaryBinary(targetPath);
    if (cachedCheck.ok) {
      return { ok: true, path: targetPath, cached: true };
    }
    log('Наявна копія не запускається на цій системі — видаляю й пробую наново.');
    try { fs.rmSync(targetPath, { force: true }); } catch { /* best effort */ }
  }

  log('Шукаю останній реліз legendary на GitHub...');
  try {
    const release = await httpsGetJson(LEGENDARY_RELEASES_API);
    const assets = release.assets || [];
    const asset = pickLegendaryAsset(assets);
    if (!asset) {
      const names = assets.map((a) => a.name).join(', ') || '(список файлів порожній)';
      binaryFailureMessage = `Не знайдено відповідний файл у релізі legendary ${release.tag_name || ''}. Наявні файли: ${names}.`;
    } else {
      log(`Завантажую ${asset.name} (${release.tag_name || ''})...`);
      const res = await httpsGetFollowing(asset.browser_download_url);
      fs.mkdirSync(LEGENDARY_BIN_DIR, { recursive: true });
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(targetPath);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      });
      if (process.platform !== 'win32') fs.chmodSync(targetPath, 0o755);

      log('Перевіряю, чи запускається завантажений файл...');
      const check = await verifyLegendaryBinary(targetPath);
      if (check.ok) {
        return { ok: true, path: targetPath, cached: false, version: release.tag_name };
      }
      try { fs.rmSync(targetPath, { force: true }); } catch { /* best effort */ }
      const errSnippet = check.stderr ? check.stderr.slice(-500) : '(немає виводу помилки)';
      binaryFailureMessage =
        `Завантажений файл (${asset.name}, ${release.tag_name || ''}) не запускається. Помилка: ${errSnippet}`;
    }
  } catch (err) {
    binaryFailureMessage = 'Не вдалося звернутись до GitHub: ' + String((err && err.message) || err);
  }

  // Standalone binary route failed — automatically fall back to pip instead
  // of just telling the user to run it themselves.
  log('Готовий бінарник не спрацював — пробую встановити через pip (пакунок під саме твій Python)...');
  const pipResult = await tryPipInstall(log);
  let pipFailureDetail = null;
  if (pipResult.ok) {
    log(`Встановлено через "${pipResult.via} legendary-gl" — перевіряю...`);
    const directCheck = await verifyLegendaryBinary(resolveLegendaryBin());
    if (directCheck.ok) {
      return { ok: true, path: resolveLegendaryBin(), viaPip: true };
    }
    // pip reported success but there's still no working `legendary` command
    // on disk (script landed somewhere we don't scan, PATH oddities, etc).
    // The package itself installed fine though, so try running it as a
    // module before giving up entirely.
    log('Команду "legendary" не знайдено після встановлення — пробую "python -m legendary"...');
    let moduleOk = false;
    for (const py of ['python3', 'python']) {
      const modCheck = await verifyPythonModule(py);
      if (modCheck.ok) {
        writeLegendaryMode({ type: 'module', python: py });
        moduleOk = true;
        return { ok: true, path: `${py} -m legendary`, viaPip: true, viaModule: true };
      }
      if (modCheck.stderr) pipFailureDetail = modCheck.stderr.slice(-500);
    }
    if (!moduleOk && !pipFailureDetail) {
      pipFailureDetail = directCheck.stderr || null;
    }
  }

  return {
    ok: false,
    message: `${binaryFailureMessage}\n\nАвтоматична спроба через pip теж не вдалась` +
      (pipFailureDetail
        ? `. Остання помилка: ${pipFailureDetail}`
        : ' (або pip не знайдено в системі).') +
      '\n\nПостав вручну: pip install legendary-gl — і переконайся, що ~/.local/bin є в PATH, ' +
      'або спробуй "python3 -m legendary --version" щоб перевірити пакунок напряму.',
  };
}

async function checkAuthStatus() {
  // `legendary status` prints account info when logged in and a
  // "not logged in" style message otherwise (exact wording varies by
  // version, so we key off exit code / absence of an account name).
  try {
    const { code, stdout } = await run(['status', '--json']);
    if (code === 0) {
      try {
        const data = JSON.parse(stdout);
        if (data && data.account) {
          return { loggedIn: true, account: data.account };
        }
      } catch {
        // Older legendary versions don't support --json; fall through.
      }
    }
  } catch {
    // ignore, try legacy path below
  }

  try {
    const { stdout } = await run(['status']);
    const match = stdout.match(/Epic account:\s*(.+)/i);
    if (match && !/not logged in/i.test(stdout)) {
      return { loggedIn: true, account: match[1].trim() };
    }
  } catch {
    // legendary not installed — handled by checkInstalled elsewhere
  }
  return { loggedIn: false };
}

// Step 1: the URL that gets loaded (in our embedded <webview>, same as the
// store). This is Epic's own official login page — Bublik Launcher never
// sees the password, only the one-time authorization code Epic shows at
// the end. The clientId here is legendary's own public OAuth client id
// (same one the official-replacement CLI uses) — it must match exactly or
// Epic rejects it with "clientId has an invalid value".
const EPIC_CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';

function getEpicLoginUrl() {
  return 'https://www.epicgames.com/id/login?redirectUrl=' +
    encodeURIComponent(
      `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT_ID}&responseType=code`
    );
}

// Step 2: exchange the authorization code for tokens. This mirrors exactly
// what `legendary auth --code <code>` does. Accepts either a bare code or
// the full JSON blob Epic shows on the redirect page (in case a manual
// paste includes the braces) — same tolerance legendary's own CLI has.
async function loginWithCode(code) {
  let trimmed = (code || '').trim();
  if (!trimmed) return { ok: false, message: 'Порожній код авторизації.' };
  if (trimmed[0] === '{') {
    try {
      trimmed = JSON.parse(trimmed).authorizationCode;
    } catch {
      return { ok: false, message: 'Не вдалося розпізнати JSON з кодом авторизації.' };
    }
  } else {
    trimmed = trimmed.replace(/^"|"$/g, '');
  }
  if (!trimmed) return { ok: false, message: 'Порожній код авторизації.' };
  const { code: exitCode, stdout, stderr } = await run(['auth', '--code', trimmed]);
  if (exitCode === 0) return { ok: true };
  return { ok: false, message: (stderr || stdout || 'Не вдалося увійти.').trim() };
}

async function logout() {
  const { code, stdout, stderr } = await run(['auth', '--delete']);
  return { ok: code === 0, message: (stderr || stdout || '').trim() };
}

// Preferred key-image types for a poster-style tile, best first. Epic's
// catalog attaches several crops/aspects per game under metadata.keyImages;
// not every game has every type, so we fall back down the list.
const COVER_IMAGE_PRIORITY = [
  'DieselGameBoxTall',
  'OfferImageTall',
  'DieselStoreFrontTall',
  'DieselGameBox',
  'Thumbnail',
  'OfferImageWide',
  'DieselStoreFrontWide',
];

function pickCoverUrl(metadata) {
  const images = metadata && Array.isArray(metadata.keyImages) ? metadata.keyImages : [];
  if (!images.length) return null;
  for (const type of COVER_IMAGE_PRIORITY) {
    const match = images.find((img) => img.type === type && img.url);
    if (match) return match.url;
  }
  // last resort: whatever image is there
  return images[0].url || null;
}

// Library = everything on the account, whether installed locally or not.
async function listLibrary() {
  const { code, stdout } = await run(['list', '--json']);
  if (code !== 0) return [];
  try {
    const data = JSON.parse(stdout);
    return data.map((g) => ({
      appName: g.app_name,
      title: g.app_title || g.title || g.app_name,
      version: g.app_version || g.version || null,
      coverUrl: pickCoverUrl(g.metadata),
    }));
  } catch {
    return [];
  }
}

async function listInstalled() {
  const { code, stdout } = await run(['list-installed', '--json']);
  if (code !== 0) return [];
  try {
    const data = JSON.parse(stdout);
    return data.map((g) => ({
      appName: g.app_name,
      title: g.title || g.app_name,
      version: g.version || null,
      installSize: g.install_size || null,
      installPath: g.install_path || null,
    }));
  } catch {
    return [];
  }
}

// Streams progress lines back to the renderer via `onLine`; the renderer is
// responsible for parsing the "Progress: NN.NN%" style lines it cares about.
async function installGame(appName, onLine, basePath) {
  const args = ['install', appName];
  if (basePath) args.push('--base-path', basePath);
  args.push('-y');
  return run(args, { onLine });
}

// `legendary launch <app>` normally spawns the game itself and then exits
// right away (it doesn't wait around) — which means we'd have no handle on
// the actual game process to close it later. Instead we ask legendary for
// the resolved launch parameters (`--json`, which returns them without
// launching anything) and spawn the game ourselves, so we keep the process
// handle for the whole session.
async function getLaunchParams(appName, onLine) {
  const { code, stdout, stderr } = await run(['launch', appName, '--json'], { onLine });
  if (code !== 0) {
    return { ok: false, message: (stderr || stdout || 'Не вдалося отримати параметри запуску.').trim() };
  }
  try {
    const jsonText = stdout.trim();
    const start = jsonText.indexOf('{');
    const params = JSON.parse(start >= 0 ? jsonText.slice(start) : jsonText);
    return { ok: true, params };
  } catch {
    return { ok: false, message: 'Не вдалося розібрати параметри запуску, отримані від legendary.' };
  }
}

function spawnGameProcess(params) {
  const exePath = path.join(params.game_directory, params.game_executable);
  const args = [
    ...(params.launch_command || []),
    exePath,
    ...(params.game_parameters || []),
    ...(params.user_parameters || []),
    ...(params.egl_parameters || []),
  ];
  const bin = args.shift();
  const env = { ...process.env, ...(params.environment || {}) };
  // detached (POSIX only) puts the game in its own process group so
  // killProcessTree can take down the whole tree, not just this one PID.
  return spawn(bin, args, {
    cwd: params.working_directory || params.game_directory,
    env,
    detached: process.platform !== 'win32',
    windowsHide: false,
  });
}

function killProcessTree(proc) {
  if (!proc || proc.killed || proc.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
    } catch {
      try { proc.kill(); } catch { /* already gone */ }
    }
  } else {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      try { proc.kill('SIGTERM'); } catch { /* already gone */ }
    }
  }
}

async function uninstallGame(appName, onLine) {
  return run(['uninstall', appName, '-y'], { onLine });
}

// ---------------------------------------------------------------------------
// Per-game settings (Wine/Proton, wrapper, env vars, offline mode, etc).
// This is NOT a new mechanism we invented — it's legendary's own documented
// config.ini format (the same file/keys Heroic writes to under the hood).
// We only read/patch it; legendary itself is what actually uses it on launch.
//
// IMPORTANT, and worth being upfront about: none of this can "unlock" anti-
// cheat on a game that doesn't support Linux. Easy Anti-Cheat/BattlEye on
// Linux is enabled per-game by the developer on Epic's/BattlEye's backend —
// a client-side setting has no way to override that. If a game's dev has
// turned it on, running it through Proton here just works like any other
// game; if they haven't, no local setting changes that. Fortnite specifically
// is deliberately blocked by Epic on Linux and will not work here regardless.

function getConfigPath() {
  if (process.env.LEGENDARY_CONFIG_PATH) {
    return path.join(process.env.LEGENDARY_CONFIG_PATH, 'config.ini');
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'legendary', 'config.ini');
}

// Minimal INI parser — good enough for legendary's flat [section] / key = value
// format (no nesting, no multi-line values). Comments and unknown sections
// outside the ones we touch are preserved by round-tripping through this
// same representation; per-line comments *inside* an edited section are not
// preserved (acceptable trade-off for a settings UI).
function parseIni(text) {
  const sections = {};
  let current = null;
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) return;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      current = sectionMatch[1];
      if (!sections[current]) sections[current] = {};
      return;
    }
    const eq = line.indexOf('=');
    if (eq > 0 && current) {
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      sections[current][key] = value;
    }
  });
  return sections;
}

function stringifyIni(sections) {
  let out = '';
  for (const [name, kv] of Object.entries(sections)) {
    const keys = Object.keys(kv);
    if (!keys.length) continue; // drop empty sections entirely
    out += `[${name}]\n`;
    for (const key of keys) out += `${key} = ${kv[key]}\n`;
    out += '\n';
  }
  return out;
}

function readConfig() {
  const p = getConfigPath();
  try {
    return { path: p, sections: parseIni(fs.readFileSync(p, 'utf8')) };
  } catch {
    return { path: p, sections: {} };
  }
}

// Returns the current [AppName] and [AppName.env] sections for a game.
function getGameSettings(appName) {
  const { sections } = readConfig();
  return {
    main: sections[appName] || {},
    env: sections[`${appName}.env`] || {},
  };
}

// mainPatch: object of known keys to set; an empty-string value deletes that
// key. envVars: the FULL desired [AppName.env] section (the settings form
// shows the complete list, so this replaces rather than merges).
function saveGameSettings(appName, mainPatch, envVars) {
  const { path: p, sections } = readConfig();

  const main = { ...(sections[appName] || {}) };
  for (const [key, value] of Object.entries(mainPatch || {})) {
    if (value === '' || value === null || value === undefined) delete main[key];
    else main[key] = value;
  }
  if (Object.keys(main).length) sections[appName] = main;
  else delete sections[appName];

  const envKey = `${appName}.env`;
  const cleanEnv = {};
  for (const [key, value] of Object.entries(envVars || {})) {
    if (key && value !== '' && value !== null && value !== undefined) cleanEnv[key] = value;
  }
  if (Object.keys(cleanEnv).length) sections[envKey] = cleanEnv;
  else delete sections[envKey];

  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, stringifyIni(sections), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    httpsGetFollowing(url).then(
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
        });
        res.on('error', reject);
      },
      reject
    );
  });
}

// ---------------------------------------------------------------------------
// GE-Proton (GloriousEggroll's community Proton build) is a real, actively
// maintained open-source project with public GitHub releases — not a mirror
// of someone else's proprietary tool. That makes it the one piece of this
// puzzle we can legitimately auto-download in full, the same way Lutris's
// and Heroic's own updater scripts do.
// https://github.com/GloriousEggroll/proton-ge-custom
const GE_PROTON_RELEASES_API = 'https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest';
const PROTON_BASE_DIR = path.join(os.homedir(), '.config', 'bublik-launcher', 'proton');

function findLocalGeProton() {
  try {
    const dirs = fs
      .readdirSync(PROTON_BASE_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      // Ignore ARM builds entirely — GE-Proton's releases bundle both, and
      // an aarch64 build's wine binary fails with "Exec format error" on a
      // normal x86_64 machine. Only match names WITHOUT an arm/aarch64 tag.
      .filter((name) => !/aarch64|arm64|-arm(?:[^a-z0-9]|$)/i.test(name))
      .filter((name) => fs.existsSync(path.join(PROTON_BASE_DIR, name, 'proton')))
      .sort();
    if (!dirs.length) return null;
    return path.join(PROTON_BASE_DIR, dirs[dirs.length - 1]);
  } catch {
    return null;
  }
}

async function downloadGeProton(onProgress) {
  // Clean up any wrong-architecture build from a previous run so it doesn't
  // just sit there taking up space once we stop selecting it.
  try {
    fs.readdirSync(PROTON_BASE_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /aarch64|arm64|-arm(?:[^a-z0-9]|$)/i.test(e.name))
      .forEach((e) => fs.rmSync(path.join(PROTON_BASE_DIR, e.name), { recursive: true, force: true }));
  } catch { /* best effort, PROTON_BASE_DIR may not exist yet */ }

  const existing = findLocalGeProton();
  if (existing) return { ok: true, path: existing, cached: true };

  if (onProgress) onProgress('Шукаю останній випуск GE-Proton на GitHub...');
  let release;
  try {
    release = await httpsGetJson(GE_PROTON_RELEASES_API);
  } catch (err) {
    return { ok: false, message: 'Не вдалося звернутись до GitHub: ' + String((err && err.message) || err) };
  }
  const candidates = (release.assets || []).filter(
    (a) => /\.tar\.(gz|xz)$/.test(a.name) && !/sha512sum/i.test(a.name)
  );
  // GE-Proton releases bundle multiple architectures in the same release —
  // picking the first match blindly grabbed an aarch64 build once, which
  // fails with "Exec format error" on a normal x86_64 machine. Explicitly
  // prefer a name with no arm/aarch64 tag.
  const asset =
    candidates.find((a) => !/aarch64|arm64|-arm(?:[^a-z0-9]|$)/i.test(a.name)) || candidates[0];
  if (!asset) return { ok: false, message: 'Не знайдено файл релізу GE-Proton.' };

  if (onProgress) onProgress(`Завантажую ${asset.name}...`);
  const tmpFile = path.join(os.tmpdir(), `bublik-geproton-${Date.now()}-${asset.name}`);
  try {
    const res = await httpsGetFollowing(asset.browser_download_url);
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tmpFile);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });
    fs.mkdirSync(PROTON_BASE_DIR, { recursive: true });
    if (onProgress) onProgress('Розпаковую GE-Proton...');
    const tarFlag = asset.name.endsWith('.xz') ? '-xJf' : '-xzf';
    const extract = spawnSync('tar', [tarFlag, tmpFile, '-C', PROTON_BASE_DIR]);
    if (extract.status !== 0) {
      return { ok: false, message: 'Не вдалося розпакувати GE-Proton (потрібен tar із підтримкою gzip/xz).' };
    }
    const found = findLocalGeProton();
    if (!found) return { ok: false, message: 'GE-Proton розпаковано, але файл proton не знайдено всередині.' };
    return { ok: true, path: found, cached: false, version: release.tag_name };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* never created / already gone */ }
  }
}

// One-shot orchestration: Steam path, GE-Proton, a per-game prefix folder,
// and the EAC runtime — everything the Proton launch mode needs, gathered
// automatically. Doesn't touch legendary's config directly; the caller
// applies the result with saveGameSettings so the renderer stays the single
// place that decides what gets written.
async function autoConfigureAntiCheat(appName, onLine) {
  const log = onLine || (() => {});

  log('Шукаю встановлений Steam...');
  let steamClientPath = detectSteamPath();
  if (!steamClientPath) {
    steamClientPath = path.join(os.homedir(), '.config', 'bublik-launcher', 'dummy-steam');
    try { fs.mkdirSync(steamClientPath, { recursive: true }); } catch { /* best effort */ }
    log('Steam не знайдено — використовую заглушку. Якщо Proton все одно впаде з помилкою про ' +
      'STEAM_COMPAT_CLIENT_INSTALL_PATH, встанови Steam (можна взагалі без ігор) і повтори.');
  } else {
    log(`Знайдено Steam: ${steamClientPath}`);
  }

  log('Шукаю/завантажую GE-Proton...');
  const protonRes = await downloadGeProton(log);
  if (!protonRes.ok) return { ok: false, message: protonRes.message };
  log(protonRes.cached
    ? `Використовую вже завантажений GE-Proton: ${protonRes.path}`
    : `Завантажено GE-Proton ${protonRes.version || ''}: ${protonRes.path}`);

  const prefixPath = path.join(os.homedir(), '.config', 'bublik-launcher', 'prefixes', appName);
  try {
    fs.mkdirSync(prefixPath, { recursive: true });
    log(`Тека префікса: ${prefixPath}`);
  } catch (err) {
    return { ok: false, message: 'Не вдалося створити теку префікса: ' + String((err && err.message) || err) };
  }

  log('Перевіряю EasyAntiCheat runtime...');
  const eacRes = await downloadEacRuntime();
  let eacPath = null;
  if (eacRes.ok) {
    eacPath = eacRes.path;
    log(eacRes.cached ? `EAC runtime вже готовий: ${eacRes.path}` : `EAC runtime завантажено: ${eacRes.path}`);
  } else {
    log('Не вдалося підготувати EAC runtime автоматично: ' + eacRes.message);
  }

  return { ok: true, protonPath: protonRes.path, prefixPath, steamClientPath, eacPath };
}


// "point me at a Steam-installed folder" step above is optional rather than
// mandatory. Source: a community-maintained mirror hosted directly inside
// ValveSoftware/Proton's own GitHub repo (the same file Lutris's install
// scripts pull from). This is NOT guaranteed to be as fresh as Valve's own
// Steam tool — flag that clearly in the UI — but it's a real, working,
// third-party-verifiable file, not something invented for this project.
const EAC_RUNTIME_MIRROR_URL =
  'https://github.com/ValveSoftware/Proton/files/4839724/easyanticheat_wine_x64.tar.gz';

function httpsGetFollowing(url, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'bublik-launcher' } }, (res) => {
        const loc = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc && redirectsLeft > 0) {
          res.resume();
          httpsGetFollowing(loc, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} під час завантаження runtime.`));
          return;
        }
        resolve(res);
      })
      .on('error', reject);
  });
}

async function downloadEacRuntime() {
  const targetDir = path.join(os.homedir(), '.config', 'bublik-launcher', 'runtimes', 'eac');
  try {
    if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
      return { ok: true, path: targetDir, cached: true };
    }
  } catch { /* fall through to (re)download */ }

  const tmpFile = path.join(os.tmpdir(), `bublik-eac-${Date.now()}.tar.gz`);
  try {
    const res = await httpsGetFollowing(EAC_RUNTIME_MIRROR_URL);
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tmpFile);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });
    fs.mkdirSync(targetDir, { recursive: true });
    const extract = spawnSync('tar', ['-xzf', tmpFile, '-C', targetDir]);
    if (extract.status !== 0) {
      return {
        ok: false,
        message: 'Не вдалося розпакувати архів (потрібна встановлена утиліта tar).',
      };
    }
    return { ok: true, path: targetDir };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* already gone / never created */ }
  }
}

// Best-effort detection of a local Steam client install — needed because
// launching through real Proton (not just a raw wine binary) requires
// STEAM_COMPAT_CLIENT_INSTALL_PATH to point at *some* Steam client dir, or
// Proton's own script crashes with a KeyError before it even gets to the
// game. Steam itself doesn't need to be running — this is just a path Proton
// reads a couple of things from.
function detectSteamPath() {
  const candidates = [
    path.join(os.homedir(), '.steam', 'steam'),
    path.join(os.homedir(), '.local', 'share', 'Steam'),
    path.join(os.homedir(), '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    path.join(os.homedir(), '.steam', 'root'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    } catch { /* keep looking */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Playtime tracking. legendary itself has no concept of this — we own the
// game's process handle (see spawnGameProcess/killProcessTree above), so we
// measure start-to-exit ourselves and persist totals in our own small file.
const PLAYTIME_FILE = path.join(os.homedir(), '.config', 'bublik-launcher', 'playtime.json');

function readPlaytime() {
  try {
    return JSON.parse(fs.readFileSync(PLAYTIME_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function getPlaytime() {
  return readPlaytime();
}

// Returns the game's new total (seconds) after adding this session.
function addPlaytime(appName, seconds) {
  const data = readPlaytime();
  data[appName] = (data[appName] || 0) + Math.max(0, Math.round(seconds));
  try {
    fs.mkdirSync(path.dirname(PLAYTIME_FILE), { recursive: true });
    fs.writeFileSync(PLAYTIME_FILE, JSON.stringify(data), 'utf8');
  } catch { /* best effort — losing one session's playtime isn't worth crashing over */ }
  return data[appName];
}

// ---------------------------------------------------------------------------
// AppImage desktop integration. AppImages don't show up in the system's
// application menu just from being downloaded — nothing registers them.
// The common fix is a separate tool (AppImageLauncher), but we can just do
// it ourselves: the AppImage runtime sets $APPIMAGE to the .AppImage file's
// own path for every process it launches, so on every start we (re)write a
// .desktop entry pointing at that exact path — cheap, idempotent, and it
// stays correct even if the user renames or moves the file. No-ops entirely
// when not actually running from an AppImage (dev mode, Windows, macOS).
function ensureDesktopIntegration() {
  const appImagePath = process.env.APPIMAGE;
  if (!appImagePath) return;

  try {
    const iconDir = path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor', '256x256', 'apps');
    fs.mkdirSync(iconDir, { recursive: true });
    const iconSrc = path.join(__dirname, 'renderer', 'assets', 'icon.png');
    if (fs.existsSync(iconSrc)) {
      fs.copyFileSync(iconSrc, path.join(iconDir, 'bublik-launcher.png'));
    }

    const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
    fs.mkdirSync(appsDir, { recursive: true });
    const desktopEntry =
      '[Desktop Entry]\n' +
      'Type=Application\n' +
      'Name=Bublik Launcher\n' +
      'Comment=Epic Games launcher built on the legendary CLI\n' +
      `Exec="${appImagePath}" --class=bublik-launcher %U\n` +
      'Icon=bublik-launcher\n' +
      'Categories=Game;\n' +
      'Terminal=false\n' +
      'StartupWMClass=bublik-launcher\n';
    fs.writeFileSync(path.join(appsDir, 'bublik-launcher.desktop'), desktopEntry, 'utf8');

    // Best-effort — most desktop environments also pick this up on their own
    // periodic rescan, this just makes it show up immediately without a
    // logout/login. Fine if the command isn't installed.
    spawnSync('update-desktop-database', [appsDir]);
    spawnSync('gtk-update-icon-cache', ['-f', '-t', path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor')]);
  } catch {
    // Desktop integration is a nicety, never worth crashing launch over.
  }
}

module.exports = {
  checkInstalled,
  downloadLegendaryBinary,
  checkAuthStatus,
  getEpicLoginUrl,
  loginWithCode,
  logout,
  listLibrary,
  listInstalled,
  installGame,
  getLaunchParams,
  spawnGameProcess,
  killProcessTree,
  uninstallGame,
  getGameSettings,
  saveGameSettings,
  downloadEacRuntime,
  detectSteamPath,
  autoConfigureAntiCheat,
  getPlaytime,
  addPlaytime,
  ensureDesktopIntegration,
};
