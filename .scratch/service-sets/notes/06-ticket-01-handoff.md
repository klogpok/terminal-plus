# Ticket 01 handoff (create Service Set + menu)

Branch `service-sets-01`, worktree `D:\projects\terminal-plus\.claude\worktrees\agent-a98297635c9046536`.
Commits: `efad091` (feature), `bad51a5` (ticket marked resolved). Based on `service-sets` @ `3fcc311`; merging the tip brought nothing new. `pnpm check` green.

## Shared (`packages/shared/src`)
- `index.ts`: `ServiceSetEntryView { ref: ServiceRef; repoName; serviceName; found }`, `ServiceSetView { id; name; services: ServiceSetEntryView[] }`, `ServiceSetsChangedEvent { serviceSets }`, `Snapshot.serviceSets` (required), `Events.serviceSetsChanged`, `Commands.createServiceSet` (payload `{ name; services: ServiceRef[] }`, result `ServiceSetView`).
- `errors.ts`: `serviceSetNameEmpty`, `serviceSetNameTaken { name }`, `serviceSetEmpty`. **`serviceSetNotFound` is NOT added yet**: ticket 03 adds it (and widens the JSDoc "createServiceSet:" to update).

## Core (`packages/core/src/service-sets.ts`)
- `SERVICE_SETS_FILE = 'service-sets.json'` (exported from `core/src/index.ts`).
- Stored shape: `{ serviceSets: [{ id, name, services: [{ repoId, serviceId, repoName, serviceName }] }] }`. Missing, unreadable or invalid file → no Sets (`console.warn`), the next save overwrites it.
- `class ServiceSets(host: ServiceSetHost, appDataDir)`: `load()` (no events), `list()`, `create({ name, services })`.
  - `ServiceSetHost { findService(ref): FoundService | undefined; emit('serviceSetsChanged', payload) }`. `FoundService = { repoName, serviceName }`.
  - Private helpers to reuse: `serialized(change)` (all changes run one at a time: validate against the list the previous change saved), `requireValidName(raw)` (trim, empty, taken ignoring case; **add an `exceptId` for update**), `entries(refs)` (dedupes, captures names from `findService`, falls back to the ids when not found; throws `serviceSetEmpty`; for update, prefer the names already stored in that Set for not-found refs), `save(sets)` (temp + rename, then sets current), `changed()` (emits the full list), `view(set)` (found = `findService` hit; found entries show current names, not-found ones the stored names).
  - Ticket 04 "refresh names while found": `view()` already shows live names; persisting refreshed names is not done.
- `DevPanelCore`: `createServiceSet(options)` delegator; private `findService(ref)` = Repo listed && Service in `repo.services` && `!service.removed`; `load()` calls `serviceSets.load()` after the Repos are built; `snapshot().serviceSets`. `CoreEvents extends SessionEvents, ServiceSetEvents`.
- No re-emit on `repoChanged`/`configChanged` yet (ticket 04: recompute `found`, emit when a flag flips; relocation rewrite).

## Server
- `commands.ts`: `createServiceSet` handler, zod `{ name: z.string().max(100), services: z.array(serviceRef).max(1000) }` (no `min(1)`, refusals come from core). `server.ts`: `serviceSetsChanged` forwarded. Round-trip test in `server/test/server.test.ts` ("creates a Service Set…").

## Web
- `BackendService`: `serviceSets` signal (snapshot + `serviceSetsChanged` case), `createServiceSet(name, services): Promise<ServiceSetView>` (upserts the result by id).
- `FakeTransport.TestSnapshot`: `serviceSets` optional, defaults to `[]`.
- `service-sets/service-sets-menu.ts` (`dp-service-sets-menu`, in the header right after the title): trigger button aria-label "Service Sets" (`aria-haspopup=menu`, `aria-expanded`); `[role=menu]` with one `button[role=menuitem][data-service-set-id]` per Set (**no click handler yet: ticket 02 wires start; ticket 03 adds an edit action per Set**), "No Service Sets yet." when empty, separator, "New Service Set…" item. Arrow keys move focus, Escape closes and refocuses the trigger, outside click closes. Hosts the dialog (`dialogOpen` signal).
- `service-sets/service-set-dialog.ts` (`dp-service-set-dialog`, output `closed`): `form[role=dialog]` over a backdrop; name input aria-label "Name" (maxlength 100); per Repo a `fieldset` with `legend` = Repo name and Repo color as left border; checkboxes aria-label `"<Service> in Repo <Repo>"` (`strings.serviceSets.serviceLabel`); Services with `removedFromConfig` are hidden. Pre-checked: statuses `starting`/`running`/`unhealthy`. Save not disabled on empty input (the Server's refusals show): name codes → `[data-field-error=name]`, `serviceSetEmpty` → `[data-field-error=services]`, others → `dp-error-message`. Escape/backdrop/Cancel close. For ticket 03: add an input for the Set being edited (initial name + selection from its entries, not-found entries listed separately, Delete with confirm).
- Strings: `serviceSets` section (en/ru) with `menu`, `none`, `create`, `newTitle`, `nameLabel`, `servicesLabel`, `noServices`, `serviceLabel`, `save`, `cancel`; errors for the three codes in both sets.
- Spec: `packages/web/src/app/service-sets.spec.ts` (helpers `openMenu`, `openNewDialog`, `checked`, `aSet`).

## Merge risk
The Settings-menu work also edits `app.html`/`app.ts` and both strings files; this ticket only added one `<dp-service-sets-menu />` line in the header, one import, and new `serviceSets` sections/error entries.
