# Decisions beyond the spec (made by the user, 2026-10-13)

These override or extend `.scratch/service-sets/spec.md`. Risks referenced are from the exploration (see the other notes).

1. **Empty name** — a separate error code `serviceSetNameEmpty` (worded in both UI string sets), alongside `serviceSetNameTaken`, `serviceSetEmpty`, `serviceSetNotFound`. Server zod schemas must NOT use `min(1)` on name or services, so these refusals come from the core, not `badCommand`. (Ticket 01.)

2. **Remembered names for entries** — each stored entry keeps, besides its `ServiceRef`, the last known Repo name and Service name. They are captured on create/update and refreshed while the entry is found. `ServiceSetView` entries expose them: `{ ref: ServiceRef; repoName: string; serviceName: string; found: boolean }`. The dialog and the start message use these names (with a "not found" mark), never raw hash ids. (Shape lands in ticket 01; refresh/not-found behaviour in 04.)

3. **Start-result event** — when a `startServiceSet` finishes with a non-empty result (or the start rejects), the core emits an event (`serviceSetStartReported` carrying `{ id, name, notFound, notRunning }` with names resolved from the entries) and the web shows the plain-language message from that event, wherever the start came from (panel or tray). The web must not show the message twice for its own panel-initiated start: show it from the event only (the command's Promise result is still returned, for the desktop and tests). (Ticket 02; the tray in 05 relies on it.)

4. **Relocation follows** — `relocateRepo` rewrites the Repo id in every Service Set entry from the old id to the new one, persists, and emits `serviceSetsChanged`. (Ticket 04.)

Defaults chosen by the orchestrator (no user decision needed):

5. **Corrupt Sets file** — fall back to no Service Sets, log it, do not crash the Server (like the UI Language file). Changed by the user on 2026-10-14 after review: the next save first renames the unreadable or invalid file to `service-sets.json.bak`, so the old Sets are not lost.
6. **Already `unhealthy` or `stopping`** entries at start time: `startService` does nothing for them, so they count as `notRunning`. A Service removed from the config but still listed as running (`removed`) counts as `notFound` (ticket 04).
7. **A taken port** rejects `startService` with `portTaken`; that rejection counts as `notRunning`, and the usual port-conflict prompt still appears in the panel.
8. **Tray**: escape `&` as `&&` in Set labels; with no Sets, the tray menu must be exactly as today (no extra separator), so `sidecar.e2e.test.ts` stays green.
