# 02: Control a Service from the browser

**What to build:** The team member opens DevPanel in the browser, sees the Workspace's Repos with their Services and a status dot for each, and starts, stops and restarts a Service with ▶ ■ ⟳. The DevPanel Server owns the processes (ADR-0001): reloading the page or opening a second tab shows the same live state. This ticket lays the whole path: the `shared` message contract, the Fastify + WebSocket Server on 127.0.0.1:7777 with Origin check and Access Key, the Angular app with `BackendService` over a `BackendTransport` interface and its `WsTransport`, the single UI strings file, and the plain-Russian error pattern with a "Details" fold-out. Statuses at this stage: stopped, starting, running (immediately after spawn for now), stopping, crashed, exited.

**Blocked by:** 01 (Start and stop a Service with full process-tree kill).

**Status:** resolved

- [x] The Server listens only on 127.0.0.1:7777, rejects WebSocket connections with a foreign Origin, and rejects connections without the correct Access Key (generated at start, stored in the app data directory, read by the client from the URL fragment).
- [x] Command and event types live in `shared` and are used by both Server and UI.
- [x] The left panel lists Repos (color stripe, name) and their Services with status dots and ▶ ■ ⟳ buttons that drive `core`.
- [x] `crashed` (non-zero exit without Stop) and `exited` (code 0 without Stop) are distinguished from `stopped`.
- [x] A snapshot query lets a reconnecting client rebuild the full state; reloading the page keeps Services running and shows them correctly.
- [x] Two browser tabs show the same state and both can control Services.
- [x] Angular components talk only to `BackendService`; a fake `BackendTransport` is used in UI tests (status dots, buttons sending the right commands, rebuild from snapshot).
- [x] All UI strings come from one file; errors render as a plain-Russian message with technical details under "Details".
- [x] One end-to-end Server test: a command round-trip over a real WebSocket, plus rejection without the Access Key.

---

## Русский перевод

# 02: Управление Сервисом из браузера

**Что сделать:** Член команды открывает DevPanel в браузере, видит Репо из Workspace с их Сервисами и статус-точкой у каждого, запускает, останавливает и перезапускает Сервис кнопками ▶ ■ ⟳. Процессами владеет Сервер DevPanel (ADR-0001): перезагрузка страницы или вторая вкладка показывают то же живое состояние. Этот тикет прокладывает весь путь: контракт сообщений в `shared`, Сервер на Fastify + WebSocket на 127.0.0.1:7777 с проверкой Origin и Ключом доступа, Angular-приложение с `BackendService` поверх интерфейса `BackendTransport` и его реализации `WsTransport`, единый файл строк UI и шаблон ошибок на понятном русском с раскрывающимся блоком «Подробнее». Статусы на этом этапе: stopped, starting, running (пока сразу после запуска процесса), stopping, crashed, exited.

**Блокируется:** 01 (Запуск и остановка Сервиса с убийством всего дерева процессов).

**Статус:** resolved

- [x] Сервер слушает только 127.0.0.1:7777, отклоняет WebSocket-подключения с чужим Origin и подключения без правильного Ключа доступа (создаётся при старте, хранится в каталоге данных приложения, клиент читает его из фрагмента URL).
- [x] Типы команд и событий лежат в `shared` и используются и Сервером, и UI.
- [x] Левая панель показывает Репо (цветная полоса, имя) и их Сервисы со статус-точками и кнопками ▶ ■ ⟳, которые управляют `core`.
- [x] `crashed` (ненулевой код без «Стоп») и `exited` (код 0 без «Стоп») отличаются от `stopped`.
- [x] Запрос снимка позволяет переподключившемуся клиенту восстановить всё состояние; перезагрузка страницы оставляет Сервисы работающими и показывает их правильно.
- [x] Две вкладки браузера показывают одно состояние, и обе могут управлять Сервисами.
- [x] Angular-компоненты общаются только с `BackendService`; в тестах UI используется фейковый `BackendTransport` (статус-точки, кнопки отправляют правильные команды, восстановление из снимка).
- [x] Все строки UI берутся из одного файла; ошибки показываются сообщением на понятном русском с техническими деталями под «Подробнее».
- [x] Один сквозной тест Сервера: команда туда и обратно через настоящий WebSocket, а также отказ без Ключа доступа.
