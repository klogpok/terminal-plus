# Shared contract + core

## Shared (`packages/shared/src`)

### index.ts
- `ServiceRef { repoId; serviceId }` already exists (index.ts:241). Reuse it for entries and results.
- `Snapshot` (index.ts:220): `repos`, `sessions`, `orphans?`, `uiLanguage`. Add `serviceSets: ServiceSetView[]`.
  - **Gotcha:** web `TestSnapshot` (web/src/app/backend/fake-transport.ts:14) is `Omit<Snapshot,'sessions'|'uiLanguage'> & Partial<Pick<...>>`. A new *required* field breaks every `connectWith({ repos })` in every spec. Either add `'serviceSets'` to that Omit/Partial and default it to `[]` in `replySnapshot` (fake-transport.ts:68-70), or make it optional like `orphans`. Prefer required + test default.
- Event payload pattern: `export interface OrphansFoundEvent { orphans: Orphan[] }` (index.ts:231) is the "full list" precedent. Suggested: `ServiceSetsChangedEvent { serviceSets: ServiceSetView[] }`. Add it to `Events` (index.ts:334).
- New view per the spec: `ServiceSetView { id: string; name: string; services: { ref: ServiceRef; found: boolean }[] }`.
- Commands (index.ts:361) to add, with JSDoc like the neighbours:
  ```ts
  createServiceSet: { payload: { name: string; services: ServiceRef[] }; result: ServiceSetView };  // or null
  updateServiceSet: { payload: { id: string; name: string; services: ServiceRef[] }; result: ServiceSetView };
  deleteServiceSet: { payload: { id: string }; result: null };
  startServiceSet: { payload: { id: string }; result: { notFound: ServiceRef[]; notRunning: ServiceRef[] } };
  ```
  The spec does not fix the create/update results. Returning the view (as `addRepo` returns `RepoView`) or `null` both work. The event updates every window anyway.
- The name `ServiceSetView` does not clash with anything existing. Grep found nothing named `ServiceSet*`.

### errors.ts (ErrorParams at :14)
Add the three codes with params the messages need, for example:
```ts
/** create/update: another Service Set already has this name (ignoring case). */
serviceSetNameTaken: { name: string };
/** create/update: no Services checked. */
serviceSetEmpty: Record<string, never>;
/** update/delete/start: the id names no Service Set (deleted meanwhile). */
serviceSetNotFound: Record<string, never>;
```
An empty name needs a decision. The spec lists only the three codes, and "empty name" has no code of its own. Options: `serviceSetNameTaken`, which would be wrong wording; a 4th code `serviceSetNameEmpty`; or a param `{ problem: 'empty' | 'taken' }`, following `serviceInvalid`'s discriminated params (errors.ts:49-53). The `serviceInvalid` shape is the established pattern for a form with several refusals. The web form can also disable Save on an empty trimmed name, as add-service.ts:98 does, but core must still refuse it.

### strings.ts (HOST_STRINGS, :13 en / :68 ru)
- `desktop` block (:42 / :90): `show`, `stopAllRepos`, `autostart`, `quit`, ... The tray item for a Set uses the Set's **name** (user text, not translated). Add host strings only for an optional section label, or for a dialog if you decide to show one on a tray-start rejection.
- `HostStrings = typeof EN_HOST_STRINGS`. A key missing from RU is a compile error.

## Core (`packages/core/src`)

### DevPanelCore shape (core.ts)
- `class DevPanelCore extends EventEmitter<CoreEvents>` (:190). The constructor builds helpers with narrow host objects:
  ```ts
  this.sessions = new Sessions(this, this.recorder);               // :218 (host = emitter)
  this.ports = new PortConflicts({                                   // :219-228
    repos: () => this.repos.values(),
    orphans: () => this.orphans,
    stopService: (repoId, serviceId) => this.stopService(repoId, serviceId),
    killOrphans: (ids) => this.killOrphans(ids),
    emit: (event, payload) => this.emit(event, payload),
  }, this.timings.portFreeTimeoutMs);
  ```
  Host-interface precedents: `PortConflictHost` (port-conflicts.ts:24-31); `SessionEmitter` + `SessionEvents` (sessions.ts:18-27). `CoreEvents extends SessionEvents` (core.ts:120).
- Public delegators are thin, e.g. `closeSession(id) { return this.sessions.close(id); }` (core.ts:897).
- `load()` (core.ts:235-249) reads the UI Language, then the Workspace, rebuilds `this.repos` **without emitting events**, then starts the watchers. Read the Service Sets file here (and make `found` computable).
- `snapshot()` (core.ts:497-505): add `serviceSets: this.serviceSets.list()`.
- `appDataDir` is public readonly (core.ts:192).

Suggested host for a `ServiceSets` module (my proposal, not existing code):
```ts
export interface ServiceSetHost {
  /** Whether repoId/serviceId names a Service in the config now. */
  isFound(ref: ServiceRef): boolean;
  /** Current Status (undefined when not found). */
  status(ref: ServiceRef): ServiceStatus | undefined;
  /** The normal Start path. */
  startService(repoId: string, serviceId: string): Promise<void>;
  /** Resolves with the status once the Service leaves `starting` (core.settledStatus-like). */
  settled(ref: ServiceRef): Promise<ServiceStatus>;
  emit(event: 'serviceSetsChanged', payload: ServiceSetsChangedEvent): boolean;
}
```

### Persistence pattern: copy workspace.ts (whole file is 44 lines)
```ts
export const WORKSPACE_FILE = 'workspace.json';                         // workspace.ts:7
const workspaceSchema = z.object({ repos: z.array(z.object({...})).default([]) });
export async function readWorkspace(appDataDir) {                        // :24
  let json: unknown;
  try { json = await readJsonFile(file); }                               // json-file.ts: strips UTF-8 BOM
  catch (err) { if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { repos: [] }; throw err; }
  return workspaceSchema.parse(json);                                    // invalid -> throws (Server start fails)
}
export async function writeWorkspace(appDataDir, workspace) {            // :37
  await mkdir(appDataDir, { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8');
  await rename(temp, file);
}
```
- `ui-language.ts:14-31` is the same pattern, but a garbled file falls back to the default instead of throwing. **Decision needed:** a corrupt `service-sets.json` either stops the Server from starting (Workspace behaviour) or reads as "no Service Sets", which the next save then overwrites. The spec says only "validated with zod on read".
- App data dir: `appDataDirFrom(env)` = `DEVPANEL_APP_DATA` or `%APPDATA%\DevPanel` (server/src/app-data.ts). Core gets it as `CoreOptions.appDataDir`. Suggested file: `<appData>/service-sets.json`. Export the constant from `core/src/index.ts` as `WORKSPACE_FILE` is (index.ts:25).
- Ids: `randomUUID` from `node:crypto`, as sessions.ts:5 uses.
- zod is `^4.6.5` in core.

### Repo id / ServiceRef
- `repoIdFor(path)` = sha1 of `path.resolve(p).toLowerCase()`, first 12 hex chars (repo-id.ts:5-8). Re-adding the same path gives the same id, so old entries match again.
- **`relocateRepo` changes the id** (core.ts:372-408, the event carries the old id plus the new state). Set entries for a relocated Repo become "not found" and do not follow. The spec does not mention relocate. Decide whether to rewrite entries on relocate (the module could watch `repoChanged` where `repoId !== repo.id`) or leave them not found.
- Repo state: `this.repos: Map<string, RepoState>`; `RepoState.services: Map<string, ServiceState>` (state.ts:62-81).
- A Service gone from the config while still running stays in `repo.services` with `removed = true` (core.ts:1126-1131). The view shows it as `removedFromConfig`. Decide: found = `repo exists && service exists && !removed`? Then `startService` on a removed-but-live Service would only return. Probably treat `removed` as not found.

### Start paths and how to await settle
- `startService(repoId, serviceId)` (core.ts:580-599):
  - `getRepo`/`getService` throw `repoNotFound` / `serviceNotFound`.
  - `if (service.process) return;`: **already starting/running/unhealthy/stopping returns at once**.
  - It joins a pending `launch` (waiting for dependencies) via `launch.done`.
  - `requireRepoFolder` throws `repoFolderMissing`.
  - Otherwise `launch()`: pnpm check (`pnpmMissing`), then `ports.ensureFree` (throws `portTaken` **before** dependencies, and the Status stays `stopped` with **no statusChanged event**; port-conflicts.test.ts:86-88), then dependencies (`dependencyFailed`), then `spawn` (sync; `spawnFailed` sets `crashed` and throws).
  - It **resolves once spawned** (Status `starting`), or quietly with Status `stopped` if stopped while waiting.
- `startAll` (core.ts:602-611) is the closest precedent for parallel starts:
  ```ts
  const results = await Promise.allSettled([...repo.services.values()].filter((s) => !s.removed)
    .map((s) => this.startService(repo.id, s.definition.id)));
  const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) throw failure.reason;
  ```
  It does **not** wait for `running`.
- `settledStatus(service, signal)` (core.ts:684-698) is **private** and waits only until the Status leaves `starting`, by subscribing to `statusChanged`:
  ```ts
  if (service.status !== 'starting' || signal.aborted) return Promise.resolve(service.status);
  return new Promise((resolve) => { const onStatus = () => { if (service.status !== 'starting') done(); }; this.on('statusChanged', onStatus); ... });
  ```
  It takes a `ServiceState`, not a ref. Expose a small host function from core, or reimplement via `this.on('statusChanged')` in the module filtering by ref. The status is read synchronously after `await startService(...)`, so subscribing right then misses nothing.
- Suggested per-entry algorithm for `startServiceSet`:
  1. Entry not found: `notFound`.
  2. Status `running` or `starting`: skip. This counts as success; the spec says skip.
  3. Otherwise `try { await startService } catch { notRunning; return }`, then `status = await settled(ref)`, and `status !== 'running'` goes to notRunning.
  4. Run all entries with `Promise.all` over per-entry promises that never reject.
- Open edge cases the spec does not cover:
  - An entry already `unhealthy` or `stopping`: `startService` no-ops, so it lands in `notRunning`. Probably right for `unhealthy`. For `stopping`, decide.
  - A `stopped` entry with a pending launch (`waitingFor`) is handled by `launch.done`.
  - `crashed`/`exited` entries are started again, which is the normal Start.
  - "Crash after running doesn't count": you only wait for leaving `starting`, so this holds automatically.
  - `unhealthy` may later flip to `running` (unhealthyPollMs), but it is reported as notRunning when the result settles. Matches the spec.
- Readiness: `onReadinessChange` (core.ts:755) sets `running`/`unhealthy`. Without criteria, `running` comes after `livenessMs` (TEST_TIMINGS 300 ms).
- Orphans: handled inside `ports.ensureFree` / `findOwner` (owner kind `orphan`). Nothing extra is needed when going through `startService`.

### Where Workspace/config changes are emitted (for re-evaluating `found`)
- `repoChanged`: `addRepo` (:325), `removeRepo` (:347, `repo: null`), `relocateRepo` (:404, old id plus new view), `refreshRepo` folder/branch (:293), `requireRepoFolder` (:446).
- `configChanged`: `reloadNow` (:1157; covers watcher reloads, `saveLocalConfig`, `add/removeLocalService`, `deleteLocalConfig`), `settleAfterExit` (:1147; a removed Service is dropped after it exits).
- `load()` emits nothing.
- Simplest approach: the module subscribes to `repoChanged` and `configChanged` on core (or core calls `serviceSets.refresh()` at those points), recomputes the `found` flags, and emits `serviceSetsChanged` only when some flag flipped. Compare JSON of the views, as `setWaiting` does (core.ts:650).

### Validation precedent
`requireFreeName` (core.ts:477-484): trim and lower-case compare, with an `exceptId` for the item's own name:
```ts
const taken = [...this.repos.values()].some((r) => r.id !== exceptRepoId && r.name.toLowerCase() === name.toLowerCase());
```
`addRepo` trims the name: `(options.name ?? ...).trim()` (core.ts:315).

## Core test harness (packages/core/test/harness.ts)
- `new Harness()`: temp root + `appDataDir`. `h.addRepo({ name, config: { services } })` writes the folder, `.devpanel.yml` and **rewrites `workspace.json`** (it does not touch other app data files). `h.makeFolder(rel)` makes a folder outside the Workspace (use it with `core.addRepo({ path })`).
- `await h.createCore(timings = TEST_TIMINGS, options)` uses the same app data dir. **A second `createCore()` is the persistence test** (repos.test.ts:47, 206).
- `waitForStatus(core, repoId, serviceId, status, timeoutMs)`; `fixtureCommand('x.mjs', ...args)`; `freePort()`; `h.waitForOutput(...)`; `h.dispose()` in `afterEach`.
- TEST_TIMINGS: graceful 1500, liveness 300, healthPoll 100, unhealthyPoll 500, readinessTimeout 10 000. Custom timings must spread `...TEST_TIMINGS`.
- Fixtures (`test/fixtures/`):
  - `ready-after.mjs <delayMs> [line]`: prints READY, keeps running. Use with `readyPattern: 'READY'`.
  - **crashing**: `exit-after.mjs <delayMs> <exitCode>`, e.g. `fixtureCommand('exit-after.mjs', 200, 3)` gives `crashed`, `..., 0` gives `exited`.
  - **listener**: `listen.mjs <port> [ipv4|ipv6|any] [delayMs]`. Port-taken setups: `listenHere(port)` (a net.Server in the test process) or `spawnForeignListener(port)` (port-conflicts.test.ts:26-41). The Service gets `port` + `command: fixtureCommand('listen.mjs', port)`.
  - `leave-listener.mjs`: escapes the tree. Not needed here.
- Prior-art tests named in the spec:
  - `test/depends-on.test.ts`: `setup()` / `readyAfter()` / `recordStatuses()` helpers (:15-35); transitive deps (:38); dependency crashed → `dependencyFailed` (:66-83); unhealthy dependency with `readinessTimeoutMs: 500` (:85-100); **Start all** (:164-178); stop-all scope across Repos (:180-211).
  - `test/port-conflicts.test.ts`: taken port → `portTaken`, Status stays `stopped`, no status events (:62-94); owner kinds (:96-142).
  - `test/repos.test.ts`: persistence through a second `createCore()` (:36-49, :194-207); `removeRepo` (:106-144); re-add via `core.addRepo({ path })`; `codeOf(promise)` helper (:25-33) for refusal codes.
  - `test/config-lifecycle.test.ts`: `configChange(core, name, predicate)` helper (:101-127) to wait for a matching `configChanged` after editing `.devpanel.yml` (use it for "Service removed from config → not found").
- Suggested test cases from the spec (seam 1): CRUD plus each refusal; persistence through a new core; start only the stopped Services of the Set, leave others (in the Set and outside it) untouched (`recordStatuses`); dependencies start; `notFound` for a removed Service (rewrite `.devpanel.yml`, await `configChange`) and for a removed Repo (`core.removeRepo`); `notRunning` for `exit-after.mjs 200 3` and for a port held by `listenHere`; empty lists on success; re-adding the Repo at the same path makes the entry found again; `serviceSetsChanged` on each change and flip.
