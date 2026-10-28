# 01: Build Error mark on a live Service

**What to build:** While a Service is live (`starting`, `running`, `unhealthy`), DevPanel reads its output line by line and recognizes the summary lines of nx, webpack, Angular CLI and `tsc --watch` (also `nest start --watch` and vite-plugin-checker). A failure line puts a Build Error mark on the Service, a success line takes it off, and the last matching line wins. An optional `errorPattern` in the config adds a failure line, and the Service's `readyPattern` adds a success line. The mark does not change the Status. It disappears when the run ends and is absent on a new run. The dot turns red with "!" and a tooltip, and a collapsed Repo's ❗ lists it. Spec: `.scratch/build-errors/spec.md`.

**Blocked by:** none.

**Status:** resolved

- [x] A `core` detection module recognizes the built-in failure and success lines from the spec table, handling ANSI, chunks split mid-line and Windows symbol variants. It adds `errorPattern` and `readyPattern`, applies "last line wins" and reports only changes.
- [x] The Service schema accepts an optional `errorPattern` validated as a regular expression; the "+ Add Service" form is unchanged.
- [x] `core` keeps the mark per run: none on spawn, removed on exit (Stop, crash, exit), and the Status and Readiness are unaffected.
- [x] `ServiceView.buildError` is in the Snapshot; `buildErrorChanged` is emitted by `core`, forwarded by the Server and applied by `BackendService`.
- [x] Web: Build Error dot (red with "!", distinct from `crashed`), tooltip, ❗ line of a collapsed Repo; strings in both UI string sets.
- [x] Tests:
  - unit tests of the detection module on real tool lines;
  - a `core` test with a fixture Service;
  - a config test for an invalid `errorPattern`;
  - web specs through `FakeTransport`.
- [x] The dot and tooltip are checked by running the app in both Themes. `pnpm check` passes.

## Русский перевод

# 01: Отметка «Ошибка сборки» на живом Сервисе

**Что сделать:** Пока Сервис жив (`starting`, `running`, `unhealthy`), DevPanel читает его вывод построчно и узнаёт итоговые строки nx, webpack, Angular CLI и `tsc --watch` (а также `nest start --watch` и vite-plugin-checker). Строка ошибки ставит на Сервис отметку «Ошибка сборки», строка успеха снимает её, побеждает последняя совпавшая строка. Необязательный `errorPattern` в конфиге добавляет строку ошибки, а `readyPattern` Сервиса — строку успеха. Отметка не меняет Статус. Она исчезает, когда запуск заканчивается, и отсутствует при новом запуске. Точка становится красной с «!» и подсказкой, а ❗ свёрнутого Репо её перечисляет. Спецификация: `.scratch/build-errors/spec.md`.

**Заблокирован:** нет.

**Статус:** resolved

- [x] Модуль распознавания в `core` узнаёт встроенные строки ошибки и успеха из таблицы спеки. Он учитывает ANSI, куски, разрезанные посреди строки, и Windows-варианты символов. Добавляет `errorPattern` и `readyPattern`, применяет правило «побеждает последняя строка» и сообщает только об изменениях.
- [x] Схема Сервиса принимает необязательный `errorPattern`, который проверяется как регулярное выражение; форма «+ Add Service» не меняется.
- [x] `core` хранит отметку для каждого запуска: при spawn её нет, при завершении (Стоп, падение, выход) она убирается, а Статус и Готовность не затрагиваются.
- [x] `ServiceView.buildError` есть в Snapshot. `buildErrorChanged` испускается `core`, пересылается Сервером и применяется в `BackendService`.
- [x] Web: точка Ошибки сборки (красная с «!», отличается от `crashed`), подсказка, строка в ❗ свёрнутого Репо; строки в обоих наборах строк UI.
- [x] Тесты:
  - unit-тесты модуля распознавания на реальных строках инструментов;
  - тест `core` с Сервисом-фикстурой;
  - тест конфига для некорректного `errorPattern`;
  - спеки web через `FakeTransport`.
- [x] Точка и подсказка проверены запуском приложения в обеих Темах. `pnpm check` проходит.
