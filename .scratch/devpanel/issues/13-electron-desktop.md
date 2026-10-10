# 13: Electron desktop app

**What to build:** DevPanel as an installable Windows app with the same behavior as the web version. The Electron main process hosts `core`; the window loads the built `web` app unchanged. The first step is proving `node-pty` works under the Electron ABI (rebuild or an Electron-compatible prebuilt). Transport is either the existing localhost WebSocket or an `IpcTransport` through a preload script with context isolation; components keep talking only to `BackendService`. The app has a tray icon (show, "Stop all", quit), allows a single instance, optionally starts with Windows, stops everything on quit, and ships as an NSIS installer.

**Blocked by:** 06 (dependsOn and Start all / Stop all), 09 (Claude Code and shell Sessions), 10 (Config lifecycle), 11 (pnpm environment checks), 12 (Launch for the team member).

**Status:** ready-for-agent

- [ ] `node-pty` loads and spawns inside Electron on Windows; the approach is recorded.
- [ ] The main process hosts `core`; the window shows the unchanged `web` build; `core` still imports nothing from Electron.
- [ ] The transport choice (WebSocket on 127.0.0.1 or `IpcTransport`) is made and recorded as an ADR; with IPC, no Access Key is needed.
- [ ] Tray with show, "Stop all in all Repos" and quit; a second launch focuses the existing window (single-instance lock).
- [ ] Optional start with Windows.
- [ ] `before-quit` stops all Services and Sessions; Orphan detection still works after a forced kill.
- [ ] An NSIS installer is produced with `electron-builder`.

---

## Русский перевод

# 13: Десктопное приложение на Electron

**Что сделать:** DevPanel как устанавливаемое приложение Windows с тем же поведением, что у веб-версии. Main-процесс Electron размещает `core`; окно загружает собранное приложение `web` без изменений. Первый шаг — доказать, что `node-pty` работает под ABI Electron (пересборка или совместимая с Electron сборка с готовыми бинарниками). Транспорт — либо существующий WebSocket на localhost, либо `IpcTransport` через preload-скрипт с изоляцией контекста; компоненты по-прежнему общаются только с `BackendService`. У приложения есть иконка в трее (показать, «Остановить всё», выход), разрешён только один экземпляр, есть автозапуск с Windows по желанию, при выходе всё останавливается, а поставляется оно как NSIS-установщик.

**Блокируется:** 06 (dependsOn и «Запустить всё» / «Остановить всё»), 09 (Сессии Claude Code и оболочки), 10 (Жизненный цикл конфига), 11 (Проверки окружения pnpm), 12 (Запуск для пользователя).

**Статус:** ready-for-agent

- [ ] `node-pty` загружается и запускает процессы внутри Electron на Windows; подход записан.
- [ ] Main-процесс размещает `core`; окно показывает неизменённую сборку `web`; `core` по-прежнему ничего не импортирует из Electron.
- [ ] Выбор транспорта (WebSocket на 127.0.0.1 или `IpcTransport`) сделан и записан как ADR; с IPC Ключ доступа не нужен.
- [ ] Трей с «Показать», «Остановить всё во всех репо» и «Выход»; повторный запуск фокусирует существующее окно (блокировка второго экземпляра).
- [ ] Автозапуск с Windows по желанию.
- [ ] `before-quit` останавливает все Сервисы и Сессии; обнаружение Зомби работает и после принудительного убийства.
- [ ] С помощью `electron-builder` собирается NSIS-установщик.
