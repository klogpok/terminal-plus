# 01: Flaky `depends-on` test: a crashing dependency can count as running

**What to fix:** `packages/core/test/depends-on.test.ts` › "a dependency that ends up crashed keeps the dependent stopped and names the dependency" fails now and then: `startService` resolves instead of rejecting with `dependencyFailed` (`expected undefined to be an instance of DevPanelError`, line 77). On 2026-10-14 it failed in 2 of 3 runs: once in a full `pnpm check` and once on its own, and it passed the third time. The failures were on `settings-menu`, whose `packages/core` matches `main`. Test only; no product change expected.

**Blocked by:** none

**Status:** resolved

**Cause (confirmed):** the dependency `db` has no `readyPattern`, `healthUrl` or `port`. That means it becomes `running` if it is still alive `livenessMs` after its process has started (`readiness.ts`). The liveness period starts once the pty's `cmd.exe` exists. `TEST_TIMINGS.livenessMs` is 300 ms. The fixture `exit-after.mjs 200 3` exits 200 ms after node itself is running, so it dies at "process started + node startup + 200 ms". The margin is only the ~100 ms left over after node startup. When node starts slowly (a busy machine, test files running in parallel), or the exit is reported late (ConPTY), the liveness check still finds the process alive. `db` then becomes `running`, `api` starts, and no error is thrown. The `exited` case in the same `it.each` has the same race.

- [x] Reproduce, or rule out, the race above, for example by running the file in a loop or with `livenessMs` lowered to 200, before you change anything.
- [x] Both `it.each` cases (`crashed`, `exited`) give the dependency's exit a wide margin before the liveness period ends: for example, pass `{ ...TEST_TIMINGS, livenessMs: 3000 }` to `setup`, or have the fixture exit at once. Keep what the test proves: the dependency ends `crashed`/`exited`, the dependent stays `stopped`, and the error names the dependency and its status.
- [x] If the cause turns out to be a product bug (for example, an exit that happened before the liveness period ended being ignored), fix it in `core` instead and add a test for it. Not a product bug: a Service that is alive for the whole liveness period is `running` by design.
- [x] `depends-on.test.ts` passes 20 runs in a row: `pnpm --filter ./packages/core exec vitest run test/depends-on.test.ts`.
- [x] `pnpm check` passes.

## Answer

- Reproduced: with `livenessMs: 150` both cases fail every time, with the same error as the flaky runs. The outcome depends only on whether the exit comes before or after the liveness period ends.
- Fix: the `it.each` passes `{ ...TEST_TIMINGS, livenessMs: 3000 }` to `setup`. The exit now lands more than 10× inside the liveness period. The test is no faster or slower: it waits for the exit, not for the timer. `readiness.test.ts` already uses the same approach (`livenessMs: 1500`).
- Checked: 20 runs in a row of the two cases (`-t "ends up"`), the whole file once, and `pnpm check`.
- The same race exists in `service-sets.test.ts` › "reports a Service that crashes and one whose port is taken…" (`exit-after.mjs 100 3` with the default 300 ms liveness). That file lives only on the `service-sets` branch, so it is fixed there.

## Русский перевод

# 01: Нестабильный тест `depends-on`: падающая зависимость может считаться запущенной

**Что исправить:** тест `packages/core/test/depends-on.test.ts` › «a dependency that ends up crashed keeps the dependent stopped and names the dependency» время от времени падает: `startService` завершается успешно вместо ошибки `dependencyFailed` (`expected undefined to be an instance of DevPanelError`, строка 77). 2026-10-14 он упал в 2 запусках из 3: один раз в полном `pnpm check` и один раз при отдельном запуске, а в третий раз прошёл. Падения были на ветке `settings-menu`, где `packages/core` совпадает с `main`. Правка только в тесте; менять продукт, скорее всего, не придётся.

**Блокируется:** ничем

**Статус:** resolved

**Причина (подтверждена):** у зависимости `db` нет ни `readyPattern`, ни `healthUrl`, ни `port`. Значит, она становится `running`, если ещё жива через `livenessMs` после запуска процесса (`readiness.ts`). Период живости начинается, как только появился `cmd.exe` в pty. `TEST_TIMINGS.livenessMs` = 300 мс. Фикстура `exit-after.mjs 200 3` завершается через 200 мс после того, как node уже запустился, то есть в момент «процесс запущен + старт node + 200 мс». Запас — только те ~100 мс, что остаются после старта node. Если node стартует медленно (загруженная машина, параллельные тестовые файлы) или о выходе процесса сообщается с задержкой (ConPTY), проверка живости ещё видит процесс живым. Тогда `db` становится `running`, `api` запускается, и ошибки нет. У случая `exited` в том же `it.each` такая же гонка.

- [x] Прежде чем что-то менять, воспроизвести гонку или исключить её: например, гонять файл в цикле или понизить `livenessMs` до 200.
- [x] В обоих случаях `it.each` (`crashed`, `exited`) выход зависимости происходит с большим запасом до конца периода живости: например, передать в `setup` `{ ...TEST_TIMINGS, livenessMs: 3000 }` или сделать так, чтобы фикстура завершалась сразу. Тест должен по-прежнему доказывать то же: зависимость заканчивает в `crashed`/`exited`, зависимый Сервис остаётся `stopped`, а ошибка называет зависимость и её статус.
- [x] Если причина окажется ошибкой продукта (например, выход, случившийся до конца периода живости, игнорируется), исправить её в `core` и добавить на неё тест. Это не ошибка продукта: Сервис, живой весь период живости, по замыслу считается `running`.
- [x] `depends-on.test.ts` проходит 20 запусков подряд: `pnpm --filter ./packages/core exec vitest run test/depends-on.test.ts`.
- [x] `pnpm check` проходит.

## Ответ

- Воспроизведено: с `livenessMs: 150` оба случая падают каждый раз, с той же ошибкой, что и в нестабильных запусках. Исход зависит только от того, наступает ли выход раньше или позже конца периода живости.
- Исправление: `it.each` передаёт в `setup` `{ ...TEST_TIMINGS, livenessMs: 3000 }`. Теперь выход наступает с запасом больше чем в 10 раз до конца периода живости. Тест не стал ни быстрее, ни медленнее: он ждёт выхода, а не таймера. `readiness.test.ts` уже использует тот же приём (`livenessMs: 1500`).
- Проверено: 20 запусков подряд обоих случаев (`-t "ends up"`), один прогон всего файла и `pnpm check`.
- Та же гонка есть в `service-sets.test.ts` › «reports a Service that crashes and one whose port is taken…» (`exit-after.mjs 100 3` при периоде живости по умолчанию 300 мс). Этот файл пока есть только в ветке `service-sets`, поэтому исправлен там.
