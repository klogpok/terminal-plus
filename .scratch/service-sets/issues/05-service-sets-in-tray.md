# 05: Start a Service Set from the tray

**What to build:** The desktop tray menu lists the user's Service Sets, one item each, between "Show" and "Stop everything in all Repos", in the current UI Language and rebuilt whenever Service Sets change. Clicking an item starts that Set without opening the window. When some Service of the Set was not found or did not reach `running`, or the start fails, DevPanel shows its window so the user sees what went wrong; a fully successful start stays quiet. Spec: `.scratch/service-sets/spec.md`.

**Blocked by:** 02 (Start a Service Set from the panel).

**Status:** resolved

- [x] `RunningServer` exposes the Service Sets list, a change listener and `startServiceSet`; the sidecar wires them to the core.
- [x] Tray items have stable ids derived from the Set id; the menu is rebuilt on `serviceSetsChanged` as it is on `uiLanguageChanged`; any new tray text is in `HOST_STRINGS` for both UI Languages.
- [x] Clicking an item calls `startServiceSet`; the window is shown on a non-empty result or a rejection, and not on success.
- [x] No change to the Rust shell is needed (tray items already travel as id + label); the shared protocol fixture still passes on both sides.
- [x] Desktop tests with fake `DesktopHost` / `RunningServer` cover listing, rebuilding, starting, and showing the window only on failure.
- [x] `pnpm check` passes.

## Русский перевод

# 05: Запустить Набор из трея

**Что сделать:** Меню трея десктопного приложения показывает Наборы пользователя, по пункту на каждый, между «Показать» и «Остановить всё во всех Репо». Пункты на текущем Языке интерфейса, а меню перестраивается при каждом изменении Наборов. Клик по пункту запускает Набор, не открывая окно. Если какой-то Сервис Набора не найден или не дошёл до `running` либо запуск не удался, DevPanel показывает своё окно, чтобы пользователь увидел, что пошло не так. Полностью удачный запуск проходит тихо. Спецификация: `.scratch/service-sets/spec.md`.

**Заблокирован:** 02 (Запустить Набор из панели).

**Статус:** resolved

- [x] `RunningServer` отдаёт список Наборов, подписку на его изменения и `startServiceSet`. Sidecar связывает их с core.
- [x] У пунктов трея стабильные id, выведенные из id Набора. Меню перестраивается по `serviceSetsChanged`, как сейчас по `uiLanguageChanged`. Любой новый текст трея лежит в `HOST_STRINGS` для обоих Языков интерфейса.
- [x] Клик по пункту вызывает `startServiceSet`. Окно показывается при непустом результате или отказе и не показывается при успехе.
- [x] Rust-оболочку менять не нужно (пункты трея уже передаются как id + подпись). Общая фикстура протокола по-прежнему проходит с обеих сторон.
- [x] Тесты десктопа с фейками `DesktopHost` / `RunningServer` покрывают показ списка, перестройку меню, запуск и показ окна только при неудаче.
- [x] `pnpm check` проходит.
