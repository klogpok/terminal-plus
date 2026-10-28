# 01: Cover the Service invariants through DevPanelCore before moving them

**What to do:** Before any code moves (spec decision 9), make sure the existing `packages/core` tests, run through `DevPanelCore` and the harness, pin every invariant that tickets 02-05 move into `Service`. Where an invariant is not pinned, add a test against the current code. Tests only; no product change.

**Blocked by:** none

**Status:** ready-for-agent

Invariants to check (list each one with the test that already covers it, or the new test):

- [ ] `lastExit` is set only when the Service ended by itself (`crashed`/`exited`), and it is dropped by a new start (`spawn`), by Dismiss and by a Stop.
- [ ] A Stop while the start still waits for its dependencies (or the pnpm check, or a port) cancels the start: the Service never spawns and stays `stopped`, and `waitingFor` is cleared (`waitingChanged` without `waitingFor`).
- [ ] Concurrent `startService` calls on one Service spawn it once.
- [ ] A readiness result that comes after a Stop does not change the status (`onReadinessChange` guard).
- [ ] A config change while the Service runs is applied only after it exits (`configChanged` view in between); a Service removed from the config while running stays listed (`removedFromConfig`) until it exits and then disappears.
- [ ] `shutdown` aborts starts that are still waiting and stops live Services.
- [ ] `restartService` writes the restart separator into the output before the new run.

Done when:

- [ ] Each invariant above is mapped to a test (note the mapping in a `## Comments` entry of this file).
- [ ] New tests pass on `main` unchanged; any that need fixtures use the existing ones in `packages/core/test/fixtures/` where possible and spread `...TEST_TIMINGS`.
- [ ] `pnpm check` passes.

## Русский перевод

# 01: Покрыть инварианты Service тестами через DevPanelCore до переноса

**Что сделать:** до переноса кода (решение 9 спеки) убедиться, что существующие тесты `packages/core` фиксируют каждый инвариант, который тикеты 02-05 переносят в `Service`. Тесты идут через `DevPanelCore` и harness. Для непокрытого инварианта добавить тест на текущем коде. Меняются только тесты, продукт не трогаем.

**Блокируется:** ничем

**Статус:** ready-for-agent

Инварианты, которые нужно проверить (для каждого указать тест, который уже его покрывает, или новый тест):

- [ ] `lastExit` выставляется только когда Service завершился сам (`crashed`/`exited`). Его сбрасывают новый запуск (`spawn`), Dismiss и Stop.
- [ ] Stop, пока запуск ещё ждёт свои зависимости (или pnpm check, или порт), отменяет запуск: Service так и не запускается, остаётся `stopped`, а `waitingFor` очищается (`waitingChanged` без `waitingFor`).
- [ ] Одновременные вызовы `startService` для одного Service запускают его один раз.
- [ ] Результат readiness, пришедший после Stop, не меняет статус (защита в `onReadinessChange`).
- [ ] Изменение конфига у работающего Service применяется только после его выхода (в промежутке приходит view в `configChanged`). Service, удалённый из конфига во время работы, остаётся в списке (`removedFromConfig`), пока не завершится, а потом исчезает.
- [ ] `shutdown` отменяет запуски, которые ещё ждут, и останавливает живые Service.
- [ ] `restartService` перед новым запуском пишет в вывод restart separator.

Готово, когда:

- [ ] Каждому инварианту выше сопоставлен тест (сопоставление записать в `## Comments` этого файла).
- [ ] Новые тесты проходят на неизменённом `main`. Где возможно, они используют существующие фикстуры из `packages/core/test/fixtures/` и расширяют `...TEST_TIMINGS`.
- [ ] `pnpm check` проходит.
