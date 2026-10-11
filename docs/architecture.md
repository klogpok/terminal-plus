# Architecture

What the code does not say by itself. Domain vocabulary: `GLOSSARY.md`. Decisions: `docs/adr/`. Scripts and env vars: the `package.json` files and the header comments of `packages/server/src/cli.ts` and `packages/desktop/src/main.ts`.

## Packages

- `shared`: the wire contract. `Commands` (payload + result), `Events`, views (`RepoView`, `ServiceView`, `SessionView`, `Snapshot`), error codes (`errors.ts`), and `HOST_STRINGS` (`strings.ts`: Russian text shown outside the web UI: launcher console, tray, desktop dialogs, the restart separator).
- `core`: all behaviour, host-agnostic (lint forbids Fastify/Electron imports). `DevPanelCore` (`core.ts`) is the public interface and the main test seam. Blocks with their own reason to change live in their own modules: `sessions.ts` (Sessions, their events in `SessionEvents`), `port-conflicts.ts` (detect, classify, resolve), `terminal.ts` (pty + output buffer + size, shared by Services and Sessions), `state.ts` (`ServiceState`, `RepoState`), `pid-file.ts` (Orphans), `readiness.ts`, `ports.ts` (netstat, process listing), `process.ts` (spawn, tree kill), `config.ts`/`detect.ts` (Repo Config, Local Config, suggestions).
- `server`: thin Fastify + WebSocket host over `core`. `commands.ts` (one zod-validated handler per command), `server.ts` (Origin + Access Key check, event forwarding, static web UI), `start.ts`, `launch.ts` (the `.bat` launcher: start, or open another tab, or explain a taken port).
- `web`: Angular 22, zoneless, signals, standalone components. Everything talks to the Server through `BackendService` over the `BackendTransport` interface (second test seam). All UI text and error wording: the UI string sets, English in `src/app/strings.en.ts` (default) and Russian in `src/app/strings.ts`, same type `UiStrings`; components read `STRINGS`, chosen once at page load from the cached UI Language (`src/app/ui-language.ts`).
- `desktop`: Electron. `desktop-app.ts` holds the behaviour behind a `DesktopHost` adapter (no Electron import, unit-tested); `main.ts` is the Electron adapter. It runs the same Server on 127.0.0.1:7777 and loads the same web UI (ADR-0002).

Type-only imports between workspace packages resolve to `src` (the `exports` map points `types` at `src/index.ts`); vitest configs and the web `tsconfig.json` `paths` alias them to `src` too. Only running `dist` (`pnpm start`, the `.bat`, Electron) needs `pnpm build`.

## Adding a command end to end

1. `shared` `Commands`: `myCommand: { payload: {...}; result: ... }`.
2. `core`: implement the method; throw `DevPanelError(code, params, technicalEnglishDetails)` for expected failures.
3. `server/src/commands.ts`: add the handler (zod payload schema + `run`); missing one is a compile error. Return `null` for void results.
4. `web` `BackendService`: a convenience method over `this.run(...)` (fire and forget, errors shown automatically) or `this.command(...)` (Promise, rejects with `UiErrorInfo`).
5. Tests: `core` through the harness; `web` through `FakeTransport` (`lastCommand`, `await reply(...)` / `await fail(...)`). A server round-trip test is optional.

New error code: add it to `ErrorParams` in `shared/src/errors.ts`, then to `errors` in both UI string sets, `web/src/app/strings.en.ts` and `web/src/app/strings.ts` (compile error until you do). Client-only errors go in `ClientErrorParams` there.

## Adding an event end to end

1. `shared` `Events`: `myEvent: MyEventPayload` (payload types live in `shared`).
2. `core`: add it to `CoreEvents` (or `SessionEvents`) and emit it.
3. `server/src/server.ts`: add the name to `FORWARDED_EVENTS` and to `forwardedEventsMatch` (compile-time payload check).
4. `web`: state changes go in a `case` of `BackendService.applyEvent`; stream-only consumers use `backend.on('myEvent', fn)`. State that must survive a reconnect also goes in `Snapshot`, `core.snapshot()` and `BackendService.onOpen`.

Output replay ordering: `getServiceOutput` / `getSessionOutput` handlers are synchronous, so every `log`/`sessionOutput` event sent before the reply is already in the buffer. Keep them free of `await` before reading the buffer. All Service output goes through `DevPanelCore.appendOutput` (buffer + `log` together).

## Running

- Web: `pnpm build && pnpm start`, then open the printed `http://127.0.0.1:7777/#key=...`. The Access Key changes on every Server start.
- UI dev loop: run the Server with `DEVPANEL_DEV_ORIGINS=http://localhost:4200`, then `pnpm --filter @devpanel/web start` (proxies `/ws`), open `http://localhost:4200/#key=<appdata>/access-key`. Use a throwaway `DEVPANEL_APP_DATA` to keep your real Workspace out of it.
- Desktop: `pnpm build`, then `pnpm --filter @devpanel/desktop start` with `ELECTRON_RUN_AS_NODE` unset. Installer: `pnpm --filter @devpanel/desktop dist` into `packages/desktop/release/`.
- Single tests: `cd packages/core && npx vitest run test/x.test.ts`; `cd packages/web && npx ng test --watch=false --include app/x.spec.ts`.

## Tests

- `core` tests run real processes on Windows (no OS adapter): `packages/core/test/harness.ts` (`Harness`, `TEST_TIMINGS`, `waitForStatus`, `fixtureCommand`, `FakeShell`) and `packages/core/test/fixtures/` (small Node scripts: listeners, grandchildren, Ctrl+C ignorers, `run-batch.cmd`, `leave-listener.mjs` for anything that must survive a Stop). Test files run one at a time in forked workers.
- Custom timings must spread `...TEST_TIMINGS`, or the 3 s production liveness applies.
- Every core built in a test gets a fake `DesktopShell` (otherwise `addRepo({})` pops a real folder dialog) and `isClaudeAvailable: false` (the harness does both).
- `web` tests: `FakeTransport` + `FakeTerminalView.factory` (needed by any spec that renders a terminal). Zoneless: `await fixture.whenStable()` after actions and `await` every `FakeTransport` reply. Specs find elements by `data-*` attributes, status classes and English `aria-label`s (the default set); keep those hooks.
- `desktop` e2e launches real Electron; `DEVPANEL_DESKTOP_EXE=<release\win-unpacked\DevPanel.exe>` points it at the packaged app.

## Gotchas

- **`ELECTRON_RUN_AS_NODE=1`** is set in the Claude Code / VS Code environment: `electron.exe` then runs as plain Node and `require('electron')` fails. Delete it when spawning Electron.
- **pnpm 12 `allowBuilds`**: a new dependency with an install script fails `pnpm install` with `ERR_PNPM_IGNORED_BUILDS` until it is listed in `pnpm-workspace.yaml`. pnpm may also write a placeholder line there; replace it with `true`/`false`.
- **Two TypeScripts**: Angular 22 needs TS ~6.0 and vitest 5, so `web` has its own; the rest stays on TS ~5.9 and vitest 4.
- **netstat** localizes `LISTENING`; `ports.ts` recognises listening rows by the foreign address `0.0.0.0:0` / `[::]:0`. A port bound on both IPv4 and IPv6 yields two rows with the same PID.
- **Process listing** uses PowerShell `Get-CimInstance Win32_Process` (~0.4 s): `wmic` is gone and `tasklist` has no parent PIDs. A listener belongs to our Service only through its ancestor chain (the pty root is `cmd.exe`).
- **ConPTY**: when the process owning the pseudo console dies hard, the console's processes die within ~3 s. Orphans are therefore only descendants that left the console, which is why the PID file records whole trees.
- **cmd batch prompt**: Ctrl+C in a `.cmd` shim (`pnpm.cmd`) makes cmd ask "Terminate batch job (Y/N)?" (localized) and wait; `process.ts` answers `Y`. Spawning goes through one command-line string (`/d /s /c "<cmd>"`), not an args array, which libuv would quote wrongly for cmd.
- **ConPTY output** is full of ANSI/OSC sequences and wraps at `cols`; strip ANSI (`stripAnsi`) and keep asserted lines short. Node children never see ConPTY resizes.
- **`fs.watch`** fires several events per write on Windows; wait for a matching `configChanged`, not the first one.
- **Playwright MCP** writes `.playwright-mcp/` into the main checkout (gitignored).
