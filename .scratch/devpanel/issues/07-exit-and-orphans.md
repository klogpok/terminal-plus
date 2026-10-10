# 07: Exit and Orphans

**What to build:** The team member has one obvious way to shut everything down: an "Exit DevPanel" button (with confirmation) that stops all Services and Sessions and then the Server. Closing the Server console window, SIGINT, SIGTERM and `beforeExit` do the same. If DevPanel was killed hard (crash, forced shutdown), the next start finds the processes it left behind — Orphans — and offers to kill them, described in plain words ("Service API from Billing was left over from the previous run"). A process that merely reused an old PID is never treated as an Orphan. An Orphan holding a port shows up as a third kind of port-conflict owner with the same one-click fix.

**Blocked by:** 05 (Port conflicts).

**Status:** ready-for-agent

- [ ] Every spawned process is recorded in a PID file in the app data directory with PID, process creation time, Repo, and Service id or Session kind; entries are removed when the process ends.
- [ ] `shutdown` stops every Service and Session, then the Server exits; the same happens on SIGINT, SIGTERM, console close (SIGHUP) and `beforeExit`.
- [ ] The UI has an "Exit DevPanel" button with confirmation.
- [ ] On start, `core` reports Orphans only for entries whose PID and creation time both match a live process (test includes a reused-PID negative case).
- [ ] The UI lists found Orphans in plain Russian with a "Kill" action (`killOrphans`), which kills each Orphan's whole tree.
- [ ] Port-conflict classification recognizes an Orphan owner ("…left over from the previous run") and `resolvePortConflict` handles it.

---

## Русский перевод

# 07: Выход и Зомби

**Что сделать:** У члена команды есть один очевидный способ всё выключить: кнопка «Выйти из DevPanel» (с подтверждением), которая останавливает все Сервисы и Сессии, а затем Сервер. Закрытие консольного окна Сервера, SIGINT, SIGTERM и `beforeExit` делают то же самое. Если DevPanel был убит жёстко (падение, принудительное выключение), при следующем старте он находит оставленные процессы — Зомби — и предлагает их убить, описывая простыми словами («Сервис API из Billing остался с прошлого запуска»). Процесс, который просто получил старый PID, никогда не считается Зомби. Зомби, держащий порт, становится третьим типом владельца в конфликте портов с тем же решением в один клик.

**Блокируется:** 05 (Конфликты портов).

**Статус:** ready-for-agent

- [ ] Каждый порождённый процесс записывается в PID-файл в каталоге данных приложения с PID, временем создания процесса, Репо и id Сервиса или типом Сессии; записи удаляются, когда процесс завершается.
- [ ] `shutdown` останавливает все Сервисы и Сессии, затем Сервер завершается; то же происходит при SIGINT, SIGTERM, закрытии консоли (SIGHUP) и `beforeExit`.
- [ ] В UI есть кнопка «Выйти из DevPanel» с подтверждением.
- [ ] При старте `core` сообщает о Зомби только для записей, у которых и PID, и время создания совпадают с живым процессом (тест включает отрицательный случай с переиспользованным PID).
- [ ] UI показывает найденных Зомби на понятном русском с действием «Убить» (`killOrphans`), которое убивает всё дерево каждого Зомби.
- [ ] Классификация конфликтов портов распознаёт Зомби-владельца («…остался с прошлого запуска»), и `resolvePortConflict` его обрабатывает.
