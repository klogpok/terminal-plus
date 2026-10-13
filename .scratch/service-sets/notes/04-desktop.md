# Desktop (packages/desktop)

## RunningServer (src/desktop-app.ts:24-35)
```ts
export interface RunningServer {
  openUrl: string;
  close(): Promise<void>;
  stopAllRepos(): Promise<void>;
  uiLanguage(): UiLanguage;
  onUiLanguageChanged(listener: (language: UiLanguage) => void): void;
}
```
Add (spec + ticket 05), for example:
```ts
  /** The Service Sets, in creation order. */
  serviceSets(): ServiceSetView[];
  /** Calls `listener` after each change (`serviceSetsChanged`). */
  onServiceSetsChanged(listener: (sets: ServiceSetView[]) => void): void;
  startServiceSet(id: string): Promise<{ notFound: ServiceRef[]; notRunning: ServiceRef[] }>;
```
The test `FakeServer` (test/desktop-app.test.ts:149-191) must implement them, or the desktop typecheck fails.

## Sidecar wiring (src/sidecar.ts:51-59)
```ts
startServer: async (onExit) => {
  const devPanel = await startDevPanel({ appDataDir, port, webRoot, shell: connection.desktopShell, onExit });
  return {
    openUrl: devPanel.openUrl,
    close: () => devPanel.close(),
    stopAllRepos: () => devPanel.core.stopAllRepos(),
    uiLanguage: () => devPanel.core.uiLanguage,
    onUiLanguageChanged: (listener) => devPanel.core.on('uiLanguageChanged', (e) => listener(e.language)),
  };
},
```
Add `serviceSets: () => devPanel.core.snapshot().serviceSets` (or a cheaper core getter such as `core.listServiceSets()`), `onServiceSetsChanged: (l) => devPanel.core.on('serviceSetsChanged', (e) => l(e.serviceSets))`, and `startServiceSet: (id) => devPanel.core.startServiceSet({ id })`.

## Tray build/rebuild (src/desktop-app.ts:161-206)
- `renderMenu()` reads `server.uiLanguage()` and `HOST_STRINGS[language].desktop`, then calls `tray.setToolTip` and `tray.setMenu([...])`. Current items and ids:
  `show` | `stopAllRepos` | `separator-1` (separator) | `autostart` (checkbox) | `separator-2` | `quit`.
- It is rebuilt on `server.onUiLanguageChanged(() => { renderMenu(); publishCrashTexts(); })` (:201-204) and on `host.onAutostartChanged(renderMenu)` (:205). Add `server.onServiceSetsChanged(renderMenu)`.
- Insert the Set items between `show` and `stopAllRepos`: `{ id: \`serviceSet:${set.id}\`, label: set.name, click: () => startSet(set.id) }`. Any extra separators need unique ids (e.g. `separator-sets`).
- Error-handling precedent for a tray action (:170-179): `server.stopAllRepos().catch(...)` shows `host.showError({ title, message, details: errorDetails(error), language: now })`, reading the UI Language **at failure time**. For Sets the spec says: on a non-empty result **or** a rejection, call `window.show()`, and stay quiet on success. Whether to show an error dialog as well on rejection is not specified.
- `TrayMenuItem` (:49-56): `{ id, label, type?, checked?, click? }`. `protocol-host.ts:86-115` maps the items to `setTray` (`kind: type ?? 'normal'`) and batches one message per synchronous rebuild (microtask). Clicks come back as `trayItemClicked { itemId }`, matched by id against the **last** item list (:151-155).

## HOST_STRINGS (packages/shared/src/strings.ts:42-62 en, :90-108 ru)
Set labels are user-entered names, so only new fixed texts (an optional section label such as "Service Sets" / "Наборы", or an error dialog) go here, in both sets. Russian text is allowed only in this file (lint).

## Tray tests to copy (test/desktop-app.test.ts)
- Harness: `setup(overrides)` returns `{ host, server, options, exitFromUi }` (:198-215). `await runDesktop(options)`. `host.tray!.item(label).click!()` (`FakeTray.item` throws listing labels, :71-75). `await flush()` (:196) after async clicks. `host.window!.visible` / `.shows` (:31-53).
- stopAllRepos tests:
  - Menu labels list (:246-256), which **asserts the exact non-separator labels**. With no Sets the list must stay the same, so the FakeServer must default to `[]`.
  - Russian (:258-270); rebuild on language change (:272-290).
  - The click calls `server.stopAllCalls` (:303-311); failure gives a dialog (:313-328, :292-301).
- New tests:
  - Sets listed in order between Show and Stop everything.
  - Rebuilt when the FakeServer fires its listeners.
  - Click calls `startServiceSet(id)`.
  - `window.visible`/`shows` stay unchanged on an empty result. For that, start hidden (`setup({ startHidden: true })`) or call `host.window!.hide()` first; otherwise the window is already visible from start.
  - The window is shown on a non-empty result and on a rejection.

## Shared protocol fixture with Rust
- `test/fixtures/protocol.jsonl`: one sample line per message, parsed by `test/protocol.test.ts` (TS) and `src-tauri/src/protocol.rs` tests (Rust). Tray items already travel as `{id,label,kind,checked?}`, so **no protocol or Rust change** is needed. Optionally add a Set item to the `setTray` sample line (line 11); both sides must still parse it.
- `src-tauri/src/tray.rs:50-74` builds `MenuItem::with_id(app, &item.id, &item.label, ...)`. Ids are arbitrary strings.
- **Risk:** on Windows, muda/Tauri menu text treats `&` as a mnemonic marker. A Set named "R&D" would show as "RD" with an underlined D. Escape `&` as `&&` in the label on the TS side. No Rust change is needed.
- **sidecar e2e** (`test/sidecar.e2e.test.ts:211-214`) asserts the exact tray ids `['show','stopAllRepos','separator-1','autostart','separator-2','quit']` on a fresh app data dir. With no Sets, add **no extra separator or section item**, or update that assertion.

## UX gap to flag
A tray start whose result has only `notFound` (or `notRunning` without a visible status change) opens the window, but the web UI shows no message: the panel did not send the command, so nothing in the web explains the result. The spec says the window opens "so the user sees what went wrong". For notRunning, the Statuses and port-conflict prompts show the problem. For notFound, nothing does, unless the dialog's "not found" marks count. Consider a host dialog, or broadcasting the result.
