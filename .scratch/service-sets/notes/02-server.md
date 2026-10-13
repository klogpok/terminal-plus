# Server

## Command handlers (packages/server/src/commands.ts)
- `type CommandHandlers = { [K in CommandType]: CommandHandler<K> }` (:33). A missing handler is a compile error once the command is in `shared` `Commands`.
- Reusable schemas (:35-39):
  ```ts
  const serviceRef = z.object({ repoId: z.string().min(1), serviceId: z.string().min(1) });
  const repoRef = z.object({ repoId: z.string().min(1) });
  const empty = z.object({}).transform(() => ({}) as Record<string, never>);
  ```
- Handler shapes to copy:
  ```ts
  moveRepo: { payload: z.object({ repoId: z.string().min(1), toIndex: z.number().int().min(0) }),
              run: async (core, p) => (await core.moveRepo(p.repoId, p.toIndex), null) },          // :80
  addRepo:  { payload: z.object({ path: z.string().min(1).optional(), name: z.string().trim().min(1).max(100).optional() }),
              run: (core, p) => core.addRepo(p) },                                                   // :72 (returns a view)
  addLocalService: { // "Only the shape: core checks the values and names the form field at fault." (:128)
  ```
- For Service Sets, follow `addLocalService` and validate **only the shape** in zod:
  ```ts
  createServiceSet: { payload: z.object({ name: z.string(), services: z.array(serviceRef) }), run: (core, p) => core.createServiceSet(p) },
  updateServiceSet: { payload: z.object({ id: z.string().min(1), name: z.string(), services: z.array(serviceRef) }), ... },
  deleteServiceSet: { payload: z.object({ id: z.string().min(1) }), run: async (core, p) => (await core.deleteServiceSet(p), null) },
  startServiceSet:  { payload: z.object({ id: z.string().min(1) }), run: (core, p) => core.startServiceSet(p) },
  ```
  Core then produces the coded refusals (empty name, taken name, no Services) that the UI shows in plain words. A zod `min(1)` on name or services would turn them into `badCommand` ("DevPanel did not understand the command. Reload the page."). Keep the zod schemas loose for those fields. A `.max(...)` on the name length is fine.
- `dispatchCommand` (:200-226) wraps everything. A `DevPanelError` becomes `ErrorInfo` (`toErrorInfo`); anything else becomes `internal`.
- `startServiceSet` replies only after every started Service has settled. That can take up to `readinessTimeoutMs` (120 s in production) when a Service never gets ready. There is no reply timeout on the WS side (`BackendService.command` waits indefinitely, or until the connection closes).

## Event forwarding (packages/server/src/server.ts)
- Add `'serviceSetsChanged'` to `FORWARDED_EVENTS` (:18-34, `as const satisfies readonly (EventType & keyof CoreEvents)[]`) **and** `serviceSetsChanged: true` in `forwardedEventsMatch` (:39-55). That map is the compile-time check that `CoreEvents[K][0] extends Events[K]`.
- Broadcast loop: :86-91 (every client, all equal peers).

## Round-trip tests (packages/server/test/server.test.ts), optional
- `beforeEach` (:40-67) creates a temp app data dir, one Repo `billing` with Service `api` running `idle.mjs`, and calls `startDevPanel({ appDataDir, port: 0, timings: { gracefulStopMs: 1000 }, shell, environment: { isClaudeAvailable: async () => false } })`.
- `Client` helper (:76-106): `await tab.send('cmd', payload)` returns the `ReplyMessage`; `tab.waitFor(predicate)` waits for a message.
- Pattern to copy: "moves a Repo, tells every client the new order, and rejects a bad index" (:242-261) checks `badCommand` for bad payloads plus an event on a second tab; also `setUiLanguage` (:301-315).
- With no readiness criteria, `idle.mjs` becomes `running` after the default `livenessMs` of 3 s (timings only override `gracefulStopMs`). A `startServiceSet` round trip therefore waits about 3 s, which is fine.
- Server package test: `tsc -p tsconfig.test.json && vitest run`.

## startDevPanel (server/src/start.ts)
`RunningDevPanel { core, url, accessKey, openUrl, close }` (:33-45). The desktop sidecar reaches core through `devPanel.core` (desktop/src/sidecar.ts:52-58), so the server needs no change for the desktop.
