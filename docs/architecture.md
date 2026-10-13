# Architecture

What the code does not say by itself. Domain vocabulary: `GLOSSARY.md`. Decisions: `docs/adr/`. Scripts and env vars: the `package.json` files and the header comments of `packages/server/src/cli.ts` and `packages/desktop/src/sidecar.ts`. Releasing the desktop app: `docs/releasing.md`.

## Packages

- `shared`: the wire contract. `Commands` (payload + result), `Events`, views (`RepoView`, `ServiceView`, `SessionView`, `Snapshot`), error codes (`errors.ts`), and `HOST_STRINGS` (`strings.ts`: text shown outside the web UI: launcher console, tray, desktop dialogs, the restart separator; one set per UI Language, English and Russian, same type `HostStrings`, read as `HOST_STRINGS[language]`). The UI Languages themselves: `UI_LANGUAGES` / `isUiLanguage` in `index.ts`. The launcher and the desktop app read the stored UI Language with `readUiLanguage` from `core`; the tray is rebuilt on `uiLanguageChanged`.
- `core`: all behaviour, host-agnostic (lint forbids Fastify imports and imports of the packages that host it). `DevPanelCore` (`core.ts`) is the public interface and the main test seam. Blocks with their own reason to change live in their own modules: `sessions.ts` (Sessions, their events in `SessionEvents`), `port-conflicts.ts` (detect, classify, resolve), `terminal.ts` (pty + output buffer + size, shared by Services and Sessions), `state.ts` (`ServiceState`, `RepoState`), `pid-file.ts` (Orphans), `readiness.ts`, `ports.ts` (netstat, process listing), `process.ts` (spawn, tree kill), `config.ts`/`detect.ts` (Repo Config, Local Config, suggestions), `local-config-edit.ts` (adding and removing Services of a Local Config), `ui-language.ts` (the stored UI Language; `readUiLanguage` needs no `DevPanelCore`), `service-sets.ts` (Service Sets and their file `service-sets.json` in the app data folder; a garbled file reads as none).
- `server`: thin Fastify + WebSocket host over `core`. `commands.ts` (one zod-validated handler per command), `server.ts` (Origin + Access Key check, event forwarding, static web UI), `start.ts`, `launch.ts` (the `.bat` launcher: start, or open another tab, or explain a taken port).
- `web`: Angular 22, zoneless, signals, standalone components. Everything talks to the Server through `BackendService` over the `BackendTransport` interface (second test seam). All UI text and error wording: the UI string sets, English in `src/app/strings.en.ts` (default, defines the type `UiStrings`) and Russian in `src/app/strings.ts`; nothing else lives in those two files. Components read `STRINGS` (and `describeError`) from `src/app/ui-strings.ts`, which selects the set once at page load (`selectUiStrings`) from the cached UI Language (`src/app/ui-language.ts`). Error codes the UI shows: `src/app/ui-errors.ts`. The Server's UI Language (snapshot, `uiLanguageChanged`) wins: `BackendService` caches it and reloads through `RELOAD_PAGE` (tests provide a fake); when it cannot be cached, the tab stays and shows `uiLanguageNotFollowed` instead of reloading forever.
- `desktop`: a Tauri shell over a Node sidecar (ADR-0003). The sidecar runs the same Server on 127.0.0.1:7777 and the window loads the same web UI over the same WebSocket (ADR-0002).
  - Who owns what: the sidecar owns every decision (start-failure explanation, tray menu in the UI Language, closing the window is not Exit, Exit stops everything); the Rust shell owns only what must happen before or outside Node: the window, tray and dialogs, the single-instance lock, Start with Windows (`--hidden`), opening URLs and folders (so nothing the user opens lives in the sidecar's Job Object), and the sidecar's lifetime.
  - Sidecar (TypeScript): `desktop-app.ts` holds the behaviour behind a `DesktopHost` adapter (no shell import, unit-tested with fakes). `sidecar.ts` (bundled to `dist/sidecar.cjs` by `scripts/bundle.mjs`, run with plain Node) starts the Server and `runDesktop`; `protocol-host.ts` is the `DesktopHost` over the protocol.
  - Protocol: JSON lines, shell messages on the sidecar's stdin, sidecar messages on its stdout (its own logging goes to stderr). The messages are defined once in `protocol.ts`; sample lines in `test/fixtures/protocol.jsonl` are shared with the Rust shell, which mirrors them with serde (`protocol.rs`, tested against the same fixture).
  - Shell (`src-tauri/`, Rust, no decisions): starts the sidecar suspended, puts it in a Job Object with kill-on-close, then lets it run (`sidecar.rs`), so killing the shell kills the Server and every Service and Session; if the sidecar dies, the shell shows an error and quits. Asked to quit by Windows or Tauri, it sends `quitRequested` and ends only on the sidecar's `exit`. It creates the window at runtime on the `openWindow` URL (no bundled frontend, no Tauri IPC; WebView2 profile in `<app data>/desktop`) and keeps other origins out of it (`window.rs`), builds the tray (`tray.rs`) and error boxes (`dialog.rs`), and keys the single-instance lock and the autostart entry on the app data folder (`instance.rs`).
  - Build: `tauri.conf.json` has no `externalBin`/`resources`, so `cargo check` and `tauri dev` need no shipped node.exe; installer-only config is `tauri.dist.conf.json`, merged by `tauri build -c` in the dist build. Installed layout: `DevPanel.exe` and the pinned `node.exe` side by side, `sidecar/sidecar.cjs` with `sidecar/node_modules/node-pty` (staged by `scripts/stage-sidecar.ts`: compiled JS and the `win32-x64` prebuilds without `*.pdb`), and `web/`. `scripts/fetch-node.ts` pins the node.exe version and SHA-256 (update both together, from the release's `SHASUMS256.txt`).

Type-only imports between workspace packages resolve to `src` (the `exports` map points `types` at `src/index.ts`); vitest configs and the web `tsconfig.json` `paths` alias them to `src` too. Only running `dist` (`pnpm start`, the `.bat`) needs `pnpm build`; the desktop scripts build what they need.

## Adding a command end to end

1. `shared` `Commands`: `myCommand: { payload: {...}; result: ... }`.
2. `core`: implement the method; throw `DevPanelError(code, params, technicalEnglishDetails)` for expected failures.
3. `server/src/commands.ts`: add the handler (zod payload schema + `run`); missing one is a compile error. Return `null` for void results.
4. `web` `BackendService`: a convenience method over `this.run(...)` (fire and forget, errors shown automatically) or `this.command(...)` (Promise, rejects with `UiErrorInfo`).
5. Tests: `core` through the harness; `web` through `FakeTransport` (`lastCommand`, `await reply(...)` / `await fail(...)`). A server round-trip test is optional.

New error code: add it to `ErrorParams` in `shared/src/errors.ts`, then to `errors` in both UI string sets, `web/src/app/strings.en.ts` and `web/src/app/strings.ts` (compile error until you do). Client-only errors go in `ClientErrorParams` in `web/src/app/ui-errors.ts`.

## Adding an event end to end

1. `shared` `Events`: `myEvent: MyEventPayload` (payload types live in `shared`).
2. `core`: add it to `CoreEvents` (or `SessionEvents`) and emit it.
3. `server/src/server.ts`: add the name to `FORWARDED_EVENTS` and to `forwardedEventsMatch` (compile-time payload check).
4. `web`: state changes go in a `case` of `BackendService.applyEvent`; stream-only consumers use `backend.on('myEvent', fn)`. State that must survive a reconnect also goes in `Snapshot`, `core.snapshot()` and `BackendService.onOpen`.

Output replay ordering: `getServiceOutput` / `getSessionOutput` handlers are synchronous, so every `log`/`sessionOutput` event sent before the reply is already in the buffer. Keep them free of `await` before reading the buffer. All Service output goes through `DevPanelCore.appendOutput` (buffer + `log` together).

## Running

- Web: `pnpm build && pnpm start`, then open the printed `http://127.0.0.1:7777/#key=...`. The Access Key changes on every Server start.
- UI dev loop: run the Server with `DEVPANEL_DEV_ORIGINS=http://localhost:4200`, then `pnpm --filter @devpanel/web start` (proxies `/ws`), open `http://localhost:4200/#key=<appdata>/access-key`. Use a throwaway `DEVPANEL_APP_DATA` to keep your real Workspace out of it.
- Desktop: `pnpm desktop` (builds `web` and the sidecar, then `tauri dev` with the developer's Node). Use a throwaway `DEVPANEL_APP_DATA` and a free `DEVPANEL_PORT` so it neither focuses nor fights your installed DevPanel. Shell compile + lint: `pnpm desktop:check` (`cargo check` + `cargo clippy -D warnings`); shell unit tests: `cargo test` in `packages/desktop/src-tauri`. Installer: `pnpm desktop:dist` (also needs internet for node.exe and, the first time, NSIS) into `packages/desktop/src-tauri/target/release/bundle/nsis/`. All three need the Rust toolchain (below); `pnpm check` never invokes Rust.
- Rust toolchain (desktop only): `rustup` with the `stable-msvc` toolchain (`rustup default stable-msvc`) and Visual Studio Build Tools with the "Desktop development with C++" workload (MSVC linker and Windows SDK). Cargo must be on PATH (`%USERPROFILE%\.cargo\bin`; a terminal opened before installing rustup does not have it). WebView2 ships with Windows 11; the installer fetches it where it is missing.
- Single tests: `cd packages/core && npx vitest run test/x.test.ts`; `cd packages/web && npx ng test --watch=false --include app/x.spec.ts`.

## Tests

- `core` tests run real processes on Windows (no OS adapter): `packages/core/test/harness.ts` (`Harness`, `TEST_TIMINGS`, `waitForStatus`, `fixtureCommand`, `FakeShell`) and `packages/core/test/fixtures/` (small Node scripts: listeners, grandchildren, Ctrl+C ignorers, `run-batch.cmd`, `leave-listener.mjs` for anything that must survive a Stop). Test files run one at a time in forked workers.
- Custom timings must spread `...TEST_TIMINGS`, or the 3 s production liveness applies.
- Every core built in a test gets a fake `DesktopShell` (otherwise `addRepo({})` pops a real folder dialog) and `isClaudeAvailable: false` (the harness does both).
- `web` tests: `FakeTransport` + `FakeTerminalView.factory` (needed by any spec that renders a terminal). Zoneless: `await fixture.whenStable()` after actions and `await` every `FakeTransport` reply. Specs find elements by `data-*` attributes, status classes and English `aria-label`s (the default set); keep those hooks.
- `desktop` sidecar e2e (`sidecar.e2e.test.ts`) plays the shell over stdin/stdout against the real sidecar bundle.
- `desktop` built-app e2e (`tauri.e2e.test.ts`) runs only when `DEVPANEL_DESKTOP_EXE` points at a built or installed Tauri `DevPanel.exe`, and is skipped otherwise: `cd packages/desktop && DEVPANEL_DESKTOP_EXE=... npx vitest run test/tauri.e2e.test.ts`. The app gets a PATH without Node, a temporary app data folder and a free port. `test/processes.ts` holds what both e2e files share (`freePort`, `isAlive`, `waitUntil`).
- Release smoke: before a release, run `tauri.e2e.test.ts` against the installed app, then the hand checklist; both are in `docs/releasing.md`.

## Gotchas

- **Cargo not on PATH**: `pnpm desktop`, `desktop:check` and `desktop:dist` fail with "cargo not found" in a shell started before rustup was installed (or one that does not read the user PATH, like some agent shells). Prepend `%USERPROFILE%\.cargo\bin`.
- **Tauri / WebView2**: the window has no Tauri IPC and loads the Server's URL like a browser tab, so the web UI behaves as in a browser; but WebView2 keeps its own storage (`<app data>/desktop`), so the per-browser Theme is not shared with a browser tab. A second desktop instance with the same app data folder only focuses the first one; give dev and test instances their own `DEVPANEL_APP_DATA`. The sidecar's stdout is the protocol: log through `console` (it goes to stderr), never write to the real stdout.
- **pnpm 12 `allowBuilds`**: a new dependency with an install script fails `pnpm install` with `ERR_PNPM_IGNORED_BUILDS` until it is listed in `pnpm-workspace.yaml`. pnpm may also write a placeholder line there; replace it with `true`/`false`.
- **Two TypeScripts**: Angular 22 needs TS ~6.0 and vitest 5, so `web` has its own; the rest stays on TS ~5.9 and vitest 4.
- **netstat** localizes `LISTENING`; `ports.ts` recognises listening rows by the foreign address `0.0.0.0:0` / `[::]:0`. A port bound on both IPv4 and IPv6 yields two rows with the same PID.
- **Process listing** uses PowerShell `Get-CimInstance Win32_Process` (~0.4 s): `wmic` is gone and `tasklist` has no parent PIDs. A listener belongs to our Service only through its ancestor chain (the pty root is `cmd.exe`).
- **ConPTY**: when the process owning the pseudo console dies hard, the console's processes die within ~3 s. Orphans are therefore only descendants that left the console, which is why the PID file records whole trees.
- **cmd batch prompt**: Ctrl+C in a `.cmd` shim (`pnpm.cmd`) makes cmd ask "Terminate batch job (Y/N)?" (localized) and wait; `process.ts` answers `Y`. Spawning goes through one command-line string (`/d /s /c "<cmd>"`), not an args array, which libuv would quote wrongly for cmd.
- **ConPTY output** is full of ANSI/OSC sequences and wraps at `cols`; strip ANSI (`stripAnsi`) and keep asserted lines short. Node children never see ConPTY resizes.
- **`fs.watch`** fires several events per write on Windows; wait for a matching `configChanged`, not the first one.
- **Playwright MCP** writes `.playwright-mcp/` into the main checkout (gitignored).
