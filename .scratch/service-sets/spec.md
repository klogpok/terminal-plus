# Spec: Service Sets

Status: resolved

## Problem Statement

A team member works with three or four Repos at once. Every morning they have to bring up the same Services in each of them: open the first Repo, press Start on the API, open the next, press Start on the web app, and so on. "Start all" exists only per Repo, and it starts every Service of that Repo, including ones they do not need today. There is "Stop everything in all Repos" in the tray, but no way to bring a working day back up in one click. With the window closed, nothing can be started at all.

## Solution

The user saves named **Service Sets**: each one is a list of Services picked from any Repos of the Workspace, for example "Project X" = `api` from Repo A, `web` from Repo B, `db` from Repo C. A Service Set lives only on this machine; the user creates, edits, renames and deletes it in the UI, never in `.devpanel.yml`.

One click starts a Service Set, from a "Service Sets" menu at the top of the panel or from the tray menu without opening the window. Starting a Service Set starts each of its Services that is not running yet (with their dependencies, as a normal Start does) and leaves every other Service alone. When a Service of the Set no longer exists, it is skipped and the user is told; when it comes back, the Set uses it again. When a Set started from the tray does not bring every Service to `running`, DevPanel opens its window so the user sees what went wrong.

## User Stories

### Creating and editing

1. As a team member, I want to create a Service Set from a "Service Sets" menu at the top of the panel, so that I can save the Services I start every morning.
2. As a team member, I want the Service Set dialog to list every Service of every Repo with a checkbox, grouped by Repo with the Repo's name and color, so that I can pick Services across Repos in one place.
3. As a team member, I want the Services that are running right now to be pre-checked when I create a Service Set, so that saving my current working state takes one click.
4. As a team member, I want to give a Service Set a name, so that I can tell several Sets apart ("Project X", "Support").
5. As a team member, I want DevPanel to refuse an empty name or a name another Service Set already has (ignoring case), and say so in plain words, so that two menu entries never look the same.
6. As a team member, I want DevPanel to refuse a Service Set with no Services, so that a click never does nothing.
7. As a team member, I want to open an existing Service Set in the same dialog and change its name and Services, so that I can keep it up to date.
8. As a team member, I want to delete a Service Set after confirming, so that old Sets do not clutter the menu.
9. As a team member, I want to have several Service Sets, so that I can switch between kinds of work.
10. As a team member, I want my Service Sets to survive closing the window, Exit DevPanel and a computer restart, so that I set them up once.
11. As a team member, I want changes to Service Sets to show at once in every open DevPanel window and in the tray menu, so that they never disagree.
12. As a team member, I want Service Sets never written into a Repo, so that my personal setup never ends up in a commit.

### Starting

13. As a team member, I want to start a Service Set with one click in the "Service Sets" menu, so that my working day is up without visiting each Repo.
14. As a team member, I want to start a Service Set from the tray menu without opening the window, so that I can bring everything up right after turning on the computer.
15. As a team member, I want Services of the Set that already run to be left as they are, so that a second click does not restart anything.
16. As a team member, I want Services that are not in the Set to be left as they are, running or not, so that starting a Set never stops my other work.
17. As a team member, I want the dependencies (dependsOn) of a Set's Services to start automatically, as they do for a normal Start, so that I do not have to add them to the Set.
18. As a team member, I want the Services of a Set to start in parallel (dependencies still ordering them), so that the morning start is as quick as "Start all".
19. As a team member, I want each Service to show its usual Status while the Set starts, so that I see progress the way I am used to.
20. As a team member, I want one Service that fails to start not to hold back the others, so that I get as much running as possible.

### Missing Services

21. As a team member, I want a Service that was removed from its Repo's config, or whose Repo was removed from the Workspace, to stay in the Set marked "not found", so that a temporary change (a branch switch, a config edit) does not silently lose it.
22. As a team member, I want a "not found" Service to be skipped when the Set starts, and the rest to start, so that one missing Service does not block my day.
23. As a team member, I want to be told which Services of the Set were not found after starting it, so that I know something is missing.
24. As a team member, I want a "not found" Service to work again in the Set once it is back (the config is restored, the Repo is added again at the same path), so that I do not have to recreate the Set.
25. As a team member, I want to see "not found" Services in the Service Set dialog and be able to uncheck them, so that I can clean the Set up.

### Failures

26. As a team member, I want to be told after starting a Set from the panel which Services did not reach `running` (blocked by a taken port, a failed dependency, crashed, exited or unhealthy), so that I know what to look at.
27. As a team member who started a Set from the tray with the window closed, I want DevPanel to open its window when some Service of the Set did not reach `running` or was not found, so that I learn about it right away and can act (for example resolve a port conflict).
28. As a team member, I want no window to pop up when every Service of the Set reached `running`, so that a successful morning start stays quiet.
29. As a team member, I want a Service that crashes after it reached `running` not to count as a failure of the Set start, so that the window does not pop up hours later.
30. As a team member, I want port conflicts of a Set's Services to show the usual port-conflict choice in the panel, so that I resolve them the way I already know.

### Language and access

31. As a team member, I want the Service Sets menu, the dialog, the tray entries and all messages in the current UI Language, so that the feature reads like the rest of DevPanel.
32. As a keyboard user, I want the menu and the dialog to work with the keyboard, so that I can use Service Sets without a mouse.
33. As a screen reader user, I want the checkboxes labelled with the Repo and Service name, and "not found" announced, so that I know what I am checking.

## Implementation Decisions

- **Domain term.** "Service Set" (Russian: "Набор") is a new glossary term: a named list of Services from any Repos of the Workspace, stored only on this machine, started with one click. It is not a "template"; that word stays free for future one-off commands.
- **Storage.** Service Sets are a Server-side, per-machine list kept in their own file in the app data directory, next to the Workspace file. They are written the same way as the Workspace (temp file + rename) and validated with zod on read. A missing file means no Service Sets. They are never written into a Repo or its Local Config.
- **Identity.** A Service Set has a generated id that stays fixed when the Set is renamed. An entry is a `ServiceRef` (Repo id + Service id). The Repo id is the hash of the Repo path, so a Repo removed and added again at the same path matches its old entries. Order of Sets: creation order.
- **Entries are not cleaned up automatically.** Removing a Service from a config or a Repo from the Workspace leaves the entry in the Set. The view marks it "not found".
- **Core (`DevPanelCore`)**, in its own module, since Service Sets have their own reason to change:
  - `createServiceSet({ name, services })`, `updateServiceSet({ id, name, services })`, `deleteServiceSet({ id })`. Name trimmed, non-empty, unique ignoring case (`serviceSetNameTaken`). At least one Service (`serviceSetEmpty`). Unknown id: `serviceSetNotFound`. Saving entries that are currently not found is allowed.
  - `startServiceSet({ id })`: starts every found entry through the existing `startService` path (so dependencies, port checks and Orphans behave exactly like a normal Start), in parallel, and skips entries that are already `running` or `starting`. It resolves once every started Service has settled: reached `running`, or ended up anything else (start rejected, `crashed`, `exited`, `unhealthy`, `stopped`). Result: `{ notFound: ServiceRef[]; notRunning: ServiceRef[] }`, both empty on success. It never stops anything.
  - An event `serviceSetsChanged` carrying the full list, emitted after each create/update/delete and when the Workspace or a config changes whether an entry is found. The list is part of `Snapshot`.
- **Shared wire contract.** New commands `createServiceSet`, `updateServiceSet`, `deleteServiceSet`, `startServiceSet`. New view `ServiceSetView { id; name; services: { ref: ServiceRef; found: boolean }[] }`. New event `serviceSetsChanged`. New error codes `serviceSetNameTaken`, `serviceSetEmpty`, `serviceSetNotFound`, worded in both UI string sets.
- **Server.** One zod-validated handler per command and `serviceSetsChanged` in the forwarded events, following the usual recipe.
- **Web.**
  - A "Service Sets" menu in the header: one entry per Set (click starts it), "New Service Set…", and an edit action per Set.
  - The Service Set dialog: name field, every Service of every Repo grouped by Repo with checkboxes (running ones pre-checked for a new Set), "not found" entries listed separately with their stored ids so they can be unchecked, Save / Delete (with confirmation) / Cancel.
  - `BackendService` keeps the list from the snapshot and `serviceSetsChanged`. Starting a Set uses a Promise command. When the result is not empty, the panel shows one plain-language message naming the not-found and not-running Services. Failures of single Services are also visible through their usual Statuses and port-conflict prompts.
- **Desktop.** `RunningServer` gains the Service Sets list, a change listener, and `startServiceSet`. The tray menu lists one item per Set between "Show" and "Stop everything in all Repos", with stable ids derived from the Set id, and is rebuilt on `serviceSetsChanged` as it is on `uiLanguageChanged`. Clicking a Set item starts it. When the result is not empty or the start rejects, the window is shown. The tray texts (a section label, if any) go into `HOST_STRINGS` for both UI Languages. No change to the Rust shell is needed: tray items already travel as id + label.

## Testing Decisions

- A good test checks behaviour visible through a public seam (commands, events, snapshot, tray items, rendered DOM), never internal fields. No new seams.
- **Seam 1 — `DevPanelCore` through the core test harness** (real processes on Windows): create/update/delete with every refusal (empty name, taken name ignoring case, no Services, unknown id); the list survives a new core on the same app data dir; `startServiceSet` starts only the Set's stopped Services, leaves others (in and out of the Set) untouched, starts dependencies, reports `notFound` for a removed Service and a removed Repo, reports `notRunning` for a crashing fixture and a port taken by a listener fixture, and returns empty lists when everything reaches `running`; an entry becomes found again when the Repo is re-added at the same path; `serviceSetsChanged` fires on each change. Prior art: the `startAll` / dependency / port-conflict tests and the Workspace persistence tests.
- **Seam 2 — web through `BackendTransport` (`FakeTransport`)**: menu lists Sets from the snapshot and follows `serviceSetsChanged`; clicking a Set sends `startServiceSet`; a non-empty result shows the message; the dialog pre-checks running Services for a new Set, sends create/update with the checked refs, shows server refusals, lists not-found entries, and deletes after confirmation. Prior art: `stop-all.spec.ts`, `edit-local-config.spec.ts`, `reorder-repos.spec.ts`.
- **Seam 3 — desktop through fake `DesktopHost` / `RunningServer`**: tray lists Sets in order and rebuilds on change; clicking an item calls `startServiceSet`; the window is shown on a non-empty result or a rejection and not on success. Prior art: the `stopAllRepos` tray tests in `desktop-app.test.ts`.
- A server round-trip test is optional, as for other commands.

## Out of Scope

- One-off commands (git pull, install, migrations, build, test) and running them before a Set. This is a separate future feature ("Tasks").
- "Stop Service Set". The existing "Stop everything in all Repos" covers the end of the day.
- Starting a Set automatically when DevPanel or Windows starts.
- Service Sets stored in `.devpanel.yml` or shared with the team.
- Stopping Services outside the Set when a Set starts ("switch context").
- Reordering Service Sets.

## Further Notes

- "Service Set (Набор)" is already defined in `GLOSSARY.md`.
- The "Settings" button and auto-opening terminal tabs are a separate spec (`.scratch/settings-menu/spec.md`). Together they let a Set start show its terminals, but neither depends on the other.

## Русский перевод

# Спецификация: Наборы

Status: resolved

## Постановка проблемы

Член команды работает с тремя-четырьмя Репо одновременно. Каждое утро ему приходится поднимать в каждом из них одни и те же Сервисы: открыть первый Репо, нажать «Старт» у API, открыть следующий, нажать «Старт» у веб-приложения и так далее. «Запустить всё» есть только для одного Репо, и оно запускает все Сервисы этого Репо, включая те, что сегодня не нужны. В трее есть «Остановить всё во всех Репо», но поднять рабочий день одним кликом нельзя. При закрытом окне вообще ничего нельзя запустить.

## Решение

Пользователь сохраняет именованные **Наборы**. Каждый Набор — это список Сервисов из любых Репо Workspace, например «Проект X» = `api` из Репо A, `web` из Репо B, `db` из Репо C. Набор существует только на этой машине. Пользователь создаёт, правит, переименовывает и удаляет его в UI, а не в `.devpanel.yml`.

Набор запускается одним кликом: из меню «Наборы» вверху панели или из меню трея, не открывая окно. Запуск Набора стартует каждый его Сервис, который ещё не запущен (вместе с его Зависимостями, как обычный «Старт»), и не трогает остальные Сервисы. Если Сервиса из Набора больше нет, он пропускается, и пользователю об этом сообщают. Когда Сервис вернётся, Набор снова его использует. Если Набор, запущенный из трея, не довёл какой-то Сервис до `running`, DevPanel открывает своё окно, чтобы пользователь увидел, что пошло не так.

## Пользовательские истории

### Создание и правка

1. Как член команды, я хочу создать Набор из меню «Наборы» вверху панели, чтобы сохранить Сервисы, которые запускаю каждое утро.
2. Как член команды, я хочу, чтобы диалог Набора показывал все Сервисы всех Репо с галочками, сгруппированные по Репо с его именем и цветом, чтобы выбирать Сервисы из разных Репо в одном месте.
3. Как член команды, я хочу, чтобы при создании Набора запущенные сейчас Сервисы были отмечены заранее, чтобы сохранить текущее рабочее состояние одним кликом.
4. Как член команды, я хочу дать Набору имя, чтобы различать несколько Наборов («Проект X», «Поддержка»).
5. Как член команды, я хочу, чтобы DevPanel отказывала в пустом имени или имени, которое уже есть у другого Набора (без учёта регистра), и говорила об этом простыми словами, чтобы два пункта меню никогда не выглядели одинаково.
6. Как член команды, я хочу, чтобы DevPanel отказывала в Наборе без Сервисов, чтобы клик никогда не делал ничего.
7. Как член команды, я хочу открыть существующий Набор в том же диалоге и поменять его имя и Сервисы, чтобы поддерживать его в актуальном виде.
8. Как член команды, я хочу удалить Набор после подтверждения, чтобы старые Наборы не загромождали меню.
9. Как член команды, я хочу иметь несколько Наборов, чтобы переключаться между видами работы.
10. Как член команды, я хочу, чтобы Наборы переживали закрытие окна, Выход из DevPanel и перезагрузку компьютера, чтобы настроить их один раз.
11. Как член команды, я хочу, чтобы изменения Наборов сразу появлялись во всех открытых окнах DevPanel и в меню трея, чтобы они никогда не расходились.
12. Как член команды, я хочу, чтобы Наборы никогда не записывались в Репо, чтобы мои личные настройки не попали в коммит.

### Запуск

13. Как член команды, я хочу запустить Набор одним кликом в меню «Наборы», чтобы рабочий день поднялся без захода в каждый Репо.
14. Как член команды, я хочу запустить Набор из меню трея, не открывая окно, чтобы поднять всё сразу после включения компьютера.
15. Как член команды, я хочу, чтобы уже работающие Сервисы Набора оставались как есть, чтобы второй клик ничего не перезапускал.
16. Как член команды, я хочу, чтобы Сервисы не из Набора оставались как есть, запущенные или нет, чтобы запуск Набора никогда не останавливал мою другую работу.
17. Как член команды, я хочу, чтобы Зависимости (dependsOn) Сервисов Набора запускались сами, как при обычном «Старте», чтобы не добавлять их в Набор.
18. Как член команды, я хочу, чтобы Сервисы Набора запускались параллельно (с учётом порядка Зависимостей), чтобы утренний запуск был таким же быстрым, как «Запустить всё».
19. Как член команды, я хочу, чтобы во время запуска Набора каждый Сервис показывал свой обычный Статус, чтобы видеть прогресс привычным образом.
20. Как член команды, я хочу, чтобы один не запустившийся Сервис не задерживал остальные, чтобы запустилось как можно больше.

### Пропавшие Сервисы

21. Как член команды, я хочу, чтобы Сервис, убранный из конфига своего Репо, или Сервис, чей Репо удалён из Workspace, оставался в Наборе с пометкой «не найден», чтобы временное изменение (смена ветки, правка конфига) не теряло его молча.
22. Как член команды, я хочу, чтобы «не найденный» Сервис пропускался при запуске Набора, а остальные запускались, чтобы один пропавший Сервис не срывал мне день.
23. Как член команды, я хочу после запуска Набора узнать, какие его Сервисы не найдены, чтобы понимать, что чего-то не хватает.
24. Как член команды, я хочу, чтобы «не найденный» Сервис снова работал в Наборе, когда он вернётся (конфиг восстановлен, Репо снова добавлен по тому же пути), чтобы не пересоздавать Набор.
25. Как член команды, я хочу видеть «не найденные» Сервисы в диалоге Набора и иметь возможность снять с них галочку, чтобы почистить Набор.

### Неудачи

26. Как член команды, я хочу после запуска Набора из панели узнать, какие Сервисы не дошли до `running` (заблокированы занятым портом, упавшей Зависимостью, стали crashed, exited или unhealthy), чтобы понимать, куда смотреть.
27. Как член команды, запустивший Набор из трея при закрытом окне, я хочу, чтобы DevPanel открыла своё окно, если какой-то Сервис Набора не дошёл до `running` или не найден, чтобы сразу узнать об этом и действовать (например, разрешить конфликт порта).
28. Как член команды, я хочу, чтобы окно не всплывало, если все Сервисы Набора дошли до `running`, чтобы удачный утренний запуск проходил тихо.
29. Как член команды, я хочу, чтобы Сервис, упавший уже после того, как стал `running`, не считался неудачей запуска Набора, чтобы окно не всплывало через несколько часов.
30. Как член команды, я хочу, чтобы конфликты портов Сервисов Набора показывали в панели обычный выбор действия при конфликте порта, чтобы разрешать их привычным способом.

### Язык и доступность

31. Как член команды, я хочу, чтобы меню «Наборы», диалог, пункты трея и все сообщения были на текущем Языке интерфейса, чтобы фича читалась так же, как остальная DevPanel.
32. Как пользователь клавиатуры, я хочу, чтобы меню и диалог работали с клавиатуры, чтобы пользоваться Наборами без мыши.
33. Как пользователь экранного диктора, я хочу, чтобы у галочек были подписи с именем Репо и Сервиса, а «не найден» озвучивался, чтобы понимать, что я отмечаю.

## Решения по реализации

- **Термин предметной области.** «Набор» (англ. «Service Set») — новый термин глоссария: именованный список Сервисов из любых Репо Workspace, который хранится только на этой машине и запускается одним кликом. Это не «шаблон»: это слово остаётся свободным для будущих разовых команд.
- **Хранение.** Наборы — это список на Сервере, свой для каждой машины. Он лежит в отдельном файле в папке данных приложения, рядом с файлом Workspace. Записывается так же, как Workspace (временный файл + переименование), и при чтении проверяется через zod. Нет файла — нет Наборов. В Репо и его Локальный конфиг Наборы никогда не записываются.
- **Идентичность.** У Набора есть сгенерированный id, который не меняется при переименовании. Запись в Наборе — это `ServiceRef` (id Репо + id Сервиса). Id Репо — хеш пути Репо, поэтому Репо, удалённый и снова добавленный по тому же пути, совпадает со своими старыми записями. Порядок Наборов — порядок создания.
- **Записи не чистятся автоматически.** Если Сервис убрали из конфига или Репо удалили из Workspace, запись остаётся в Наборе. Представление помечает её «не найден».
- **Core (`DevPanelCore`)**, в отдельном модуле, потому что у Наборов своя причина меняться:
  - `createServiceSet({ name, services })`, `updateServiceSet({ id, name, services })`, `deleteServiceSet({ id })`. Имя обрезается по краям, не пустое и уникально без учёта регистра (`serviceSetNameTaken`). Хотя бы один Сервис (`serviceSetEmpty`). Неизвестный id — `serviceSetNotFound`. Сохранять записи, которые сейчас не найдены, разрешено.
  - `startServiceSet({ id })`: запускает каждую найденную запись через существующий путь `startService` (поэтому Зависимости, проверка портов и Зомби работают ровно как при обычном «Старте»), параллельно, и пропускает записи, которые уже `running` или `starting`. Завершается, когда каждый запущенный Сервис пришёл к итогу: стал `running` или чем-то другим (запуск отклонён, `crashed`, `exited`, `unhealthy`, `stopped`). Результат: `{ notFound: ServiceRef[]; notRunning: ServiceRef[] }`, оба пустые при успехе. Ничего не останавливает.
  - Событие `serviceSetsChanged` с полным списком. Оно отправляется после каждого создания, правки и удаления, а также когда изменение Workspace или конфига меняет, найдена ли запись. Список входит в `Snapshot`.
- **Общий контракт (shared).** Новые команды `createServiceSet`, `updateServiceSet`, `deleteServiceSet`, `startServiceSet`. Новое представление `ServiceSetView { id; name; services: { ref: ServiceRef; found: boolean }[] }`. Новое событие `serviceSetsChanged`. Новые коды ошибок `serviceSetNameTaken`, `serviceSetEmpty`, `serviceSetNotFound` с текстами в обоих наборах строк UI.
- **Сервер.** По одному обработчику с zod-проверкой на команду и `serviceSetsChanged` в пересылаемых событиях, по обычному рецепту.
- **Web.**
  - Меню «Наборы» в шапке: по пункту на каждый Набор (клик запускает его), «Новый Набор…» и действие правки у каждого Набора.
  - Диалог Набора: поле имени; все Сервисы всех Репо, сгруппированные по Репо, с галочками (для нового Набора запущенные отмечены заранее); «не найденные» записи отдельным списком с сохранёнными id, чтобы с них можно было снять галочку; Сохранить / Удалить (с подтверждением) / Отмена.
  - `BackendService` держит список из снимка и `serviceSetsChanged`. Запуск Набора идёт через команду с Promise. Если результат не пустой, панель показывает одно сообщение простыми словами с перечнем не найденных и не дошедших до running Сервисов. Неудачи отдельных Сервисов видны и через их обычные Статусы и вопросы о конфликте порта.
- **Десктоп.** `RunningServer` получает список Наборов, подписку на его изменения и `startServiceSet`. Меню трея показывает по пункту на каждый Набор между «Показать» и «Остановить всё во всех Репо». Id пунктов стабильные, выводятся из id Набора. Меню перестраивается по `serviceSetsChanged`, как сейчас по `uiLanguageChanged`. Клик по пункту Набора запускает его. Если результат не пустой или запуск отклонён, окно показывается. Тексты трея (подпись раздела, если она будет) идут в `HOST_STRINGS` для обоих Языков интерфейса. Rust-оболочку менять не нужно: пункты трея и так передаются как id + подпись.

## Решения по тестированию

- Хороший тест проверяет поведение, видимое через публичный шов (команды, события, снимок, пункты трея, отрисованный DOM), и никогда не проверяет внутренние поля. Новых швов нет.
- **Шов 1 — `DevPanelCore` через тестовый harness core** (настоящие процессы в Windows):
  - создание, правка и удаление со всеми отказами: пустое имя, занятое имя без учёта регистра, нет Сервисов, неизвестный id;
  - список переживает новый core на той же папке данных приложения;
  - `startServiceSet` запускает только остановленные Сервисы Набора, не трогает остальные (ни в Наборе, ни вне его) и запускает Зависимости;
  - `notFound` для удалённого Сервиса и для удалённого Репо;
  - `notRunning` для падающей фикстуры и для порта, занятого фикстурой-слушателем;
  - пустые списки, когда всё дошло до `running`;
  - запись снова найдена, когда Репо добавили обратно по тому же пути;
  - `serviceSetsChanged` приходит при каждом изменении.

  Прецеденты: тесты `startAll`, Зависимостей и конфликтов портов, тесты сохранения Workspace.
- **Шов 2 — web через `BackendTransport` (`FakeTransport`)**:
  - меню показывает Наборы из снимка и следует за `serviceSetsChanged`;
  - клик по Набору отправляет `startServiceSet`, а непустой результат показывает сообщение;
  - диалог отмечает заранее запущенные Сервисы для нового Набора, отправляет создание или правку с отмеченными ссылками, показывает отказы сервера, перечисляет не найденные записи и удаляет после подтверждения.

  Прецеденты: `stop-all.spec.ts`, `edit-local-config.spec.ts`, `reorder-repos.spec.ts`.
- **Шов 3 — десктоп через фейки `DesktopHost` / `RunningServer`**:
  - трей показывает Наборы по порядку и перестраивается при изменении;
  - клик по пункту вызывает `startServiceSet`;
  - окно показывается при непустом результате или отказе и не показывается при успехе.

  Прецедент: тесты трея для `stopAllRepos` в `desktop-app.test.ts`.
- Круговой тест через сервер не обязателен, как и для других команд.

## Вне рамок

- Разовые команды (git pull, install, миграции, сборка, тесты) и их запуск перед Набором. Это отдельная будущая фича («Задачи»).
- «Остановить Набор». Вечером хватает существующей «Остановить всё во всех Репо».
- Автоматический запуск Набора при старте DevPanel или Windows.
- Наборы в `.devpanel.yml` и общие для команды Наборы.
- Остановка Сервисов вне Набора при его запуске («переключение контекста»).
- Изменение порядка Наборов.

## Дополнительные заметки

- «Набор (Service Set)» уже определён в `GLOSSARY.md`.
- Кнопка «Настройки» и автооткрытие вкладок терминала описаны в отдельной спецификации (`.scratch/settings-menu/spec.md`). Вместе они позволяют показывать терминалы при запуске Набора, но друг от друга не зависят.
