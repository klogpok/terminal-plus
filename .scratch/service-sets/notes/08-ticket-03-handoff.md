# Ticket 03 handoff (edit + delete Service Set)

Branch `service-sets-03`, worktree `D:\projects\terminal-plus\.claude\worktrees\agent-a43fa77c1ed6b4895`.
Commits: `a297769` (feature), `a740a13` (ticket marked resolved). Based on `service-sets` @ `bad51a5`; the tip had not moved, so the merge brought nothing.

## Shared
- `Commands.updateServiceSet` (payload `{ id; name; services: ServiceRef[] }`, result `ServiceSetView`), `Commands.deleteServiceSet` (payload `{ id }`, result `null`).
- `errors.ts`: `serviceSetNotFound: Record<string, never>`, added right after `serviceSetEmpty`. **Ticket 02 adds the same key: on merge keep one copy.** JSDoc of the three create codes now says "`createServiceSet`, `updateServiceSet`".
- Web wording: `errors.serviceSetNotFound` in both string sets (en: "This Service Set no longer exists. It may have been deleted in another window." / ru: "Этого набора больше нет. Возможно, его удалили в другом окне."). Ticket 02 adds this key too: keep one.

## Core (`service-sets.ts`)
- `ServiceSets.update({ id, name, services })` and `delete(id)`, both serialized, saved, then `changed()`. Private `require(id)` throws `serviceSetNotFound`.
- `requireValidName(raw, ownId?)` skips the Set's own name.
- `entries(refs, previous = [])`: for a not-found ref it uses the names from `previous` (the Set's stored entries), else the ids. Update passes `current.services`.
- `DevPanelCore.updateServiceSet(options)` and `deleteServiceSet(id)` delegators, right after `createServiceSet` (ticket 02 likely adds `startServiceSet` at the same place: a trivial conflict).

## Server
- `commands.ts`: `updateServiceSet` (zod `{ id: z.string().min(1), name: z.string().max(100), services: z.array(serviceRef).max(1000) }`), `deleteServiceSet` (`{ id: z.string().min(1) }`). Test in `server.test.ts`: "updates and deletes a Service Set…".

## Web
- `BackendService.updateServiceSet(id, name, services)` (replaces it by id in the list) and `deleteServiceSet(id)` (removes it). Both reject with `UiErrorInfo`.
- Menu (`service-sets-menu.ts`): each Set is now `<div class="row" role="none">` holding the name `button[role=menuitem][data-service-set-id]` (unchanged, **no click handler: ticket 02's start goes there**) and a separate `button.edit[role=menuitem]` with aria-label `strings.serviceSets.edit(name)` ("Edit Project X") and a ✎ glyph. `editing` signal (`ServiceSetView | undefined`); `openEditDialog(set)` / `openNewDialog()`. The dialog gets `[serviceSet]="editing()"`. **Merge conflict with ticket 02 is expected on the `@for` row in the template: keep the row wrapper + edit button and add 02's `(click)` to the name button.**
- Dialog (`service-set-dialog.ts`): `serviceSet = input<ServiceSetView>()`. `name` and `selected` are `linkedSignal`s: an edited Set starts with its name and the keys of all its entries; a new Set with the running Services (read `untracked`). Title `editTitle` "Edit Service Set" vs `newTitle`. Save → `updateServiceSet` when editing, else create. Delete button (edit mode only, `.danger.delete`) → inline confirm `deleteConfirm(name)` with "Yes, delete" / "Keep it" (`deleteYes`/`deleteNo`) → `deleteServiceSet`. Shared `attempt()` closes on success and shows refusals through `placeOf` (`serviceSetNotFound` → `form` place, `dp-error-message`).
- New strings (en/ru) in `serviceSets`: `edit(name)`, `editTitle`, `delete`, `deleteConfirm(name)`, `deleteYes`, `deleteNo`.
- Specs: `service-sets.spec.ts` "Edit Service Set dialog" (helper `openEditDialog(name)` inside that describe; the fixture `projectX` = Billing Worker + Shop Web).

## For ticket 04 (not-found entries in the dialog)
- The dialog already has `private readonly missing = computed(...)`: entries of the edited Set whose key is not among the listed (found, not `removedFromConfig`) Services, as `{ ref, key }`. Their keys are in `selected` from the start, and `submit()` sends `[...listed, ...missing()]` filtered by `selected`. So not-found entries are **kept on save already**, just not shown. Ticket 04 only has to render `missing()` as a separate section with checkboxes bound to `selected`/`toggle(key)` (to let the user uncheck them), labelled with the stored names: extend `missing` to carry `repoName`/`serviceName` from the `ServiceSetEntryView`, plus a "not found" mark. Spec test "keeps an entry that is not found when saving" covers the kept-on-save part.
- A Service with `removedFromConfig` is hidden from the list, so its entry lands in `missing()`, consistent with core where `removed` is not found.
- `missing` is computed from the `serviceSet` input snapshot taken when the edit action was clicked; the dialog does not follow `serviceSetsChanged` while open (a Set deleted elsewhere shows `serviceSetNotFound` on save).
- Core: update keeps the stored names of not-found entries (test "keeps the remembered names of an entry that is not found when the Set is saved again", which uses `removeRepo`). Persisting refreshed names while found and the re-emit on `repoChanged`/`configChanged` are still open (04).
