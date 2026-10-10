# Spec: DevPanel MVP

Status: ready-for-agent

## Problem Statement

A team member with no programming experience works on several repositories at once. To get anything running they have to open terminals by hand, remember which command starts which service, keep track of which window belongs to which repo, and figure out why something did not start. When something goes wrong (a port is already taken, a process survives a stop, a dev server silently exits), the failure is invisible or expressed in jargon they cannot act on. Launching Claude Code in the right folder is one more manual terminal step. On Windows it is worse: closing a terminal often leaves `node.exe` children alive, holding ports, so the next start fails for no visible reason.

## Solution

DevPanel is a local app (a web UI on localhost now, an Electron desktop app later) that lists every Repo in the user's Workspace and, for each Repo, its Services. The user starts, stops and restarts Services with buttons, sees a clear Service Status for each, watches each Service's live, interactive terminal in its own tab, and opens Claude Code or a shell Session in the Repo folder with one click. DevPanel owns all processes through the DevPanel Server: closing or reloading the browser tab changes nothing, and only an explicit Exit stops everything. Stopping a Service kills its whole process tree and verifies the port is free. Port conflicts, missing tools, crashes and leftover Orphans from a previous run are explained in plain Russian, each with a button that resolves it.

## User Stories

### Workspace and Repos

1. As a team member, I want to add a Repo by picking a folder, so that I never edit configuration files by hand.
2. As a team member, I want each Repo to get a default name from its folder and a distinct color, so that I can tell Repos apart at a glance.
3. As a team member, I want DevPanel to refuse adding the same folder twice, so that I do not end up with duplicate Repos fighting over the same processes.
4. As a team member, I want DevPanel to ask me for a different name when a Repo name is already taken, so that every message like "service API from Billing" is unambiguous.
5. As a team member, I want to remove a Repo from the Workspace, so that my list only shows what I work on.
6. As a team member, I want to be told which Services and Sessions are running in a Repo before I remove it, and have them stopped after I confirm, so that nothing keeps running without an owner.
7. As a team member, I want removing a Repo to never touch the Repo folder itself, so that I cannot lose code from DevPanel.
8. As a team member, I want a Repo whose folder disappeared to stay in the list, greyed out with "Folder not found", so that a temporarily disconnected drive does not lose my setup.
9. As a team member, I want to point a missing Repo to its new location while keeping its name and color, so that moving a folder is a one-click fix.
10. As a team member, I want to see the current git branch of each Repo, refreshed periodically, so that I know which branch I am about to run.
11. As a team member, I want an "Open folder" button on each Repo, so that I can reach the files in Explorer.

### Configuration

12. As a developer on the team, I want to describe a Repo's Services in a committed Repo Config, so that every team member gets the same, correct setup.
13. As a team member, I want DevPanel to suggest Services automatically when a Repo has no Repo Config, so that I can start working without asking a developer.
14. As a team member, I want to choose suggested Services with checkboxes and save them, so that I only get what I need.
15. As a team member, I want the saved suggestions stored as a Local Config outside the Repo, so that I never create uncommitted changes in someone's git repository.
16. As a team member, I want DevPanel to use only the Repo Config once developers commit one, and offer to delete my Local Config, so that I am never running an outdated private setup.
17. As a team member, I want DevPanel to notice when the config file changes (after a git pull or an edit by Claude), so that I do not need to know when to reload anything.
18. As a team member, I want stopped Services to pick up config changes immediately and running Services to be marked "Config changed — restart", so that nothing restarts under my feet.
19. As a team member, I want a Service removed from the config to stay visible until I stop it, so that I never lose track of a running process.
20. As a team member, I want an invalid config change to show an error on the Repo while the last valid config keeps working, so that a typo does not break my running setup.
21. As a developer, I want the Repo Config validated (unique Service ids, unique ports, dependsOn pointing to Services of the same Repo), so that configuration mistakes surface immediately with a clear message.
22. As a developer, I want Services without port, healthUrl or readyPattern to be allowed, so that watchers and workers can be described too.

### Running Services

23. As a team member, I want to start, stop and restart each Service with ▶ ■ ⟳ buttons, so that I never type commands.
24. As a team member, I want "Start all" and "Stop all" per Repo, so that I can bring a whole Repo up or down at once.
25. As a team member, I want "Stop all in all Repos" at the top, so that I can free the machine quickly.
26. As a team member, I want "Stop all" to leave my Claude and shell Sessions alone, so that I never lose a Claude conversation by accident.
27. As a team member, I want a Service's dependencies to be started first and awaited until running, so that a frontend does not start before its API.
28. As a team member, I want a Service whose dependency failed to start to stay stopped and tell me why, so that I see the root cause instead of a cascade of errors.
29. As a team member, I want stopping or crashing a dependency to leave already-running dependent Services alone, so that DevPanel never stops things I did not ask it to stop.
30. As a team member, I want a clear error with a hint ("run corepack enable or install pnpm") when pnpm is missing in a pnpm Repo, so that I know what to do.
31. As a team member, I want an "Install dependencies" button when a pnpm Repo has no installed dependencies, so that a fresh clone works without a terminal.
32. As a team member, I want Repos that use npm or yarn to still work when their Repo Config specifies commands, so that DevPanel is useful beyond pnpm Repos.
33. As a team member, I want Service output to keep its colors, so that logs look the same as in a normal terminal.

### Stopping and process hygiene

34. As a team member, I want "Stop" to kill the whole process tree of a Service, so that no hidden node.exe keeps running.
35. As a team member, I want DevPanel to give the Service a few seconds to shut down gracefully before forcing it, so that dev servers can clean up.
36. As a team member, I want DevPanel to verify the port is free after a stop and offer to kill whatever still holds it, so that the next start does not fail.
37. As a team member, I want all Services and Sessions stopped when I exit DevPanel, so that nothing keeps running in the background.
38. As a team member, I want DevPanel to detect Orphans left over from a previous run (after a crash or a forced shutdown) and offer to kill them, described in plain words like "Service API from Billing was left over from the previous run", so that I can recover cleanly.
39. As a team member, I want DevPanel to never kill an unrelated process that merely reused an old PID, so that cleaning Orphans can never kill my browser or another app.

### Ports

40. As a team member, I want DevPanel to check that a Service's port is free before starting, on every address (IPv4, IPv6, any-address), so that conflicts are detected even for servers listening on ::1.
41. As a team member, I want to see "Port 3000 is taken by service API from Repo Billing" with a "Stop it and start ours" button, so that conflicts between my own Repos are one click.
42. As a team member, I want the same one-click fix when the port is held by an Orphan, so that leftovers from a crash do not block me.
43. As a team member, I want to see "Port 3000 is taken by node.exe (PID 1234)" with a "Kill it and start ours" button that asks for confirmation, so that I can resolve foreign conflicts deliberately.
44. As a team member, I want DevPanel to wait until the port is actually free and then continue starting my Service, so that I do not have to press start again.

### Service Status

45. As a team member, I want each Service to show a status dot (🟢 running, 🟡 starting/stopping, 🟠 unhealthy, 🔴 crashed, ⚪ stopped/exited), so that I see the state of everything at a glance.
46. As a team member, I want a Service to become running only when it is actually ready (ready pattern seen, health URL answers, or port listening), so that green means usable.
47. As a team member, I want a Service with no readiness criteria to become running after it has stayed alive for a few seconds, so that it does not flash green and then crash.
48. As a team member, I want a Service that is alive but not ready after 120 seconds to show "Running, but not responding" instead of being killed, so that a slow first build is not interrupted.
49. As a team member, I want an unhealthy Service to turn running as soon as it becomes ready, so that the status catches up by itself.
50. As a team member, I want a crashed Service to show its exit code and the last 30 log lines, so that I can send the reason to a developer.
51. As a team member, I want a Service that exits by itself with code 0 to show "Finished by itself" rather than an error, so that one-shot commands are not mistaken for crashes.
52. As a team member, I want a "Start again" button on crashed Services and no automatic restart loop, so that a broken Service does not flood the log.

### Logs and terminals

53. As a team member, I want each Service's output in its own tab, colored like its Repo, so that logs from different Repos never mix.
54. As a team member, I want to type into a Service's terminal, so that I can answer a dev server's question or press its hotkeys.
55. As a team member, I want the terminal size to follow the tab size, so that output wraps correctly.
56. As a team member, I want the recent output (about 10,000 lines) to be shown when I open a tab or reload the page, so that I do not miss what already happened.
57. As a team member, I want the log to survive a restart, with a "── restart 14:32 ──" separator, so that I can still see why the previous run failed.
58. As a team member, I want "Clear", "Copy all" and search in each log, so that I can find and share errors.
59. As a team member, I want an "Open in browser" button on Services with a URL, so that I reach the app without typing addresses.

### Claude Code and shell Sessions

60. As a team member, I want a "Claude Code" button on each Repo that opens an interactive Claude Session in that Repo's folder, so that Claude always works in the right place.
61. As a team member, I want a clear message when Claude Code is not installed, so that I know what is missing.
62. As a team member, I want to open several Claude Sessions for one Repo, so that I can run parallel conversations.
63. As a team member, I want a "Terminal" button that opens a shell Session in the Repo folder, so that I can follow instructions from a developer.
64. As a team member, I want closing a Session's tab to end that Session, with a confirmation if it is still running, so that tabs and processes never drift apart.
65. As a team member, I want a Session whose process exited by itself to keep its tab marked "Session finished", so that I can still read the output.
66. As a team member, I want my open Sessions and their output restored after a page reload, so that an accidental F5 does not lose my Claude conversation.

### App lifecycle and access

67. As a team member, I want to start DevPanel from a desktop shortcut that opens the browser for me, so that launching it is one double-click.
68. As a team member, I want launching DevPanel again while it is running to just open another browser tab, so that I never get a second, conflicting instance.
69. As a team member, I want several browser tabs to show the same live state and accept input, so that it does not matter which tab I use.
70. As a team member, I want closing the browser tab to keep everything running, so that I do not lose work by closing a window.
71. As a team member, I want an "Exit DevPanel" button (with confirmation) that stops everything, so that I have one obvious way to shut it all down.
72. As a team member, I want closing the DevPanel console window to also count as Exit, so that processes never outlive DevPanel.
73. As a team member, I want all errors shown in plain Russian with technical details hidden under "Details", so that I understand what happened without jargon.
74. As a team member, I want the DevPanel Server reachable only from my machine and protected by an Access Key, so that no website or local program can run commands through it.
75. As a maintainer, I want all UI strings kept in one place, so that adding English later is straightforward.

### Desktop (stage 6)

76. As a team member, I want DevPanel as an installable Windows desktop app with a tray icon, so that it feels like a normal application.
77. As a team member, I want the desktop app to allow only one instance and stop all processes when quitting, so that it behaves exactly like the web version.
78. As a team member, I want to optionally start DevPanel with Windows, so that it is ready when I log in.
79. As a maintainer, I want the desktop app to reuse the same core and the same UI without changes, so that there is one codebase to maintain.

## Implementation Decisions

### Architecture

- pnpm monorepo with five parts: `core` (all logic), `shared` (message contract and shared types), `server` (thin Fastify + WebSocket wrapper over `core`), `web` (Angular UI), `desktop` (Electron wrapper, stage 6).
- **The DevPanel Server owns all processes** (ADR-0001). Services and Sessions live as long as the Server runs, not as long as a browser tab is open. Clients are equal peers: any number may connect, all see the same state, input from any of them goes to the pty, and the pty size follows the most recent resize.
- `core` has no dependency on Fastify or Electron. The Angular components have no direct dependency on WebSocket.
- Backend stack: Node.js LTS, TypeScript, Fastify, `@fastify/websocket`, `node-pty` (prebuilt-binary fork if the build tools are missing; verify first), `yaml`, `zod`.
- Frontend stack: Angular with standalone components only, signals for state (no NgRx), `@xterm/xterm` + fit and search addons, no heavy UI libraries.

### `core` public interface (the primary test seam)

- Commands: `startService`, `stopService`, `restartService`, `startAll`, `stopAll` (per Repo and global; Services only), `openTerminal`, `openClaude`, `closeSession`, `writeToPty`, `resizePty`, `openFolder`, `openUrl`, `listRepos`, `addRepo`, `removeRepo`, `relocateRepo`, `saveLocalConfig`, `installDependencies`, `resolvePortConflict`, `killOrphans`, `shutdown`.
- Events: `statusChanged`, `log` (pty output chunks), `exit`, `configChanged`, `repoChanged` (missing folder, branch), `orphansFound`.
- A snapshot query returns the full state (Repos, Services with Status, Sessions, buffered output), so that a reconnecting client can rebuild the UI.
- Timing parameters are constructor options with production defaults: readiness timeout 120 s, no-criteria liveness 3 s, graceful stop 5 s, health poll 1 s, unhealthy re-poll 5 s, git branch refresh 10 s.
- Filesystem locations (the app data directory) are constructor options, so tests can run in a temporary directory.

### Domain rules

- **Repo identity**: a Repo is identified by its path; one path cannot be added twice. Repo names are unique within the Workspace.
- **Configuration**: a Repo Config file in the Repo root takes precedence. Without one, a Local Config stored in the app data directory, keyed by a hash of the Repo path, is used. The two are never merged. Auto-detection reads `pnpm-workspace.yaml` packages (scripts `dev`/`start`/`serve` → `pnpm --filter <name> <script>`), otherwise the root `package.json` scripts.
- **Config validation** (zod): unique Service ids and ports within a file, dependsOn only to Services in the same Repo, readiness criteria optional.
- **Config watching**: config files are watched. Stopped Services take the new definition immediately; running Services keep the old one and are flagged; Services removed from the config remain listed until stopped; an invalid file yields a Repo-level error and the last valid config stays active.
- **Service Status state machine**: `stopped → starting → running → stopping → stopped`, plus `unhealthy` (alive, not ready after the readiness timeout; becomes `running` when ready), `crashed` (non-zero exit without a user stop) and `exited` (exit code 0 without a user stop). Readiness = first of readyPattern match, healthUrl answer, port listening; with no criteria, alive for the liveness period. Checks run only in `starting` and `unhealthy`. No automatic restart.
- **dependsOn** only orders startup: dependencies start first and are awaited until `running`; if one ends up `crashed`, `exited` or `unhealthy`, the dependent does not start and reports why. Stops and crashes of dependencies do not propagate.
- **Process spawning on Windows**: through `cmd.exe /d /s /c <cmd>`, with `cwd` resolved against the Repo path and `FORCE_COLOR=1` added. A pnpm availability check runs only for Repos with `pnpm-lock.yaml`.
- **Stopping**: send Ctrl+C to the pty, wait for the graceful period, then `taskkill /T /F` on the pty PID; afterwards confirm the port is free, otherwise report its owner.
- **Port occupancy** is read from the OS table of listening TCP sockets on all addresses (`netstat -ano` for TCP and TCPv6), which also gives the owner PID; the process name comes from `tasklist`. The same mechanism provides the "port listening" readiness signal. Conflict owners are classified as: our Service in another Repo, an Orphan, or a foreign process. Resolving a conflict frees the port, waits until it is free, then continues the start.
- **Orphans**: every spawned process (Services and Sessions) is recorded in a PID file in the app data directory together with its process creation time, Repo and Service id or Session kind. On Server start, a recorded process counts as an Orphan only when both PID and creation time match.
- **Exit**: on the "Exit DevPanel" command, SIGINT, SIGTERM, console close (SIGHUP) and `beforeExit`, all Services and Sessions are stopped before the Server terminates.
- **Sessions**: Claude (`claude` through `cmd.exe`, after a `where claude` check) or a shell, in the Repo folder; several per Repo allowed; one UI tab corresponds to one Session; closing the tab calls `closeSession`; a self-exited Session stays listed as finished until its tab is closed.
- **Output buffers**: in-memory ring buffer of about 10,000 lines per Service and per Session, no files. A Service restart appends a timestamped separator instead of clearing.

### Transport and contract

- `shared` defines the command and event message types used by both sides.
- `server` listens on 127.0.0.1:7777 only, checks the WebSocket Origin (127.0.0.1/localhost on its port) and requires the **Access Key**: a random secret generated at Server start, stored in the app data directory and passed to the browser in the URL fragment. Connections without the correct key are rejected.
- In Angular, a single `BackendService` talks to a `BackendTransport` interface; `WsTransport` is the web implementation and `IpcTransport` will be the desktop one. This interface is the second test seam.
- Opening folders and URLs always goes through the backend (`explorer.exe`, `start ""`, later `shell.openExternal`), never through browser APIs.

### Launch

- A `.bat` launcher runs the built Server and opens the browser with the Access Key. If port 7777 is already held by DevPanel, it only opens the browser. Closing its console window means Exit.

### Desktop (stage 6)

- Electron main process hosts `core`; the window loads the built `web`. `node-pty` must be rebuilt for the Electron ABI or taken as an Electron-compatible prebuilt (verify first). Transport is either the same localhost WebSocket or IPC via a preload script with context isolation. Tray, single-instance lock, optional autostart, stop everything on `before-quit`, NSIS installer through `electron-builder`.

### Delivery stages

1. Skeleton: monorepo, Server, config reading, start/stop of one Service through node-pty, correct tree kill. Verify on a real pnpm project that no node.exe survives Stop.
2. WebSocket contract, Statuses, output buffers, UI with Repo list and xterm tabs.
3. Port checks, dependsOn, readiness, unhealthy, crashed/exited details.
4. Claude and shell Sessions.
5. Auto-detection and Local Config, adding Repos from the UI, `.bat` launch.
6. Electron desktop app.

## Testing Decisions

- **Good tests exercise external behavior only**: they drive the public interface and assert on observable results (events emitted, Statuses, processes alive or dead, ports free or taken, files on disk), never on internal classes, private state or call order.
- **Seam 1 — the `core` public interface**, with real processes on Windows. Tests construct `core` with a temporary app data directory and short timings, add Repos pointing at temporary fixture folders, and run small Node fixture scripts as Service commands. The fixtures can: spawn a grandchild process; listen on a given port on IPv4, IPv6 or any-address; print a ready line after a delay; exit with a given code after a delay; ignore Ctrl+C; and echo stdin. This covers tree kill, port freeing, port conflict classification and resolution, Orphan detection (including a reused-PID negative case), every Status transition, dependsOn ordering and failure reporting, config precedence, watching and invalid-config fallback, Repo identity rules, missing folders, output buffering with restart separators, Sessions (using a shell instead of `claude`), and Exit stopping everything. There is no OS-adapter seam: `netstat`, `taskkill` and `tasklist` run for real.
- **Seam 2 — `BackendTransport`** in the Angular app. Components and `BackendService` are tested against a fake transport that records commands and emits events: Status dots, error messages in plain Russian, conflict buttons sending the right command, Session tab close confirmation, state rebuilt from a snapshot after reconnect, config-changed and folder-missing indicators.
- **Server**: one or two end-to-end tests over a real WebSocket: a command round-trip through the `shared` contract, and rejection of connections without the Access Key or with a foreign Origin.
- **Prior art**: none yet; this is a greenfield repo. The first `core` tests establish the fixture-script pattern that the others follow.

## Out of Scope

- Automatic restart of crashed Services.
- Health or port monitoring after a Service has become running.
- Cascading stops or crashes along dependsOn, and dependencies between Repos.
- Writing anything into a Repo folder (no generated Repo Config, no edits).
- Merging a Local Config over a Repo Config.
- Automatic config detection or dependency installation for npm or yarn Repos.
- Persisting logs to disk.
- Remote access, multiple users, or listening on anything other than 127.0.0.1.
- Accepting arbitrary commands from the UI beyond Claude and a shell in a known Repo folder.
- macOS and Linux.
- An English UI (strings are only prepared for it).

## Further Notes

- Domain vocabulary is defined in `GLOSSARY.md`; process ownership is recorded in ADR-0001.
- The highest technical risks are node-pty installation on Windows and reliable tree kill; stage 1 must prove both on a real pnpm project before anything else is built. The same check repeats for the Electron ABI at the start of stage 6.
- The target user is not a programmer: every user-facing message must say what happened and what to press, in Russian, with technical details folded away.
- **node-pty package (stage 1 result):** the original `node-pty@1.1.0` is used, not a fork. Since 1.1.0 it ships win32-x64/arm64 prebuilds that load without any build step, so no Visual Studio build tools or Python are needed. Its install script only checks for the prebuilds and otherwise falls back to `node-gyp`, so it is disabled with `allowBuilds: { node-pty: false }` in `pnpm-workspace.yaml`. No real trade-off, hence no ADR.
- **Ctrl+C and `.cmd` shims (stage 1 finding):** `pnpm dev` runs through `pnpm.cmd`, so Ctrl+C makes `cmd.exe` ask "Terminate batch job (Y/N)?" and wait, stalling every graceful stop for the full grace period. `stopService` answers that prompt (English and Russian wording) with `Y`. Verified on a real pnpm project: a graceful stop takes about 1 s and no `node.exe` of the Service remains; a Service that ignores Ctrl+C is killed by `taskkill /T /F` after the grace period, again with no survivors.
- **Launch for the team member (ticket 12):** a developer runs `pnpm install` and `pnpm build` once in the DevPanel folder (and after every update). Then the desktop shortcut is created by double-clicking `create-desktop-shortcut.bat` in the repo root: it puts a "DevPanel" shortcut to `start-devpanel.bat` on the desktop. By hand: right-click `start-devpanel.bat` → "Send to" → "Desktop (create shortcut)". The launcher (`packages/server/dist/launch-main.js`) asks `GET /api/hello` on 127.0.0.1:7777 whether DevPanel already runs and whether the stored Access Key is current; it then starts the Server, or only opens another tab, or explains in Russian that another program holds the port. Closing the launcher's console window is Exit. `DEVPANEL_BROWSER=none` prints the URL instead of opening a browser.
- **Desktop app (ticket 13):** `packages/desktop`. `node-pty@1.1.0` is an N-API addon, so its prebuilt binaries load in the Electron main process without a rebuild (verified with Electron 44.6); electron-builder runs with `npmRebuild: false` and unpacks `node-pty` from `app.asar`. Transport: the same WebSocket on 127.0.0.1:7777 (ADR-0002); the window loads the Server URL with the Access Key, so `web` is unchanged. Closing the window hides it to the tray (not Exit); the tray has "Показать DevPanel", "Остановить всё во всех репо", "Запускать вместе с Windows" (login item with `--hidden`, off by default) and "Выйти из DevPanel" (stops every Service and Session before the process ends). A second launch focuses the first window. Installer: `pnpm build`, then `pnpm --filter @devpanel/desktop dist` → `packages/desktop/release/DevPanel-Setup-<version>.exe` (unsigned). `DEVPANEL_APP_DATA` and `DEVPANEL_PORT` work as in the web version; Electron's own data goes to `<app data>\desktop`.

---

## Русский перевод

# Спека: DevPanel MVP

Статус: ready-for-agent

## Постановка проблемы

Член команды без опыта программирования работает с несколькими репозиториями одновременно. Чтобы что-то запустить, ему нужно вручную открывать терминалы, помнить, какая команда запускает какой сервис, следить, какое окно относится к какому репо, и разбираться, почему что-то не запустилось. Когда что-то идёт не так (порт уже занят, процесс пережил остановку, dev-сервер молча завершился), сбой либо незаметен, либо описан жаргоном, с которым пользователь ничего не может сделать. Запуск Claude Code в нужной папке — ещё один ручной шаг в терминале. На Windows всё ещё хуже: закрытие терминала часто оставляет живыми дочерние `node.exe`, которые держат порты, и следующий запуск падает без видимой причины.

## Решение

DevPanel — локальное приложение (сейчас веб-UI на localhost, позже десктоп на Electron). Оно показывает все Репо из Workspace пользователя, а внутри каждого Репо — его Сервисы. Пользователь запускает, останавливает и перезапускает Сервисы кнопками и видит понятный Статус каждого. Живой интерактивный терминал каждого Сервиса открыт в отдельной вкладке. Одним кликом можно открыть Сессию Claude Code или оболочки в папке Репо. Всеми процессами владеет Сервер DevPanel: закрытие или перезагрузка вкладки браузера ничего не меняет, и только явный Выход останавливает всё. Остановка Сервиса убивает всё дерево его процессов и проверяет, что порт освободился. Конфликты портов, отсутствующие инструменты, падения и Зомби, оставшиеся с прошлого запуска, объясняются понятным русским языком, и у каждого случая есть кнопка, которая его решает.

## Пользовательские истории

### Workspace и Репо

1. Как член команды, я хочу добавлять Репо выбором папки, чтобы никогда не править конфигурационные файлы вручную.
2. Как член команды, я хочу, чтобы каждое Репо по умолчанию получало имя по своей папке и собственный цвет, чтобы различать Репо с первого взгляда.
3. Как член команды, я хочу, чтобы DevPanel не давал добавить одну и ту же папку дважды, чтобы у меня не появились дубли Репо, которые борются за одни и те же процессы.
4. Как член команды, я хочу, чтобы DevPanel просил другое имя, если имя Репо уже занято, чтобы любое сообщение вида «сервис API из Billing» было однозначным.
5. Как член команды, я хочу удалять Репо из Workspace, чтобы в списке было только то, с чем я работаю.
6. Как член команды, я хочу перед удалением Репо узнать, какие Сервисы и Сессии в нём работают, и чтобы после подтверждения они были остановлены, чтобы ничего не продолжало работать без владельца.
7. Как член команды, я хочу, чтобы удаление Репо никогда не трогало саму папку Репо, чтобы через DevPanel нельзя было потерять код.
8. Как член команды, я хочу, чтобы Репо, папка которого пропала, оставалось в списке серым с пометкой «Папка не найдена», чтобы временно отключённый диск не уничтожал мою настройку.
9. Как член команды, я хочу указать пропавшему Репо новое расположение, сохранив имя и цвет, чтобы перенос папки исправлялся одним кликом.
10. Как член команды, я хочу видеть текущую git-ветку каждого Репо с периодическим обновлением, чтобы знать, какую ветку я сейчас запущу.
11. Как член команды, я хочу кнопку «Открыть папку» у каждого Репо, чтобы добраться до файлов через Проводник.

### Конфигурация

12. Как разработчик команды, я хочу описывать Сервисы Репо в закоммиченном Конфиге репо, чтобы у каждого члена команды была одинаковая правильная настройка.
13. Как член команды, я хочу, чтобы DevPanel сам предлагал Сервисы, если в Репо нет Конфига репо, чтобы начать работу, не дёргая разработчика.
14. Как член команды, я хочу выбирать предложенные Сервисы галочками и сохранять их, чтобы получить только то, что мне нужно.
15. Как член команды, я хочу, чтобы сохранённые предложения хранились как Локальный конфиг вне Репо, чтобы я никогда не создавал незакоммиченные изменения в чужом git-репозитории.
16. Как член команды, я хочу, чтобы после появления закоммиченного Конфига репо DevPanel использовал только его и предлагал удалить мой Локальный конфиг, чтобы я никогда не работал на устаревшей личной настройке.
17. Как член команды, я хочу, чтобы DevPanel замечал изменение файла конфига (после git pull или правки Claude), чтобы мне не нужно было знать, когда что-то перечитывать.
18. Как член команды, я хочу, чтобы остановленные Сервисы сразу получали изменения конфига, а запущенные помечались «Конфиг изменился — перезапустите», чтобы ничего не перезапускалось само посреди работы.
19. Как член команды, я хочу, чтобы Сервис, удалённый из конфига, оставался виден, пока я его не остановлю, чтобы не потерять из виду работающий процесс.
20. Как член команды, я хочу, чтобы при невалидном изменении конфига на Репо показывалась ошибка, а последний валидный конфиг продолжал работать, чтобы опечатка не ломала мою работающую настройку.
21. Как разработчик, я хочу, чтобы Конфиг репо проверялся (уникальные id Сервисов, уникальные порты, dependsOn только на Сервисы того же Репо), чтобы ошибки конфигурации сразу всплывали с понятным сообщением.
22. Как разработчик, я хочу, чтобы Сервисы без port, healthUrl и readyPattern были допустимы, чтобы можно было описывать вотчеры и воркеры.

### Запуск Сервисов

23. Как член команды, я хочу запускать, останавливать и перезапускать каждый Сервис кнопками ▶ ■ ⟳, чтобы никогда не набирать команды.
24. Как член команды, я хочу кнопки «Запустить всё» и «Остановить всё» для каждого Репо, чтобы поднимать или гасить всё Репо разом.
25. Как член команды, я хочу кнопку «Остановить всё во всех репо» сверху, чтобы быстро освободить машину.
26. Как член команды, я хочу, чтобы «Остановить всё» не трогало мои Сессии Claude и оболочки, чтобы я случайно не потерял диалог с Claude.
27. Как член команды, я хочу, чтобы Зависимости Сервиса запускались первыми и чтобы DevPanel ждал, пока они станут running, чтобы фронтенд не стартовал раньше своего API.
28. Как член команды, я хочу, чтобы Сервис, Зависимость которого не запустилась, оставался остановленным и объяснял причину, чтобы я видел первопричину, а не каскад ошибок.
29. Как член команды, я хочу, чтобы остановка или падение Зависимости не трогали уже запущенные зависящие Сервисы, чтобы DevPanel никогда не останавливал то, о чём я не просил.
30. Как член команды, я хочу видеть понятную ошибку с подсказкой («выполните corepack enable или установите pnpm»), если в pnpm-Репо не найден pnpm, чтобы знать, что делать.
31. Как член команды, я хочу кнопку «Установить зависимости», если в pnpm-Репо не установлены зависимости, чтобы свежий клон работал без терминала.
32. Как член команды, я хочу, чтобы Репо на npm или yarn тоже работали, если команды заданы в их Конфиге репо, чтобы DevPanel был полезен не только для pnpm-Репо.
33. Как член команды, я хочу, чтобы вывод Сервиса сохранял цвета, чтобы логи выглядели так же, как в обычном терминале.

### Остановка и гигиена процессов

34. Как член команды, я хочу, чтобы «Стоп» убивал всё дерево процессов Сервиса, чтобы не оставалось скрытых node.exe.
35. Как член команды, я хочу, чтобы DevPanel давал Сервису несколько секунд на корректное завершение, прежде чем убивать принудительно, чтобы dev-серверы успевали прибраться.
36. Как член команды, я хочу, чтобы после остановки DevPanel проверял, что порт свободен, и предлагал убить то, что его ещё держит, чтобы следующий запуск не падал.
37. Как член команды, я хочу, чтобы при Выходе из DevPanel останавливались все Сервисы и Сессии, чтобы ничего не продолжало работать в фоне.
38. Как член команды, я хочу, чтобы DevPanel находил Зомби, оставшиеся с прошлого запуска (после падения или принудительного выключения), и предлагал их убить, описывая простыми словами, например «Сервис API из Billing остался с прошлого запуска», чтобы я мог чисто восстановиться.
39. Как член команды, я хочу, чтобы DevPanel никогда не убивал посторонний процесс, который просто получил старый PID, чтобы очистка Зомби не могла убить мой браузер или другое приложение.

### Порты

40. Как член команды, я хочу, чтобы DevPanel перед запуском проверял, что порт Сервиса свободен, на всех адресах (IPv4, IPv6, любой адрес), чтобы конфликт обнаруживался даже для серверов, слушающих ::1.
41. Как член команды, я хочу видеть «Порт 3000 занят сервисом API из репо Billing» с кнопкой «Остановить его и запустить наш», чтобы конфликт между моими Репо решался одним кликом.
42. Как член команды, я хочу такое же решение в один клик, когда порт держит Зомби, чтобы остатки после падения меня не блокировали.
43. Как член команды, я хочу видеть «Порт 3000 занят процессом node.exe (PID 1234)» с кнопкой «Завершить и запустить наш», которая просит подтверждения, чтобы чужие конфликты решались осознанно.
44. Как член команды, я хочу, чтобы DevPanel ждал, пока порт действительно освободится, и продолжал запуск моего Сервиса, чтобы не нажимать «Запустить» ещё раз.

### Статус сервиса

45. Как член команды, я хочу, чтобы у каждого Сервиса была статус-точка (🟢 running, 🟡 starting/stopping, 🟠 unhealthy, 🔴 crashed, ⚪ stopped/exited), чтобы видеть состояние всего с первого взгляда.
46. Как член команды, я хочу, чтобы Сервис становился running только при реальной Готовности (найден readyPattern, ответил healthUrl или слушается порт), чтобы зелёный означал «можно пользоваться».
47. Как член команды, я хочу, чтобы Сервис без критериев Готовности становился running, когда проживёт несколько секунд, чтобы он не мелькал зелёным перед падением.
48. Как член команды, я хочу, чтобы Сервис, который жив, но не готов через 120 секунд, показывал «Запущен, но не отвечает», а не убивался, чтобы не прерывать долгую первую сборку.
49. Как член команды, я хочу, чтобы unhealthy-Сервис становился running, как только наступит Готовность, чтобы статус догонял реальность сам.
50. Как член команды, я хочу, чтобы упавший Сервис показывал код выхода и последние 30 строк лога, чтобы я мог переслать причину разработчику.
51. Как член команды, я хочу, чтобы Сервис, сам завершившийся с кодом 0, показывал «Завершился сам», а не ошибку, чтобы разовые команды не принимались за падения.
52. Как член команды, я хочу кнопку «Запустить снова» у упавших Сервисов и никакого автоперезапуска по кругу, чтобы сломанный Сервис не заваливал лог.

### Логи и терминалы

53. Как член команды, я хочу видеть вывод каждого Сервиса в отдельной вкладке цвета его Репо, чтобы логи разных Репо не смешивались.
54. Как член команды, я хочу печатать в терминал Сервиса, чтобы отвечать на вопросы dev-сервера или нажимать его горячие клавиши.
55. Как член команды, я хочу, чтобы размер терминала следовал за размером вкладки, чтобы вывод правильно переносился.
56. Как член команды, я хочу, чтобы при открытии вкладки или перезагрузке страницы показывался недавний вывод (около 10 000 строк), чтобы не пропустить то, что уже произошло.
57. Как член команды, я хочу, чтобы лог переживал перезапуск с разделителем «── перезапуск 14:32 ──», чтобы было видно, почему упал предыдущий запуск.
58. Как член команды, я хочу кнопки «Очистить», «Копировать всё» и поиск в каждом логе, чтобы находить ошибки и делиться ими.
59. Как член команды, я хочу кнопку «Открыть в браузере» у Сервисов с URL, чтобы попадать в приложение без набора адреса.

### Сессии Claude Code и оболочки

60. Как член команды, я хочу кнопку «Claude Code» у каждого Репо, которая открывает интерактивную Сессию Claude в папке этого Репо, чтобы Claude всегда работал в правильном месте.
61. Как член команды, я хочу видеть понятное сообщение, если Claude Code не установлен, чтобы знать, чего не хватает.
62. Как член команды, я хочу открывать несколько Сессий Claude для одного Репо, чтобы вести параллельные диалоги.
63. Как член команды, я хочу кнопку «Терминал», которая открывает Сессию оболочки в папке Репо, чтобы выполнять инструкции разработчика.
64. Как член команды, я хочу, чтобы закрытие вкладки Сессии завершало эту Сессию, а если она ещё работает — с подтверждением, чтобы вкладки и процессы никогда не расходились.
65. Как член команды, я хочу, чтобы у Сессии, процесс которой завершился сам, вкладка оставалась с пометкой «Сессия завершена», чтобы я мог дочитать вывод.
66. Как член команды, я хочу, чтобы после перезагрузки страницы мои открытые Сессии и их вывод восстанавливались, чтобы случайный F5 не уничтожал диалог с Claude.

### Жизненный цикл приложения и доступ

67. Как член команды, я хочу запускать DevPanel ярлыком на рабочем столе, который сам открывает браузер, чтобы запуск был одним двойным кликом.
68. Как член команды, я хочу, чтобы повторный запуск DevPanel, когда он уже работает, просто открывал ещё одну вкладку браузера, чтобы никогда не появлялся второй конфликтующий экземпляр.
69. Как член команды, я хочу, чтобы несколько вкладок браузера показывали одно и то же живое состояние и принимали ввод, чтобы было неважно, в какой вкладке я работаю.
70. Как член команды, я хочу, чтобы закрытие вкладки браузера оставляло всё работающим, чтобы не терять работу из-за закрытого окна.
71. Как член команды, я хочу кнопку «Выйти из DevPanel» (с подтверждением), которая останавливает всё, чтобы был один очевидный способ всё выключить.
72. Как член команды, я хочу, чтобы закрытие консольного окна DevPanel тоже считалось Выходом, чтобы процессы никогда не переживали DevPanel.
73. Как член команды, я хочу, чтобы все ошибки показывались понятным русским языком, а технические детали были спрятаны под «Подробнее», чтобы понимать, что случилось, без жаргона.
74. Как член команды, я хочу, чтобы Сервер DevPanel был доступен только с моей машины и защищён Ключом доступа, чтобы ни сайт, ни локальная программа не могли выполнять через него команды.
75. Как сопровождающий, я хочу, чтобы все строки UI хранились в одном месте, чтобы потом было просто добавить английский.

### Десктоп (этап 6)

76. Как член команды, я хочу, чтобы DevPanel был устанавливаемым десктопным приложением Windows с иконкой в трее, чтобы он ощущался как обычная программа.
77. Как член команды, я хочу, чтобы десктопное приложение разрешало только один экземпляр и останавливало все процессы при выходе, чтобы оно вело себя ровно как веб-версия.
78. Как член команды, я хочу по желанию запускать DevPanel вместе с Windows, чтобы он был готов, когда я вхожу в систему.
79. Как сопровождающий, я хочу, чтобы десктопное приложение использовало тот же core и тот же UI без изменений, чтобы поддерживать одну кодовую базу.

## Решения по реализации

### Архитектура

- Монорепо на pnpm из пяти частей: `core` (вся логика), `shared` (контракт сообщений и общие типы), `server` (тонкая обёртка Fastify + WebSocket над `core`), `web` (Angular UI), `desktop` (Electron-обёртка, этап 6).
- **Всеми процессами владеет Сервер DevPanel** (ADR-0001). Сервисы и Сессии живут, пока работает Сервер, а не пока открыта вкладка браузера. Клиенты равноправны: их может быть подключено сколько угодно, все видят одно и то же состояние, ввод из любого идёт в pty, а размер pty следует за последним resize.
- `core` не зависит от Fastify и Electron. Angular-компоненты не зависят напрямую от WebSocket.
- Стек бэкенда: Node.js LTS, TypeScript, Fastify, `@fastify/websocket`, `node-pty` (форк с готовыми бинарниками, если нет build tools; проверить первым делом), `yaml`, `zod`.
- Стек фронтенда: Angular только со standalone-компонентами, состояние на signals (без NgRx), `@xterm/xterm` с аддонами fit и search, без тяжёлых UI-библиотек.

### Публичный интерфейс `core` (основной шов для тестов)

- Команды: `startService`, `stopService`, `restartService`, `startAll`, `stopAll` (для Репо и глобально; только Сервисы), `openTerminal`, `openClaude`, `closeSession`, `writeToPty`, `resizePty`, `openFolder`, `openUrl`, `listRepos`, `addRepo`, `removeRepo`, `relocateRepo`, `saveLocalConfig`, `installDependencies`, `resolvePortConflict`, `killOrphans`, `shutdown`.
- События: `statusChanged`, `log` (куски вывода pty), `exit`, `configChanged`, `repoChanged` (пропавшая папка, ветка), `orphansFound`.
- Запрос снимка состояния возвращает всё целиком (Репо, Сервисы со Статусами, Сессии, буферизованный вывод), чтобы переподключившийся клиент мог восстановить UI.
- Временны́е параметры передаются опциями конструктора с боевыми значениями по умолчанию: таймаут Готовности 120 с, время жизни без критериев 3 с, корректная остановка 5 с, поллинг health 1 с, повторный поллинг в unhealthy 5 с, обновление git-ветки 10 с.
- Расположение файлов (каталог данных приложения) — опция конструктора, чтобы тесты работали во временном каталоге.

### Правила предметной области

- **Идентичность Репо**: Репо определяется своим путём; один путь нельзя добавить дважды. Имена Репо уникальны в пределах Workspace.
- **Конфигурация**: файл Конфига репо в корне Репо имеет приоритет. Если его нет, используется Локальный конфиг, который хранится в каталоге данных приложения под ключом — хэшем пути Репо. Они никогда не сливаются. Автоопределение читает пакеты из `pnpm-workspace.yaml` (скрипты `dev`/`start`/`serve` → `pnpm --filter <name> <script>`), иначе — скрипты корневого `package.json`.
- **Валидация конфига** (zod): уникальные id Сервисов и порты в пределах файла, dependsOn только на Сервисы того же Репо, критерии Готовности необязательны.
- **Отслеживание конфига**: за файлами конфигов ведётся наблюдение. Остановленные Сервисы сразу получают новое определение; запущенные сохраняют старое и получают пометку; Сервисы, удалённые из конфига, остаются в списке до остановки; невалидный файл даёт ошибку на уровне Репо, а активным остаётся последний валидный конфиг.
- **Машина состояний Статуса сервиса**: `stopped → starting → running → stopping → stopped`, плюс `unhealthy` (жив, но не готов по истечении таймаута Готовности; становится `running`, когда готов), `crashed` (ненулевой код выхода без «Стоп» от пользователя) и `exited` (код выхода 0 без «Стоп» от пользователя). Готовность — первое из: совпадение readyPattern, ответ healthUrl, порт слушается; без критериев — процесс прожил период живучести. Проверки работают только в `starting` и `unhealthy`. Автоперезапуска нет.
- **dependsOn** только упорядочивает запуск: Зависимости стартуют первыми, и DevPanel ждёт их `running`; если какая-то из них оказывается в `crashed`, `exited` или `unhealthy`, зависящий Сервис не стартует и сообщает причину. Остановки и падения Зависимостей не распространяются.
- **Запуск процессов на Windows**: через `cmd.exe /d /s /c <cmd>`, `cwd` разрешается относительно пути Репо, добавляется `FORCE_COLOR=1`. Проверка наличия pnpm выполняется только для Репо с `pnpm-lock.yaml`.
- **Остановка**: отправить Ctrl+C в pty, подождать период корректной остановки, затем `taskkill /T /F` по PID pty; после этого убедиться, что порт свободен, иначе сообщить его владельца.
- **Занятость порта** читается из таблицы ОС слушающих TCP-сокетов на всех адресах (`netstat -ano` для TCP и TCPv6), оттуда же берётся PID владельца; имя процесса — через `tasklist`. Тот же механизм даёт сигнал Готовности «порт слушается». Владельцы при конфликте классифицируются как: наш Сервис из другого Репо, Зомби или чужой процесс. Разрешение конфликта освобождает порт, ждёт, пока он станет свободен, и продолжает запуск.
- **Зомби**: каждый порождённый процесс (Сервисы и Сессии) записывается в PID-файл в каталоге данных приложения вместе со временем создания процесса, Репо и id Сервиса или типом Сессии. При старте Сервера записанный процесс считается Зомби, только если совпадают и PID, и время создания.
- **Выход**: по команде «Выйти из DevPanel», SIGINT, SIGTERM, закрытию консоли (SIGHUP) и `beforeExit` все Сервисы и Сессии останавливаются до завершения Сервера.
- **Сессии**: Claude (`claude` через `cmd.exe`, после проверки `where claude`) или оболочка, в папке Репо; на одно Репо можно несколько; одна вкладка UI соответствует одной Сессии; закрытие вкладки вызывает `closeSession`; Сессия, завершившаяся сама, остаётся в списке как завершённая, пока её вкладку не закроют.
- **Буферы вывода**: кольцевой буфер в памяти примерно на 10 000 строк на каждый Сервис и каждую Сессию, без файлов. Перезапуск Сервиса добавляет разделитель со временем вместо очистки.

### Транспорт и контракт

- `shared` определяет типы сообщений команд и событий, которыми пользуются обе стороны.
- `server` слушает только 127.0.0.1:7777, проверяет Origin у WebSocket (127.0.0.1/localhost на своём порту) и требует **Ключ доступа**: случайный секрет, который создаётся при старте Сервера, хранится в каталоге данных приложения и передаётся браузеру во фрагменте URL. Подключения без правильного ключа отклоняются.
- В Angular единственный `BackendService` общается с интерфейсом `BackendTransport`; `WsTransport` — веб-реализация, `IpcTransport` станет десктопной. Этот интерфейс — второй шов для тестов.
- Открытие папок и URL всегда идёт через бэкенд (`explorer.exe`, `start ""`, позже `shell.openExternal`), никогда через API браузера.

### Запуск

- `.bat`-запускалка стартует собранный Сервер и открывает браузер с Ключом доступа. Если порт 7777 уже занят DevPanel, она только открывает браузер. Закрытие её консольного окна означает Выход.

### Десктоп (этап 6)

- Main-процесс Electron размещает `core`; окно загружает собранный `web`. `node-pty` нужно пересобрать под ABI Electron или взять совместимую с Electron сборку с готовыми бинарниками (проверить первым делом). Транспорт — либо тот же WebSocket на localhost, либо IPC через preload-скрипт с изоляцией контекста. Трей, блокировка второго экземпляра, автозапуск по желанию, остановка всего на `before-quit`, NSIS-установщик через `electron-builder`.

### Этапы поставки

1. Каркас: монорепо, Сервер, чтение конфигов, запуск/остановка одного Сервиса через node-pty, корректное убийство дерева процессов. Проверить на реальном pnpm-проекте, что после «Стоп» не остаётся node.exe.
2. WebSocket-контракт, Статусы, буферы вывода, UI со списком Репо и вкладками xterm.
3. Проверка портов, dependsOn, Готовность, unhealthy, подробности crashed/exited.
4. Сессии Claude и оболочки.
5. Автоопределение и Локальный конфиг, добавление Репо из UI, запуск через `.bat`.
6. Десктопное приложение на Electron.

## Решения по тестированию

- **Хорошие тесты проверяют только внешнее поведение**: они работают через публичный интерфейс и проверяют наблюдаемые результаты (испущенные события, Статусы, живы ли процессы, свободны ли порты, файлы на диске), но никогда не внутренние классы, приватное состояние или порядок вызовов.
- **Шов 1 — публичный интерфейс `core`**, с настоящими процессами на Windows. Тесты создают `core` со временным каталогом данных и короткими таймингами, добавляют Репо, указывающие на временные папки-фикстуры, и используют маленькие Node-скрипты-фикстуры как команды Сервисов. Фикстуры умеют: порождать процесс-внука; слушать заданный порт на IPv4, IPv6 или любом адресе; печатать строку готовности с задержкой; выходить с заданным кодом после задержки; игнорировать Ctrl+C; повторять stdin. Это покрывает убийство дерева процессов, освобождение порта, классификацию и разрешение конфликтов портов, обнаружение Зомби (включая отрицательный случай с переиспользованным PID), все переходы Статусов, порядок dependsOn и сообщения о сбоях, приоритет конфигов, отслеживание изменений и откат к последнему валидному конфигу, правила идентичности Репо, пропавшие папки, буферизацию вывода с разделителями перезапуска, Сессии (с оболочкой вместо `claude`) и остановку всего при Выходе. Шва-адаптера для ОС нет: `netstat`, `taskkill` и `tasklist` выполняются по-настоящему.
- **Шов 2 — `BackendTransport`** в Angular-приложении. Компоненты и `BackendService` тестируются с фейковым транспортом, который записывает команды и испускает события: статус-точки, сообщения об ошибках на понятном русском, кнопки конфликтов, отправляющие правильную команду, подтверждение закрытия вкладки Сессии, восстановление состояния из снимка после переподключения, индикаторы изменения конфига и пропавшей папки.
- **Сервер**: один-два сквозных теста через настоящий WebSocket: команда туда и обратно по контракту `shared` и отклонение подключений без Ключа доступа или с чужим Origin.
- **Прецеденты**: пока нет, репозиторий новый. Первые тесты `core` задают паттерн скриптов-фикстур, которому следуют остальные.

## Вне рамок

- Автоматический перезапуск упавших Сервисов.
- Мониторинг health или порта после того, как Сервис стал running.
- Каскадные остановки или падения по dependsOn и зависимости между Репо.
- Запись чего-либо в папку Репо (никакого сгенерированного Конфига репо, никаких правок).
- Слияние Локального конфига поверх Конфига репо.
- Автоопределение конфига и установка зависимостей для Репо на npm или yarn.
- Сохранение логов на диск.
- Удалённый доступ, несколько пользователей или прослушивание чего-либо, кроме 127.0.0.1.
- Приём произвольных команд из UI, кроме Claude и оболочки в папке известного Репо.
- macOS и Linux.
- Английский интерфейс (строки только подготовлены для него).

## Дополнительные заметки

- Словарь предметной области определён в `GLOSSARY.md`; владение процессами зафиксировано в ADR-0001.
- Самые высокие технические риски — установка node-pty на Windows и надёжное убийство дерева процессов; этап 1 должен доказать и то и другое на реальном pnpm-проекте, прежде чем строить что-либо ещё. Та же проверка повторяется для ABI Electron в начале этапа 6.
- Целевой пользователь — не программист: каждое сообщение для пользователя должно говорить, что случилось и что нажать, по-русски, с техническими деталями под спойлером.
- **Пакет node-pty (итог этапа 1):** используется оригинальный `node-pty@1.1.0`, а не форк. Начиная с 1.1.0 он поставляет готовые бинарники для win32-x64/arm64, которые загружаются без сборки, поэтому Visual Studio build tools и Python не нужны. Его install-скрипт лишь проверяет наличие бинарников, а иначе откатывается на `node-gyp`, поэтому он отключён через `allowBuilds: { node-pty: false }` в `pnpm-workspace.yaml`. Реального компромисса нет, поэтому ADR не нужен.
- **Ctrl+C и `.cmd`-обёртки (находка этапа 1):** `pnpm dev` запускается через `pnpm.cmd`, поэтому на Ctrl+C `cmd.exe` спрашивает «Terminate batch job (Y/N)?» и ждёт, из-за чего каждая мягкая остановка длилась бы весь период ожидания. `stopService` отвечает на этот вопрос (английская и русская формулировки) символом `Y`. Проверено на реальном pnpm-проекте: мягкая остановка занимает около 1 с, и ни одного `node.exe` Сервиса не остаётся; Сервис, игнорирующий Ctrl+C, убивается через `taskkill /T /F` после периода ожидания, тоже без выживших.
- **Запуск для члена команды (тикет 12):** разработчик один раз (и после каждого обновления) выполняет `pnpm install` и `pnpm build` в папке DevPanel. Затем ярлык на рабочем столе создаётся двойным кликом по `create-desktop-shortcut.bat` в корне репозитория: он кладёт на рабочий стол ярлык «DevPanel» на `start-devpanel.bat`. Вручную: правый клик по `start-devpanel.bat` → «Отправить» → «Рабочий стол (создать ярлык)». Запускалка (`packages/server/dist/launch-main.js`) спрашивает `GET /api/hello` на 127.0.0.1:7777, работает ли уже DevPanel и актуален ли сохранённый Ключ доступа; затем запускает Сервер, или только открывает ещё одну вкладку, или по-русски объясняет, что порт занят другой программой. Закрытие консольного окна запускалки означает Выход. `DEVPANEL_BROWSER=none` печатает URL вместо открытия браузера.
- **Десктопное приложение (тикет 13):** `packages/desktop`. `node-pty@1.1.0` — N-API-аддон, поэтому его готовые бинарники загружаются в main-процессе Electron без пересборки (проверено на Electron 44.6); electron-builder работает с `npmRebuild: false` и распаковывает `node-pty` из `app.asar`. Транспорт — тот же WebSocket на 127.0.0.1:7777 (ADR-0002); окно загружает URL Сервера с Ключом доступа, поэтому `web` не меняется. Закрытие окна прячет его в трей (это не Выход); в трее есть «Показать DevPanel», «Остановить всё во всех репо», «Запускать вместе с Windows» (элемент автозапуска с `--hidden`, по умолчанию выключен) и «Выйти из DevPanel» (останавливает все Сервисы и Сессии до завершения процесса). Повторный запуск фокусирует первое окно. Установщик: `pnpm build`, затем `pnpm --filter @devpanel/desktop dist` → `packages/desktop/release/DevPanel-Setup-<версия>.exe` (без подписи). `DEVPANEL_APP_DATA` и `DEVPANEL_PORT` работают как в веб-версии; собственные данные Electron лежат в `<каталог данных>\desktop`.
