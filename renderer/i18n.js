// i18n.js — flat key → string dictionaries for uk/ru/en, plus a tiny apply
// helper. Loaded before renderer.js. Persists the chosen language in
// localStorage (a real Electron desktop app, not a sandboxed webview, so
// this is just normal persistent storage — not the claude.ai artifact
// restriction).

const TRANSLATIONS = {
  uk: {
    'nav.store': 'Магазин',
    'nav.library': 'Бібліотека',
    'nav.installed': 'Встановлені',
    'nav.settings': 'Налаштування',
    'sidebar.console': 'Консоль',

    'topbar.searchPlaceholder': 'Знайти гру в бібліотеці…',
    'account.login': 'Увійти в Epic',
    'account.logout': 'Вийти',

    'banner.legendaryMissingTitle': 'legendary не знайдено.',
    'banner.legendaryMissingBody':
      'Bublik Launcher — це інтерфейс поверх CLI-інструмента <code>legendary</code>. Натисни кнопку ' +
      'нижче, щоб він завантажився автоматично (офіційний бінарник з GitHub-релізів), або постав ' +
      'вручну (<code>pip install legendary-gl</code>) і перезапусти застосунок.',
    'banner.downloadLegendary': '⚡ Завантажити legendary автоматично',
    'banner.downloading': '⚡ Завантажую…',
    'banner.downloadFailed': 'Не вдалося завантажити legendary автоматично.',

    'store.back': 'Назад',
    'store.forward': 'Вперед',
    'store.reload': 'Оновити',

    'library.title': 'Бібліотека',
    'library.empty': "Тут з'явиться твоя бібліотека Epic Games після входу в акаунт.",

    'installed.title': 'Встановлені',
    'installed.empty': 'Ще немає встановлених ігор. Онови бібліотеку, обери гру та натисни «Встановити».',

    'settings.title': 'Налаштування',
    'settings.accountLabel': 'Акаунт Epic Games',
    'settings.notLoggedIn': 'Не виконано вхід',
    'settings.loggedInAs': 'Виконано вхід як {account}',
    'settings.dataSourceLabel': 'Джерело даних',
    'settings.dataSourceHint': 'legendary CLI (опенсорс, community-проєкт, не офіційний клієнт Epic)',
    'settings.languageLabel': 'Мова',
    'settings.languageHint': 'Мова інтерфейсу застосунку',

    'login.title': 'Увійти в Epic Games',
    'login.close': 'Закрити',
    'login.description':
      'Це справжня сторінка входу epicgames.com, показана прямо тут. Пароль вводиться на ній ' +
      'напряму — Bublik Launcher його не бачить, лише одноразовий код після входу.',
    'login.loadingPage': 'Завантаження сторінки Epic…',
    'login.codeReceived': 'Код отримано, входимо…',
    'login.autoFailed': 'Не вдалося зчитати код автоматично — введи вручну нижче.',
    'login.manualToggle': 'Код не підхопився автоматично? Ввести вручну',
    'login.manualDescription':
      'Після входу на сторінці вище має з\'явитись JSON з полем <code>authorizationCode</code> — ' +
      'встав його значення (або весь JSON) сюди:',
    'login.codePlaceholder': 'Код авторизації',
    'login.submit': 'Увійти з кодом',
    'login.submitting': 'Вхід…',
    'login.emptyCode': 'Встав код авторизації з Epic.',
    'login.failed': 'Не вдалося увійти. Спробуй ще раз.',

    'ctx.settingsEnabled': '⚙ Налаштування (Proton/Wine)',
    'ctx.settingsDisabled': '⚙ Налаштування (спочатку встанови гру)',

    'gs.titlePrefix': 'Налаштування — ',
    'gs.description':
      'Proton/Wine та інші параметри запуску (актуально для Linux). Записується напряму у ' +
      '<code>config.ini</code> legendary — той самий механізм, яким користується Heroic.',
    'gs.wineExecutable': 'Wine/Proton виконуваний файл',
    'gs.winePrefix': 'Wine-префікс',
    'gs.wrapper': 'Обгортка запуску (wrapper)',
    'gs.startParams': 'Додаткові параметри запуску',
    'gs.offline': 'Запускати офлайн (без онлайн-автентифікації)',
    'gs.skipUpdate': 'Не перевіряти оновлення при запуску',
    'gs.noWine': 'Не використовувати Wine (нативний Linux-білд)',
    'gs.anticheatTitle': 'Easy Anti-Cheat / BattlEye Runtime (Linux)',
    'gs.anticheatDescription':
      'Це той самий механізм, яким користується Heroic. Файли розповсюджує Valve безкоштовно через ' +
      'Steam — інструменти <code>Proton EasyAntiCheat Runtime</code> та <code>Proton BattlEye Runtime</code> ' +
      'можна встановити на акаунт і завантажити навіть без жодної гри в Steam. Або тисни «Завантажити» ' +
      'нижче — це підтягне community-дзеркало напряму, без Steam (може бути не таким свіжим).',
    'gs.eacEnabled': 'Увімкнути EasyAntiCheat Runtime',
    'gs.battlEyeEnabled': 'Увімкнути BattlEye Runtime',
    'gs.download': 'Завантажити',
    'gs.envVarsLabel': 'Додаткові змінні середовища (по одній на рядок, KEY=VALUE)',
    'gs.anticheatNote':
      '<strong>Чесно про межі цього.</strong> EAC/BattlEye runtime вище працює лише в режимі ' +
      '<strong>Proton</strong> (не Wine) — це реальна вимога самого Proton: змінні ' +
      '<code>PROTON_EAC_RUNTIME</code>/<code>PROTON_BATTLEYE_RUNTIME</code> читає скрипт ' +
      '<code>proton</code>, а не звичайний Wine-бінарник. Навіть у режимі Proton це вмикає лише ' +
      '<em>можливість</em> ініціалізації анти-чита, а чи саму гру пропустить конкретний анти-чит-деплой, ' +
      'вирішує розробник на своєму боці. Fortnite Epic блокує на Linux свідомо — це не обійти жодним ' +
      'налаштуванням тут.',
    'gs.eacDownloadFailed': 'Не вдалося завантажити runtime автоматично. Спробуй шлях через Steam вручну.',
    'gs.saveFailed': 'Не вдалося зберегти налаштування.',

    'common.browse': 'Огляд',
    'common.cancel': 'Скасувати',
    'common.save': 'Зберегти',
    'common.saving': 'Збереження…',
    'common.clear': 'Очистити',

    'console.title': 'Вивід legendary',

    'uninstall.confirm': 'Видалити «{title}»? Файли гри будуть видалені з диска.',
    'game.launchFailed': 'Не вдалося запустити гру.',
    'game.closeFailed': 'Не вдалося закрити гру.',
    'game.uninstallFailed': 'Не вдалося видалити гру.',

    'tile.install': 'Встановити',
    'tile.play': 'Грати',
    'tile.downloading': 'Завантаження…',
    'tile.closeGame': 'Закрити гру',
    'tile.deleteTitle': 'Видалити гру',
    'tile.playtimeLabel': 'Зіграно: {duration}',
    'playtime.hoursMinutes': '{hours} год {minutes} хв',
    'playtime.minutesOnly': '{minutes} хв',
    'playtime.lessThanMinute': 'менше хвилини',

    'install.title': 'Куди встановити гру?',
    'install.description': 'Залиш порожнім, щоб використати теку за замовчуванням legendary (~/legendary).',
    'install.confirm': 'Завантажити',

    'settings.themeLabel': 'Тема',
    'settings.themeHint': 'Колір акценту інтерфейсу',
  },

  ru: {
    'nav.store': 'Магазин',
    'nav.library': 'Библиотека',
    'nav.installed': 'Установленные',
    'nav.settings': 'Настройки',
    'sidebar.console': 'Консоль',

    'topbar.searchPlaceholder': 'Найти игру в библиотеке…',
    'account.login': 'Войти в Epic',
    'account.logout': 'Выйти',

    'banner.legendaryMissingTitle': 'legendary не найден.',
    'banner.legendaryMissingBody':
      'Bublik Launcher — это интерфейс поверх CLI-инструмента <code>legendary</code>. Нажми кнопку ' +
      'ниже, чтобы он скачался автоматически (официальный бинарник из GitHub-релизов), или установи ' +
      'вручную (<code>pip install legendary-gl</code>) и перезапусти приложение.',
    'banner.downloadLegendary': '⚡ Скачать legendary автоматически',
    'banner.downloading': '⚡ Скачиваю…',
    'banner.downloadFailed': 'Не удалось скачать legendary автоматически.',

    'store.back': 'Назад',
    'store.forward': 'Вперёд',
    'store.reload': 'Обновить',

    'library.title': 'Библиотека',
    'library.empty': 'Здесь появится твоя библиотека Epic Games после входа в аккаунт.',

    'installed.title': 'Установленные',
    'installed.empty': 'Пока нет установленных игр. Обнови библиотеку, выбери игру и нажми «Установить».',

    'settings.title': 'Настройки',
    'settings.accountLabel': 'Аккаунт Epic Games',
    'settings.notLoggedIn': 'Вход не выполнен',
    'settings.loggedInAs': 'Выполнен вход как {account}',
    'settings.dataSourceLabel': 'Источник данных',
    'settings.dataSourceHint': 'legendary CLI (опенсорс, community-проект, не официальный клиент Epic)',
    'settings.languageLabel': 'Язык',
    'settings.languageHint': 'Язык интерфейса приложения',

    'login.title': 'Войти в Epic Games',
    'login.close': 'Закрыть',
    'login.description':
      'Это настоящая страница входа epicgames.com, показанная прямо здесь. Пароль вводится ' +
      'напрямую на ней — Bublik Launcher его не видит, только одноразовый код после входа.',
    'login.loadingPage': 'Загрузка страницы Epic…',
    'login.codeReceived': 'Код получен, входим…',
    'login.autoFailed': 'Не удалось считать код автоматически — введи вручную ниже.',
    'login.manualToggle': 'Код не подхватился автоматически? Ввести вручную',
    'login.manualDescription':
      'После входа на странице выше должен появиться JSON с полем <code>authorizationCode</code> — ' +
      'вставь его значение (или весь JSON) сюда:',
    'login.codePlaceholder': 'Код авторизации',
    'login.submit': 'Войти с кодом',
    'login.submitting': 'Вход…',
    'login.emptyCode': 'Вставь код авторизации из Epic.',
    'login.failed': 'Не удалось войти. Попробуй ещё раз.',

    'ctx.settingsEnabled': '⚙ Настройки (Proton/Wine)',
    'ctx.settingsDisabled': '⚙ Настройки (сначала установи игру)',

    'gs.titlePrefix': 'Настройки — ',
    'gs.description':
      'Proton/Wine и другие параметры запуска (актуально для Linux). Записывается напрямую в ' +
      '<code>config.ini</code> legendary — тот же механизм, которым пользуется Heroic.',
    'gs.wineExecutable': 'Исполняемый файл Wine/Proton',
    'gs.winePrefix': 'Wine-префикс',
    'gs.wrapper': 'Обёртка запуска (wrapper)',
    'gs.startParams': 'Дополнительные параметры запуска',
    'gs.offline': 'Запускать оффлайн (без онлайн-аутентификации)',
    'gs.skipUpdate': 'Не проверять обновления при запуске',
    'gs.noWine': 'Не использовать Wine (нативная Linux-сборка)',
    'gs.anticheatTitle': 'Easy Anti-Cheat / BattlEye Runtime (Linux)',
    'gs.anticheatDescription':
      'Это тот же механизм, которым пользуется Heroic. Файлы распространяет Valve бесплатно через ' +
      'Steam — инструменты <code>Proton EasyAntiCheat Runtime</code> и <code>Proton BattlEye Runtime</code> ' +
      'можно установить на аккаунт и скачать даже без единой игры в Steam. Либо нажми «Скачать» ниже — ' +
      'это подтянет community-зеркало напрямую, без Steam (может быть не самым свежим).',
    'gs.eacEnabled': 'Включить EasyAntiCheat Runtime',
    'gs.battlEyeEnabled': 'Включить BattlEye Runtime',
    'gs.download': 'Скачать',
    'gs.envVarsLabel': 'Дополнительные переменные окружения (по одной на строку, KEY=VALUE)',
    'gs.anticheatNote':
      '<strong>Честно о пределах этого.</strong> EAC/BattlEye runtime выше работает только в режиме ' +
      '<strong>Proton</strong> (не Wine) — это реальное требование самого Proton: переменные ' +
      '<code>PROTON_EAC_RUNTIME</code>/<code>PROTON_BATTLEYE_RUNTIME</code> читает скрипт ' +
      '<code>proton</code>, а не обычный Wine-бинарник. Даже в режиме Proton это включает лишь ' +
      '<em>возможность</em> инициализации анти-чита, а пропустит ли саму игру конкретный анти-чит-деплой, ' +
      'решает разработчик на своей стороне. Fortnite Epic блокирует на Linux сознательно — это не обойти ' +
      'никакими настройками здесь.',
    'gs.eacDownloadFailed': 'Не удалось скачать runtime автоматически. Попробуй путь через Steam вручную.',
    'gs.saveFailed': 'Не удалось сохранить настройки.',

    'common.browse': 'Обзор',
    'common.cancel': 'Отмена',
    'common.save': 'Сохранить',
    'common.saving': 'Сохранение…',
    'common.clear': 'Очистить',

    'console.title': 'Вывод legendary',

    'uninstall.confirm': 'Удалить «{title}»? Файлы игры будут удалены с диска.',
    'game.launchFailed': 'Не удалось запустить игру.',
    'game.closeFailed': 'Не удалось закрыть игру.',
    'game.uninstallFailed': 'Не удалось удалить игру.',

    'tile.install': 'Установить',
    'tile.play': 'Играть',
    'tile.downloading': 'Загрузка…',
    'tile.closeGame': 'Закрыть игру',
    'tile.deleteTitle': 'Удалить игру',
    'tile.playtimeLabel': 'Сыграно: {duration}',
    'playtime.hoursMinutes': '{hours} ч {minutes} мин',
    'playtime.minutesOnly': '{minutes} мин',
    'playtime.lessThanMinute': 'меньше минуты',

    'install.title': 'Куда установить игру?',
    'install.description': 'Оставь пустым, чтобы использовать папку по умолчанию legendary (~/legendary).',
    'install.confirm': 'Скачать',

    'settings.themeLabel': 'Тема',
    'settings.themeHint': 'Цвет акцента интерфейса',
  },

  en: {
    'nav.store': 'Store',
    'nav.library': 'Library',
    'nav.installed': 'Installed',
    'nav.settings': 'Settings',
    'sidebar.console': 'Console',

    'topbar.searchPlaceholder': 'Search your library…',
    'account.login': 'Log in to Epic',
    'account.logout': 'Log out',

    'banner.legendaryMissingTitle': 'legendary not found.',
    'banner.legendaryMissingBody':
      'Bublik Launcher is an interface on top of the <code>legendary</code> CLI tool. Click the button ' +
      'below to download it automatically (the official binary from its GitHub releases), or install it ' +
      'manually (<code>pip install legendary-gl</code>) and restart the app.',
    'banner.downloadLegendary': '⚡ Download legendary automatically',
    'banner.downloading': '⚡ Downloading…',
    'banner.downloadFailed': "Couldn't auto-download legendary.",

    'store.back': 'Back',
    'store.forward': 'Forward',
    'store.reload': 'Reload',

    'library.title': 'Library',
    'library.empty': 'Your Epic Games library will show up here once you log in.',

    'installed.title': 'Installed',
    'installed.empty': 'No installed games yet. Refresh the library, pick a game and hit "Install".',

    'settings.title': 'Settings',
    'settings.accountLabel': 'Epic Games account',
    'settings.notLoggedIn': 'Not logged in',
    'settings.loggedInAs': 'Logged in as {account}',
    'settings.dataSourceLabel': 'Data source',
    'settings.dataSourceHint': 'legendary CLI (open-source community project, not an official Epic client)',
    'settings.languageLabel': 'Language',
    'settings.languageHint': 'Interface language',

    'login.title': 'Log in to Epic Games',
    'login.close': 'Close',
    'login.description':
      "This is the real epicgames.com login page, shown right here. Your password is typed directly " +
      "into it — Bublik Launcher never sees it, only the one-time code Epic shows afterward.",
    'login.loadingPage': 'Loading Epic\u2019s login page…',
    'login.codeReceived': 'Code received, signing in…',
    'login.autoFailed': "Couldn't read the code automatically — enter it manually below.",
    'login.manualToggle': "Code didn't pick up automatically? Enter it manually",
    'login.manualDescription':
      'After logging in, the page above should show JSON with an <code>authorizationCode</code> field — ' +
      'paste its value (or the whole JSON) here:',
    'login.codePlaceholder': 'Authorization code',
    'login.submit': 'Log in with code',
    'login.submitting': 'Logging in…',
    'login.emptyCode': "Paste the authorization code from Epic.",
    'login.failed': "Couldn't log in. Please try again.",

    'ctx.settingsEnabled': '⚙ Settings (Proton/Wine)',
    'ctx.settingsDisabled': '⚙ Settings (install the game first)',

    'gs.titlePrefix': 'Settings — ',
    'gs.description':
      'Proton/Wine and other launch parameters (relevant for Linux). Written directly into legendary\'s ' +
      '<code>config.ini</code> — the same mechanism Heroic uses.',
    'gs.wineExecutable': 'Wine/Proton executable',
    'gs.winePrefix': 'Wine prefix',
    'gs.wrapper': 'Launch wrapper',
    'gs.startParams': 'Extra launch parameters',
    'gs.offline': 'Launch offline (no online authentication)',
    'gs.skipUpdate': "Don't check for updates on launch",
    'gs.noWine': "Don't use Wine (native Linux build)",
    'gs.anticheatTitle': 'Easy Anti-Cheat / BattlEye Runtime (Linux)',
    'gs.anticheatDescription':
      'Same mechanism Heroic uses. Valve distributes these files for free via Steam — the ' +
      '<code>Proton EasyAntiCheat Runtime</code> and <code>Proton BattlEye Runtime</code> tools can be ' +
      'installed and downloaded to your account even with zero games on Steam. Or hit "Download" below to ' +
      'pull a community mirror directly, no Steam needed (may be less fresh).',
    'gs.eacEnabled': 'Enable EasyAntiCheat Runtime',
    'gs.battlEyeEnabled': 'Enable BattlEye Runtime',
    'gs.download': 'Download',
    'gs.envVarsLabel': 'Extra environment variables (one per line, KEY=VALUE)',
    'gs.anticheatNote':
      "<strong>Honest limits of this.</strong> The EAC/BattlEye runtime above only works in " +
      "<strong>Proton</strong> mode (not Wine) — that's a real requirement of Proton itself: " +
      "<code>PROTON_EAC_RUNTIME</code>/<code>PROTON_BATTLEYE_RUNTIME</code> are read by the " +
      "<code>proton</code> script, not a plain Wine binary. Even in Proton mode this only enables the " +
      "<em>possibility</em> of anti-cheat initializing — whether a specific deployment actually lets the " +
      "game through is decided by the developer on their end. Epic deliberately blocks Fortnite on Linux " +
      "— no setting here changes that.",
    'gs.eacDownloadFailed': "Couldn't auto-download the runtime. Try the manual Steam path instead.",

    'common.browse': 'Browse',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.saving': 'Saving…',
    'common.clear': 'Clear',

    'console.title': 'legendary output',

    'uninstall.confirm': 'Delete "{title}"? Its files will be removed from disk.',
    'game.launchFailed': "Couldn't launch the game.",
    'game.closeFailed': "Couldn't close the game.",
    'game.uninstallFailed': "Couldn't uninstall the game.",

    'tile.install': 'Install',
    'tile.play': 'Play',
    'tile.downloading': 'Downloading…',
    'tile.closeGame': 'Close game',
    'tile.deleteTitle': 'Delete game',
    'tile.playtimeLabel': 'Played: {duration}',
    'playtime.hoursMinutes': '{hours}h {minutes}m',
    'playtime.minutesOnly': '{minutes}m',
    'playtime.lessThanMinute': 'less than a minute',

    'install.title': 'Where should the game install?',
    'install.description': "Leave blank to use legendary's default folder (~/legendary).",
    'install.confirm': 'Download',

    'settings.themeLabel': 'Theme',
    'settings.themeHint': 'Interface accent color',
  },
};

// Slavic plural rules for uk/ru (1 гра / 2-4 ігри / 5+ ігор), simple
// singular/plural for en. Returns the fully formatted "N word" string.
function formatGameCount(n) {
  const lang = getLang();
  if (lang === 'en') return `${n} ${n === 1 ? 'game' : 'games'}`;

  const forms = lang === 'ru' ? ['игра', 'игры', 'игр'] : ['гра', 'ігри', 'ігор'];
  const mod10 = n % 10;
  const mod100 = n % 100;
  let form;
  if (mod10 === 1 && mod100 !== 11) form = forms[0];
  else if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) form = forms[1];
  else form = forms[2];
  return `${n} ${form}`;
}

// Formats a total-seconds playtime figure using the current language's
// duration phrasing (see playtime.* keys above).
function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return t('playtime.hoursMinutes', { hours, minutes });
  if (minutes > 0) return t('playtime.minutesOnly', { minutes });
  return t('playtime.lessThanMinute');
}

const THEME_STORAGE_KEY = 'bublik_theme';
const SUPPORTED_THEMES = ['amber', 'emerald', 'violet', 'crimson', 'azure'];

function getTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return SUPPORTED_THEMES.includes(stored) ? stored : 'amber';
}

function setTheme(theme) {
  if (!SUPPORTED_THEMES.includes(theme)) return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.documentElement.dataset.theme = theme;
}
const I18N_STORAGE_KEY = 'bublik_lang';
const SUPPORTED_LANGS = ['uk', 'ru', 'en'];

function getLang() {
  const stored = localStorage.getItem(I18N_STORAGE_KEY);
  return SUPPORTED_LANGS.includes(stored) ? stored : 'uk';
}

function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  localStorage.setItem(I18N_STORAGE_KEY, lang);
}

// t('key') -> string; t('key', {name: 'value'}) -> string with {name}
// placeholders substituted. Falls back to the key itself if missing (should
// never happen once translations are complete) and to Ukrainian if a key is
// missing from the current language only.
function t(key, vars) {
  const lang = getLang();
  let str = (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.uk[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return str;
}

// Walks the DOM applying translations to anything tagged with data-i18n
// (textContent), data-i18n-html (innerHTML — for the handful of strings
// with inline <code>/<strong>/<em>), data-i18n-placeholder, or data-i18n-title.
function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}
