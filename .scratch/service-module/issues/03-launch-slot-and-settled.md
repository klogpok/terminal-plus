# 03: Launch slot, `waitingFor` and `settled` move into `Service`

**What to do:** `Service` takes over the launch slot and waiting (spec decisions 6 and 10). The launch body stays in core.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `Service.start(body: (signal) => Promise<void>)`:
  - returns at once if the Service is live;
  - joins a launch that runs and is not aborted;
  - otherwise creates the `AbortController`, runs `body(signal)` and clears the slot when it settles.
  
  `DevPanelCore.startService` keeps its Repo checks (`requireRepoFolder`, `requireStillListed`) and passes `launch` as the body.
- [ ] `Service.setWaiting(depIds?)` owns `waitingFor` and emits `waitingChanged` with dependency names. The names come from the Service's `repo.services`.
- [ ] `Service.stop()` aborts the launch. `shutdown` no longer touches `launch` itself.
- [ ] `Service.settled(signal)` replaces `DevPanelCore.settledStatus`. It resolves with the status once the Service leaves `starting`, or when the signal aborts. Waiters live in the Service and are resolved from its `setStatus`. `startDependency` and the `ServiceSets` host (`core.ts:241`) use it.
- [ ] Remove `this.setMaxListeners(0)` and its comment (`core.ts:217-218`). Check that no test or production path now warns `MaxListenersExceededWarning`.
- [ ] `launch`, `waitingFor` and the waiters are private.
- [ ] `pnpm check` passes. Run `depends-on` and `service-sets` 10 times in a row.

## Русский перевод

# 03: Слот запуска, `waitingFor` и `settled` переезжают в `Service`

**Что сделать:** `Service` берёт на себя слот запуска и ожидание (решения 6 и 10 спеки). Тело запуска остаётся в core.

**Блокируется:** 02

**Статус:** ready-for-agent

- [ ] `Service.start(body: (signal) => Promise<void>)`:
  - сразу возвращается, если Service живой;
  - присоединяется к запуску, который идёт и не отменён;
  - иначе создаёт `AbortController`, выполняет `body(signal)` и освобождает слот, когда тот завершится.
  
  `DevPanelCore.startService` сохраняет свои проверки Repo (`requireRepoFolder`, `requireStillListed`) и передаёт `launch` как тело.
- [ ] `Service.setWaiting(depIds?)` владеет `waitingFor` и эмитит `waitingChanged` с именами зависимостей. Имена берутся из `repo.services` этого Service.
- [ ] `Service.stop()` отменяет запуск. `shutdown` больше сам не трогает `launch`.
- [ ] `Service.settled(signal)` заменяет `DevPanelCore.settledStatus`. Метод возвращает статус, как только Service выходит из `starting` или когда signal отменён. Ожидающие хранятся в Service и разрешаются из его `setStatus`. Его используют `startDependency` и host `ServiceSets` (`core.ts:241`).
- [ ] Удалить `this.setMaxListeners(0)` вместе с комментарием (`core.ts:217-218`). Проверить, что ни тесты, ни продакшен теперь не выдают `MaxListenersExceededWarning`.
- [ ] `launch`, `waitingFor` и список ожидающих — private.
- [ ] `pnpm check` проходит. `depends-on` и `service-sets` прогнать 10 раз подряд.
