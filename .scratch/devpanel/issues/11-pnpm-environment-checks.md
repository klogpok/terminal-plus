# 11: pnpm environment checks

**What to build:** In a pnpm Repo (one with `pnpm-lock.yaml`), starting a Service when pnpm is not available shows a clear error with a hint ("run `corepack enable` or install pnpm") instead of a cryptic shell failure. A pnpm Repo with no installed dependencies shows an "Install dependencies" button that runs `pnpm install` with its output visible in a tab. Repos without `pnpm-lock.yaml` skip these checks, so npm and yarn Repos with hand-written commands still work.

**Blocked by:** 02 (Control a Service from the browser).

**Status:** resolved

- [x] For a Repo with `pnpm-lock.yaml`, a missing pnpm (`where pnpm` fails) blocks the start with a plain-Russian error and hint.
- [x] Repos without `pnpm-lock.yaml` never run the pnpm check.
- [x] A pnpm Repo without `node_modules` shows "Install dependencies"; `installDependencies` runs `pnpm install` in the Repo folder with output in a tab and reports success or failure.
- [x] After a successful install the button disappears.

## Comments

- Install output is shown in a minimal plain-text panel in the main area (`dp-install-output`); when the terminal tabs of ticket 03 exist, it should move into an xterm tab fed from the same raw output. Install output is not buffered on the Server, so a reconnecting client sees only the install state, not past output.

---

## Русский перевод

# 11: Проверки окружения pnpm

**Что сделать:** В pnpm-Репо (с `pnpm-lock.yaml`) запуск Сервиса при отсутствии pnpm показывает понятную ошибку с подсказкой («выполните `corepack enable` или установите pnpm») вместо непонятного сбоя оболочки. pnpm-Репо без установленных зависимостей показывает кнопку «Установить зависимости», которая запускает `pnpm install` с выводом во вкладке. Репо без `pnpm-lock.yaml` пропускают эти проверки, поэтому Репо на npm и yarn с командами, заданными вручную, по-прежнему работают.

**Блокируется:** 02 (Управление Сервисом из браузера).

**Статус:** resolved

- [x] Для Репо с `pnpm-lock.yaml` отсутствие pnpm (`where pnpm` не находит) блокирует запуск ошибкой на понятном русском с подсказкой.
- [x] Для Репо без `pnpm-lock.yaml` проверка pnpm никогда не выполняется.
- [x] pnpm-Репо без `node_modules` показывает «Установить зависимости»; `installDependencies` запускает `pnpm install` в папке Репо с выводом во вкладке и сообщает об успехе или ошибке.
- [x] После успешной установки кнопка исчезает.

## Комментарии

- Вывод установки показывается в минимальной текстовой панели в основной области (`dp-install-output`); когда появятся терминальные вкладки тикета 03, его стоит перенести во вкладку xterm, которая получает тот же сырой вывод. Сервер не буферизует вывод установки, поэтому переподключившийся клиент видит только состояние установки, но не прошлый вывод.
