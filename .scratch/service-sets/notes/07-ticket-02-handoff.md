# Ticket 02 handoff (start a Service Set from the panel)

Branch `ticket-02-start-service-set`, worktree `D:\projects\terminal-plus\.claude\worktrees\agent-aecee14faf867b6d8`.
Commits: `3066617` (feature), `5a37f66` (ticket marked resolved). Based on `service-sets` @ `bad51a5`; the tip had not moved, so merging it brought nothing. `pnpm check` green. (One run hit a 30 s `afterEach` dispose timeout in `service-lifecycle.test.ts`, which is unrelated. It passed alone and on the full re-run, probably because of load from the parallel worktree.)

## Shared
- `index.ts`: `ServiceSetStartResult { notFound: ServiceRef[]; notRunning: ServiceRef[] }`, `ServiceSetStartReportEntry { ref; repoName; serviceName }`, `ServiceSetStartReportedEvent { id; name; notFound: Entry[]; notRunning: Entry[] }`, `Events.serviceSetStartReported`, `Commands.startServiceSet { payload: { id }; result: ServiceSetStartResult }`.
- `errors.ts`: `serviceSetNotFound: Record<string, never>`, added right after `serviceSetEmpty`. Its JSDoc says "`startServiceSet`: …", so ticket 03 widens it to update/delete. **Merge with 03:** both branches add the same key at the same place in `errors.ts` and in both strings files; keep one. My wording: EN "This Service Set no longer exists. It may have been deleted in another window." / RU "Этого набора больше нет. Возможно, его удалили в другом окне."

## Core (`service-sets.ts`)
- `ServiceSetHost` gained `status(ref)`, `startService(ref)` and `settledStatus(ref)`. `emit` is now generic over `ServiceSetEvents` (`serviceSetsChanged`, `serviceSetStartReported`); core passes `this.emit.bind(this)`. **Merge with 03:** 03 may also touch the host/emit line in `core.ts`.
- `ServiceSets.start(id)`: unknown id → `serviceSetNotFound`. Per entry (`startEntry`, never rejects): not found (`findService` undefined) → `'skipped'` (**ticket 04: change it to `'notFound'`, fill `notFound` in the result and the event, and include `notFound` in the "emit when non-empty" condition**); `running`/`starting` → counts as fine; otherwise `startService` then `settledStatus` (leaves `starting`) → `running` is fine, anything else, or any throw (portTaken, dependencyFailed, repoFolderMissing, Repo removed meanwhile), → `notRunning`. `unhealthy`/`stopping` at start: `startService` no-ops and `settledStatus` returns that status → `notRunning` (decision 6).
- The event is emitted only when `notRunning` (later also `notFound`) is non-empty. Names come from `entryView(entry)` (live names when found, stored ones otherwise). `view()` now maps through `entryView`, and the helpers `refOf` and `reportEntry` live at module level.
- `DevPanelCore.startServiceSet(id)` delegates.
- **Not done:** no event on a rejection (unknown id). The only rejection is `serviceSetNotFound`, and it has no Set name to report. The panel shows it from the command's rejection; **the tray (05) must show the window itself on a rejection.**

## Server
- `startServiceSet` handler: zod `{ id: z.string().min(1).max(100) }`. `serviceSetStartReported` is in `FORWARDED_EVENTS` and `forwardedEventsMatch`. `server.test.ts` has a round trip: bad payload → `badCommand`, unknown id → `serviceSetNotFound`.

## Web
- `BackendService.startServiceSet(id): void` uses `run(...)` (fire and forget; rejections such as `serviceSetNotFound` go to the errors list; `portTaken` never reaches it, since core swallows per-Service failures).
- `applyEvent` case `serviceSetStartReported` → `showError` with the **client** code `serviceSetStartIncomplete` (`ClientErrorParams` in `ui-errors.ts`, params `{ name, notFound, notRunning }` as report entries). Details lists the raw refs. It is shown from the event only, in every tab, whether the start came from the panel or the tray.
- Message (EN): `The Service Set "X" did not start completely. Not running: API in Repo Billing, Web in Repo Shop. The list of Services shows why; a taken port offers its choice there. Not found: DB in Repo Old. They were removed from their Repo's config, or their Repo from DevPanel.` RU mirrors it ("Набор «X» запустился не полностью. Не работают: … Не найдены: …"). Each part appears only when its list is non-empty. A `serviceList` helper sits in each strings file. **Ticket 04:** the not-found wording already exists, so only core has to fill `notFound`.
- Menu: each Set item has `(click)="start(set.id)"`, which closes the menu (focus back on the trigger) and calls `backend.startServiceSet`. **Merge with 03:** 03 adds an edit action per Set next to this button.
- Specs: `service-sets.spec.ts` "Starting a Service Set" (click sends the command and closes the menu; success shows nothing; a report shows exactly one message even when the command also resolves with the same lists; not-found wording; `serviceSetNotFound` wording).

## For ticket 05 (tray)
- Call `core.startServiceSet(id)` (or the command). Show the window when `notFound.length || notRunning.length`, or on rejection. The message itself appears in the web from `serviceSetStartReported`, so the desktop does not need to show it.
