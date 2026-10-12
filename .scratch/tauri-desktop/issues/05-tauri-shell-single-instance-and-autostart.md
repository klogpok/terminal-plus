# 05: Tauri shell: single instance and Start with Windows

Spec: `.scratch/tauri-desktop/spec.md`

**What to build:** Launching the Tauri app a second time brings up the running window, and the second launch exits at once, before any sidecar starts, so there is never a second Server or a second Node process. Start with Windows works from the tray. The shell reports the current autostart state in `start`. On `setAutostart` it turns the Windows autostart entry on or off, then confirms with `autostartChanged`, and the tray checkmark follows. The entry launches the app with `--hidden`, so after sign-in DevPanel starts in the tray without a window. The shell passes the hidden start to the sidecar in `start`.

**Blocked by:** 03

**Status:** resolved

- [x] A second launch shows and focuses the running window and exits without spawning a sidecar (no second `node.exe`).
- [x] Start with Windows is off by default; toggling it in the tray creates or removes the autostart entry and the checkmark follows the shell's confirmation.
- [x] The autostart entry starts the app with `--hidden`; started that way, the window stays hidden until opened from the tray.
- [ ] Checked by hand (second launch, toggle, sign-out/sign-in); automated second-launch check comes in ticket 06.
- [x] `desktop:check` and `pnpm check` pass.

## Русский перевод

# 05: Оболочка Tauri: единственный экземпляр и автозапуск с Windows

Спецификация: `.scratch/tauri-desktop/spec.md`

**Что сделать:** Повторный запуск Tauri-приложения показывает работающее окно, а сам повторный запуск сразу завершается — до старта какого-либо sidecar, поэтому второго Сервера или второго процесса Node никогда не бывает. Автозапуск с Windows работает из трея. Оболочка сообщает текущее состояние автозапуска в `start`. По `setAutostart` она включает или выключает запись автозапуска Windows, затем подтверждает это через `autostartChanged`, и галочка в трее следует за ним. Запись запускает приложение с `--hidden`, поэтому после входа в систему DevPanel стартует в трее без окна. Скрытый старт оболочка передаёт sidecar в `start`.

**Блокируется:** 03

**Статус:** resolved

- [x] Повторный запуск показывает работающее окно, переводит на него фокус и завершается, не запуская sidecar (второго `node.exe` нет).
- [x] Автозапуск по умолчанию выключен; переключение в трее создаёт или удаляет запись автозапуска, а галочка следует подтверждению оболочки.
- [x] Запись автозапуска запускает приложение с `--hidden`; при таком запуске окно скрыто, пока его не откроют из трея.
- [ ] Проверено вручную (повторный запуск, переключение, выход и вход в систему); автоматическая проверка повторного запуска — в тикете 06.
- [x] `desktop:check` и `pnpm check` проходят.
