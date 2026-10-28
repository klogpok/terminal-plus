# Spec: Branch Check

Status: resolved

## Problem Statement

A developer works on a feature in a git worktree (`C:\vplans\worktrees\<repo>\<name>`, made by `new-worktree.ps1`), often with the same branch in two or three Repos at once (`feat/quote-tenant-signature` in `client`, `vplans-app` and `clients-portal`). To check the result by hand they have to run the right Services from the worktree folders. DevPanel only knows each Repo's main folder. Adding every worktree as its own Repo means building its Local Config again (it is keyed by the folder path), fighting the main folder's Services for the same ports, and cluttering the Workspace (`vplans-app` alone has 20+ worktrees). So today the check happens in a hand-opened terminal, outside DevPanel.

## Solution

A Repo can run from one of its **Worktrees** instead of its main folder. DevPanel finds a Repo's Worktrees itself (`git worktree list`); it never creates or removes them. The Repo keeps its name, color, Local Config and place in the Workspace. Only the folder its Services, install and new Sessions run in changes. Only one folder of a Repo runs at a time, so ports never clash.

A **Branch Check** does this for a whole feature in one click. A new "Branches" panel in the header lists every branch that has a Worktree in any Repo of the Workspace, with the Repos it spans. "Check" on a branch switches every Repo that has this branch to it and restarts, from the new folder, the Services that were running. Repos without the branch are not touched. The header shows which branch is being checked, with "Back to main" to return every Repo to its main folder.

## User Stories

### Finding Worktrees

1. As a developer, I want DevPanel to find the Worktrees of my Repos by itself, so that I do not register each one.
2. As a developer, I want the Branches panel to group Worktrees of all Repos by branch name and show which Repos (name and color) each branch spans, so that I see a cross-repo feature as one line.
3. As a developer, I want Worktrees in detached HEAD and Worktrees whose folder is gone to be left out, so that agent sandboxes and stale entries do not clutter the list.
4. As a developer, I want a Repo whose main folder is itself on the branch to count as part of that branch, so that a feature I develop in the main folder is checked together with its Worktrees.
5. As a developer, I want the list to be read again each time I open the Branches panel or the Repo's folder switcher, so that a Worktree I just made appears without restarting DevPanel.

### Checking a branch

6. As a developer, I want to press "Check" on a branch and have every Repo that has it switch to it, so that a feature spanning three Repos takes one click.
7. As a developer, I want the Services that were running (starting, running or unhealthy) in a switched Repo to be stopped and started again from the Worktree, so that I check the feature with the same setup I had.
8. As a developer, I want all Services of a switched Repo to start when none of them was running, so that a cold check also works in one click.
9. As a developer, I want Repos without this branch to keep running as they are, so that a shared backend on `master` keeps serving the feature's frontend.
10. As a developer, I want the Worktree's own `.devpanel.yml` to be used when it has one, and otherwise the Repo's Local Config, so that a branch that adds a Service runs as the branch describes it.
11. As a developer, I want to be told which Services did not exist in the Worktree's config or did not reach `running`, so that I know what to look at.
12. As a developer, I want the header to show "Checking: <branch>" with "Back to main", so that I always know which code I am looking at.
13. As a developer, I want "Check" on another branch to switch Repos to it and return the Repos that are not in the new branch to their main folder, so that two features never mix.
14. As a developer, I want "Back to main" to switch every Repo back to its main folder and restart its running Services there, so that ending a check takes one click.

### One Repo

15. As a developer, I want a folder switcher in the Repo header (main folder or one of its Worktrees, by branch name), so that I can switch a single Repo without a Branch Check.
16. As a developer, I want the Repo header to show the branch and mark when the Repo runs from a Worktree, so that I can tell at a glance.
17. As a developer, I want new Claude Code and shell Sessions of the Repo to open in the folder it runs from, so that I can fix what I found right there. Sessions already open stay where they are.
18. As a developer, I want "Open folder" to open the folder the Repo runs from.
19. As a developer, I want the install prompt to look at the Worktree's own `node_modules`, so that a fresh Worktree without dependencies is installed the usual way.

### Edges

20. As a developer, I want every Repo to run from its main folder after DevPanel restarts, so that a forgotten check does not linger.
21. As a developer, I want to be told in plain words when the Worktree a Repo runs from was removed, and be offered to return to the main folder, so that a deleted Worktree does not leave the Repo broken.
22. As a developer, I want switching to wait for Services that are stopping, as Stop all does, so that the old and new processes never overlap on a port.
23. As a developer, I want every window to show the same folder and branch for each Repo, so that they never disagree.
24. As a developer, I want the Branches panel, the switcher and all messages in the current UI Language, and usable from the keyboard.

## Implementation Decisions

- **Domain terms.** Two new glossary terms.
  - **Worktree** (RU: Worktree): a git worktree of a Repo's folder that DevPanel found. Not a Repo and never added to the Workspace. Identified by its path.
  - **Branch Check** (RU: Проверка ветки): running the Repos that have a given branch from their Worktrees on that branch, while the other Repos stay as they are. At most one at a time.
- **Run folder.** `RepoState` gets an optional active Worktree (`{ path, branch }`). The run folder is the active Worktree's path, or the Repo's path when there is none. Everything that runs or reads code uses the run folder: Service `cwd` (`path.resolve(runFolder, definition.cwd ?? '.')`), the install command and `needsInstall`, Repo Config reading and its folder watcher, new Sessions, `openFolder`, suggestions. The Local Config stays keyed by the Repo's own path, so it is shared by the main folder and all Worktrees. Repo identity (id = hash of the Repo path) does not change, so Service Sets keep working.
- **Discovery.** A `worktrees.ts` module in `core` runs `git worktree list --porcelain` in the Repo's path and keeps entries that have a branch, are not the main folder, and whose folder exists. Not cached and not in `Snapshot`: read on demand by a command.
- **Not persisted.** The active Worktree lives only in memory. A Server start puts every Repo on its main folder.
- **Core (`DevPanelCore`).**
  - `listWorktrees()`: for every Repo of the Workspace, its Worktrees (`{ repoId, path, branch }[]`) plus the main folder's current branch. The web groups them by branch.
  - `switchRepoFolder({ repoId, worktreePath: string | null })`: remembers the Repo's Services that are starting, running or unhealthy; stops all of them (waiting like Stop all); sets or clears the active Worktree; reloads the config from the new run folder; starts the remembered Services that exist in the new config, or all Services when none was remembered, through the normal `startService` path. Result `{ notFound: ServiceRef[]; notRunning: ServiceRef[] }`, as `startServiceSet`. A path that is no longer a Worktree of this Repo: `worktreeNotFound`.
  - `startBranchCheck({ branch })`: for each Repo with a Worktree on `branch` (a Repo whose main folder is on `branch` goes to its main folder), `switchRepoFolder` in parallel. Repos running from a Worktree of another branch return to the main folder. Others are untouched. Records the checked branch. No Repo has the branch: `branchNotFound`.
  - `endBranchCheck()`: `switchRepoFolder(null)` for every Repo with an active Worktree. Clears the checked branch.
  - Starting a Service while the active Worktree's folder is gone: `worktreeFolderMissing` (UI offers "Back to main").
  - Event `repoFolderChanged` (or a field in the existing Repo update) carrying the Repo's run folder and branch, plus `branchCheckChanged` with the checked branch. Both are in `Snapshot` so other windows and reconnects agree.
- **Shared wire contract.** Commands `listWorktrees`, `switchRepoFolder`, `startBranchCheck`, `endBranchCheck`. `RepoView` gains `worktree?: { path; branch }`. `Snapshot` gains `branchCheck?: string`. Error codes `worktreeNotFound`, `branchNotFound`, `worktreeFolderMissing`, worded in both UI string sets.
- **Server.** One zod-validated handler per command and the new events forwarded, following the usual recipe.
- **Web.**
  - A "Branches" button in the header next to "Service Sets", opening a panel: one row per branch with the Repo chips (name + color) and "Check". The row of the checked branch is marked and has "Back to main" instead.
  - When a Branch Check is active, the header shows "Checking: <branch>" with "Back to main".
  - The Repo header shows the branch and a Worktree mark, and a folder switcher (main folder + Worktrees by branch) that calls `switchRepoFolder`.
  - Non-empty results show one plain-language message naming the missing and not-running Services, as for Service Sets.
- **Desktop.** No change. The tray keeps working on Repos.

## Testing Decisions

- A good test checks behaviour through a public seam (commands, events, snapshot, rendered DOM), never internal fields. No new seams.
- **Seam 1 — `DevPanelCore` through the core harness** (real processes and real git): the test makes a temp git repo with two Worktrees (one on a branch, one detached) and a missing-folder Worktree. `listWorktrees` returns only the branch Worktree plus the main branch. `switchRepoFolder` restarts only the Services that were running, with `cwd` inside the Worktree (fixture prints its cwd), uses the Worktree's `.devpanel.yml` over the Local Config, reports `notFound` for a Service missing there, and refuses an unknown path. `startBranchCheck` switches only Repos with the branch, leaves others running, returns Repos of a previous branch to main. `endBranchCheck` returns all. A new core on the same app data dir starts on main folders. New Sessions open in the run folder. Prior art: Service Sets and `startAll` tests.
- **Seam 2 — web through `FakeTransport`**: the Branches panel groups `listWorktrees` by branch, sends `startBranchCheck` / `endBranchCheck`, shows the checked branch from the snapshot and its event, shows the result message. The Repo header switcher sends `switchRepoFolder`. Prior art: `service-sets.spec.ts`.
- Layout of the panel and header gets a look in the running app (`/run`), not a test.

## Out of Scope

- Creating, removing or pruning Worktrees from DevPanel (stays with `new-worktree.ps1` / `remove-worktree.ps1`).
- Running a Worktree and the main folder of one Repo at the same time (would need port overrides).
- Remembering the active Worktree or Branch Check across Server restarts.
- Branch Check from the tray.
- Binding Service Sets to a branch.
- Branch status (ahead/behind, dirty), git pull or checkout.

## Further Notes

- Decided with the user: one Repo, switchable run folder plus a Branches panel; restart the Services that were running; Repos without the branch keep running; detached Worktrees hidden; Worktree `.devpanel.yml` wins over the Local Config; not persisted; new Sessions follow the run folder; term "Branch Check".
- Decided by default, to confirm in review: stories 4 (main folder on the branch counts), 5 (read on panel open, no watching), 13 (another Check returns Repos of the old branch to main), 21 (removed Worktree is reported on Start, no automatic fallback).
- Settled while implementing:
  - The Branches panel lists only branches that have at least one Worktree; a Repo whose own folder is on such a branch joins its row ("· Repo folder"). A branch that lives only in Repo folders gets no row, or every `main`/`master` would.
  - A Worktree that is itself a Repo of the Workspace is not offered (it would run the same code twice).
  - The Repo folder's branch in `listWorktrees` comes from `git worktree list`, so a detached folder has none.
  - No `repoFolderChanged` event: the switch reloads the config, and `configChanged` carries the whole `RepoView` with `worktree`.
  - Switching while the Repo's dependencies install is refused with a new code, `installRunning`.
  - A gone Worktree (story 21): the message points to the branch button in the Repo header; there is no separate button.
  - Switching a Repo's folder by hand ends the Branch Check.

## Русский перевод

# Спецификация: Проверка ветки

Status: resolved

## Постановка проблемы

Разработчик делает фичу в git worktree (`C:\vplans\worktrees\<repo>\<name>`, создаётся `new-worktree.ps1`), часто с одной и той же веткой сразу в двух-трёх Репо (`feat/quote-tenant-signature` в `client`, `vplans-app` и `clients-portal`). Чтобы проверить результат руками, нужно запустить нужные Сервисы из папок worktree. DevPanel знает только основную папку каждого Репо. Если добавлять каждый worktree отдельным Репо, придётся заново собирать Локальный конфиг (он привязан к пути папки), Сервисы будут бороться с Сервисами основной папки за те же порты, а Workspace будет завален (у одного `vplans-app` больше 20 worktree). Поэтому сейчас проверка идёт в вручную открытом терминале, мимо DevPanel.

## Решение

Репо может запускаться не из своей основной папки, а из одного из своих **Worktree**. DevPanel сама находит Worktree Репо (`git worktree list`), но никогда их не создаёт и не удаляет. У Репо остаются имя, цвет, Локальный конфиг и место в Workspace. Меняется только папка, в которой запускаются его Сервисы, установка зависимостей и новые Сессии. Одновременно работает только одна папка Репо, поэтому порты не конфликтуют.

**Проверка ветки** делает это для всей фичи одним кликом. Новая панель «Ветки» в шапке показывает каждую ветку, у которой есть Worktree в каком-либо Репо Workspace, и Репо, которые она охватывает. «Проверить» на ветке переключает на неё каждый Репо, где она есть, и перезапускает из новой папки Сервисы, которые работали. Репо без этой ветки не трогаются. В шапке видно, какая ветка проверяется, и есть «Вернуть на основную», чтобы вернуть все Репо в их основные папки.

## Пользовательские истории

### Поиск Worktree

1. Как разработчик, я хочу, чтобы DevPanel сама находила Worktree моих Репо, чтобы не регистрировать каждый.
2. Как разработчик, я хочу, чтобы панель «Ветки» группировала Worktree всех Репо по имени ветки и показывала, какие Репо (имя и цвет) охватывает каждая ветка, чтобы видеть фичу в нескольких Репо одной строкой.
3. Как разработчик, я хочу, чтобы Worktree в detached HEAD и Worktree с пропавшей папкой не показывались, чтобы песочницы агентов и устаревшие записи не загромождали список.
4. Как разработчик, я хочу, чтобы Репо, чья основная папка сама стоит на этой ветке, считался частью ветки, чтобы фича, которую я делаю в основной папке, проверялась вместе с её Worktree.
5. Как разработчик, я хочу, чтобы список перечитывался при каждом открытии панели «Ветки» или переключателя папки Репо, чтобы только что созданный Worktree появлялся без перезапуска DevPanel.

### Проверка ветки

6. Как разработчик, я хочу нажать «Проверить» на ветке, чтобы каждый Репо, где она есть, переключился на неё, и фича в трёх Репо проверялась одним кликом.
7. Как разработчик, я хочу, чтобы Сервисы, которые работали (starting, running или unhealthy) в переключаемом Репо, остановились и запустились снова из Worktree, чтобы проверять фичу в той же конфигурации, что была.
8. Как разработчик, я хочу, чтобы при отсутствии работающих Сервисов в переключаемом Репо запускались все его Сервисы, чтобы проверка «с нуля» тоже шла одним кликом.
9. Как разработчик, я хочу, чтобы Репо без этой ветки продолжали работать как есть, чтобы общий бэкенд на `master` обслуживал фронтенд фичи.
10. Как разработчик, я хочу, чтобы использовался собственный `.devpanel.yml` Worktree, если он есть, а иначе Локальный конфиг Репо, чтобы ветка, добавившая Сервис, запускалась так, как она его описывает.
11. Как разработчик, я хочу знать, каких Сервисов не оказалось в конфиге Worktree и какие не дошли до `running`, чтобы понимать, куда смотреть.
12. Как разработчик, я хочу видеть в шапке «Проверка: <ветка>» с кнопкой «Вернуть на основную», чтобы всегда знать, на какой код я смотрю.
13. Как разработчик, я хочу, чтобы «Проверить» на другой ветке переключало Репо на неё, а Репо, которых нет в новой ветке, возвращало в основную папку, чтобы две фичи никогда не смешивались.
14. Как разработчик, я хочу, чтобы «Вернуть на основную» переключало все Репо обратно в основную папку и перезапускало там работавшие Сервисы, чтобы закончить проверку одним кликом.

### Один Репо

15. Как разработчик, я хочу переключатель папки в шапке Репо (основная папка или один из её Worktree, по имени ветки), чтобы переключить один Репо без Проверки ветки.
16. Как разработчик, я хочу, чтобы шапка Репо показывала ветку и отмечала, что Репо работает из Worktree, чтобы понимать это с первого взгляда.
17. Как разработчик, я хочу, чтобы новые Сессии Claude Code и оболочки открывались в той папке, из которой работает Репо, чтобы сразу править найденное. Уже открытые Сессии остаются где были.
18. Как разработчик, я хочу, чтобы «Открыть папку» открывало ту папку, из которой работает Репо.
19. Как разработчик, я хочу, чтобы предложение установить зависимости смотрело на собственный `node_modules` Worktree, чтобы свежий Worktree без зависимостей устанавливался обычным способом.

### Граничные случаи

20. Как разработчик, я хочу, чтобы после перезапуска DevPanel каждый Репо работал из основной папки, чтобы забытая проверка не висела.
21. Как разработчик, я хочу простыми словами узнать, что Worktree, из которого работает Репо, удалён, и получить предложение вернуться в основную папку, чтобы удалённый Worktree не ломал Репо.
22. Как разработчик, я хочу, чтобы переключение ждало Сервисы в stopping, как это делает «Остановить всё», чтобы старые и новые процессы не пересекались на порту.
23. Как разработчик, я хочу, чтобы все окна показывали для каждого Репо одну и ту же папку и ветку, чтобы они не расходились.
24. Как разработчик, я хочу, чтобы панель «Ветки», переключатель и все сообщения были на текущем Языке интерфейса и работали с клавиатуры.

## Решения по реализации

- **Доменные термины.** Два новых термина в глоссарии.
  - **Worktree** (RU: Worktree): git worktree папки Репо, найденный DevPanel. Не Репо и никогда не добавляется в Workspace. Определяется своим путём.
  - **Проверка ветки (Branch Check)**: запуск Репо, у которых есть данная ветка, из их Worktree на этой ветке, при этом остальные Репо остаются как есть. Не более одной одновременно.
- **Папка запуска.** `RepoState` получает необязательный активный Worktree (`{ path, branch }`). Папка запуска — путь активного Worktree, а если его нет — путь Репо. Всё, что запускает или читает код, использует папку запуска: `cwd` Сервиса (`path.resolve(runFolder, definition.cwd ?? '.')`), команду установки и `needsInstall`, чтение Конфига репо и его watcher папки, новые Сессии, `openFolder`, предложения автоопределения. Локальный конфиг по-прежнему привязан к собственному пути Репо и поэтому общий для основной папки и всех Worktree. Идентичность Репо (id = хэш пути Репо) не меняется, так что Наборы продолжают работать.
- **Поиск.** Модуль `worktrees.ts` в `core` выполняет `git worktree list --porcelain` в пути Репо и оставляет записи, у которых есть ветка, которые не являются основной папкой и чья папка существует. Без кэша и не в `Snapshot`: читается по запросу командой.
- **Не сохраняется.** Активный Worktree живёт только в памяти. При старте Сервера все Репо в основных папках.
- **Core (`DevPanelCore`).**
  - `listWorktrees()`: для каждого Репо Workspace его Worktree (`{ repoId, path, branch }[]`) и текущая ветка основной папки. Группирует по веткам web.
  - `switchRepoFolder({ repoId, worktreePath: string | null })`: запоминает Сервисы Репо в starting, running или unhealthy; останавливает их все (ожидая, как «Остановить всё»); ставит или снимает активный Worktree; перечитывает конфиг из новой папки запуска; запускает запомненные Сервисы, которые есть в новом конфиге, или все Сервисы, если запомненных нет, через обычный путь `startService`. Результат `{ notFound: ServiceRef[]; notRunning: ServiceRef[] }`, как у `startServiceSet`. Путь, который больше не Worktree этого Репо: `worktreeNotFound`.
  - `startBranchCheck({ branch })`: для каждого Репо с Worktree на `branch` (Репо, чья основная папка на `branch`, переходит в основную папку) параллельно вызывает `switchRepoFolder`. Репо, работающие из Worktree другой ветки, возвращаются в основную папку. Остальные не трогаются. Запоминает проверяемую ветку. Ни у одного Репо нет ветки: `branchNotFound`.
  - `endBranchCheck()`: `switchRepoFolder(null)` для каждого Репо с активным Worktree. Сбрасывает проверяемую ветку.
  - Старт Сервиса, когда папки активного Worktree нет: `worktreeFolderMissing` (UI предлагает «Вернуть на основную»).
  - Событие `repoFolderChanged` (или поле в существующем обновлении Репо) с папкой запуска и веткой Репо, плюс `branchCheckChanged` с проверяемой веткой. Оба входят в `Snapshot`, чтобы другие окна и переподключения сходились.
- **Общий контракт.** Команды `listWorktrees`, `switchRepoFolder`, `startBranchCheck`, `endBranchCheck`. `RepoView` получает `worktree?: { path; branch }`. `Snapshot` получает `branchCheck?: string`. Коды ошибок `worktreeNotFound`, `branchNotFound`, `worktreeFolderMissing` с формулировками в обоих наборах строк UI.
- **Server.** По одному zod-валидируемому обработчику на команду и пересылка новых событий по обычному рецепту.
- **Web.**
  - Кнопка «Ветки» в шапке рядом с «Наборами», открывающая панель: строка на каждую ветку с чипами Репо (имя + цвет) и «Проверить». Строка проверяемой ветки отмечена, и вместо кнопки в ней «Вернуть на основную».
  - Пока идёт Проверка ветки, шапка показывает «Проверка: <ветка>» с «Вернуть на основную».
  - Шапка Репо показывает ветку и отметку Worktree, а также переключатель папки (основная папка + Worktree по веткам), который вызывает `switchRepoFolder`.
  - Непустой результат показывает одно сообщение простыми словами с перечнем отсутствующих и не запустившихся Сервисов, как для Наборов.
- **Desktop.** Без изменений. Трей по-прежнему работает с Репо.

## Решения по тестированию

- Хороший тест проверяет поведение через публичный шов (команды, события, снимок, отрисованный DOM), а не внутренние поля. Новых швов нет.
- **Шов 1 — `DevPanelCore` через тестовый harness** (реальные процессы и реальный git): тест создаёт временный git-репозиторий с двумя Worktree (один на ветке, один detached) и Worktree с пропавшей папкой. `listWorktrees` возвращает только Worktree с веткой плюс ветку основной папки. `switchRepoFolder` перезапускает только работавшие Сервисы с `cwd` внутри Worktree (фикстура печатает свой cwd), предпочитает `.devpanel.yml` Worktree Локальному конфигу, сообщает `notFound` для отсутствующего там Сервиса и отказывает на неизвестный путь. `startBranchCheck` переключает только Репо с веткой, оставляет остальные работать, возвращает Репо прошлой ветки в основную папку. `endBranchCheck` возвращает все. Новый core на той же папке данных стартует в основных папках. Новые Сессии открываются в папке запуска. Образцы: тесты Наборов и `startAll`.
- **Шов 2 — web через `FakeTransport`**: панель «Ветки» группирует `listWorktrees` по веткам, отправляет `startBranchCheck` / `endBranchCheck`, показывает проверяемую ветку из снимка и её события, показывает сообщение с результатом. Переключатель в шапке Репо отправляет `switchRepoFolder`. Образец: `service-sets.spec.ts`.
- Вёрстка панели и шапки проверяется осмотром в запущенном приложении (`/run`), а не тестом.

## Вне рамок

- Создание, удаление и очистка Worktree из DevPanel (остаётся за `new-worktree.ps1` / `remove-worktree.ps1`).
- Одновременная работа Worktree и основной папки одного Репо (нужно переопределение портов).
- Запоминание активного Worktree или Проверки ветки между перезапусками Сервера.
- Проверка ветки из трея.
- Привязка Наборов к ветке.
- Состояние ветки (ahead/behind, незакоммиченные изменения), git pull или checkout.

## Дополнительные заметки

- Решено с пользователем: один Репо с переключаемой папкой запуска плюс панель «Ветки»; перезапуск работавших Сервисов; Репо без ветки продолжают работать; detached Worktree скрыты; `.devpanel.yml` Worktree приоритетнее Локального конфига; не сохраняется; новые Сессии следуют за папкой запуска; термин «Проверка ветки».
- Решено по умолчанию, подтвердить на ревью: истории 4 (основная папка на ветке считается), 5 (чтение при открытии панели, без слежения), 13 (новая «Проверить» возвращает Репо старой ветки в основную), 21 (удалённый Worktree обнаруживается при старте, без автоматического отката).
- Уточнено при реализации:
  - Панель «Ветки» показывает только ветки, у которых есть хотя бы один Worktree; Репо, чья собственная папка на такой ветке, присоединяется к её строке («· папка репо»). Ветка, которая есть только в папках Репо, строки не получает, иначе строку получили бы все `main`/`master`.
  - Worktree, который сам является Репо Workspace, не предлагается (тот же код запустился бы дважды).
  - Ветка папки Репо в `listWorktrees` берётся из `git worktree list`, поэтому у папки в detached HEAD ветки нет.
  - События `repoFolderChanged` нет: переключение перечитывает конфиг, и `configChanged` несёт весь `RepoView` с `worktree`.
  - Переключение во время установки зависимостей Репо отклоняется новым кодом `installRunning`.
  - Пропавший Worktree (история 21): сообщение указывает на кнопку ветки в шапке Репо; отдельной кнопки нет.
  - Переключение папки Репо вручную завершает Проверку ветки.
