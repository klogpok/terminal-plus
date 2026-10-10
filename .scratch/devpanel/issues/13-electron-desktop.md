# 13: Electron desktop app

**What to build:** DevPanel as an installable Windows app with the same behavior as the web version. The Electron main process hosts `core`; the window loads the built `web` app unchanged. The first step is proving `node-pty` works under the Electron ABI (rebuild or an Electron-compatible prebuilt). Transport is either the existing localhost WebSocket or an `IpcTransport` through a preload script with context isolation; components keep talking only to `BackendService`. The app has a tray icon (show, "Stop all", quit), allows a single instance, optionally starts with Windows, stops everything on quit, and ships as an NSIS installer.

**Blocked by:** 06 (dependsOn and Start all / Stop all), 09 (Claude Code and shell Sessions), 10 (Config lifecycle), 11 (pnpm environment checks), 12 (Launch for the team member).

**Status:** resolved

- [x] `node-pty` loads and spawns inside Electron on Windows; the approach is recorded.
- [x] The main process hosts `core`; the window shows the unchanged `web` build; `core` still imports nothing from Electron.
- [x] The transport choice (WebSocket on 127.0.0.1 or `IpcTransport`) is made and recorded as an ADR; with IPC, no Access Key is needed.
- [x] Tray with show, "Stop all in all Repos" and quit; a second launch focuses the existing window (single-instance lock).
- [x] Optional start with Windows.
- [x] `before-quit` stops all Services and Sessions; Orphan detection still works after a forced kill.
- [x] An NSIS installer is produced with `electron-builder`.

---

## Русский перевод

# 13: Десктопное приложение на Electron

**Что сделать:** DevPanel как устанавливаемое приложение Windows с тем же поведением, что у веб-версии. Main-процесс Electron размещает `core`; окно загружает собранное приложение `web` без изменений. Первый шаг — доказать, что `node-pty` работает под ABI Electron (пересборка или совместимая с Electron сборка с готовыми бинарниками). Транспорт — либо существующий WebSocket на localhost, либо `IpcTransport` через preload-скрипт с изоляцией контекста; компоненты по-прежнему общаются только с `BackendService`. У приложения есть иконка в трее (показать, «Остановить всё», выход), разрешён только один экземпляр, есть автозапуск с Windows по желанию, при выходе всё останавливается, а поставляется оно как NSIS-установщик.

**Блокируется:** 06 (dependsOn и «Запустить всё» / «Остановить всё»), 09 (Сессии Claude Code и оболочки), 10 (Жизненный цикл конфига), 11 (Проверки окружения pnpm), 12 (Запуск для пользователя).

**Статус:** resolved

- [x] `node-pty` загружается и запускает процессы внутри Electron на Windows; подход записан.
- [x] Main-процесс размещает `core`; окно показывает неизменённую сборку `web`; `core` по-прежнему ничего не импортирует из Electron.
- [x] Выбор транспорта (WebSocket на 127.0.0.1 или `IpcTransport`) сделан и записан как ADR; с IPC Ключ доступа не нужен.
- [x] Трей с «Показать», «Остановить всё во всех репо» и «Выход»; повторный запуск фокусирует существующее окно (блокировка второго экземпляра).
- [x] Автозапуск с Windows по желанию.
- [x] `before-quit` останавливает все Сервисы и Сессии; обнаружение Зомби работает и после принудительного убийства.
- [x] С помощью `electron-builder` собирается NSIS-установщик.

## Comments

**Implementation (ticket 13).** `packages/desktop`: `src/desktop-app.ts` (behavior, no Electron import), `src/main.ts` (Electron adapter), bundled by esbuild into `dist/main.cjs`; `electron-builder.yml`. node-pty 1.1.0 is N-API and loads in Electron 44.6 without a rebuild. Transport: localhost WebSocket on 7777, see ADR-0002. How each item was verified:
- Unit tests (`test/desktop-app.test.ts`, fake Electron host): single instance, window shown/hidden to tray, tray menu, "Stop all in all Repos", autostart toggle, quit stops everything before the process ends, start failures (port held by DevPanel / another program / other errors).
- End-to-end (`test/electron.e2e.test.ts`, real Electron, temp app data, random port; also passed against the packaged `release/win-unpacked/DevPanel.exe` via `DEVPANEL_DESKTOP_EXE`): a Service and a shell Session run through node-pty; Exit from the UI stops all of them and ends the app; a second launch exits and leaves the first running; after a forced kill every surviving recorded process is found as an Orphan.
- Live: the packaged window showed the web UI connected; login-item registration was checked with the same Electron API (registry value written, then removed again).
- Not exercised live: clicking the tray menu itself (covered only by unit tests) and running the NSIS installer (`DevPanel-Setup-0.1.0.exe` was built, unsigned, not installed on this machine).

### Русский перевод

**Реализация (тикет 13).** `packages/desktop`: `src/desktop-app.ts` (поведение, без импорта Electron), `src/main.ts` (адаптер Electron), собирается esbuild в `dist/main.cjs`; `electron-builder.yml`. node-pty 1.1.0 — N-API, загружается в Electron 44.6 без пересборки. Транспорт — WebSocket на localhost:7777, см. ADR-0002. Как проверен каждый пункт:
- Модульные тесты (`test/desktop-app.test.ts`, фейковый хост Electron): один экземпляр, окно показывается и прячется в трей, меню трея, «Остановить всё во всех репо», переключение автозапуска, выход останавливает всё до завершения процесса, ошибки запуска (порт занят DevPanel / другой программой / прочие ошибки).
- Сквозные тесты (`test/electron.e2e.test.ts`, настоящий Electron, временный каталог данных, случайный порт; также прошли на упакованном `release/win-unpacked/DevPanel.exe` через `DEVPANEL_DESKTOP_EXE`): Сервис и Сессия оболочки работают через node-pty; Выход из UI останавливает их все и завершает приложение; повторный запуск завершается и не трогает первый; после принудительного убийства каждый выживший записанный процесс находится как Зомби.
- Вживую: упакованное окно показало подключённый веб-UI; регистрация автозапуска проверена тем же API Electron (значение в реестре записано и снова удалено).
- Не проверено вживую: клики по самому меню трея (покрыты только модульными тестами) и запуск NSIS-установщика (`DevPanel-Setup-0.1.0.exe` собран, без подписи, на этой машине не устанавливался).
