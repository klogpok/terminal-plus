# The desktop app keeps the localhost WebSocket transport, on the same port as the web version

The desktop app runs the unchanged DevPanel Server (`startDevPanel` from `server`, which hosts `core`) on `127.0.0.1:7777` (since ADR-0003 in a Node sidecar of the Tauri shell; originally in-process in Electron's main process, which is where the preload option below comes from), and the window loads the Server's URL with the Access Key in the fragment, exactly like a browser tab. We chose this over an `IpcTransport` through a preload script because it keeps one transport for both modes: the `web` build ships unchanged, the WebSocket path is already covered by the Server tests, a browser tab can still join as an equal client (ADR-0001), and nothing new has to be kept in sync between `shared`, a preload bridge and an Angular transport. The fixed port doubles as the "one DevPanel per machine" guard: the desktop app and the `.bat` launcher share the app data directory (Workspace, PID file), and two Servers over it would report each other's processes as Orphans. If the port is taken, the desktop app asks `/api/hello` and explains in Russian whether DevPanel already runs or another program holds the port. The cost: the Access Key stays necessary in the desktop app (any local process could otherwise drive the Server), and the desktop app cannot start while the web version runs.

## Considered Options

- **`IpcTransport` through a preload script with context isolation.** Would drop the Access Key and the open port, but needs a second `BackendTransport` in `web`, transport selection at runtime, a preload bridge and its own tests, and loses browser tabs as extra clients. Rejected for now; worth reopening if the open localhost port becomes a security concern.
- **WebSocket on a random free port.** Avoids clashing with a running web version, but then two Servers can run over one app data directory and kill or report each other's processes as Orphans. Rejected.

---

## Русский перевод

# Десктопное приложение оставляет транспорт WebSocket на localhost, на том же порту, что и веб-версия

Десктопное приложение запускает неизменённый Сервер DevPanel (`startDevPanel` из `server`, который размещает `core`) на `127.0.0.1:7777` (начиная с ADR-0003 — в Node-sidecar оболочки Tauri; изначально — внутри main-процесса Electron, отсюда и вариант с preload ниже), а окно загружает URL Сервера с Ключом доступа во фрагменте — ровно как вкладка браузера. Мы выбрали это вместо `IpcTransport` через preload-скрипт, потому что так остаётся один транспорт для обоих режимов: сборка `web` поставляется без изменений, путь через WebSocket уже покрыт тестами Сервера, вкладка браузера по-прежнему может подключиться как равноправный клиент (ADR-0001), и не появляется ничего нового, что нужно держать в согласии между `shared`, preload-мостом и Angular-транспортом. Фиксированный порт заодно служит защитой «один DevPanel на машину»: десктопное приложение и `.bat`-запускалка используют общий каталог данных (Workspace, PID-файл), и два Сервера над ним считали бы процессы друг друга Зомби. Если порт занят, десктопное приложение спрашивает `/api/hello` и по-русски объясняет, работает ли уже DevPanel или порт занят другой программой. Цена: Ключ доступа нужен и в десктопном приложении (иначе Сервером мог бы управлять любой локальный процесс), и десктопное приложение не запустится, пока работает веб-версия.

## Рассмотренные варианты

- **`IpcTransport` через preload-скрипт с изоляцией контекста.** Убрал бы Ключ доступа и открытый порт, но требует второго `BackendTransport` в `web`, выбора транспорта во время работы, preload-моста с собственными тестами и лишает возможности подключать вкладки браузера как дополнительных клиентов. Пока отклонено; стоит пересмотреть, если открытый порт на localhost станет проблемой безопасности.
- **WebSocket на случайном свободном порту.** Не конфликтует с запущенной веб-версией, но тогда над одним каталогом данных могут работать два Сервера и убивать процессы друг друга или считать их Зомби. Отклонено.
