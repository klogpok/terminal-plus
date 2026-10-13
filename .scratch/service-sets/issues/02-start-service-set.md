# 02: Start a Service Set from the panel

**What to build:** Clicking a Service Set in the "Service Sets" menu starts it. Each Service of the Set that is not `running` or `starting` is started through the normal Start path (dependencies, port checks and Orphans behave as usual), all in parallel. Services already running and Services outside the Set are left alone; nothing is stopped. The start finishes once every started Service has reached `running` or ended up otherwise (start refused, `crashed`, `exited`, `unhealthy`, `stopped`). When some did not reach `running`, the panel shows one plain-language message naming them; port conflicts show the usual port-conflict choice. A Service that crashes after reaching `running` does not count. Spec: `.scratch/service-sets/spec.md`.

**Blocked by:** 01 (Create a Service Set and see it in the menu).

**Status:** resolved

- [x] Shared: `startServiceSet` command with result `{ notFound: ServiceRef[]; notRunning: ServiceRef[] }` (`notFound` stays empty until ticket 04); `serviceSetNotFound` error code worded in both UI string sets.
- [x] Core: `startServiceSet` as described; one failing Service does not hold back the others; empty result when every Service reaches `running`.
- [x] Server: zod-validated handler.
- [x] Web: clicking a Set sends the command; a non-empty result shows the message; an unknown Set shows the error.
- [x] Core harness tests: only the Set's stopped Services start; others (in and out of the Set) untouched; dependencies start; a crashing fixture and a port taken by a listener fixture land in `notRunning`; success gives empty lists. Web specs through `FakeTransport`.
- [x] `pnpm check` passes.

## Русский перевод

# 02: Запустить Набор из панели

**Что сделать:** Клик по Набору в меню «Наборы» запускает его. Каждый Сервис Набора, который не `running` и не `starting`, запускается обычным путём «Старта» (Зависимости, проверка портов и Зомби работают как обычно), все параллельно. Уже запущенные Сервисы и Сервисы вне Набора не трогаются, ничего не останавливается. Запуск завершается, когда каждый запущенный Сервис стал `running` или пришёл к другому итогу (запуск отклонён, `crashed`, `exited`, `unhealthy`, `stopped`). Если какие-то Сервисы не дошли до `running`, панель показывает одно сообщение простыми словами с их перечнем. Конфликты портов показывают обычный выбор действия при конфликте порта. Сервис, упавший после того, как стал `running`, не считается. Спецификация: `.scratch/service-sets/spec.md`.

**Заблокирован:** 01 (Создать Набор и увидеть его в меню).

**Статус:** resolved

- [x] Shared: команда `startServiceSet` с результатом `{ notFound: ServiceRef[]; notRunning: ServiceRef[] }` (`notFound` остаётся пустым до тикета 04). Код ошибки `serviceSetNotFound` с текстами в обоих наборах строк UI.
- [x] Core: `startServiceSet`, как описано выше. Один не запустившийся Сервис не задерживает остальные. Пустой результат, когда каждый Сервис дошёл до `running`.
- [x] Сервер: обработчик с zod-проверкой.
- [x] Web: клик по Набору отправляет команду. Непустой результат показывает сообщение, неизвестный Набор показывает ошибку.
- [x] Тесты через harness core: запускаются только остановленные Сервисы Набора; остальные (в Наборе и вне его) не трогаются; Зависимости запускаются; падающая фикстура и порт, занятый фикстурой-слушателем, попадают в `notRunning`; при успехе списки пустые. Спеки web через `FakeTransport`.
- [x] `pnpm check` проходит.
