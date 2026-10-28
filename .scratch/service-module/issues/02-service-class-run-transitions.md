# 02: `Service` class owns spawn, readiness, stop, exit and Dismiss

**What to do:** Create `packages/core/src/service.ts` with the class `Service` (extends `Terminal`), which replaces `ServiceState`, and the `ServiceContext` / `ServiceEmitter` it needs (spec decisions 1, 3, 5, 8, 11, 13). Move the run transitions out of `core.ts` into it. `DevPanelCore`'s public interface does not change.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `Service` takes `(repo: RepoState, definition, ctx: ServiceContext)`. `ServiceContext` holds a narrow emitter, the `ProcessRecorder`, `CoreTimings`, `uiLanguage()` and `checkReleased(service)`. `DevPanelCore` builds one context and passes it to every Service it creates (`applyDefinitions`, `createRepo`).
- [ ] Move into `Service`:
  - `spawn`: restart separator, `lastExit` reset, `spawnService`, PID file `track`/`forget`, readiness, output tail, exit handling;
  - `onReadinessChange`;
  - `stopService` as `stop(gracefulMs?)`, calling `ctx.checkReleased` after the exit;
  - `dismissExit` as `dismiss()`;
  - `appendOutput`, `setStatus`, `isLive`;
  - the service part of `repoView` as `view(): ServiceView`.
- [ ] Fields that tickets 02-05 own become private, or read-only from outside through getters. Fields still written by core until a later ticket (`launch`, `waitingFor`, `pending`, `removed`, `portConflict`) may stay public until that ticket.
- [ ] `spawnService` is called directly; no process factory in the context.
- [ ] `getServiceOutput` / `writeToPty` / `resizePty` keep working unchanged (they use `Terminal`).
- [ ] No test changes, apart from imports if a test referenced `ServiceState`.
- [ ] `pnpm check` passes. Run `start-stop`, `service-lifecycle`, `readiness`, `depends-on` and `port-conflicts` 5 times in a row.

## Русский перевод

# 02: Класс `Service` владеет spawn, readiness, stop, exit и Dismiss

**Что сделать:** создать `packages/core/src/service.ts` с классом `Service` (наследует `Terminal`), который заменяет `ServiceState`, и нужные ему `ServiceContext` / `ServiceEmitter` (решения 1, 3, 5, 8, 11, 13 спеки). Перенести в него переходы запуска из `core.ts`. Публичный interface `DevPanelCore` не меняется.

**Блокируется:** 01

**Статус:** ready-for-agent

- [ ] `Service` принимает `(repo: RepoState, definition, ctx: ServiceContext)`. В `ServiceContext` лежат узкий emitter, `ProcessRecorder`, `CoreTimings`, `uiLanguage()` и `checkReleased(service)`. `DevPanelCore` создаёт один context и передаёт его каждому создаваемому Service (`applyDefinitions`, `createRepo`).
- [ ] Перенести в `Service`:
  - `spawn`: restart separator, сброс `lastExit`, `spawnService`, `track`/`forget` в PID-файле, readiness, хвост вывода, обработку выхода;
  - `onReadinessChange`;
  - `stopService` в виде `stop(gracefulMs?)`, с вызовом `ctx.checkReleased` после выхода;
  - `dismissExit` в виде `dismiss()`;
  - `appendOutput`, `setStatus`, `isLive`;
  - часть `repoView` про Service в виде `view(): ServiceView`.
- [ ] Поля, которыми владеют тикеты 02-05, становятся private или доступны снаружи только на чтение через геттеры. Поля, которые core ещё пишет до своего тикета (`launch`, `waitingFor`, `pending`, `removed`, `portConflict`), могут оставаться публичными до этого тикета.
- [ ] `spawnService` вызывается напрямую; фабрики процессов в context нет.
- [ ] `getServiceOutput` / `writeToPty` / `resizePty` работают как раньше (через `Terminal`).
- [ ] Тесты не меняются, кроме импортов, если тест ссылался на `ServiceState`.
- [ ] `pnpm check` проходит. `start-stop`, `service-lifecycle`, `readiness`, `depends-on` и `port-conflicts` прогнать 5 раз подряд.
