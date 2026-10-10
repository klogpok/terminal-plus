# 04: Readiness and the full Service Status model

**What to build:** A Service turns green only when it is actually usable. Readiness is the first of: `readyPattern` matched in the output, `healthUrl` answering (polled every second), or the Service's port listening on any address (read from the OS table of listening sockets via `netstat`). With no criteria, the Service becomes running after staying alive for the liveness period. A Service still not ready after the readiness timeout becomes `unhealthy` ("Running, but not responding"), is not killed, keeps being checked less often, and turns running when ready. Checks stop once running. Crashed and exited Services show their exit code and last 30 log lines.

**Blocked by:** 02 (Control a Service from the browser).

**Status:** resolved

- [x] Each readiness criterion moves a Service from `starting` to `running`, proven with fixtures (ready line, health endpoint, port on IPv4, on IPv6 `::1`, on any-address).
- [x] The port-listening check reads the OS listening-socket table on all addresses and returns the owner PID; it is reused later for port conflicts.
- [x] A Service with no criteria becomes `running` after the liveness period; one that dies before it ends up `crashed` or `exited`, never briefly `running`.
- [x] After the readiness timeout a live, unready Service becomes `unhealthy` (🟠) and is not killed; re-polling continues at the slower interval and moves it to `running` when ready.
- [x] No readiness checks run while `running`.
- [x] `crashed` shows the exit code and the last 30 lines; `exited` shows "Finished by itself" with the last lines, not styled as an error; both offer "Start again". No automatic restart.
- [x] UI status dots cover all seven Statuses.

---

## Русский перевод

# 04: Готовность и полная модель Статусов сервиса

**Что сделать:** Сервис становится зелёным, только когда им действительно можно пользоваться. Готовность — первое из: в выводе найден `readyPattern`, ответил `healthUrl` (опрос каждую секунду) или порт Сервиса слушается на любом адресе (берётся из таблицы слушающих сокетов ОС через `netstat`). Без критериев Сервис становится running, если прожил период живучести. Сервис, не готовый к концу таймаута Готовности, становится `unhealthy` («Запущен, но не отвечает»), не убивается, проверяется реже и становится running, когда будет готов. После running проверки прекращаются. Упавшие и завершившиеся сами Сервисы показывают код выхода и последние 30 строк лога.

**Блокируется:** 02 (Управление Сервисом из браузера).

**Статус:** resolved

- [x] Каждый критерий Готовности переводит Сервис из `starting` в `running`; это доказано фикстурами (строка готовности, health-эндпоинт, порт на IPv4, на IPv6 `::1`, на любом адресе).
- [x] Проверка «порт слушается» читает таблицу слушающих сокетов ОС на всех адресах и возвращает PID владельца; позже она переиспользуется для конфликтов портов.
- [x] Сервис без критериев становится `running` после периода живучести; Сервис, умерший раньше, оказывается в `crashed` или `exited` и никогда не бывает кратковременно `running`.
- [x] После таймаута Готовности живой, но не готовый Сервис становится `unhealthy` (🟠) и не убивается; повторный опрос идёт с более редким интервалом и переводит его в `running` при Готовности.
- [x] Пока Сервис `running`, проверки Готовности не выполняются.
- [x] `crashed` показывает код выхода и последние 30 строк; `exited` показывает «Завершился сам» с последними строками, без оформления ошибки; у обоих есть «Запустить снова». Автоперезапуска нет.
- [x] Статус-точки в UI покрывают все семь Статусов.
