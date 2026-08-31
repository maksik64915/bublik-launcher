# Bublik Launcher

Десктопний UI (Electron) поверх опенсорсного CLI-інструмента **[legendary](https://github.com/derrod/legendary)**,
який реалізує неофіційний, реверс-інжинірений клієнт Epic Games Store (той самий підхід, яким користується
Heroic Games Launcher). Bublik Launcher сам не логінить акаунт і не звертається до серверів Epic напряму —
він лише запускає `legendary` як окремий процес і показує результат у власному інтерфейсі.

**Важливо розуміти, перш ніж користуватись:**
- Це не офіційний продукт Epic Games. `legendary` реверс-інжинірить протокол офіційного лаунчера.
- Це технічно порушує Terms of Service Epic (заборона автоматизованого доступу), хоч Epic це толерує роками.
- Пароль ти вводиш на справжній сторінці epicgames.com у своєму браузері — застосунок його не бачить,
  лише отримує одноразовий код авторизації, який сам `legendary` обмінює на токени.

## 1. Встанови передумови

1. **Node.js** ≥ 18 — https://nodejs.org
2. **legendary** — сам CLI-клієнт, окремо від цього застосунку:
   ```bash
   pip install legendary-gl
   ```
   або завантаж готовий бінарник з https://github.com/derrod/legendary/releases і поклади його в PATH.
   Перевір встановлення: `legendary --version`.

   Якщо не хочеш класти `legendary` в PATH, можна вказати шлях до нього напряму через змінну середовища
   перед запуском застосунку:
   ```bash
   set BUBLIK_LEGENDARY_BIN=C:\path\to\legendary.exe   # Windows (cmd)
   $env:BUBLIK_LEGENDARY_BIN="C:\path\to\legendary.exe" # Windows (PowerShell)
   export BUBLIK_LEGENDARY_BIN=/path/to/legendary       # macOS/Linux
   ```

## 2. Встанови залежності проєкту

У папці проєкту:
```bash
npm install
```

Якщо npm попередить про блоковані postinstall-скрипти (стосується самого пакета `electron`,
якому потрібно завантажити бінарник Electron):
```bash
npm approve-scripts electron
npm install
```

## 3. Запуск у режимі розробки

```bash
npm start
```

Відкриється вікно застосунку. У розділі «Налаштування» або кнопкою «Увійти в Epic» зверху —
проходиш логін (крок 1: сторінка Epic у браузері; крок 2: вставляєш код авторизації назад).
Після входу «Бібліотека» підтягне список ігор твого акаунта через `legendary list`.

## 4. Збірка в .exe

Проєкт налаштований на **electron-builder**. Щоб зібрати Windows-інсталятор і портативний .exe:

```bash
npm run dist:win
```

(на Windows можна просто `npm run dist`). Готові файли з'являться в папці `dist/`:
- `Bublik Launcher Setup <version>.exe` — звичайний інсталятор (NSIS), ставить ярлик на робочий стіл.
- `Bublik Launcher <version>.exe` (portable) — один файл, запускається без встановлення.

Збірка під Windows-таргет найнадійніше працює саме на Windows-машині (electron-builder вміє крос-компілювати
з macOS/Linux через Wine, але це окрема історія з додатковими залежностями).

## Що всередині

```
main.js          — головний процес Electron, IPC-хендлери
preload.js        — безпечний міст main ↔ renderer (contextBridge)
legendary.js       — обгортка над CLI: spawn('legendary', [...]), парсинг stdout
renderer/
  index.html        — розмітка інтерфейсу
  styles.css         — дизайн-система (темна, з "консольним" акцентом — застосунок чесно
                        показує живий вивід legendary в шухляді знизу, бо це те, чим він
                        реально є під капотом)
  renderer.js        — логіка вкладок, бібліотеки, встановлення, логіну
```

## Чого тут навмисно немає

- Прямого логіну в API Epic, обходу DRM чи власної реалізації протоколу — усе це робить `legendary`,
  а не цей застосунок.
- Збереження пароля користувача будь-де.

## Якщо щось не працює

- «legendary не знайдено» — переконайся, що `legendary --version` працює в звичайному терміналі;
  якщо ні, `legendary` не в PATH (див. крок 1).
- Формат виводу `legendary` іноді трохи змінюється між версіями (особливо прапорці `--json`,
  доступні не в усіх релізах) — якщо парсинг бібліотеки не спрацював, звір команди в `legendary.js`
  з `legendary --help` своєї версії.
