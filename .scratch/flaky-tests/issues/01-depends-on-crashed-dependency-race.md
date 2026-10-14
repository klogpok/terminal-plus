# 01: Flaky `depends-on` test: a crashing dependency can count as running

**What to fix:** `packages/core/test/depends-on.test.ts` › "a dependency that ends up crashed keeps the dependent stopped and names the dependency" fails now and then: `startService` resolves instead of rejecting with `dependencyFailed` (`expected undefined to be an instance of DevPanelError`, line 77). On 2026-10-14 it failed in 2 of 3 runs: once in a full `pnpm check` and once on its own, and it passed the third time. The failures were on `settings-menu`, whose `packages/core` matches `main`. Test only; no product change expected.

**Blocked by:** none

**Status:** resolved

**Cause (confirmed 2026-10-14, 1 failure in 15 runs of the two cases):** the dependency `db` has no `readyPattern`, `healthUrl` or `port`. That means it becomes `running` if it is still alive `livenessMs` after its process has started (`readiness.ts`). `TEST_TIMINGS.livenessMs` is 300 ms. The fixture `exit-after.mjs 200 3` exits 200 ms after node itself is running, so it dies at "process started + node startup + 200 ms". The gap is only about 100 ms. If node starts quickly, or the exit is reported late (ConPTY, a busy machine, test files running in parallel), the liveness check still finds the process alive. `db` then becomes `running`, `api` starts, and no error is thrown. The `exited` case in the same `it.each` has the same race; it just hit it less often here.

- [x] Reproduce, or rule out, the race above, for example by running the file in a loop or with `livenessMs` lowered to 200, before you change anything.
- [x] Both `it.each` cases (`crashed`, `exited`) give the dependency's exit a wide margin before the liveness period ends: for example, pass `{ ...TEST_TIMINGS, livenessMs: 3000 }` to `setup`, or have the fixture exit at once. Keep what the test proves: the dependency ends `crashed`/`exited`, the dependent stays `stopped`, and the error names the dependency and its status.
- [x] ~~If the cause turns out to be a product bug (for example, an exit that happened before the liveness period ended being ignored), fix it in `core` instead and add a test for it.~~ Not a product bug: a Service without criteria that is alive after `livenessMs` is `running` by design.
- [x] `depends-on.test.ts` passes 20 runs in a row: `pnpm --filter ./packages/core exec vitest run test/depends-on.test.ts`.
- [x] `pnpm check` passes.

## Русский перевод

# 01: Нестабильный тест `depends-on`: падающая зависимость может считаться запущенной

**Что исправить:** тест `packages/core/test/depends-on.test.ts` › «a dependency that ends up crashed keeps the dependent stopped and names the dependency» время от времени падает: `startService` завершается успешно вместо ошибки `dependencyFailed` (`expected undefined to be an instance of DevPanelError`, строка 77). 2026-10-14 он упал в 2 запусках из 3: один раз в полном `pnpm check` и один раз при отдельном запуске, а в третий раз прошёл. Падения были на ветке `settings-menu`, где `packages/core` совпадает с `main`. Правка только в тесте; менять продукт, скорее всего, не придётся.

**Блокируется:** ничем

**Статус:** resolved

**Причина (подтверждена 2026-10-14, 1 падение на 15 запусков двух случаев):** у зависимости `db` нет ни `readyPattern`, ни `healthUrl`, ни `port`. Значит, она становится `running`, если ещё жива через `livenessMs` после запуска процесса (`readiness.ts`). `TEST_TIMINGS.livenessMs` = 300 мс. Фикстура `exit-after.mjs 200 3` завершается через 200 мс после того, как node уже запустился, то есть в момент «процесс запущен + старт node + 200 мс». Разрыв — всего около 100 мс. Если node стартует быстро или о выходе процесса сообщается с задержкой (ConPTY, загруженная машина, параллельные тестовые файлы), проверка живости ещё видит процесс живым. Тогда `db` становится `running`, `api` запускается, и ошибки нет. У случая `exited` в том же `it.each` такая же гонка; просто здесь он попадал на неё реже.

- [x] Прежде чем что-то менять, воспроизвести гонку или исключить её: например, гонять файл в цикле или понизить `livenessMs` до 200.
- [x] В обоих случаях `it.each` (`crashed`, `exited`) выход зависимости происходит с большим запасом до конца периода живости: например, передать в `setup` `{ ...TEST_TIMINGS, livenessMs: 3000 }` или сделать так, чтобы фикстура завершалась сразу. Тест должен по-прежнему доказывать то же: зависимость заканчивает в `crashed`/`exited`, зависимый Сервис остаётся `stopped`, а ошибка называет зависимость и её статус.
- [x] ~~Если причина окажется ошибкой продукта (например, выход, случившийся до конца периода живости, игнорируется), исправить её в `core` и добавить на неё тест.~~ Не ошибка продукта: Сервис без критериев, живой через `livenessMs`, по замыслу `running`.
- [x] `depends-on.test.ts` проходит 20 запусков подряд: `pnpm --filter ./packages/core exec vitest run test/depends-on.test.ts`.
- [x] `pnpm check` проходит.
