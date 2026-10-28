# 05: `portConflict` behind `Service.setPortConflict`; docs

**What to do:** The last public mutable field moves behind `Service` (spec decision 7). `docs/architecture.md` describes the new module.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] `Service.setPortConflict(conflict?)` sets the field only when it changed (today's `JSON.stringify` check in `port-conflicts.ts:194`) and emits `portConflictChanged` through the Service's emitter.
- [ ] `PortConflicts` calls it instead of writing `service.portConflict` and emitting. `PortConflictHost` loses `emit`. It reads the conflict through a getter (`resolve` needs `portConflict?.reason`).
- [ ] No public mutable field is left on `Service`. `state.ts` keeps only `RepoState`, `Launch` and `InstallRun`. If `Launch` is used only by `Service` by now, move it into `service.ts`.
- [ ] `docs/architecture.md`, `core` paragraph:
  - add `service.ts` (a Service with its own lifecycle: run transitions, launch slot, waiting, pending/removed definition, port conflict; the launch body and dependency graph stay in `core.ts`);
  - update `state.ts`.
- [ ] Set `Status: resolved` on tickets 01-05 and the spec.
- [ ] `pnpm check` passes. Run `port-conflicts` 5 times in a row.

## Русский перевод

# 05: `portConflict` за `Service.setPortConflict`; документация

**Что сделать:** последнее публичное изменяемое поле прячется за `Service` (решение 7 спеки). В `docs/architecture.md` появляется описание нового module.

**Блокируется:** 03, 04

**Статус:** ready-for-agent

- [ ] `Service.setPortConflict(conflict?)` меняет поле только при реальном изменении (как нынешняя проверка через `JSON.stringify` в `port-conflicts.ts:194`) и эмитит `portConflictChanged` через emitter этого Service.
- [ ] `PortConflicts` вызывает этот метод вместо прямой записи в `service.portConflict` и своего эмита. `PortConflictHost` теряет `emit`. Конфликт читается через геттер (`resolve` нужен `portConflict?.reason`).
- [ ] У `Service` не остаётся публичных изменяемых полей. В `state.ts` остаются только `RepoState`, `Launch` и `InstallRun`. Если к этому моменту `Launch` использует только `Service`, перенести его в `service.ts`.
- [ ] `docs/architecture.md`, абзац про `core`:
  - добавить `service.ts` (Service с собственным жизненным циклом: переходы запуска, слот launch, ожидание, definition с pending/removed, конфликт порта; тело запуска и граф зависимостей остаются в `core.ts`);
  - обновить описание `state.ts`.
- [ ] Выставить `Status: resolved` в тикетах 01-05 и в спеке.
- [ ] `pnpm check` проходит. `port-conflicts` прогнать 5 раз подряд.
