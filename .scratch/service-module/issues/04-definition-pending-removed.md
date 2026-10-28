# 04: `Service` owns "a definition never changes under a live process"

**What to do:** Move the pending/removed rule from `applyDefinitions` and `settleAfterExit` into `Service` (spec decision 2). Core keeps building `repo.services` and emitting `configChanged`.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `Service.applyDefinition(definition | 'removed')`:
  - a Service that is not live takes the new definition at once and clears `pending`;
  - a live one keeps its definition and records `pending` (none if it is the same definition) or `removed`;
  - a definition that comes back clears `removed`.
- [ ] After its exit the Service applies `pending` or, if `removed`, reports it. Either way it calls `ctx.definitionSettled(this)`. Core then deletes the Service from `repo.services` if it was removed and is still the one in the map, and emits `configChanged` with `repoView`. The guard `repo.services.get(id) !== service` stays.
- [ ] `applyDefinitions` keeps only the map building: new definitions get `new Service(...)`; known ones get `applyDefinition`; live ones missing from the config get `applyDefinition('removed')` and stay in the map.
- [ ] `pending` and `removed` are private. `view()` exposes them as `configChanged` / `removedFromConfig`, as today.
- [ ] `pnpm check` passes. Run `config-lifecycle` 5 times in a row.

## Русский перевод

# 04: `Service` владеет правилом «definition не меняется под живым процессом»

**Что сделать:** перенести правило pending/removed из `applyDefinitions` и `settleAfterExit` в `Service` (решение 2 спеки). Core по-прежнему собирает `repo.services` и эмитит `configChanged`.

**Блокируется:** 02

**Статус:** ready-for-agent

- [ ] `Service.applyDefinition(definition | 'removed')`:
  - Service без живого процесса сразу берёт новый definition и очищает `pending`;
  - живой Service оставляет свой definition и записывает `pending` (если definition тот же — ничего) или `removed`;
  - вернувшийся в конфиг definition снимает `removed`.
- [ ] После выхода Service применяет `pending` или, если он `removed`, сообщает об этом. В обоих случаях он вызывает `ctx.definitionSettled(this)`. Core затем удаляет Service из `repo.services`, если тот удалён из конфига и в Map всё ещё лежит именно он, и эмитит `configChanged` с `repoView`. Проверка `repo.services.get(id) !== service` остаётся.
- [ ] В `applyDefinitions` остаётся только сборка Map: для новых definition создаётся `new Service(...)`, для известных вызывается `applyDefinition`, живые Service, которых нет в конфиге, получают `applyDefinition('removed')` и остаются в Map.
- [ ] `pending` и `removed` — private. `view()` отдаёт их как `configChanged` / `removedFromConfig`, как сейчас.
- [ ] `pnpm check` проходит. `config-lifecycle` прогнать 5 раз подряд.
