# 03: Tauri shell: window and sidecar lifecycle

Spec: `.scratch/tauri-desktop/spec.md`

**What to build:** `pnpm desktop` opens DevPanel in a Tauri window. The Rust shell starts the sidecar (in development: the developer's Node with the sidecar built from source) inside a Windows Job Object with kill-on-close. It sends `start` and opens the window on `openWindow`; the window loads the Server's URL, and the web UI works as in a browser tab. Closing the window sends `windowCloseRequested`, and the shell hides the window only when the sidecar answers `hideWindow`. A tray icon already exists so a hidden window can come back: a left click sends `trayClicked` and shows the window on `showWindow` (the menu comes in ticket 04). "Exit DevPanel" in the UI goes through the quit flow and ends the shell after everything is stopped. If the sidecar dies without `exit`, the shell shows the crash dialog with the last crash texts (English fallback) and quits. If the shell is killed, or Windows ends it at sign-out, the sidecar and its Services and Sessions die with it. Links to other origins open in the default browser. The WebView2 profile lives under the `desktop` subfolder of the app data folder, which follows `DEVPANEL_APP_DATA`. The tray menu, error dialogs, single instance and autostart come in later tickets: until then a start failure may simply end the shell, and the shell may log unhandled messages.

**Blocked by:** 02

**Status:** resolved

- [x] `pnpm desktop` builds what it needs and opens the DevPanel window via Tauri; the web UI is unchanged and Services and Sessions work.
- [x] The sidecar runs in a Job Object with kill-on-close: killing the shell from Task Manager kills the sidecar and every Service and Session (checked by hand; automated in ticket 06).
- [x] Closing the window hides it and stops nothing; a left click on the tray icon shows and focuses it again (checked by hand on the installed app, 2026-10-13).
- [x] "Exit DevPanel" ends the shell after everything is stopped.
- [x] A sidecar exit without `exit` shows the crash dialog in the last UI Language reported (English before any), then the shell quits.
- [x] Links to other origins open in the default browser, never in the window (checked by hand on the installed app, 2026-10-13).
- [x] The WebView2 profile is under the app data folder's `desktop` subfolder and follows `DEVPANEL_APP_DATA`.
- [x] Rust mirrors the protocol types (serde), and a Rust unit test deserializes every line of the protocol fixture.
- [x] A root `desktop:check` script runs `cargo check` and `cargo clippy` cleanly; `pnpm check` still needs no Rust.
- [x] `pnpm check` passes.

## Русский перевод

# 03: Оболочка Tauri: окно и жизненный цикл sidecar

Спецификация: `.scratch/tauri-desktop/spec.md`

**Что сделать:** `pnpm desktop` открывает DevPanel в окне Tauri. Rust-оболочка запускает sidecar (при разработке — на Node разработчика с sidecar, собранным из исходников) внутри Windows Job Object с завершением при закрытии. Она отправляет `start` и открывает окно по `openWindow`; окно загружает URL Сервера, и веб-UI работает как во вкладке браузера. Закрытие окна отправляет `windowCloseRequested`, а оболочка прячет окно, только когда sidecar ответит `hideWindow`. Значок в трее уже есть, чтобы спрятанное окно можно было вернуть: щелчок левой кнопкой отправляет `trayClicked` и показывает окно по `showWindow` (меню — в тикете 04). «Выход из DevPanel» в UI идёт через поток выхода и завершает оболочку после остановки всего. Если sidecar умер без `exit`, оболочка показывает диалог аварии с последними текстами аварии (запасной вариант — английский) и завершается. Если оболочку убили или Windows завершил её при выходе из учётной записи, sidecar с его Сервисами и Сессиями умирает вместе с ней. Ссылки на другие источники открываются в браузере по умолчанию. Профиль WebView2 лежит в подкаталоге `desktop` каталога данных, который следует за `DEVPANEL_APP_DATA`. Меню трея, диалоги ошибок, единственный экземпляр и автозапуск — в следующих тикетах: до тех пор ошибка старта может просто завершать оболочку, а необработанные сообщения оболочка может записывать в лог.

**Блокируется:** 02

**Статус:** resolved

- [x] `pnpm desktop` собирает нужное и открывает окно DevPanel через Tauri; веб-UI не изменился, Сервисы и Сессии работают.
- [x] Sidecar работает в Job Object с завершением при закрытии: убийство оболочки через диспетчер задач убивает sidecar и все Сервисы и Сессии (проверено вручную; автоматизация — в тикете 06).
- [x] Закрытие окна прячет его и ничего не останавливает; щелчок левой кнопкой по значку в трее снова показывает окно и переводит на него фокус (проверено вручную на установленном приложении, 2026-10-13).
- [x] «Выход из DevPanel» завершает оболочку после остановки всего.
- [x] Завершение sidecar без `exit` показывает диалог аварии на последнем сообщённом Языке интерфейса (до первого сообщения — на английском), после чего оболочка завершается.
- [x] Ссылки на другие источники открываются в браузере по умолчанию, никогда в окне (проверено вручную на установленном приложении, 2026-10-13).
- [x] Профиль WebView2 лежит в подкаталоге `desktop` каталога данных и следует за `DEVPANEL_APP_DATA`.
- [x] Rust повторяет типы протокола (serde), и юнит-тест Rust десериализует каждую строку фикстуры протокола.
- [x] Корневой скрипт `desktop:check` чисто проходит `cargo check` и `cargo clippy`; `pnpm check` по-прежнему не требует Rust.
- [x] `pnpm check` проходит.
