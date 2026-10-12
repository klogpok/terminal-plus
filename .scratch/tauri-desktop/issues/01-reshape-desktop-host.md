# 01: Reshape the desktop host for the shell–sidecar split

Spec: `.scratch/tauri-desktop/spec.md`

**What to build:** A prefactor that makes the Tauri move easy while the Electron desktop app keeps working unchanged for the user. `runDesktop` stops owning the single-instance lock: the host adapter takes it before the desktop behaviour starts. In Electron, the adapter takes the lock before calling `runDesktop`, and a second launch still shows the running window. Start with Windows becomes state the host reports, and the behaviour asks the host to change it. The tray checkmark follows the reported state, and toggling it asks the host and re-renders once the host confirms. The behaviour also publishes the crash texts (title and message shown if the DevPanel Server stops unexpectedly) to the host at start and after every UI Language change. These texts are new `HostStrings` entries in both UI Languages. The Electron adapter accepts the crash texts and ignores them.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The desktop host interface no longer has single-instance members; the Electron adapter takes the lock and shows the window on a second launch before or around `runDesktop`.
- [x] Start with Windows: the host reports the current state, the behaviour asks it to change, and the tray checkmark reflects what the host reports.
- [x] Crash dialog title and message exist in `HostStrings` for English and Russian (compile error if one is missing).
- [x] The behaviour hands the crash texts to the host at start and again after each UI Language change.
- [x] The desktop unit tests (fake host) cover: autostart toggling through the host, crash texts at start and after a language change. The single-instance cases move out of this suite or are adapted to the adapter.
- [x] The Electron end-to-end test still passes; the Electron desktop app behaves as before.
- [x] `pnpm check` passes.

## Русский перевод

# 01: Перестроить десктопный хост под разделение оболочка–sidecar

Спецификация: `.scratch/tauri-desktop/spec.md`

**Что сделать:** Префакторинг, который упрощает переезд на Tauri; для пользователя Electron-приложение работает как прежде. `runDesktop` больше не владеет блокировкой единственного экземпляра: её берёт адаптер хоста до запуска поведения десктопа. В Electron адаптер берёт блокировку до вызова `runDesktop`, и повторный запуск по-прежнему показывает работающее окно. Автозапуск с Windows становится состоянием, о котором сообщает хост; поведение просит хост его изменить. Галочка в трее следует сообщённому состоянию, а переключение просит хост и перерисовывает меню после подтверждения. Поведение также передаёт хосту тексты аварии (заголовок и сообщение на случай неожиданной остановки Сервера DevPanel) при старте и после каждой смены Языка интерфейса. Эти тексты — новые записи `HostStrings` на обоих Языках интерфейса. Electron-адаптер принимает тексты аварии и игнорирует их.

**Блокируется:** ничем (можно начинать сразу)

**Статус:** resolved

- [x] В интерфейсе десктопного хоста нет членов для единственного экземпляра; Electron-адаптер берёт блокировку и показывает окно при повторном запуске до или вокруг `runDesktop`.
- [x] Автозапуск с Windows: хост сообщает текущее состояние, поведение просит изменить его, галочка в трее отражает то, что сообщил хост.
- [x] Заголовок и текст диалога аварии есть в `HostStrings` на английском и русском (ошибка компиляции, если одного не хватает).
- [x] Поведение передаёт тексты аварии хосту при старте и снова после каждой смены Языка интерфейса.
- [x] Юнит-тесты десктопа (фейковый хост) покрывают переключение автозапуска через хост и тексты аварии при старте и после смены языка. Случаи единственного экземпляра уходят из этого набора или переносятся на адаптер.
- [x] Electron e2e-тест по-прежнему проходит; Electron-приложение ведёт себя как раньше.
- [x] `pnpm check` проходит.
