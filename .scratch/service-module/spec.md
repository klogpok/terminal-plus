# Service module: a Service that owns its own lifecycle

**Status:** ready-for-agent (design agreed in grilling, 2026-10-22)

**Kind:** refactoring inside `packages/core`. No behaviour change, no change to the wire contract (`shared`), no new domain term. Per `CLAUDE.md` no further spec round is needed; the tickets in `issues/` are the work.

## Why

`ServiceState` (`packages/core/src/state.ts`) is a `Terminal` plus ten public mutable fields (`status`, `stopping`, `readiness`, `lastExit`, `launch`, `waitingFor`, `pending`, `removed`, `portConflict`, `runId`, and `process`). Its invariants are written only as field comments ("`lastExit` present only while crashed/exited", "`readiness` only while starting/unhealthy"). The code that keeps them is spread over `core.ts`:

- `spawn` (767-820)
- `onReadinessChange` (823)
- `stopService` (835)
- `dismissExit` (867)
- `shutdown` (1003)
- `applyDefinitions` / `settleAfterExit` (1177-1216)
- `port-conflicts.ts:194`, which writes `portConflict` directly

`core.ts` is the most changed file in the repo (1320 lines, 42 public members). Sessions (`sessions.ts`) and Service Sets (`service-sets.ts`) already sit behind narrow modules. Services do not.

## Decisions

1. **Shape: a Service object with behaviour.** A class `Service` in `packages/core/src/service.ts` replaces `ServiceState`. Its fields become private and it keeps its own invariants. It is not a separate collection like `Sessions`: Services stay in `RepoState.services`, which `applyDefinitions` rebuilds on every config reload.
2. **Definitions.** The rule "a definition never changes under a live process" (pending/removed) belongs to `Service`. Core keeps building the `Map` and emitting `configChanged`.
3. **Events.** `Service` emits through a narrow emitter, like `SessionEmitter`. The events are `statusChanged`, `exit`, `log`, `waitingChanged` and `portConflictChanged`. Moving to a whole `serviceChanged` event later (architecture review candidate 2) then changes one place.
4. **Scope.** Pure refactoring; candidate 2 is not part of it.
5. **Dependencies.** One `ServiceContext` per `DevPanelCore`, plus a read-only reference to the Service's `RepoState`, both given to the constructor. The reference cannot go stale: `relocateRepo` refuses while processes run and creates new `RepoState`s and Services (`core.ts:409-422`).
6. **Launch.** `Service` owns the launch slot. It deduplicates concurrent starts, holds the `AbortController` and `waitingFor`, and `stop()` aborts the launch. The launch body stays in core: the pnpm check, `ports.ensureFree`, and the dependency graph in `startDependency`.
7. **Port conflicts.** `Service.setPortConflict(c?)` sets the field and emits `portConflictChanged`. `PortConflicts` calls it, and `PortConflictHost` loses `emit`.
8. **Name.** `Service` in `service.ts`. The term is already in `GLOSSARY.md`. `state.ts` keeps `RepoState`, `Launch` and `InstallRun`.
9. **Tests.** `DevPanelCore` stays the main test seam, through the harness and real processes. Before moving code, invariants that are not covered get tests through `DevPanelCore`. They must pass before and after.
10. **Waiting.** `Service.settled(signal)` replaces `settledStatus`. The Service keeps its own waiters and resolves them in its `setStatus`, so there are no global `statusChanged` listeners. `setMaxListeners(0)` goes away: in production the only listeners are the one per event that `server.ts:91` adds.
11. **No spawn seam.** `spawnService` is called directly. `docs/architecture.md` says "core tests run real processes (no OS adapter)", and with only one adapter the seam would be hypothetical.
12. **Delivery.** Branch `service-module`, one green commit per ticket.
13. Without a separate question:
    - `view(): ServiceView` moves from `repoView` into `Service`;
    - `appendOutput` (buffer + `log`) moves into `Service`;
    - `isLive` becomes `Service.isLive`.

## Shape (sketch, not final signatures)

```ts
interface ServiceContext {            // one per DevPanelCore
  emitter: ServiceEmitter;            // statusChanged, exit, log, waitingChanged, portConflictChanged
  recorder: ProcessRecorder;
  timings: CoreTimings;
  uiLanguage(): UiLanguage;           // restart separator
  checkReleased(s: Service): Promise<void>;   // PortConflicts after a Stop
  definitionSettled(s: Service): void;        // core drops it from the Map / emits configChanged
}

class Service extends Terminal {
  constructor(repo: RepoState, definition: ServiceDefinition, ctx: ServiceContext)
  get status / name / definition / isLive
  start(body: (signal: AbortSignal) => Promise<void>): Promise<void>  // launch slot, deduplication
  setWaiting(depIds?: string[]): void
  settled(signal: AbortSignal): Promise<ServiceStatus>
  spawn(): void                       // separator, lastExit, readiness, PID file, exit handling
  stop(gracefulMs?: number): Promise<void>   // aborts the launch, disposes readiness
  dismiss(): void
  setPortConflict(conflict?: PortConflict): void
  applyDefinition(definition: ServiceDefinition | 'removed'): void
  view(): ServiceView
}
```

## Out of scope

- A `serviceChanged` event, i.e. a whole `ServiceView` per change (candidate 2: wire contract, needs its own spec).
- Service Status predicates in `shared` (candidate 4: a separate fix for "Stop all" with `waitingFor`).
- Any change to `sessions.ts`, `service-sets.ts` beyond calling `settled`, `server`, `web`.

## Tickets

- `issues/01-cover-service-invariants.md`
- `issues/02-service-class-run-transitions.md`
- `issues/03-launch-slot-and-settled.md`
- `issues/04-definition-pending-removed.md`
- `issues/05-port-conflict-and-docs.md`

## Русский перевод

# Service module: Service сам владеет своим жизненным циклом

**Статус:** ready-for-agent (дизайн согласован в grilling, 2026-10-22)

**Вид работы:** рефакторинг внутри `packages/core`. Поведение и wire-контракт (`shared`) не меняются, новых доменных терминов нет. По `CLAUDE.md` отдельный раунд спеки не нужен; работа — это тикеты в `issues/`.

## Зачем

`ServiceState` (`packages/core/src/state.ts`) — это `Terminal` плюс десять публичных изменяемых полей (`status`, `stopping`, `readiness`, `lastExit`, `launch`, `waitingFor`, `pending`, `removed`, `portConflict`, `runId`, а также `process`). Его инварианты записаны только в комментариях к полям («`lastExit` есть только в crashed/exited», «`readiness` только в starting/unhealthy»). Код, который их соблюдает, разбросан по `core.ts`:

- `spawn` (767-820)
- `onReadinessChange` (823)
- `stopService` (835)
- `dismissExit` (867)
- `shutdown` (1003)
- `applyDefinitions` / `settleAfterExit` (1177-1216)
- `port-conflicts.ts:194`, который пишет `portConflict` напрямую

`core.ts` — самый часто меняемый файл репозитория (1320 строк, 42 публичных члена). Sessions (`sessions.ts`) и Service Sets (`service-sets.ts`) уже вынесены за узкие module. Services — нет.

## Решения

1. **Форма: Service — объект с поведением.** Класс `Service` в `packages/core/src/service.ts` заменяет `ServiceState`. Его поля становятся private, и он сам держит свои инварианты. Это не отдельная коллекция, как `Sessions`: Services остаются в `RepoState.services`, которую `applyDefinitions` пересобирает при каждой перезагрузке конфига.
2. **Definition.** Правилом «definition не меняется под живым процессом» (pending/removed) владеет `Service`. Core по-прежнему собирает `Map` и эмитит `configChanged`.
3. **События.** `Service` эмитит через узкий emitter, как `SessionEmitter`. События: `statusChanged`, `exit`, `log`, `waitingChanged` и `portConflictChanged`. Если позже перейти на целое событие `serviceChanged` (кандидат 2 из архитектурного обзора), менять придётся одно место.
4. **Объём.** Чистый рефакторинг; кандидат 2 в него не входит.
5. **Зависимости.** Один `ServiceContext` на `DevPanelCore` и readonly-ссылка на `RepoState` этого Service; оба передаются в конструктор. Ссылка не может устареть: `relocateRepo` отказывает, пока есть живые процессы, и создаёт новые `RepoState` и Service (`core.ts:409-422`).
6. **Launch.** Слотом запуска владеет `Service`. Он дедуплицирует одновременные запуски, хранит `AbortController` и `waitingFor`, а `stop()` отменяет запуск. Тело запуска остаётся в core: pnpm check, `ports.ensureFree` и граф зависимостей в `startDependency`.
7. **Конфликты портов.** `Service.setPortConflict(c?)` выставляет поле и эмитит `portConflictChanged`. `PortConflicts` вызывает этот метод, а `PortConflictHost` теряет `emit`.
8. **Имя.** `Service` в `service.ts`. Термин уже есть в `GLOSSARY.md`. В `state.ts` остаются `RepoState`, `Launch` и `InstallRun`.
9. **Тесты.** Главным test seam остаётся `DevPanelCore` — через harness и реальные процессы. До переноса кода на непокрытые инварианты пишутся тесты через `DevPanelCore`. Они должны проходить и до, и после.
10. **Ожидание.** `Service.settled(signal)` заменяет `settledStatus`. Service сам хранит список ожидающих и разрешает их в своём `setStatus`, так что глобальных слушателей `statusChanged` больше нет. `setMaxListeners(0)` уходит: в продакшене остаются только слушатели, которые `server.ts:91` вешает по одному на событие.
11. **Seam на spawn не вводим.** `spawnService` вызывается напрямую. В `docs/architecture.md` сказано «core tests run real processes (no OS adapter)», а при единственном adapter seam был бы гипотетическим.
12. **Поставка.** Ветка `service-module`, по одному зелёному коммиту на тикет.
13. Без отдельного вопроса:
    - `view(): ServiceView` переезжает из `repoView` в `Service`;
    - `appendOutput` (буфер + `log`) переезжает в `Service`;
    - `isLive` становится `Service.isLive`.

## Форма (эскиз, сигнатуры не окончательные)

См. блок кода в английской части.

## Вне объёма

- Событие `serviceChanged`, то есть целый `ServiceView` на каждое изменение (кандидат 2: wire-контракт, нужна своя спека).
- Предикаты Service Status в `shared` (кандидат 4: отдельный фикс «Stop all» при `waitingFor`).
- Любые изменения в `sessions.ts`, в `service-sets.ts` (кроме вызова `settled`), в `server` и `web`.

## Тикеты

- `issues/01-cover-service-invariants.md`
- `issues/02-service-class-run-transitions.md`
- `issues/03-launch-slot-and-settled.md`
- `issues/04-definition-pending-removed.md`
- `issues/05-port-conflict-and-docs.md`
