# Web (packages/web/src/app)

## BackendService (backend/backend.service.ts)
- State signals: private `xState = signal<T>(...)`, public `readonly x = this.xState.asReadonly()` (:67-88). Add `serviceSetsState` / `serviceSets`.
- `onOpen` (:321-334) sets everything from the snapshot:
  ```ts
  this.command('getSnapshot', {}).then((snapshot) => {
    this.reposState.set(snapshot.repos); this.sessionsState.set(snapshot.sessions);
    this.orphansState.set(snapshot.orphans ?? []); this.followUiLanguage(snapshot.uiLanguage);
  }, (error: UiErrorInfo) => this.showError(error));
  ```
- `applyEvent` switch (:358-438). The full-list precedent is `case 'orphansFound': this.orphansState.set(event.payload.orphans); break;`.
- `command()` (:278-287) returns a Promise that rejects with `UiErrorInfo`, and rejects at once with `connectionLost` when not open. `run()` (:290-296) is fire and forget and swallows `portTaken`.
- Promise-command method precedents:
  ```ts
  async addLocalService(repoId, service): Promise<void> { await this.command('addLocalService', { repoId, service }); }  // :188 form shows rejection
  async addRepo(options = {}) { const repo = await this.command('addRepo', options); if (repo) this.applyRepoChange(...); return repo; } // :205
  ```
  For `startServiceSet`: `startServiceSet(id): Promise<{notFound; notRunning}>`, or a void method that calls `showError`/sets a message signal itself. Errors from the reject path go through `this.showError(error)`. Note that `startServiceSet` can fail with `serviceSetNotFound`.
- `showError(error: UiErrorInfo)` (:310) pushes `{ id, message: describeError(error), details }` into `errors`, rendered in `app.html:102-108` with `dp-error-message` (dismissible). The non-empty start result is **not** an error code. Show it as its own message: a new signal plus a block (like `.orphans` in app.html:90-101), or a client-side `ClientErrorParams` code in `ui-errors.ts:8-13` so it reuses the errors list. The second option gives a dismissible message for free. It needs params such as `{ notFound: string[]; notRunning: string[] }` (already-resolved names) and a message in both string sets.
- Resolving names for the message: `notRunning` refs are found, so their names come from `repos()` (`repo.name`, `service.name`). `notFound` refs may have no Repo any more. The spec says the dialog lists them "with their stored ids". **Risk:** the Repo id is a 12-hex hash (core/src/repo-id.ts), which means nothing to a non-programmer. Consider showing `serviceId` plus "(Repo removed)", or storing last-known names in the entry. The spec keeps the entry as just `ServiceRef`.

## Header (app.html:1-41, app.ts, app.css)
- Order: `.app-title` (flex:1) | `button.stop-all-repos` (aria-label = `strings.actions.stopAllRepos`) | `.ui-language` group | `.theme-switch` group | `button.exit-button`.
- Button CSS shared at app.css:18-46 (`height: 26px`, border, `var(--bg)`, `var(--fg)`, hover `var(--accent)`). Danger: `button.danger` (:92).
- The "Service Sets" menu probably sits right before or after `stop-all-repos`. **Conflict:** the parallel Settings-menu feature rewrites this header (gear popover replacing the language/theme groups).
- `App` imports `[RepoList, ErrorMessage, TerminalTabStrip]` (app.ts:21). Add the new component there.
- `LIVE` statuses in app.ts:10. "Running" for pre-checking = `status === 'running'` (spec: "running right now"). Decide whether `starting`/`unhealthy` count.

## Existing menu / dialog / confirm patterns
- **There is no dropdown menu or modal dialog component yet.** Grep finds no `role="menu"`, `aria-haspopup`, `<dialog>` or CDK overlay. `@angular/cdk` ^22.2 is a dependency (only `drag-drop` is used: repo-list.ts:1, repo-header.ts:1). Options: `@angular/cdk/menu` (`CdkMenuTrigger`, `CdkMenu`, `CdkMenuItem`, keyboard support built in) and `@angular/cdk/dialog`, or a hand-made popover with `aria-expanded`/`aria-haspopup="menu"` and `(keydown.escape)`. The Settings-menu work in the other worktree (`packages/web/src/app/settings/`) is building a popover too. Look there for a shared approach to closing on Escape and outside clicks.
- Inline confirm: `role="alertdialog"` with a danger "Yes" button and "Cancel":
  - Exit: app.html:42-48 (`confirmingExit = signal(false)`).
  - Remove Service: remove-service/remove-service.ts:27-37 (`class="danger"`, `(click)="closed.emit()"`).
  - Session close: terminal/terminal-tab-strip.html:16 (`(keydown.escape)="cancelClose()"`).
  - Specs find them with `[role=alertdialog]` and button text (edit-local-config.spec.ts:201-222).
- Form with Server refusals: add-service/add-service.ts:
  - `busy` / `rejection` signals; `submit()` awaits the Promise command and catches `UiErrorInfo` into `describeError(error)` (:170-184).
  - Field errors render as `<div class="field-error" role="alert" data-field-error="name">` (:44-46). General errors render as `<dp-error-message [message] [details]>` (:92-96).
  - Inputs are labelled with `[attr.aria-label]` from strings. Checkbox list pattern in a `fieldset`/`legend` (:77-90): `<input type="checkbox" [value]="service.id" [checked]="set.has(id)" (change)="toggle(id)">`.
  - The Save button is disabled on an empty trim (:98).
- Repo color: `repoColor(repo)` (repo-color.ts:7) for the dialog's grouping by Repo (spec story 2).
- Status/service hooks in repo-list.html: `[attr.data-repo-id]` (:12), `li.service[attr.data-service-id]` (:60), `.status-dot.status-<status>` (:62-66).

## UI strings
- English `strings.en.ts` defines the type `UiStrings`. Russian `strings.ts` must match (compile error otherwise). Components read `STRINGS` from `ui-strings.ts`.
- Sections to mirror: `actions` (en :175-187; ru `strings.ts:179-190`), `editConfig` (form/confirm wording, en :138-159), `errors` (en :287-357). Accessible-name helpers take names, e.g. `serviceAction: (action, serviceName) => \`${action} ${serviceName}\``.
- Add a `serviceSets` section: menu label "Service Sets", "New Service Set…", edit label per Set (`(name) => \`Edit ${name}\``), dialog title, name label, checkbox label `(repoName, serviceName)`, "not found" label/announcement, Save/Delete/Cancel, delete question, and the start-result message builder.
- Errors in both sets: `serviceSetNameTaken: (p) => ...`, `serviceSetEmpty: () => ...`, `serviceSetNotFound: () => ...`.
- RU term: "Набор". Use `Сервис`/`Репо` as the RU file already does.
- Specs find elements by `data-*`, status classes and **English** `aria-label`s, so keep those hooks stable.

## FakeTransport (backend/fake-transport.ts)
- `connectWith(snapshot)` = `open()` + `replySnapshot`. `transport.lastCommand('x')` returns `{ id, type, payload }`; `transport.commands('x')` returns all of them. `await transport.reply(cmd, result)`, `await transport.fail(cmd, errorInfo)`, `transport.emit('event', payload)`.
- `TestSnapshot` (:14) has to be extended for `serviceSets` (see 01-shared-core.md).
- Builders: `aRepo({ id, name?, color?, services? })`, `aService({ id, status?, ... })` (backend/test-data.ts).

## Prior-art specs
- Setup (identical in all three): `TestBed.configureTestingModule({ imports: [App], providers: [{ provide: BACKEND_TRANSPORT, useValue: transport }] })`, `fixture = TestBed.createComponent(App)`, `await fixture.whenStable()`.
- `stop-all.spec.ts`:
  - `button(root, ariaLabel)` helper (:22-26); clicking the top-bar button, then `transport.lastCommand('stopAllRepos').payload` (:66-72).
  - A plain-language error after `transport.fail(...)`, then `.errors` textContent (:74-89).
- `edit-local-config.spec.ts`:
  - Helpers `buttonIn(root, text)`, `field(root, ariaLabel)`, `type(input, value)` (dispatches `input`) at :32-51.
  - Form submit plus reply closes the form (:101-126); refusal shown next to a field (:128-151); confirm dialog flow (:201-222).
- `reorder-repos.spec.ts`:
  - Following server events (`transport.emit('reposReordered', ...)`) (:107-115).
  - Optimistic update rolled back on `fail` (:70-88); `.error` textContent check (:86).
- Zoneless: `await fixture.whenStable()` after each action, and `await` every `reply`/`fail`.
- Run: `cd packages/web && npx ng test --watch=false --include app/service-sets.spec.ts`.
