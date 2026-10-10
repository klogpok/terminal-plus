# 05: Port conflicts

**What to build:** Before starting a Service with a port, DevPanel checks the port on every address. If it is taken, the team member sees who holds it and one button that resolves it: "Port 3000 is taken by service API from Repo Billing" → "Stop it and start ours"; "Port 3000 is taken by node.exe (PID 1234)" → "Kill it and start ours" (with confirmation). After resolving, DevPanel waits until the port is free and continues the start. After every Stop, DevPanel confirms the port was released and, if not, reports the owner with a kill offer.

**Blocked by:** 04 (Readiness and the full Service Status model).

**Status:** resolved

- [x] Starting a Service whose port is held (on IPv4, IPv6 or any-address) does not spawn it and reports a conflict instead.
- [x] The owner is classified as either a DevPanel Service from another Repo (named by Service and Repo) or a foreign process (named by process name and PID).
- [x] `resolvePortConflict` stops our Service or kills the foreign process, waits until the port is free, then starts the requested Service; tests cover both owner kinds.
- [x] Killing a foreign process requires a confirmation in the UI.
- [x] After a Stop, a port still held is reported with its owner and a kill button.
- [x] Conflict messages follow the plain-Russian error pattern.

---

## Русский перевод

# 05: Конфликты портов

**Что сделать:** Перед запуском Сервиса с портом DevPanel проверяет этот порт на всех адресах. Если порт занят, член команды видит, кто его держит, и одну кнопку, которая решает проблему: «Порт 3000 занят сервисом API из репо Billing» → «Остановить его и запустить наш»; «Порт 3000 занят процессом node.exe (PID 1234)» → «Завершить и запустить наш» (с подтверждением). После решения DevPanel ждёт, пока порт освободится, и продолжает запуск. После каждой остановки DevPanel проверяет, что порт освободился, а если нет — сообщает владельца и предлагает его убить.

**Блокируется:** 04 (Готовность и полная модель Статусов сервиса).

**Статус:** resolved

- [x] Запуск Сервиса, чей порт занят (на IPv4, IPv6 или любом адресе), не порождает процесс, а сообщает о конфликте.
- [x] Владелец классифицируется либо как Сервис DevPanel из другого Репо (называются Сервис и Репо), либо как чужой процесс (называются имя процесса и PID).
- [x] `resolvePortConflict` останавливает наш Сервис или убивает чужой процесс, ждёт, пока порт освободится, затем запускает нужный Сервис; тесты покрывают оба типа владельца.
- [x] Убийство чужого процесса требует подтверждения в UI.
- [x] Если после остановки порт всё ещё занят, сообщается его владелец и показывается кнопка «Завершить».
- [x] Сообщения о конфликтах следуют шаблону ошибок на понятном русском.
