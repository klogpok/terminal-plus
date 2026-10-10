# 01: Start and stop a Service with full process-tree kill

**What to build:** The first proof that DevPanel can run a Service on Windows and stop it without leaving anything behind. Set up the pnpm monorepo (`core`, `shared`, `server`, `web` packages), get `node-pty` installed on Windows (fall back to a prebuilt-binary fork if the build tools are missing), and make `core` read the Workspace file and a Repo Config, start a Service through `cmd.exe`, and stop it with Ctrl+C, a grace period, then `taskkill /T /F`. Establish the `core` test harness: `core` constructed with a temporary app data directory and short timings, and Node fixture scripts used as Service commands. See the spec: `.scratch/devpanel/spec.md`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The monorepo builds with pnpm; `core` has no dependency on Fastify or Electron.
- [ ] `node-pty` installs and spawns on Windows; the chosen package (original or prebuilt fork) is recorded in the Further Notes of the spec or an ADR if it was a real trade-off.
- [ ] `core` loads Repos from the Workspace file and Services from each Repo's Repo Config, validated with zod (unique Service ids and ports, dependsOn to same-Repo Services only).
- [ ] `startService` spawns through `cmd.exe /d /s /c`, with `cwd` resolved against the Repo path and `FORCE_COLOR=1`.
- [ ] `stopService` sends Ctrl+C, waits the configurable grace period, then kills the tree; a test with a fixture that spawns a grandchild and ignores Ctrl+C proves no process from the tree survives.
- [ ] Timings and the app data directory are constructor options of `core`.
- [ ] Fixture scripts exist for: spawn a grandchild, listen on a port (IPv4/IPv6/any), print a ready line after a delay, exit with a code after a delay, ignore Ctrl+C, echo stdin.
- [ ] Manually verified on a real pnpm project: after Stop, no `node.exe` from that Service remains.

---

## Русский перевод

# 01: Запуск и остановка Сервиса с убийством всего дерева процессов

**Что сделать:** Первое доказательство того, что DevPanel умеет запускать Сервис на Windows и останавливать его, ничего не оставляя. Развернуть монорепо на pnpm (пакеты `core`, `shared`, `server`, `web`), добиться установки `node-pty` на Windows (если нет build tools — взять форк с готовыми бинарниками) и научить `core` читать файл Workspace и Конфиг репо, запускать Сервис через `cmd.exe` и останавливать его: Ctrl+C, период ожидания, затем `taskkill /T /F`. Заложить тестовую обвязку `core`: `core` создаётся со временным каталогом данных приложения и короткими таймингами, а командами Сервисов служат Node-скрипты-фикстуры. См. спеку: `.scratch/devpanel/spec.md`.

**Блокируется:** Нет (можно начинать сразу).

**Статус:** ready-for-agent

- [ ] Монорепо собирается pnpm; `core` не зависит от Fastify и Electron.
- [ ] `node-pty` устанавливается и запускает процессы на Windows; выбранный пакет (оригинал или форк с бинарниками) записан в «Дополнительные заметки» спеки или в ADR, если это был реальный компромисс.
- [ ] `core` загружает Репо из файла Workspace и Сервисы из Конфига репо каждого Репо с валидацией zod (уникальные id Сервисов и порты, dependsOn только на Сервисы того же Репо).
- [ ] `startService` запускает через `cmd.exe /d /s /c`, `cwd` разрешается относительно пути Репо, добавляется `FORCE_COLOR=1`.
- [ ] `stopService` отправляет Ctrl+C, ждёт настраиваемый период, затем убивает дерево; тест с фикстурой, которая порождает внука и игнорирует Ctrl+C, доказывает, что ни один процесс дерева не выжил.
- [ ] Тайминги и каталог данных приложения — опции конструктора `core`.
- [ ] Есть скрипты-фикстуры для: порождения внука, прослушивания порта (IPv4/IPv6/любой адрес), печати строки готовности с задержкой, выхода с кодом после задержки, игнорирования Ctrl+C, повтора stdin.
- [ ] Вручную проверено на реальном pnpm-проекте: после «Стоп» не остаётся ни одного `node.exe` этого Сервиса.
