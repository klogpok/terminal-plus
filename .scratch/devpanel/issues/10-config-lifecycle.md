# 10: Config lifecycle

**What to build:** A Repo without a Repo Config gets suggested Services: packages from `pnpm-workspace.yaml` with `dev`/`start`/`serve` scripts as `pnpm --filter <name> <script>`, otherwise the root `package.json` scripts. The team member ticks the ones they want and saves them as a Local Config in the app data directory (keyed by a hash of the Repo path), never in the Repo. Once a Repo Config appears, it alone is used and the UI offers to delete the Local Config. Config files are watched: stopped Services pick up changes immediately, running ones are flagged "Config changed — restart", Services removed from the config stay listed until stopped, and an invalid file shows an error on the Repo while the last valid config keeps working.

**Blocked by:** 02 (Control a Service from the browser).

**Status:** resolved

- [x] Auto-detection proposes Services from `pnpm-workspace.yaml` packages, else from the root `package.json`; the UI shows them with checkboxes and "Save config".
- [x] `saveLocalConfig` writes the Local Config to the app data directory and nothing into the Repo folder (test asserts the Repo folder is unchanged).
- [x] When both exist, only the Repo Config is used, with no merging; the UI offers to delete the Local Config.
- [x] Editing a watched config emits `configChanged`; stopped Services take the new definition; running ones keep the old one and are flagged.
- [x] A Service removed from the config while running stays listed until it is stopped, then disappears.
- [x] An invalid config shows a plain-Russian error on the Repo, and the last valid config stays active.
- [x] zod validation errors (duplicate ids or ports, unknown dependsOn) are shown on the Repo.

---

## Русский перевод

# 10: Жизненный цикл конфига

**Что сделать:** Репо без Конфига репо получает предложенные Сервисы: пакеты из `pnpm-workspace.yaml` со скриптами `dev`/`start`/`serve` в виде `pnpm --filter <name> <script>`, иначе — скрипты корневого `package.json`. Член команды отмечает нужные галочками и сохраняет их как Локальный конфиг в каталоге данных приложения (ключ — хэш пути Репо), никогда не в Репо. Как только появляется Конфиг репо, используется только он, а UI предлагает удалить Локальный конфиг. За файлами конфигов ведётся наблюдение: остановленные Сервисы сразу получают изменения, запущенные помечаются «Конфиг изменился — перезапустите», Сервисы, удалённые из конфига, остаются в списке до остановки, а невалидный файл показывает ошибку на Репо, пока последний валидный конфиг продолжает работать.

**Блокируется:** 02 (Управление Сервисом из браузера).

**Статус:** resolved

- [x] Автоопределение предлагает Сервисы из пакетов `pnpm-workspace.yaml`, иначе из корневого `package.json`; UI показывает их с галочками и кнопкой «Сохранить конфиг».
- [x] `saveLocalConfig` записывает Локальный конфиг в каталог данных приложения и ничего не пишет в папку Репо (тест проверяет, что папка Репо не изменилась).
- [x] Если есть оба, используется только Конфиг репо, без слияния; UI предлагает удалить Локальный конфиг.
- [x] Правка отслеживаемого конфига испускает `configChanged`; остановленные Сервисы получают новое определение, запущенные сохраняют старое и получают пометку.
- [x] Сервис, удалённый из конфига во время работы, остаётся в списке, пока его не остановят, затем исчезает.
- [x] Невалидный конфиг показывает ошибку на понятном русском на Репо, и активным остаётся последний валидный конфиг.
- [x] Ошибки валидации zod (дубли id или портов, неизвестный dependsOn) показываются на Репо.
