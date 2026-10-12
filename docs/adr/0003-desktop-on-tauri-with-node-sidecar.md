# The desktop app is a Tauri shell over the DevPanel Server running as a Node sidecar

We replace Electron with Tauri to shrink the installer (about 104 MB to about 45 MB) and the disk footprint (about 330 MB to about 110 MB). `core` stays in TypeScript: the Tauri shell starts the bundled `node.exe` as a sidecar that runs the unchanged DevPanel Server on `127.0.0.1:7777` (ADR-0002 still holds), and the WebView2 window loads its URL with the Access Key, exactly like a browser tab. The desktop behaviour (start-failure explanation, tray menu in the UI Language, closing the window is not Exit, Exit from the tray stops everything) stays in TypeScript under test in the sidecar; the Rust shell only shows the window, tray and dialogs, and talks to the sidecar through JSON lines over stdin/stdout. The Rust shell owns what must happen before or outside Node: the single-instance lock and autostart (Tauri plugins). The sidecar runs in a Windows Job Object with kill-on-close, so if the shell dies, the Server and all its Services and Sessions die with it instead of leaving an orphaned Server holding the port; if the sidecar dies, the shell shows an error and quits. The cost: memory barely improves (WebView2 is Chromium too, and Node still runs), the build needs a Rust toolchain, and `node.exe` (about 30 MB compressed) ships in the installer.

## Considered Options

- **Rewrite `core` and `server` in Rust.** Saves another ~30 MB of installer and ~60 MB of memory, but rewrites all process, pty, port and Orphan logic and its tests. Rejected: the gain does not pay for it.
- **Move the desktop behaviour into Rust.** Would drop the stdin/stdout protocol, but the logic and its tests would have to be rewritten in Rust and leave the TypeScript test harness. Rejected.
- **Node single executable (SEA).** Same size, since `node-pty`'s native module must sit next to it anyway, and harder to inspect. Rejected in favour of plain `node.exe` plus files.
- **Tauri IPC instead of the WebSocket.** Rust would have to relay between the webview and Node, and `web` would need a second `BackendTransport`. Rejected, as in ADR-0002.
- **Keep Electron (trimmed).** Rejected: the installer size was the main reason to move.

---

## Русский перевод

# Десктопное приложение — оболочка Tauri над Сервером DevPanel, работающим как Node-sidecar

Мы заменяем Electron на Tauri, чтобы уменьшить установщик (примерно со 104 МБ до 45 МБ) и место на диске (примерно с 330 МБ до 110 МБ). `core` остаётся на TypeScript: оболочка Tauri запускает поставляемый `node.exe` как sidecar, который поднимает неизменённый Сервер DevPanel на `127.0.0.1:7777` (ADR-0002 по-прежнему в силе), а окно WebView2 загружает его URL с Ключом доступа — ровно как вкладка браузера. Поведение десктопа (объяснение ошибки старта, меню трея на Языке интерфейса, закрытие окна — не Выход, Выход из трея останавливает всё) остаётся на TypeScript под тестами внутри sidecar; Rust-оболочка лишь показывает окно, трей и диалоги и общается с sidecar строками JSON через stdin/stdout. Rust-оболочке принадлежит то, что должно произойти до Node или вне его: блокировка единственного экземпляра и автозапуск (плагины Tauri). Sidecar работает в Windows Job Object с завершением при закрытии, поэтому если оболочка умирает, Сервер со всеми Сервисами и Сессиями умирает вместе с ней, а не остаётся сиротой, держащим порт; если умирает sidecar, оболочка показывает ошибку и завершается. Цена: память почти не уменьшается (WebView2 — тоже Chromium, а Node по-прежнему работает), для сборки нужен Rust-тулчейн, и в установщик входит `node.exe` (около 30 МБ в сжатом виде).

## Рассмотренные варианты

- **Переписать `core` и `server` на Rust.** Экономит ещё ~30 МБ установщика и ~60 МБ памяти, но требует переписать всю логику процессов, pty, портов и Зомби вместе с тестами. Отклонено: выигрыш того не стоит.
- **Перенести поведение десктопа в Rust.** Убрал бы протокол через stdin/stdout, но логику и её тесты пришлось бы переписать на Rust, вне тестового каркаса TypeScript. Отклонено.
- **Единый исполняемый файл Node (SEA).** Тот же размер, так как нативный модуль `node-pty` всё равно лежит рядом, и его сложнее исследовать. Отклонено в пользу обычного `node.exe` с файлами.
- **Tauri IPC вместо WebSocket.** Rust пришлось бы ретранслировать сообщения между webview и Node, а `web` получил бы второй `BackendTransport`. Отклонено, как и в ADR-0002.
- **Оставить Electron (урезанный).** Отклонено: размер установщика был главной причиной переезда.
