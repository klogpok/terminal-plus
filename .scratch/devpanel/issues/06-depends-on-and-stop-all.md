# 06: dependsOn and Start all / Stop all

**What to build:** Starting a Service starts its dependencies first and waits until they are running. If a dependency ends up crashed, exited or unhealthy, the dependent Service stays stopped and explains why. Stopping or crashing a dependency never touches running dependents. Each Repo header gets "Start all" and "Stop all", and the top bar gets "Stop all in all Repos"; all of these act on Services only and never on Sessions.

**Blocked by:** 04 (Readiness and the full Service Status model).

**Status:** ready-for-agent

- [ ] `startService` on a Service with dependsOn starts each not-yet-running dependency first (transitively) and waits for `running` before spawning the dependent.
- [ ] If a dependency becomes `crashed`, `exited` or `unhealthy`, the dependent is not started and a plain-Russian reason names the dependency.
- [ ] Stopping or crashing a dependency leaves running dependents untouched (test).
- [ ] "Start all" respects dependency order; "Stop all" stops every Service of the Repo.
- [ ] "Stop all in all Repos" stops every Service in the Workspace.
- [ ] None of these commands stops a Session (asserted once Sessions exist; until then, the command API accepts only Services).

---

## Русский перевод

# 06: dependsOn и «Запустить всё» / «Остановить всё»

**Что сделать:** Запуск Сервиса сначала запускает его Зависимости и ждёт, пока они станут running. Если Зависимость оказывается в crashed, exited или unhealthy, зависящий Сервис остаётся остановленным и объясняет причину. Остановка или падение Зависимости никогда не трогает работающие зависящие Сервисы. В заголовке каждого Репо появляются «Запустить всё» и «Остановить всё», а в верхней панели — «Остановить всё во всех репо»; все они действуют только на Сервисы и никогда — на Сессии.

**Блокируется:** 04 (Готовность и полная модель Статусов сервиса).

**Статус:** ready-for-agent

- [ ] `startService` для Сервиса с dependsOn сначала запускает каждую ещё не работающую Зависимость (транзитивно) и ждёт `running`, прежде чем запустить зависящий Сервис.
- [ ] Если Зависимость становится `crashed`, `exited` или `unhealthy`, зависящий Сервис не запускается, а причина на понятном русском называет Зависимость.
- [ ] Остановка или падение Зависимости не трогает работающие зависящие Сервисы (тест).
- [ ] «Запустить всё» соблюдает порядок зависимостей; «Остановить всё» останавливает каждый Сервис Репо.
- [ ] «Остановить всё во всех репо» останавливает каждый Сервис в Workspace.
- [ ] Ни одна из этих команд не останавливает Сессию (проверяется, когда появятся Сессии; до тех пор API команды принимает только Сервисы).
