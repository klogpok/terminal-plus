# Service Sets: overview notes

Repo: `D:\projects\terminal-plus`. These notes were written on branch `tauri-migration`. `service-sets` points at the same commit (`3fcc311`), so the content is identical.
Spec: `.scratch/service-sets/spec.md`. Tickets: `01-create`, `02-start` (needs 01), `03-edit-delete` (needs 01), `04-missing` (needs 02 and 03), `05-tray` (needs 02).

## Packages (docs/architecture.md:5-18)

| pkg | role | files touched by Service Sets |
|---|---|---|
| `shared` | wire contract | `src/index.ts` (views, `Snapshot`, `Events`, `Commands`), `src/errors.ts` (`ErrorParams`), `src/strings.ts` (`HOST_STRINGS`, tray) |
| `core` | all behaviour; the main test seam is `DevPanelCore` (`src/core.ts`) | new module, e.g. `src/service-sets.ts`, plus a persistence file, delegated from `core.ts`; export the file name in `src/index.ts` |
| `server` | Fastify + WS | `src/commands.ts` (handlers), `src/server.ts` (`FORWARDED_EVENTS` + `forwardedEventsMatch`) |
| `web` | Angular 22, zoneless, signals | `backend/backend.service.ts`, `app.html/.ts/.css` (header), a new component (menu + dialog), `strings.en.ts` + `strings.ts`, `backend/fake-transport.ts` (TestSnapshot) |
| `desktop` | sidecar TS + Rust shell | `src/desktop-app.ts` (`RunningServer`, `renderMenu`), `src/sidecar.ts` (wiring), tests in `test/desktop-app.test.ts`. No Rust change. |

Type-only imports between packages resolve to `src` (vitest aliases, web tsconfig `paths`). `web` must only `import type` from `@devpanel/shared` (shared/src/index.ts:9). Runtime constants such as `UI_LANGUAGES` are fine in server/core/desktop.

## Recipe: add a command (architecture.md:20-28)
1. `shared` `Commands`: `createServiceSet: { payload: {...}; result: ServiceSetView }` and so on.
2. `core`: a method that throws `new DevPanelError(code, params, englishDetails)`.
3. `server/src/commands.ts`: handler `{ payload: zodSchema, run }`. The mapped type makes a missing handler a compile error. Return `null` for void results.
4. `web` `BackendService`: use `this.run(...)` (fire and forget, errors shown automatically; `portTaken` is swallowed) or `this.command(...)` (Promise that rejects with `UiErrorInfo`).
5. Tests: core through the harness, web through `FakeTransport`. A server round trip is optional.

New error code: add it to `ErrorParams` (shared/src/errors.ts:14), then to `errors` in **both** `web/src/app/strings.en.ts:287` and `web/src/app/strings.ts`. It does not compile until both have it (`satisfies { [C in UiErrorCode]: ... }`, strings.en.ts:357).

## Recipe: add an event (architecture.md:30-35)
1. `shared` `Events` (index.ts:334): `serviceSetsChanged: ServiceSetsChangedEvent`, with the payload type in shared (e.g. `{ serviceSets: ServiceSetView[] }`).
2. `core` `CoreEvents` (core.ts:120). Emit it, or define a `ServiceSetEvents` the way `SessionEvents` is defined and extend it.
3. `server/src/server.ts:18` `FORWARDED_EVENTS`, plus `forwardedEventsMatch` at :39. The compile-time payload check needs both.
4. `web` `BackendService.applyEvent` (backend.service.ts:358): add a `case`. State that must survive a reconnect also goes into `Snapshot`, `core.snapshot()` (core.ts:497) and `BackendService.onOpen` (backend.service.ts:321).

## Running tests
- Everything: `pnpm check` (= `pnpm typecheck && pnpm lint && pnpm test`) from the root. Must pass before handing back. The pre-commit hook (`.githooks/pre-commit`) runs typecheck + lint only.
- Core, one file: `cd packages/core && npx vitest run test/service-sets.test.ts`. Core `test` runs `tsc -p tsconfig.test.json && vitest run`. Real processes, files run one at a time (`pool: 'forks'`, `fileParallelism: false`), 30 s timeouts (core/vitest.config.ts).
- Server: `cd packages/server && npx vitest run test/server.test.ts`.
- Web, one spec: `cd packages/web && npx ng test --watch=false --include app/service-sets.spec.ts` (builder `@angular/build:unit-test`, vitest 5, own TS ~6.0).
- Desktop: `cd packages/desktop && npx vitest run test/desktop-app.test.ts`. The package `test` script also bundles the sidecar (`node scripts/bundle.mjs`), because `sidecar.e2e.test.ts` runs the bundle.
- Rust (only if touched; it should not be): `pnpm desktop:check`, and `cargo test` in `packages/desktop/src-tauri`.

## Lint rules that bite (eslint.config.js)
- Cyrillic literals are forbidden in `packages/*/src/**/*.ts`, except `web/src/app/strings.ts` and `shared/src/strings.ts`. Spec/test files are exempt.
- `core` must not import fastify, `@fastify/*`, `@devpanel/server|desktop|web`.
- Unused vars must be prefixed `_`.

## Coding standards (CODING_STANDARDS.md)
- User-facing errors are plain language with a next step. Technical detail goes under "Details" (`dp-error-message`, or the `details` of the desktop dialog). No hard-coded text outside the strings modules.
- **One reason to change**: Service Sets get their own core module behind a narrow host interface, and `DevPanelCore` delegates to it. Do not grow `core.ts` with the block.
- Timing tests: keep a 2-3x margin between fixture timings and core timings. Wait on observable state (`waitForStatus`, events), never on a fixed sleep.
- Names: glossary vocabulary. "Service Set" (RU "Набор"). Avoid "template", "preset", "group" (GLOSSARY.md:45-47).

## Windows gotchas relevant here (architecture.md:57-69)
- `fs.watch` fires several times per write. Wait for a *matching* `configChanged`; config reloads are debounced 100 ms (core.ts:138).
- netstat localizes `LISTENING`. Ports are checked by the foreign address. A dual-stack bind gives two rows.
- Process listing goes through PowerShell CIM (~0.4 s), so a port-conflict start takes noticeable time.
- ConPTY output carries ANSI codes: use `stripAnsi`.
- Git Bash heredocs mangle backslashes (user CLAUDE.md). Write source files with Write/Edit.
- The desktop sidecar's stdout is the protocol. Log through `console`, which goes to stderr.

## Parallel work / merge risk
A locked worktree `.claude/worktrees/agent-aeb1496e4c1a4e3e5` (branch `settings-menu-01`) has uncommitted `packages/web/src/app/settings/`. The Settings-menu spec moves the UI Language and Theme switches out of the header into a gear popover. **The same header (`app.html`, `app.css`, `app.ts`) and both strings files will be edited by both features.** Expect merge conflicts there. Specs that click `data-ui-language` / `data-theme-choice` will need Settings opened first once that lands.
