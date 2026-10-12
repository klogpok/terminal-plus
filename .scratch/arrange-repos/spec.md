# Spec: Arrange Repos — reorder by drag and drop, collapse

Status: ready-for-agent

## Problem Statement

The Repo list shows Repos in the order they were added, and every Repo card is always fully expanded with all its Services, notices and buttons. With several Repos the list gets long: the Repos a team member uses most can sit at the bottom, and there is no way to put them first or to hide the ones they are not working on right now.

## Solution

A team member reorders Repos by dragging a card by its ⋮⋮ handle in the card header. The new order is stored by the DevPanel Server in the Workspace, so every tab and the desktop app show the same order, and it survives Exit and a computer restart.

A team member collapses a Repo card to a single line with ▾/▸ (or by clicking the Repo name). A collapsed Repo still shows its name, branch, header buttons and one status dot per Service, and a ❗ when something in it needs attention. "Collapse all / Expand all" in the panel title collapses or expands every Repo at once. Which Repos are collapsed is a per-viewer convenience remembered in the browser.

## User Stories

### Reorder

1. As a team member, I want to drag a Repo card by a ⋮⋮ handle in its header, so that I can put the Repos I use most at the top.
2. As a team member, I want only the handle to start a drag, so that clicking ▶ ■ ⟳ ✕ or typing in a form never moves a card by accident.
3. As a team member, I want to see a compact line with the Repo's color and name under the cursor and a gap of the same height where it will land, so that I can aim in a narrow panel even when cards are tall.
4. As a team member, I want the card to stay where I dropped it right away, so that the list does not jump back while the Server answers.
5. As a team member, I want the old order restored and an error shown if the move could not be saved, so that the list never lies about what is stored.
6. As a team member, I want the new order shown in every open tab and in the desktop app, so that two windows never disagree.
7. As a team member, I want the order remembered after Exit and a computer restart, so that I arrange the list only once.
8. As a team member, I want a new Repo to appear at the bottom of the list, as now.
9. As a team member, I want a Repo whose folder is missing to be movable like any other.
10. As a team member, I want the handle to have a tooltip and an accessible name in my UI Language, so that I know what it is for.

### Collapse

11. As a team member, I want to collapse a Repo card with ▾/▸ before its name or by clicking its name, so that Repos I am not working on take one line.
12. As a team member, I want a collapsed Repo to keep its name, branch, Claude / terminal / 📂 / ✕ buttons and one status dot per Service, so that I see at a glance whether something runs or crashed.
13. As a team member, I want each status dot of a collapsed Repo to tell the Service name and Status on hover, so that I know which Service a dot belongs to.
14. As a team member, I want a ❗ with a tooltip in a collapsed Repo's line when a Service is crashed or unhealthy, has a port conflict, the config is invalid, or the folder is missing, so that a problem is not hidden by collapsing.
15. As a team member, I want a collapsed Repo to stay collapsed when such a problem appears, so that the panel never rearranges itself under my cursor.
16. As a team member, I want "Collapse all" in the panel title when at least one Repo is expanded and "Expand all" when all are collapsed, so that I can tidy the list with one click.
17. As a team member, I want my collapsed Repos remembered after a page reload, so that the list looks the way I left it.
18. As a team member, I want a newly added Repo to be expanded, so that I see its Services and config suggestions.
19. As a team member, I want the Remove confirmation and the "Folder not found" notice to show on a collapsed Repo too, so that header actions work the same either way.
20. As a screen reader user, I want ▾/▸ to be a button with `aria-expanded` and an accessible name in my UI Language.

## Implementation Decisions

- No new glossary term: order is a property of the **Workspace** (the order of its Repos); collapsed is a per-viewer UI state, not a domain concept.
- **Order lives in the Workspace file**: the order of the `repos` array in `workspace.json` is the Repo order. No new field.
- **`shared`**: new command `moveRepo { repoId: string; toIndex: number }` (result `null`) and new event `reposReordered { repoIds: string[] }`.
- **`core`**: `moveRepo` moves the Repo to `toIndex`, clamped to `0 … repos.length - 1`; an unknown `repoId` fails with `repoNotFound`. It writes the Workspace through the existing atomic write, then emits `reposReordered` with the full new order. Moving to the current index writes nothing and emits nothing. The snapshot lists Repos in Workspace order, as now.
- **Server**: a zod-validated handler for `moveRepo` (`toIndex` an integer ≥ 0) and `reposReordered` added to the forwarded events, following the "adding a command/event end to end" recipes in `docs/architecture.md`.
- **`web`, reorder**:
  - New dependency `@angular/cdk` (major 22, matching Angular). The Repo list is a `cdkDropList`, each card a `cdkDrag` with a `cdkDragHandle` (⋮⋮) in the header, and a `cdkDragPreview` that renders only the Repo's color and name; the placeholder is a strip of the preview's height.
  - On drop `BackendService` reorders `repos()` at once (optimistic) and sends `moveRepo`; on failure it restores the previous order and shows the error through the usual error pattern.
  - On `reposReordered` it sorts `repos()` by the given ids; ids it does not know are ignored and Repos missing from the list keep their relative order at the end.
  - Mouse (and touch, as CDK gives it) only; no keyboard reordering.
- **`web`, collapse**:
  - A small injectable service owns the set of collapsed `repoId`s, stored in `localStorage` (per-viewer convenience, like the splitter width and open tabs), with every read and write in try/catch; unavailable storage means nothing collapsed and nothing remembered. Ids of Repos no longer in the Workspace are dropped.
  - The header gets ▾/▸ (`button`, `aria-expanded`) before the name; clicking the name toggles too. When collapsed, the card shows only the header row plus the status-dot row; "Start all / Stop all", the Service list, config suggestions, Install, the unused Local Config notice and "+ Add Service" are hidden. The Remove confirmation and the "Folder not found" block stay.
  - ❗ shows in a collapsed Repo when any Service is `crashed` or `unhealthy`, any Service has a `portConflict`, `configError` is set, or `folderMissing` is set; its tooltip says which.
  - "Collapse all / Expand all" sits next to the panel title.
  - All new texts (handle, toggle, collapse/expand all, ❗ tooltip, status-dot tooltip) go into both UI string sets, English and Russian.
- No ADR: cheap to reverse, no surprising trade-off.

## Testing Decisions

- Tests exercise external behaviour only: commands in, events and visible DOM out, files on disk.
- **Seam 1 — `core` public interface** (harness, temporary app data folder): `moveRepo` changes the snapshot order and emits `reposReordered`; a new core on the same folder keeps the order; `toIndex` past the end clamps; an unknown id fails; moving to the same index emits nothing. Prior art: `packages/core/test/repos.test.ts`.
- **Seam 2 — `BackendTransport`** (`FakeTransport`): the drop handler sends `moveRepo` and the DOM order changes before the reply; a failed reply restores the order and shows an error; `reposReordered` reorders the DOM. Drive the drop through the list component's drop handler (or CDK's `moveItemInArray` path), not real pointer gestures. Collapse: toggling hides the Service list and shows the dot row; the state survives re-creating the component from the same storage; ❗ appears for each attention case; "Collapse all / Expand all" switches its label; storage that throws does not break rendering. Prior art: `packages/web/src/app/repos.spec.ts`.
- `pnpm check` must pass.

## Out of Scope

- Adding a Repo by dropping a folder from Explorer.
- Reordering Services within a Repo.
- Keyboard reordering or ↑/↓ buttons.
- Sharing the collapsed state between browsers or with the desktop app.
- Auto-expanding a Repo when it needs attention.
- Grouping or sorting Repos automatically.

## Русский перевод

# Спека: Упорядочивание Репо — перетаскивание и сворачивание

Status: ready-for-agent

## Постановка проблемы

Список Репо показывает Репо в порядке добавления, и каждая карточка всегда развёрнута целиком: все Сервисы, уведомления и кнопки. Когда Репо несколько, список становится длинным: самые нужные Репо могут оказаться внизу, а поставить их наверх или спрятать те, с которыми сейчас не работаешь, нельзя.

## Решение

Член команды меняет порядок Репо, перетаскивая карточку за ручку ⋮⋮ в её заголовке. Новый порядок сохраняет Сервер DevPanel в Workspace, поэтому все вкладки и десктоп показывают один и тот же порядок, и он переживает Выход и перезагрузку компьютера.

Член команды сворачивает карточку Репо в одну строку кнопкой ▾/▸ (или кликом по имени Репо). Свёрнутый Репо по-прежнему показывает имя, ветку, кнопки заголовка и по одной точке статуса на Сервис, а также ❗, когда что-то в нём требует внимания. «Свернуть всё / Развернуть всё» в заголовке панели сворачивает или разворачивает все Репо сразу. Какие Репо свёрнуты — удобство одного зрителя, оно запоминается в браузере.

## Пользовательские истории

### Порядок

1. Как член команды, я хочу перетаскивать карточку Репо за ручку ⋮⋮ в её заголовке, чтобы поставить самые нужные Репо наверх.
2. Как член команды, я хочу, чтобы перетаскивание начиналось только с ручки, чтобы клик по ▶ ■ ⟳ ✕ или ввод в форму никогда случайно не двигал карточку.
3. Как член команды, я хочу видеть под курсором компактную строку с цветом и именем Репо, а на месте, куда она встанет, — промежуток той же высоты, чтобы попадать в цель в узкой панели даже при высоких карточках.
4. Как член команды, я хочу, чтобы карточка сразу оставалась там, куда я её бросил, чтобы список не прыгал назад, пока отвечает Сервер.
5. Как член команды, я хочу, чтобы при неудачном сохранении вернулся старый порядок и показалась ошибка, чтобы список никогда не врал о том, что сохранено.
6. Как член команды, я хочу видеть новый порядок во всех открытых вкладках и в десктопе, чтобы два окна никогда не расходились.
7. Как член команды, я хочу, чтобы порядок запоминался после Выхода и перезагрузки компьютера, чтобы раскладывать список только один раз.
8. Как член команды, я хочу, чтобы новый Репо появлялся внизу списка, как сейчас.
9. Как член команды, я хочу перемещать Репо с ненайденной папкой так же, как любой другой.
10. Как член команды, я хочу, чтобы у ручки была подсказка и доступное имя на моём Языке интерфейса, чтобы понимать, зачем она.

### Сворачивание

11. Как член команды, я хочу сворачивать карточку Репо кнопкой ▾/▸ перед именем или кликом по имени, чтобы Репо, с которыми я сейчас не работаю, занимали одну строку.
12. Как член команды, я хочу, чтобы у свёрнутого Репо оставались имя, ветка, кнопки Claude / терминал / 📂 / ✕ и по одной точке статуса на Сервис, чтобы с одного взгляда видеть, что-то запущено или упало.
13. Как член команды, я хочу, чтобы каждая точка статуса свёрнутого Репо при наведении называла Сервис и Статус, чтобы понимать, чья это точка.
14. Как член команды, я хочу видеть ❗ с подсказкой в строке свёрнутого Репо, когда Сервис crashed или unhealthy, есть конфликт порта, конфиг невалиден или папка не найдена, чтобы сворачивание не прятало проблему.
15. Как член команды, я хочу, чтобы свёрнутый Репо оставался свёрнутым при появлении такой проблемы, чтобы панель не перестраивалась у меня под курсором.
16. Как член команды, я хочу видеть в заголовке панели «Свернуть всё», когда хотя бы один Репо развёрнут, и «Развернуть всё», когда свёрнуты все, чтобы навести порядок одним кликом.
17. Как член команды, я хочу, чтобы свёрнутые Репо запоминались после перезагрузки страницы, чтобы список выглядел так, как я его оставил.
18. Как член команды, я хочу, чтобы новый Репо добавлялся развёрнутым, чтобы видеть его Сервисы и предложения конфига.
19. Как член команды, я хочу, чтобы подтверждение удаления и уведомление «Папка не найдена» показывались и у свёрнутого Репо, чтобы действия заголовка работали одинаково.
20. Как пользователь экранного диктора, я хочу, чтобы ▾/▸ была кнопкой с `aria-expanded` и доступным именем на моём Языке интерфейса.

## Решения по реализации

- Нового термина в глоссарии нет: порядок — свойство **Workspace** (порядок его Репо); свёрнутость — состояние UI одного зрителя, а не доменное понятие.
- **Порядок живёт в файле Workspace**: порядок массива `repos` в `workspace.json` и есть порядок Репо. Нового поля нет.
- **`shared`**: новая команда `moveRepo { repoId: string; toIndex: number }` (результат `null`) и новое событие `reposReordered { repoIds: string[] }`.
- **`core`**: `moveRepo` перемещает Репо на `toIndex`, зажатый в `0 … repos.length - 1`; неизвестный `repoId` даёт `repoNotFound`. Workspace записывается существующей атомарной записью, затем испускается `reposReordered` с полным новым порядком. Перемещение на текущий индекс ничего не пишет и ничего не испускает. Снимок, как и сейчас, перечисляет Репо в порядке Workspace.
- **Server**: обработчик `moveRepo` с zod-проверкой (`toIndex` — целое ≥ 0) и `reposReordered` в пересылаемых событиях, по рецептам «добавление команды/события» из `docs/architecture.md`.
- **`web`, порядок**:
  - Новая зависимость `@angular/cdk` (мажор 22, как Angular). Список Репо — `cdkDropList`, каждая карточка — `cdkDrag` с `cdkDragHandle` (⋮⋮) в заголовке и `cdkDragPreview`, который рисует только цвет и имя Репо; плейсхолдер — полоска высотой с превью.
  - При броске `BackendService` сразу переставляет `repos()` (оптимистично) и отправляет `moveRepo`; при ошибке возвращает прежний порядок и показывает ошибку обычным шаблоном ошибок.
  - На `reposReordered` сортирует `repos()` по присланным id; незнакомые id игнорируются, Репо, которых нет в списке, сохраняют относительный порядок в конце.
  - Только мышь (и тач, как его даёт CDK); перестановки с клавиатуры нет.
- **`web`, сворачивание**:
  - Небольшой внедряемый сервис хранит набор свёрнутых `repoId` в `localStorage` (удобство одного зрителя, как ширина сплиттера и открытые вкладки), каждое чтение и запись — в try/catch; недоступное хранилище означает «ничего не свёрнуто и не запоминается». Id Репо, которых больше нет в Workspace, удаляются.
  - В заголовке появляется ▾/▸ (`button`, `aria-expanded`) перед именем; клик по имени тоже переключает. В свёрнутом виде карточка показывает только строку заголовка и ряд точек статуса; «Start all / Stop all», список Сервисов, предложения конфига, Install, уведомление о неиспользуемом Локальном конфиге и «+ Add Service» скрыты. Подтверждение удаления и блок «Папка не найдена» остаются.
  - ❗ показывается у свёрнутого Репо, когда какой-либо Сервис `crashed` или `unhealthy`, у какого-либо Сервиса есть `portConflict`, задан `configError` или `folderMissing`; подсказка говорит, что именно.
  - «Свернуть всё / Развернуть всё» — рядом с заголовком панели.
  - Все новые тексты (ручка, переключатель, свернуть/развернуть всё, подсказка ❗, подсказка точки статуса) — в оба набора строк UI, английский и русский.
- ADR нет: решение дёшево откатить, неожиданных компромиссов нет.

## Решения по тестированию

- Тесты проверяют только внешнее поведение: команды на входе, события и видимый DOM на выходе, файлы на диске.
- **Шов 1 — публичный интерфейс `core`** (harness, временная папка данных): `moveRepo` меняет порядок в снимке и испускает `reposReordered`; новый core на той же папке сохраняет порядок; `toIndex` за концом зажимается; неизвестный id даёт ошибку; перемещение на тот же индекс ничего не испускает. Образец: `packages/core/test/repos.test.ts`.
- **Шов 2 — `BackendTransport`** (`FakeTransport`): обработчик броска отправляет `moveRepo`, и порядок в DOM меняется до ответа; неудачный ответ возвращает порядок и показывает ошибку; `reposReordered` переставляет DOM. Бросок вызывается через обработчик drop компонента списка (или путь CDK `moveItemInArray`), а не через реальные жесты мыши. Сворачивание: переключение прячет список Сервисов и показывает ряд точек; состояние переживает пересоздание компонента с тем же хранилищем; ❗ появляется в каждом случае внимания; «Свернуть всё / Развернуть всё» меняет подпись; бросающее исключение хранилище не ломает отрисовку. Образец: `packages/web/src/app/repos.spec.ts`.
- `pnpm check` должен проходить.

## Вне рамок

- Добавление Репо перетаскиванием папки из Проводника.
- Перестановка Сервисов внутри Репо.
- Перестановка с клавиатуры или кнопки ↑/↓.
- Общая свёрнутость между браузерами или с десктопом.
- Автоматическое разворачивание Репо, требующего внимания.
- Автоматическая группировка или сортировка Репо.
