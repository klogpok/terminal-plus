# Spec: Build Error mark on a live Service

Status: ready-for-agent

## Problem Statement

A dev server in watch mode (`nx serve`, `ng serve`, `tsc --watch`, webpack) does not exit when a build fails: it prints the errors and waits for the next file change. Its process stays alive, so DevPanel shows the Service as green `running` while the app behind it is broken. The user only finds out by opening the terminal tab and reading red text, and in a collapsed Repo they do not find out at all. The same happens when nx restarts the built app and the app exits (`Process exited with code 1, waiting for changes to restart...`).

No process-level signal exists for this: the exit code does not change, and process managers (PM2 and the like) have the same blind spot. The only source is the Service's output, which is how VS Code problem matchers solve it too.

## Solution

DevPanel reads a live Service's output and recognizes the summary lines that common watch tools print after every build. A failure line puts a **Build Error** mark on the Service; a success line takes it off. The mark sits on top of the Status and does not change it: the dot turns red with a "!" and a tooltip says the build has errors, and a collapsed Repo lists it under ❗. Built-in lines cover nx, webpack, Angular CLI, `tsc --watch` (and `nest start --watch`, vite-plugin-checker), with no setup. A developer can add an `errorPattern` in `.devpanel.yml` for other tools; the Service's `readyPattern` also takes the mark off.

## User Stories

1. As a team member, I want a running Service whose build failed to look different from a healthy one, so that I do not think the app works when it does not.
2. As a team member, I want the mark to appear while the Service is still starting or unhealthy, so that I see why it never becomes ready instead of waiting for a timeout.
3. As a team member, I want the mark to go away by itself when the next build succeeds, so that I do not have to reset it.
4. As a team member, I want Stop and Restart to clear the mark, so that a new run starts clean.
5. As a team member, I want the Clear button of the terminal not to clear the mark, so that clearing the log does not hide a broken build.
6. As a team member, I want a collapsed Repo's ❗ to name a Service with a Build Error, so that I notice it without expanding the Repo.
7. As a team member, I want the tooltip in my UI Language, so that I understand what the mark means.
8. As a team member using nx, I want an app that nx restarted and that then exited to get the same mark, so that a dead app inside a live watcher is not green.
9. As a team member, I want it to work for nx, webpack, Angular CLI and `tsc --watch` without any config, so that I do not need a developer to set it up.
10. As a developer, I want an `errorPattern` in `.devpanel.yml`, so that I can cover a tool DevPanel does not know.
11. As a developer, I want the Service's `readyPattern` to take the mark off, so that one line describes "built and ready" for both Readiness and the Build Error.
12. As a team member, I want a page reload or a second browser to show the same mark, so that every window agrees.
13. As a team member, I want Dependencies, "Start all" and Service Sets to behave as before, so that the mark never blocks or starts anything.

## Implementation Decisions

- **A mark, not a Status.** `ServiceStatus` is unchanged. Readiness, `dependsOn`, "Start all" and Service Sets ignore the mark.
- **Detection module in `core`** (next to `readiness.ts`). Input: a live Service's raw pty output, fed in chunks. It splits the output into lines (holding back an unfinished line), strips ANSI, and checks each completed line against the failure and success patterns. **The last matching line wins**: a failure line sets the mark, a success line clears it, other lines change nothing. It reports only changes. One instance per run, disposed with the run.
- **Built-in lines** (from the tools' source, see Further Notes). Not anchored to the line start, since tools prefix timestamps and badges:

  | Tool | Sets the mark | Clears the mark |
  |---|---|---|
  | nx `@nx/js:node` | `Build failed, waiting for changes to restart`; `Process exited with code \d+, waiting for changes to restart` | (its webpack summary below) |
  | webpack 5 | `compiled with \d+ errors?` | `compiled successfully`; `compiled with \d+ warnings?` (only when the line has no "error") |
  | Angular `application` (esbuild) | `Application bundle generation failed.` | `Application bundle generation complete.` |
  | Angular legacy webpack, CRA | `Failed to compile.` | `Compiled successfully` |
  | `tsc --watch`, `nest start --watch`, vite-plugin-checker | `Found [1-9]\d* errors?. Watching for file changes.` | `Found 0 errors. Watching for file changes.` |

  They apply to every Service, always. Vite's own errors (`[vite] Internal server error`, `Pre-transform error`) are not recognized: Vite dev has no reliable success line.
- **Config.** A new optional `errorPattern` in the Service schema, validated as a regular expression like `readyPattern`. It is added to the built-in failure lines, not replacing them. The Service's `readyPattern` is added to the success lines. Both are tested per line. The schema is shared, so a Local Config may hold `errorPattern` too, but the "+ Add Service" form gets no new field.
- **Lifecycle in `core`.** A new run (spawn) starts without the mark; a run's exit (Stop, crash, exit) removes it. With no success line ever seen, the mark stays until the run ends.
- **Contract (`shared`).** `ServiceView.buildError?: boolean` (set only while true), carried in the Snapshot. A new event `buildErrorChanged { repoId, serviceId, buildError }`, following `portConflictChanged` / `waitingChanged`: emitted by `core`, listed in `FORWARDED_EVENTS`, handled by `BackendService`.
- **Web.** While `buildError` is set, the status dot gets a Build Error look (red with "!", distinct from `crashed`) and the tooltip "The build has errors, see the terminal". The buttons stay those of the live Status. `attention()` of a collapsed Repo adds a line "<name>: the build has errors". Strings go in both UI string sets.

## Testing Decisions

- A good test drives a public interface and checks what is observable: marks reported, events emitted, Snapshot fields, what the user sees in the DOM.
- **Detection module, unit tests** (like `readiness.test.ts`), fed real lines from each tool:
  - each built-in failure line sets the mark and each success line clears it;
  - ANSI codes and Windows symbol variants (`×`/`√`, `X [ERROR]`) are handled;
  - a line split across chunks is matched once complete;
  - the last line wins;
  - `errorPattern` adds a failure line and `readyPattern` adds a success line;
  - `compiled with 2 warnings` clears, while `compiled with 1 error and 2 warnings` sets;
  - a plain Vite error does not set the mark, but vite-plugin-checker's `[TypeScript] Found 2 errors. Watching for file changes.` does;
  - neutral lines change nothing.
- **`core` public interface, real process.** A fixture Service prints lines on demand (e.g. echoes what is typed into its terminal):
  - `buildErrorChanged` is emitted on set and clear;
  - the Snapshot carries `buildError`;
  - the mark appears while `starting` and does not change the Status or Readiness;
  - Stop and Restart remove it.

  Prior art: `depends-on.test.ts`, `harness.ts`, `fixtures/echo-stdin.mjs`.
- **Config:** `errorPattern` that is not a valid regular expression is rejected like `readyPattern` (prior art: `config.test.ts`).
- **Web through `FakeTransport`:**
  - a Snapshot with `buildError` shows the Build Error dot and tooltip;
  - `buildErrorChanged` toggles it;
  - a collapsed Repo's ❗ lists it.

  Prior art: `service-status.spec.ts`, `collapse-repos.spec.ts`.
- **Look:** the dot and tooltip are checked by running the app (`/run`) in both Themes.

## Out of Scope

- Vite's own dev-server errors.
- Notifications and the tray.
- An `errorPattern` field in the "+ Add Service" form.
- A separate success pattern (`okPattern`) in the config.
- Tracking several tools or compilers in one Service separately (see Further Notes).
- Showing the error text, the error count or warnings.
- Clearing the mark by hand.
- Detecting errors after Readiness by any means other than output (health or port monitoring stays out of scope).

## Further Notes

- **Known limitation, last line wins.** If one process prints several builds (several webpack compilers, Vite plus a checker), a success of one clears a failure of another.
- **Known limitation, no success line.** With an `errorPattern` and no `readyPattern` or built-in success line, the mark stays until the next restart; the config docs should advise setting `readyPattern` with `errorPattern`.
- **False positives.** An app that itself logs a line like "Failed to compile." gets the mark. The built-in lines are narrow, so this is accepted.
- **Sources of the built-in lines:**
  - nx: `packages/js/src/executors/node/node.impl.ts`;
  - webpack: `lib/stats/DefaultStatsPrinterPlugin.js`;
  - Angular: `packages/angular/build/src/builders/application/index.js` and `packages/angular_devkit/build_angular/src/builders/dev-server/webpack-server.ts`;
  - CRA: `react-dev-utils/WebpackDevServerUtils.js`;
  - TypeScript: `diagnosticMessages.json` 6193/6194;
  - esbuild: Windows prints `X [ERROR]` instead of `✘ [ERROR]`;
  - ansi-colors: `×`/`√` on win32.
- **Localized tsc.** With `--locale`, tsc prints translated lines that the built-in patterns miss; `errorPattern` covers that.

## Русский перевод

# Спецификация: отметка «Ошибка сборки» на живом Сервисе

Status: ready-for-agent

## Постановка проблемы

Dev-сервер в режиме watch (`nx serve`, `ng serve`, `tsc --watch`, webpack) не завершается, когда сборка не прошла: он печатает ошибки и ждёт следующего изменения файлов. Его процесс жив, поэтому DevPanel показывает Сервис зелёным `running`, хотя приложение за ним сломано. Пользователь узнаёт об этом, только открыв вкладку терминала и прочитав красный текст, а в свёрнутом Репо не узнаёт вовсе. То же самое происходит, когда nx перезапускает собранное приложение и оно завершается (`Process exited with code 1, waiting for changes to restart...`).

Сигнала на уровне процесса для этого нет: код выхода не меняется, и у менеджеров процессов (PM2 и подобных) та же слепая зона. Единственный источник — вывод Сервиса. Так эту задачу решают и problem matchers в VS Code.

## Решение

DevPanel читает вывод живого Сервиса и узнаёт итоговые строки, которые распространённые watch-инструменты печатают после каждой сборки. Строка ошибки ставит на Сервис отметку **Ошибка сборки**, строка успеха её снимает. Отметка лежит поверх Статуса и не меняет его. Точка становится красной с «!», подсказка сообщает, что сборка с ошибкой, а свёрнутый Репо показывает её под ❗. Встроенные строки покрывают nx, webpack, Angular CLI и `tsc --watch` (а также `nest start --watch` и vite-plugin-checker) без настройки. Для других инструментов разработчик может задать `errorPattern` в `.devpanel.yml`. `readyPattern` Сервиса тоже снимает отметку.

## Пользовательские истории

1. Как член команды, я хочу, чтобы работающий Сервис с упавшей сборкой выглядел иначе, чем здоровый, чтобы не думать, что приложение работает, когда оно не работает.
2. Как член команды, я хочу, чтобы отметка появлялась, пока Сервис ещё starting или unhealthy, чтобы видеть, почему он не становится готовым, а не ждать тайм-аута.
3. Как член команды, я хочу, чтобы отметка сама пропадала, когда следующая сборка прошла, чтобы не сбрасывать её вручную.
4. Как член команды, я хочу, чтобы «Стоп» и «Перезапуск» снимали отметку, чтобы новый запуск начинался с чистого листа.
5. Как член команды, я хочу, чтобы кнопка Clear в терминале не снимала отметку, чтобы очистка лога не прятала сломанную сборку.
6. Как член команды, я хочу, чтобы ❗ свёрнутого Репо называл Сервис с Ошибкой сборки, чтобы замечать её, не разворачивая Репо.
7. Как член команды, я хочу видеть подсказку на моём Языке интерфейса, чтобы понимать, что означает отметка.
8. Как член команды, работающий с nx, я хочу, чтобы приложение, которое nx перезапустил и которое затем завершилось, получало ту же отметку, чтобы мёртвое приложение внутри живого watch-процесса не было зелёным.
9. Как член команды, я хочу, чтобы это работало для nx, webpack, Angular CLI и `tsc --watch` без какого-либо конфига, чтобы не звать разработчика для настройки.
10. Как разработчик, я хочу `errorPattern` в `.devpanel.yml`, чтобы покрыть инструмент, которого DevPanel не знает.
11. Как разработчик, я хочу, чтобы `readyPattern` Сервиса снимал отметку, чтобы одна строка описывала «собрано и готово» и для Готовности, и для Ошибки сборки.
12. Как член команды, я хочу, чтобы после перезагрузки страницы или во втором браузере была видна та же отметка, чтобы все окна показывали одно и то же.
13. Как член команды, я хочу, чтобы Зависимости, «Запустить всё» и Наборы работали как раньше, чтобы отметка ничего не блокировала и ничего не запускала.

## Решения по реализации

- **Отметка, а не Статус.** `ServiceStatus` не меняется. Готовность, `dependsOn`, «Запустить всё» и Наборы отметку не учитывают.
- **Модуль распознавания в `core`** (рядом с `readiness.ts`). На вход получает сырой вывод pty живого Сервиса кусками. Делит вывод на строки (незаконченную строку придерживает), убирает ANSI и сверяет каждую законченную строку с шаблонами ошибки и успеха. **Побеждает последняя совпавшая строка**: строка ошибки ставит отметку, строка успеха снимает, остальные строки ничего не меняют. Сообщает только об изменениях. Один экземпляр на запуск, уничтожается вместе с запуском.
- **Встроенные строки** (из исходников инструментов, см. «Дополнительные заметки»). Не привязаны к началу строки, потому что инструменты добавляют впереди время и бейджи:

  | Инструмент | Ставит отметку | Снимает отметку |
  |---|---|---|
  | nx `@nx/js:node` | `Build failed, waiting for changes to restart`; `Process exited with code \d+, waiting for changes to restart` | (его сводка webpack ниже) |
  | webpack 5 | `compiled with \d+ errors?` | `compiled successfully`; `compiled with \d+ warnings?` (только если в строке нет «error») |
  | Angular `application` (esbuild) | `Application bundle generation failed.` | `Application bundle generation complete.` |
  | Angular legacy webpack, CRA | `Failed to compile.` | `Compiled successfully` |
  | `tsc --watch`, `nest start --watch`, vite-plugin-checker | `Found [1-9]\d* errors?. Watching for file changes.` | `Found 0 errors. Watching for file changes.` |

  Они действуют для всех Сервисов всегда. Собственные ошибки Vite (`[vite] Internal server error`, `Pre-transform error`) не распознаются: у dev-режима Vite нет надёжной строки успеха.
- **Конфиг.** В схеме Сервиса появляется необязательное поле `errorPattern`, которое проверяется как регулярное выражение, так же как `readyPattern`. Оно добавляется к встроенным строкам ошибки и не заменяет их. `readyPattern` Сервиса добавляется к строкам успеха. Оба проверяются построчно. Схема общая, поэтому `errorPattern` может быть и в Локальном конфиге, но форма «+ Add Service» нового поля не получает.
- **Жизненный цикл в `core`.** Новый запуск (spawn) начинается без отметки; завершение запуска (Стоп, падение, выход) её убирает. Если строка успеха так и не появилась, отметка держится до конца запуска.
- **Контракт (`shared`).** `ServiceView.buildError?: boolean` (задаётся, только пока true) передаётся в Snapshot. Новое событие `buildErrorChanged { repoId, serviceId, buildError }` устроено по образцу `portConflictChanged` / `waitingChanged`: его испускает `core`, оно указано в `FORWARDED_EVENTS` и обрабатывается в `BackendService`.
- **Web.** Пока `buildError` задан, точка статуса выглядит как Ошибка сборки (красная с «!», отличается от `crashed`), а подсказка гласит «Сборка с ошибкой — смотрите терминал». Кнопки остаются такими же, как у живого Статуса. `attention()` свёрнутого Репо добавляет строку «<имя>: сборка с ошибкой». Строки добавляются в оба набора строк UI.

## Решения по тестированию

- Хороший тест управляет публичным интерфейсом и проверяет наблюдаемое: сообщённые отметки, испущенные события, поля Snapshot, то, что пользователь видит в DOM.
- **Модуль распознавания, unit-тесты** (как `readiness.test.ts`) на реальных строках каждого инструмента:
  - каждая встроенная строка ошибки ставит отметку, а каждая строка успеха снимает;
  - ANSI-коды и Windows-варианты символов (`×`/`√`, `X [ERROR]`) обрабатываются;
  - строка, разрезанная между кусками, распознаётся, когда закончится;
  - побеждает последняя строка;
  - `errorPattern` добавляет строку ошибки, а `readyPattern` — строку успеха;
  - `compiled with 2 warnings` снимает отметку, а `compiled with 1 error and 2 warnings` ставит;
  - обычная ошибка Vite отметку не ставит, а `[TypeScript] Found 2 errors. Watching for file changes.` от vite-plugin-checker ставит;
  - нейтральные строки ничего не меняют.
- **Публичный интерфейс `core`, реальный процесс.** Сервис-фикстура печатает строки по запросу (например, повторяет то, что ввели в его терминал):
  - `buildErrorChanged` испускается при установке и снятии;
  - Snapshot содержит `buildError`;
  - отметка появляется в `starting` и не меняет ни Статус, ни Готовность;
  - «Стоп» и «Перезапуск» её убирают.

  Прецеденты: `depends-on.test.ts`, `harness.ts`, `fixtures/echo-stdin.mjs`.
- **Конфиг:** `errorPattern`, не являющийся корректным регулярным выражением, отклоняется так же, как `readyPattern` (прецедент: `config.test.ts`).
- **Web через `FakeTransport`:**
  - Snapshot с `buildError` показывает точку и подсказку Ошибки сборки;
  - `buildErrorChanged` её переключает;
  - ❗ свёрнутого Репо её перечисляет.

  Прецеденты: `service-status.spec.ts`, `collapse-repos.spec.ts`.
- **Внешний вид:** точку и подсказку проверяем запуском приложения (`/run`) в обеих Темах.

## Вне рамок

- Собственные ошибки dev-сервера Vite.
- Уведомления и трей.
- Поле `errorPattern` в форме «+ Add Service».
- Отдельный шаблон успеха (`okPattern`) в конфиге.
- Раздельное отслеживание нескольких инструментов или компиляторов в одном Сервисе (см. «Дополнительные заметки»).
- Показ текста ошибки, числа ошибок или предупреждений.
- Ручное снятие отметки.
- Распознавание ошибок после Готовности иначе, чем по выводу (мониторинг health и порта по-прежнему вне рамок).

## Дополнительные заметки

- **Известное ограничение: побеждает последняя строка.** Если один процесс печатает несколько сборок (несколько компиляторов webpack, Vite вместе с checker), успех одной снимает ошибку другой.
- **Известное ограничение: нет строки успеха.** Если задан `errorPattern`, а нет ни `readyPattern`, ни встроенной строки успеха, отметка держится до следующего перезапуска. В документации конфига стоит советовать задавать `readyPattern` вместе с `errorPattern`.
- **Ложные срабатывания.** Приложение, которое само пишет в лог строку вроде «Failed to compile.», получит отметку. Встроенные строки узкие, поэтому это принято.
- **Источники встроенных строк:**
  - nx: `packages/js/src/executors/node/node.impl.ts`;
  - webpack: `lib/stats/DefaultStatsPrinterPlugin.js`;
  - Angular: `packages/angular/build/src/builders/application/index.js` и `packages/angular_devkit/build_angular/src/builders/dev-server/webpack-server.ts`;
  - CRA: `react-dev-utils/WebpackDevServerUtils.js`;
  - TypeScript: `diagnosticMessages.json` 6193/6194;
  - esbuild: на Windows печатает `X [ERROR]` вместо `✘ [ERROR]`;
  - ansi-colors: `×`/`√` на win32.
- **Локализованный tsc.** С `--locale` tsc печатает переведённые строки, которые встроенные шаблоны не узнают; это покрывается `errorPattern`.
