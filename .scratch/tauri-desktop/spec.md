# Spec: Desktop app on Tauri with a Node sidecar

Status: resolved

## Problem Statement

The DevPanel desktop app is an Electron app: the installer weighs about 104 MB and the installed app about 330 MB, almost all of it a bundled Chromium the user already has on Windows as WebView2. For a tool whose job is to start, stop and watch a few Services, that is a heavy download and a heavy footprint, and it is the first thing a new team member has to fetch.

## Solution

The desktop app becomes a small Tauri shell (ADR-0003). The shell shows the window (WebView2), the tray and the dialogs, and starts the DevPanel Server as a Node sidecar: the shipped `node.exe` running the same Server bundle as today on `127.0.0.1:7777` with the Access Key (ADR-0002 unchanged). The window loads the Server's URL exactly like a browser tab, so the web UI and the web version (`.bat` launcher) do not change. Everything the user sees and does stays the same: the tray menu in the UI Language, closing the window hides it to the tray (not Exit), "Exit DevPanel" and Quit from the tray stop every Service and Session, start with Windows, one DevPanel per machine, plain-language explanations when the port is taken. The installer drops to about 45 MB and the installed app to about 110 MB. Memory use barely changes.

Electron is removed completely. Existing Electron installations are not migrated: the user uninstalls the old app; the Workspace, Local Configs, UI Language and Access Key live in the shared app data folder and are kept.

## User Stories

1. As a new team member, I want a desktop installer under 50 MB, so that getting DevPanel is quick.
2. As a user, I want the installed desktop app to take about a third of the disk space it takes today, so that it does not feel heavy for what it does.
3. As a user on Windows 11, I want the installer to work without downloading anything extra, so that installation is one step.
4. As a user on a Windows 10 machine without WebView2, I want the installer to fetch WebView2 for me, so that I do not have to find and install it myself.
5. As a user, I want the desktop window to show the same DevPanel UI as before, so that nothing has to be relearned.
6. As a user, I want my Repos, Local Configs and UI Language to still be there after switching to the new desktop app, so that I do not set anything up again.
7. As a user, I want closing the window to hide DevPanel to the tray without stopping anything, so that my Services and Sessions keep running (closing is not Exit).
8. As a user, I want a left click on the tray icon to show and focus the window, so that I can get back to DevPanel quickly.
9. As a user, I want the tray menu to offer Show, "Stop everything in all Repos", Start with Windows and Quit, so that I can manage DevPanel without opening the window.
10. As a user, I want the tray menu and its tooltip in the current UI Language, rebuilt right after I switch the language in the window, so that the whole app speaks one language.
11. As a user, I want "Stop everything in all Repos" from the tray to stop every Service of every Repo and keep Sessions and DevPanel running, so that it means the same as in the UI.
12. As a user, I want a failed "Stop everything in all Repos" to be explained in plain language in the current UI Language, with technical details kept apart, so that I understand what happened.
13. As a user, I want Quit from the tray to stop every Service and Session before the app ends, so that nothing keeps running behind my back.
14. As a user, I want "Exit DevPanel" in the UI to end the desktop app once everything is stopped, so that Exit means the same in both versions.
15. As a user, I want signing out or shutting down Windows to end DevPanel together with all its Services and Sessions, as today, so that nothing keeps running into my next session.
16. As a user, I want to turn Start with Windows on and off from the tray, with a checkmark showing the current state, so that I control whether DevPanel starts with Windows.
17. As a user who turned on Start with Windows, I want DevPanel to start in the tray without a window, so that it does not get in my way at sign-in.
18. As a user, I want launching DevPanel a second time to bring up the running window instead of starting a second DevPanel, so that I never end up with two.
19. As a user, I want a second launch to start no second Server and no second Node process, so that two DevPanels never fight over my processes.
20. As a user who already runs DevPanel from the `.bat` launcher, I want the desktop app to explain that DevPanel already runs and then close, so that I know where to find it.
21. As a user whose port is held by another program, I want the desktop app to name the port and say another program holds it, so that I know what to fix.
22. As a user whose port is held by a DevPanel with another app data folder, I want the desktop app to say so and close, so that I am not confused by a different Workspace.
23. As a user, I want any other start failure explained in plain language, with technical details apart, so that I can pass them on to a developer.
24. As a user, I want start-failure messages in my stored UI Language, so that I understand them before the window ever opens.
25. As a user, I want my Services and Sessions to die with the app if the desktop app is killed from Task Manager, so that no hidden Server keeps holding the port and my processes.
26. As a user, I want the processes left over after such a forced kill to be found as Orphans on the next start, so that I can stop them from DevPanel.
27. As a user, I want the desktop app to tell me, in my UI Language, when its Server stopped unexpectedly, and then close, so that I am not left with a dead window.
28. As a user, I want links to other sites (a Service's URL, documentation) to open in my browser, never inside the app window, so that the app window always shows DevPanel.
29. As a user, I want a browser tab to still be able to join the running desktop DevPanel as an equal client, so that I can use both (ADR-0001).
30. As a user, I want Services and Sessions (Claude Code, shell) to work in the desktop app exactly as in the web version, so that the terminal behaves the same.
31. As a user who had the Electron version, I want release notes telling me to uninstall the old version first, so that I do not keep two apps and two Start with Windows entries.
32. As a developer, I want `pnpm desktop` to start the Tauri app in development, so that the familiar command keeps working.
33. As a developer, I want `pnpm desktop:dist` to build the Windows installer, so that releasing works as before.
34. As a developer, I want `pnpm check` to need no Rust toolchain, so that working on `core`, `server` or `web` stays as easy as today.
35. As a developer, I want a separate desktop check that runs the Rust compiler and linter, so that the shell does not rot.
36. As a developer, I want the desktop behaviour to stay in TypeScript under unit tests, so that I can change it without Rust knowledge.
37. As a developer, I want an end-to-end test of the sidecar driven by a fake shell in `pnpm test`, so that real processes, Exit and Orphans are covered without building Tauri.
38. As a developer, I want an optional end-to-end test against the built app, so that the second instance and the forced-kill behaviour can be checked before a release.
39. As a developer, I want the shell's own data (WebView2 profile, caches) to follow the app data folder override, so that a test instance never collides with the installed app.

## Implementation Decisions

- **Architecture (ADR-0003).** The `desktop` package is rebuilt in place: a TypeScript sidecar entry plus a Tauri (Rust) shell beside it. The package keeps its name and the root scripts `desktop` and `desktop:dist` keep theirs. Electron, electron-builder and the Electron start script are removed.
- **Transport unchanged (ADR-0002).** The sidecar runs the unchanged `startDevPanel` on `127.0.0.1:7777` (or `DEVPANEL_PORT`), with the Access Key. The window loads the Server's open URL (Access Key in the fragment). `web`, `server`, `core` and `shared` need no changes except any string or type the protocol needs.
- **Division of labour.** The sidecar decides, the shell executes. The Rust shell owns only what must happen outside or before Node:
  - the single-instance lock (Tauri single-instance plugin): a second launch shows and focuses the running window, exits, and never spawns a sidecar;
  - Start with Windows (Tauri autostart plugin), with the `--hidden` argument passed through;
  - spawning the sidecar inside a Windows Job Object with kill-on-close;
  - rendering the window, the tray and native message dialogs;
  - opening links to other origins in the default browser, never in the window.
- **Shell–sidecar protocol.** One JSON object per line: the shell writes to the sidecar's stdin, the sidecar writes to its stdout. Server and Service output never goes to stdout; the sidecar's own logging goes to stderr. Messages:
  - shell → sidecar: `start` (startHidden, autostartEnabled), `trayClicked`, `trayItemClicked` (item id), `windowCloseRequested`, `quitRequested` (the shell itself was asked to quit), `autostartChanged` (enabled), `errorDismissed` (dialog id).
  - sidecar → shell: `openWindow` (url, show), `showWindow`, `hideWindow`, `setTray` (tooltip, items with id, label, kind normal/checkbox/separator, checked), `showError` (dialog id, title, message, details, language, button labels), `setAutostart` (enabled), `setCrashTexts` (title and message the shell shows if the sidecar dies), `exit` (code).
- **The protocol message types are defined once in TypeScript** in the `desktop` package. The Rust side mirrors them with serde; a protocol test fixture (sample lines) keeps both sides in step.
- **`DesktopHost` stays the behaviour seam.** `runDesktop` keeps holding the behaviour: start-failure explanation through `probePort`/`portBlocker`, the tray menu in the UI Language rebuilt on `uiLanguageChanged`, closing is not Exit, Quit stops everything first, "Exit DevPanel" ends the app. `DesktopHost` is reshaped for the new split:
  - the single-instance members leave it (the shell handles them before Node starts);
  - autostart reads the state the shell reported and asks the shell to change it;
  - window, tray, error and quit/exit members map to protocol messages.
  The production `DesktopHost` is a stdio protocol adapter, not Electron.
- **Quit flow.** Tray Quit (a `trayItemClicked` the sidecar handles) or a `quitRequested` from the shell starts it; the shell keeps the window meanwhile. The sidecar stops every Service and Session and closes the Server, then sends `exit`, and the shell ends. "Exit DevPanel" in the UI makes the sidecar send `exit` after the Server's own Exit. While quitting, a `windowCloseRequested` is not answered with `hideWindow`.
- **Windows sign-out and shutdown.** No graceful stop, as today with Electron: Windows ends the shell, and the Job Object takes the sidecar and every Service and Session with it.
- **Window close.** The shell prevents every user close and sends `windowCloseRequested`. The sidecar answers `hideWindow` unless it is quitting.
- **Sidecar death.** If the sidecar exits without having sent `exit`, the shell shows the crash dialog with the last `setCrashTexts` (English fallback before the first one) and quits. The sidecar sends `setCrashTexts` at start and on every UI Language change, from `HOST_STRINGS`.
- **Shell death.** The Job Object with kill-on-close takes down the sidecar and every Service and Session it spawned. The PID file then lets the next start find any survivor as an Orphan, as today.
- **Error dialogs.** Same as today: a native message box with the plain-language message and, when there are technical details, a "Details" button that opens them in a second box. Button labels and the details title come from `HOST_STRINGS` (`ok`, `details`, `detailsTitle`) in the dialog's UI Language.
- **Host strings.** The crash dialog title and message are added to `HostStrings` in `shared` for both UI Languages.
- **App data.** The shell resolves the app data folder like today (`DEVPANEL_APP_DATA`, default `%APPDATA%\DevPanel`), passes `DEVPANEL_APP_DATA` and `DEVPANEL_PORT` to the sidecar, and keeps its own WebView2 profile under the `desktop` subfolder of the app data folder.
- **Shipping Node.** The installer carries a plain `node.exe` (win-x64, pinned to a version satisfying the repo's `engines.node`, fetched by the dist build and checked against the official checksums) as the Tauri sidecar binary. Beside it, as resources: the bundled sidecar JS (Server, `core`, `shared` inlined), `node-pty` (an N-API addon: its prebuilt `win32-x64` binary loads under any Node version, no rebuild; sources and other platforms' prebuilds are dropped, as today), the built `web` UI and the icon. No Node SEA.
- **Installer.** Tauri's NSIS bundler, per-user install, WebView2 through `downloadBootstrapper`. Kept from today: choice of the install folder, Start menu and desktop shortcuts named DevPanel, English and Russian installer languages. No code signing, no auto-update.
- **Development.** `pnpm desktop` runs the Tauri dev mode against the workspace `web` build and the sidecar built from source, using the developer's Node. A new root script `desktop:check` runs `cargo check` and `cargo clippy` for the shell. `pnpm check` and the pre-commit hook do not invoke Rust.
- **Docs.** `docs/architecture.md` (`desktop` package section, running, Windows gotchas such as `ELECTRON_RUN_AS_NODE`) is updated to describe the shell, the sidecar and the protocol. ADR-0002 and ADR-0003 are already written.

## Testing Decisions

- Good tests here check what the user and the shell see: dialogs, tray menus, window shows and hides, protocol messages, processes started and stopped. They do not check how the adapter is wired inside.
- **Seam 1: `runDesktop` with a fake `DesktopHost` (existing, unit).** The current suite carries over and is adjusted to the reshaped host: window, tray, quit, start failures, UI Language. Single-instance cases leave this suite. Autostart cases follow the "shell reports, sidecar asks" shape. New case: crash texts are published at start and after a UI Language change. Prior art: the existing desktop-app unit tests.
- **Seam 2: the sidecar process over the stdio protocol with a fake shell (end-to-end, in `pnpm test`).** It replaces the Electron end-to-end test. The test builds the sidecar bundle and runs it with the test's Node, a temporary app data folder and a random port. It plays the shell by writing and reading JSON lines and proves:
  - the Server answers `/api/hello` after `openWindow`;
  - Services and Sessions run through node-pty;
  - `quitRequested` stops every recorded process before `exit`;
  - `windowCloseRequested` yields `hideWindow` and stops nothing;
  - after a forced kill of the sidecar, every recorded process still alive is found as an Orphan on the next start;
  - a taken port yields `showError` and `exit`.
  Prior art: the current Electron end-to-end test (temporary app data, workspace fixture, WebSocket client, PID file checks).
- **Seam 3: the built Tauri app (end-to-end, optional).** It runs only when `DEVPANEL_DESKTOP_EXE` points at a built app and is skipped otherwise. It proves:
  - a second launch exits at once and leaves the running app alone (no second Node);
  - killing the shell process kills the sidecar and its Services and Sessions;
  - Exit through the UI ends the shell.
  It is run by hand before a release, and the release smoke steps in `docs/architecture.md` name it.
- **Protocol fixture.** One sample line per message, shared by the TypeScript tests (they parse against the TS types) and a Rust unit test (it deserializes them). This keeps the two sides in step without a running app.
- Rust beyond the fixture test gets no unit tests: the shell holds no decisions.

## Out of Scope

- Rewriting `core` or `server` in Rust.
- Tauri IPC or any transport other than the localhost WebSocket.
- Migrating Electron installations: no uninstall of the old app, no cleanup of its Start with Windows entry or caches by the new installer.
- Auto-update and code signing.
- macOS and Linux builds.
- Reducing memory use beyond what dropping Electron gives.
- Any change to the web UI, the web version or the `.bat` launcher.

## Further Notes

- Expected sizes, measured against the current Electron build (installer 104 MB, unpacked 328 MB): installer about 45 MB, installed about 110 MB. `node.exe` is the largest part (about 92 MB unpacked, about 30 MB compressed).
- Visible change: the Theme is stored per browser, and the Electron window's storage does not carry over to WebView2, so the Theme falls back to "as in the system" once after the switch. The UI Language is unaffected (the Server's value wins).
- Release notes for the first Tauri release must tell Electron users to uninstall the old version first. Until they do, the old Start with Windows entry keeps launching the Electron app at sign-in. Whichever of the two apps starts second finds the port taken and shows "DevPanel already runs" at every sign-in. The single-instance lock does not help, since they are different apps.

---

## Русский перевод

# Спецификация: десктопное приложение на Tauri с Node-sidecar

Status: resolved

## Постановка проблемы

Десктопное приложение DevPanel написано на Electron: установщик весит около 104 МБ, установленное приложение — около 330 МБ. Почти всё это — встроенный Chromium, который в Windows у пользователя уже есть в виде WebView2. Для инструмента, который запускает, останавливает и показывает несколько Сервисов, это тяжёлая загрузка и много места на диске, и именно её первой скачивает новый участник команды.

## Решение

Десктопное приложение становится небольшой оболочкой Tauri (ADR-0003). Оболочка показывает окно (WebView2), трей и диалоги и запускает Сервер DevPanel как Node-sidecar: поставляемый `node.exe` выполняет тот же бандл Сервера, что и сейчас, на `127.0.0.1:7777` с Ключом доступа (ADR-0002 не меняется). Окно загружает URL Сервера ровно как вкладка браузера, поэтому веб-UI и веб-версия (`.bat`-запускалка) не меняются. Всё, что пользователь видит и делает, остаётся прежним:
- меню трея на Языке интерфейса;
- закрытие окна прячет его в трей (это не Выход);
- «Выход из DevPanel» и «Выход» из трея останавливают все Сервисы и Сессии;
- автозапуск с Windows;
- один DevPanel на машину;
- понятные объяснения, когда порт занят.

Установщик уменьшается примерно до 45 МБ, установленное приложение — примерно до 110 МБ. Потребление памяти почти не меняется.

Electron удаляется полностью. Существующие установки Electron не мигрируются: пользователь удаляет старое приложение сам. Workspace, Локальные конфиги, Язык интерфейса и Ключ доступа лежат в общем каталоге данных и сохраняются.

## Пользовательские истории

1. Как новый участник команды, я хочу десктопный установщик меньше 50 МБ, чтобы быстро получить DevPanel.
2. Как пользователь, я хочу, чтобы установленное приложение занимало примерно треть нынешнего места на диске, чтобы оно не казалось тяжёлым для своих задач.
3. Как пользователь Windows 11, я хочу, чтобы установщик работал без дополнительных загрузок, чтобы установка была в один шаг.
4. Как пользователь Windows 10 без WebView2, я хочу, чтобы установщик сам скачал WebView2, чтобы мне не пришлось искать и ставить его самому.
5. Как пользователь, я хочу видеть в окне тот же интерфейс DevPanel, что и раньше, чтобы ничего не переучивать.
6. Как пользователь, я хочу, чтобы мои Репо, Локальные конфиги и Язык интерфейса сохранились после перехода на новое приложение, чтобы ничего не настраивать заново.
7. Как пользователь, я хочу, чтобы закрытие окна прятало DevPanel в трей и ничего не останавливало, чтобы Сервисы и Сессии продолжали работать (закрытие — не Выход).
8. Как пользователь, я хочу, чтобы щелчок левой кнопкой по значку в трее показывал окно и переводил на него фокус, чтобы быстро вернуться в DevPanel.
9. Как пользователь, я хочу, чтобы меню трея предлагало «Показать», «Остановить всё во всех Репо», «Запускать вместе с Windows» и «Выход», чтобы управлять DevPanel, не открывая окно.
10. Как пользователь, я хочу, чтобы меню трея и подсказка были на текущем Языке интерфейса и перестраивались сразу после смены языка в окне, чтобы всё приложение говорило на одном языке.
11. Как пользователь, я хочу, чтобы «Остановить всё во всех Репо» из трея останавливало все Сервисы всех Репо, а Сессии и DevPanel продолжали работать, чтобы команда значила то же, что и в UI.
12. Как пользователь, я хочу, чтобы неудачное «Остановить всё во всех Репо» объяснялось простыми словами на текущем Языке интерфейса, а технические подробности шли отдельно, чтобы я понял, что произошло.
13. Как пользователь, я хочу, чтобы «Выход» из трея останавливал все Сервисы и Сессии до завершения приложения, чтобы ничего не работало у меня за спиной.
14. Как пользователь, я хочу, чтобы «Выход из DevPanel» в UI завершал десктопное приложение после остановки всего, чтобы Выход значил одно и то же в обеих версиях.
15. Как пользователь, я хочу, чтобы выход из учётной записи или выключение Windows завершали DevPanel вместе со всеми его Сервисами и Сессиями, как сейчас, чтобы ничего не продолжало работать в моём следующем сеансе.
16. Как пользователь, я хочу включать и выключать автозапуск с Windows из трея, видя галочку текущего состояния, чтобы самому решать, запускается ли DevPanel вместе с Windows.
17. Как пользователь, включивший автозапуск, я хочу, чтобы DevPanel запускался в трее без окна, чтобы не мешать мне при входе в систему.
18. Как пользователь, я хочу, чтобы повторный запуск DevPanel показывал уже работающее окно, а не запускал второй DevPanel, чтобы у меня никогда не оказалось двух.
19. Как пользователь, я хочу, чтобы повторный запуск не поднимал второй Сервер и второй процесс Node, чтобы два DevPanel никогда не боролись за мои процессы.
20. Как пользователь, уже запустивший DevPanel через `.bat`, я хочу, чтобы десктопное приложение объяснило, что DevPanel уже работает, и закрылось, чтобы я знал, где его искать.
21. Как пользователь, у которого порт занят другой программой, я хочу, чтобы приложение назвало порт и сказало, что его держит другая программа, чтобы я знал, что исправить.
22. Как пользователь, у которого порт занят DevPanel с другим каталогом данных, я хочу, чтобы приложение так и сказало и закрылось, чтобы меня не сбил с толку другой Workspace.
23. Как пользователь, я хочу, чтобы любая другая ошибка старта объяснялась простыми словами, а технические подробности шли отдельно, чтобы я мог передать их разработчику.
24. Как пользователь, я хочу видеть сообщения об ошибке старта на сохранённом Языке интерфейса, чтобы понять их ещё до открытия окна.
25. Как пользователь, я хочу, чтобы при убийстве приложения через диспетчер задач мои Сервисы и Сессии умирали вместе с ним, чтобы скрытый Сервер не держал порт и мои процессы.
26. Как пользователь, я хочу, чтобы процессы, оставшиеся после такого принудительного завершения, находились как Зомби при следующем запуске, чтобы я мог остановить их из DevPanel.
27. Как пользователь, я хочу, чтобы приложение на моём Языке интерфейса сообщало о неожиданной остановке своего Сервера и закрывалось, чтобы у меня не оставалось мёртвого окна.
28. Как пользователь, я хочу, чтобы ссылки на другие сайты (URL Сервиса, документация) открывались в браузере, а не в окне приложения, чтобы окно всегда показывало DevPanel.
29. Как пользователь, я хочу, чтобы вкладка браузера по-прежнему могла подключиться к работающему десктопному DevPanel как равноправный клиент, чтобы пользоваться обоими (ADR-0001).
30. Как пользователь, я хочу, чтобы Сервисы и Сессии (Claude Code, оболочка) работали в десктопном приложении так же, как в веб-версии, чтобы терминал вёл себя одинаково.
31. Как пользователь версии на Electron, я хочу, чтобы в заметках к релизу было сказано сначала удалить старую версию, чтобы у меня не осталось двух приложений и двух записей автозапуска.
32. Как разработчик, я хочу, чтобы `pnpm desktop` запускал Tauri-приложение в режиме разработки, чтобы привычная команда продолжала работать.
33. Как разработчик, я хочу, чтобы `pnpm desktop:dist` собирал установщик для Windows, чтобы выпуск релиза работал как прежде.
34. Как разработчик, я хочу, чтобы `pnpm check` не требовал Rust-тулчейна, чтобы работа над `core`, `server` или `web` оставалась такой же простой, как сейчас.
35. Как разработчик, я хочу отдельную проверку десктопа с компилятором и линтером Rust, чтобы оболочка не портилась незаметно.
36. Как разработчик, я хочу, чтобы поведение десктопа оставалось на TypeScript под юнит-тестами, чтобы менять его без знания Rust.
37. Как разработчик, я хочу end-to-end-тест sidecar с фейковой оболочкой в `pnpm test`, чтобы настоящие процессы, Выход и Зомби были покрыты без сборки Tauri.
38. Как разработчик, я хочу необязательный end-to-end-тест собранного приложения, чтобы перед релизом проверить повторный запуск и поведение при принудительном завершении.
39. Как разработчик, я хочу, чтобы собственные данные оболочки (профиль WebView2, кэши) следовали за переопределением каталога данных, чтобы тестовый экземпляр никогда не пересекался с установленным приложением.

## Решения по реализации

- **Архитектура (ADR-0003).** Пакет `desktop` перестраивается на месте: TypeScript-точка входа sidecar и рядом с ней оболочка Tauri (Rust). Пакет сохраняет имя, корневые скрипты `desktop` и `desktop:dist` — тоже. Electron, electron-builder и скрипт запуска Electron удаляются.
- **Транспорт не меняется (ADR-0002).** Sidecar запускает неизменённый `startDevPanel` на `127.0.0.1:7777` (или `DEVPANEL_PORT`) с Ключом доступа. Окно загружает открывающий URL Сервера (Ключ доступа во фрагменте). `web`, `server`, `core` и `shared` не меняются, кроме строк и типов, которые нужны протоколу.
- **Разделение обязанностей.** Sidecar решает, оболочка исполняет. Rust-оболочке принадлежит только то, что должно произойти вне Node или до его запуска:
  - блокировка единственного экземпляра (плагин Tauri single-instance): повторный запуск показывает работающее окно, переводит на него фокус, завершается и никогда не запускает sidecar;
  - автозапуск с Windows (плагин Tauri autostart) с передачей аргумента `--hidden`;
  - запуск sidecar внутри Windows Job Object с завершением при закрытии;
  - отрисовка окна, трея и нативных диалогов;
  - открытие ссылок на другие источники в браузере по умолчанию, а не в окне.
- **Протокол оболочка–sidecar.** Один JSON-объект на строку: оболочка пишет в stdin sidecar, sidecar пишет в свой stdout. Вывод Сервера и Сервисов в stdout не попадает никогда; собственные логи sidecar идут в stderr. Сообщения:
  - оболочка → sidecar: `start` (startHidden, autostartEnabled), `trayClicked`, `trayItemClicked` (id пункта), `windowCloseRequested`, `quitRequested` (саму оболочку попросили завершиться), `autostartChanged` (enabled), `errorDismissed` (id диалога).
  - sidecar → оболочка: `openWindow` (url, show), `showWindow`, `hideWindow`, `setTray` (tooltip; пункты с id, label, kind normal/checkbox/separator, checked), `showError` (id диалога, title, message, details, language, подписи кнопок), `setAutostart` (enabled), `setCrashTexts` (заголовок и текст, которые оболочка покажет при смерти sidecar), `exit` (code).
- **Типы сообщений протокола определены один раз на TypeScript** в пакете `desktop`. Rust-сторона повторяет их через serde; фикстура протокола (образцы строк) держит обе стороны в согласии.
- **`DesktopHost` остаётся швом поведения.** `runDesktop` по-прежнему держит поведение: объяснение ошибки старта через `probePort`/`portBlocker`, меню трея на Языке интерфейса с перестройкой по `uiLanguageChanged`, закрытие — не Выход, «Выход» сначала всё останавливает, «Выход из DevPanel» завершает приложение. `DesktopHost` перестраивается под новое разделение:
  - члены для единственного экземпляра из него уходят (оболочка обрабатывает это до запуска Node);
  - автозапуск читает состояние, о котором сообщила оболочка, и просит оболочку его изменить;
  - члены окна, трея, ошибок и выхода соответствуют сообщениям протокола.
  Боевой `DesktopHost` — адаптер stdio-протокола, а не Electron.
- **Поток Выхода.** Его запускает «Выход» из трея (`trayItemClicked`, который обрабатывает sidecar) или `quitRequested` от оболочки; окно оболочка пока не закрывает. Sidecar останавливает все Сервисы и Сессии, закрывает Сервер и отправляет `exit`, после чего оболочка завершается. При «Выходе из DevPanel» в UI sidecar отправляет `exit` после собственного Выхода Сервера. Во время выхода на `windowCloseRequested` не отвечают `hideWindow`.
- **Выход из учётной записи и выключение Windows.** Без аккуратной остановки, как сейчас в Electron: Windows завершает оболочку, а Job Object уносит с ней sidecar и все Сервисы и Сессии.
- **Закрытие окна.** Оболочка отменяет любое закрытие пользователем и отправляет `windowCloseRequested`. Sidecar отвечает `hideWindow`, если не идёт выход.
- **Смерть sidecar.** Если sidecar завершился, не отправив `exit`, оболочка показывает диалог аварии с последними `setCrashTexts` (до первого такого сообщения — английский запасной текст) и завершается. Sidecar отправляет `setCrashTexts` при старте и при каждой смене Языка интерфейса, беря тексты из `HOST_STRINGS`.
- **Смерть оболочки.** Job Object с завершением при закрытии уносит с собой sidecar и все запущенные им Сервисы и Сессии. Если что-то выжило, PID-файл позволяет при следующем старте найти это как Зомби — как и сейчас.
- **Диалоги ошибок.** Как сейчас: нативное окно сообщения с понятным текстом и, если есть технические подробности, кнопкой «Подробности», которая открывает их во втором окне. Подписи кнопок и заголовок подробностей берутся из `HOST_STRINGS` (`ok`, `details`, `detailsTitle`) на Языке интерфейса диалога.
- **Тексты хоста.** Заголовок и текст диалога аварии добавляются в `HostStrings` в `shared` для обоих Языков интерфейса.
- **Каталог данных.** Оболочка определяет каталог данных как сейчас (`DEVPANEL_APP_DATA`, по умолчанию `%APPDATA%\DevPanel`), передаёт sidecar `DEVPANEL_APP_DATA` и `DEVPANEL_PORT` и держит свой профиль WebView2 в подкаталоге `desktop` каталога данных.
- **Поставка Node.** Установщик содержит обычный `node.exe` (win-x64) как sidecar-бинарь Tauri. Версия закреплена и удовлетворяет `engines.node` репозитория; dist-сборка скачивает файл и сверяет его с официальными контрольными суммами. Рядом, как ресурсы, лежат: бандл JS sidecar (Сервер, `core`, `shared` встроены), `node-pty` (N-API-модуль: его готовый бинарь `win32-x64` загружается под любой версией Node без пересборки; исходники и бинари других платформ отбрасываются, как сейчас), собранный `web` UI и значок. Без Node SEA.
- **Установщик.** NSIS-бандлер Tauri, установка для текущего пользователя, WebView2 через `downloadBootstrapper`. Как сейчас: выбор папки установки, ярлыки DevPanel в меню «Пуск» и на рабочем столе, английский и русский языки установщика. Без подписи кода и без автообновления.
- **Разработка.** `pnpm desktop` запускает Tauri в режиме разработки с `web` из рабочего пространства и sidecar, собранным из исходников, на Node разработчика. Новый корневой скрипт `desktop:check` запускает для оболочки `cargo check` и `cargo clippy`. `pnpm check` и pre-commit-хук Rust не вызывают.
- **Документация.** `docs/architecture.md` обновляется: раздел пакета `desktop`, запуск, особенности Windows (например, `ELECTRON_RUN_AS_NODE`) — теперь об оболочке, sidecar и протоколе. ADR-0002 и ADR-0003 уже написаны.

## Решения по тестированию

- Хорошие тесты здесь проверяют то, что видят пользователь и оболочка: диалоги, меню трея, показ и скрытие окна, сообщения протокола, запущенные и остановленные процессы. Как адаптер устроен внутри, они не проверяют.
- **Шов 1: `runDesktop` с фейковым `DesktopHost` (существующий, юнит).** Текущий набор тестов переносится и подстраивается под перестроенный хост: окно, трей, выход, ошибки старта, Язык интерфейса. Случаи единственного экземпляра из этого набора уходят. Случаи автозапуска следуют схеме «оболочка сообщает, sidecar просит». Новый случай: тексты аварии публикуются при старте и после смены Языка интерфейса. Образец: существующие юнит-тесты desktop-app.
- **Шов 2: процесс sidecar через stdio-протокол с фейковой оболочкой (end-to-end, в `pnpm test`).** Заменяет Electron e2e. Тест собирает бандл sidecar и запускает его на Node теста с временным каталогом данных и случайным портом. Он играет роль оболочки — пишет и читает строки JSON — и доказывает:
  - после `openWindow` Сервер отвечает на `/api/hello`;
  - Сервисы и Сессии работают через node-pty;
  - `quitRequested` останавливает все записанные процессы до `exit`;
  - `windowCloseRequested` даёт `hideWindow` и ничего не останавливает;
  - после принудительного убийства sidecar каждый выживший записанный процесс находится как Зомби при следующем старте;
  - занятый порт даёт `showError` и `exit`.
  Образец: текущий Electron e2e (временный каталог данных, фикстура workspace, WebSocket-клиент, проверки PID-файла).
- **Шов 3: собранное Tauri-приложение (end-to-end, необязательный).** Запускается, только если `DEVPANEL_DESKTOP_EXE` указывает на собранное приложение, иначе пропускается. Он доказывает:
  - повторный запуск сразу завершается и не трогает работающее приложение (второго Node нет);
  - убийство процесса оболочки убивает sidecar и его Сервисы и Сессии;
  - Выход через UI завершает оболочку.
  Запускается вручную перед релизом; шаги релизного смоука в `docs/architecture.md` ссылаются на него.
- **Фикстура протокола.** По одной образцовой строке на сообщение. Её используют тесты TypeScript (разбирают по TS-типам) и юнит-тест Rust (десериализует). Так обе стороны остаются согласованными без запуска приложения.
- Кроме теста фикстуры, юнит-тестов на Rust нет: оболочка не принимает решений.

## Вне рамок

- Переписывание `core` или `server` на Rust.
- Tauri IPC или любой транспорт, кроме WebSocket на localhost.
- Миграция установок Electron: новый установщик не удаляет старое приложение, его запись автозапуска и кэши.
- Автообновление и подпись кода.
- Сборки для macOS и Linux.
- Снижение потребления памяти сверх того, что даёт отказ от Electron.
- Любые изменения веб-UI, веб-версии и `.bat`-запускалки.

## Дополнительные заметки

- Ожидаемые размеры относительно текущей сборки Electron (установщик 104 МБ, распакованное приложение 328 МБ): установщик около 45 МБ, установленное приложение около 110 МБ. Самая крупная часть — `node.exe` (около 92 МБ в распакованном виде, около 30 МБ в сжатом).
- Видимое изменение: Тема хранится в каждом браузере своя, а хранилище окна Electron в WebView2 не переносится, поэтому после перехода Тема один раз сбросится на «как в системе». Язык интерфейса не затронут (побеждает значение Сервера).
- В заметках к первому релизу на Tauri нужно попросить пользователей Electron сначала удалить старую версию. Пока они этого не сделали, старая запись автозапуска при входе в систему продолжает запускать Electron-приложение. То из двух приложений, что стартует вторым, находит порт занятым и при каждом входе показывает «DevPanel уже работает». Блокировка единственного экземпляра тут не помогает: это разные приложения.
