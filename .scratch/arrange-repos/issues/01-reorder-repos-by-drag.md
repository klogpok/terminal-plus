# 01: Reorder Repos by drag and drop

Spec: `.scratch/arrange-repos/spec.md`

**What to build:** A team member drags a Repo card by a ⋮⋮ handle in its header to a new place in the Repo list. Under the cursor is a compact line with the Repo's color and name; a strip of the same height marks where it lands. The card stays where it was dropped at once; the DevPanel Server stores the new order in the Workspace (`moveRepo`) and broadcasts it (`reposReordered`), so every tab and the desktop app follow and the order survives Exit and a restart. If the move fails, the old order comes back and an error shows. Built on `@angular/cdk` DragDrop, mouse only.

**Blocked by:** none

**Status:** resolved

- [x] `shared` has `moveRepo { repoId, toIndex }` (result `null`) and `reposReordered { repoIds }`.
- [x] `core` `moveRepo` reorders the Workspace, writes `workspace.json` atomically, and emits `reposReordered` with the full order; a new core on the same app data folder lists Repos in the new order.
- [x] `toIndex` past either end is clamped; an unknown `repoId` fails with `repoNotFound`; moving to the current index writes nothing and emits nothing.
- [x] The Server validates `moveRepo` (`toIndex` integer ≥ 0) and forwards `reposReordered`.
- [x] `@angular/cdk` (major 22) is added to `web`; the Repo list is a `cdkDropList`, each card a `cdkDrag` that starts only from the ⋮⋮ `cdkDragHandle`; buttons and forms in the card never start a drag.
- [x] The drag preview shows only the Repo's color and name; the placeholder is a strip of the same height.
- [x] On drop the DOM order changes before the Server replies and `moveRepo` is sent; a rejected `moveRepo` restores the previous order and shows the error through the usual pattern.
- [x] `reposReordered` reorders the list in every tab; unknown ids are ignored and unlisted Repos keep their relative order at the end.
- [x] New Repos still appear at the bottom; a Repo with a missing folder can be moved.
- [x] The handle has a tooltip and `aria-label` in both UI string sets (English and Russian).
- [x] `pnpm check` passes.

## Русский перевод

# 01: Порядок Репо перетаскиванием

Спека: `.scratch/arrange-repos/spec.md`

**Что сделать:** Член команды перетаскивает карточку Репо за ручку ⋮⋮ в её заголовке на новое место в списке Репо. Под курсором — компактная строка с цветом и именем Репо; полоска той же высоты показывает, куда она встанет. Карточка сразу остаётся там, куда её бросили; Сервер DevPanel сохраняет новый порядок в Workspace (`moveRepo`) и рассылает его (`reposReordered`), поэтому все вкладки и десктоп следуют за ним, а порядок переживает Выход и перезагрузку. Если перемещение не удалось, возвращается старый порядок и показывается ошибка. Сделано на `@angular/cdk` DragDrop, только мышью.

**Блокируется:** ничем

**Статус:** resolved

- [x] В `shared` есть `moveRepo { repoId, toIndex }` (результат `null`) и `reposReordered { repoIds }`.
- [x] `moveRepo` в `core` переставляет Workspace, атомарно пишет `workspace.json` и испускает `reposReordered` с полным порядком; новый core на той же папке данных перечисляет Репо в новом порядке.
- [x] `toIndex` за любым краем зажимается; неизвестный `repoId` даёт `repoNotFound`; перемещение на текущий индекс ничего не пишет и ничего не испускает.
- [x] Сервер проверяет `moveRepo` (`toIndex` — целое ≥ 0) и пересылает `reposReordered`.
- [x] В `web` добавлен `@angular/cdk` (мажор 22); список Репо — `cdkDropList`, каждая карточка — `cdkDrag`, который начинается только с ручки ⋮⋮ `cdkDragHandle`; кнопки и формы в карточке никогда не начинают перетаскивание.
- [x] Превью перетаскивания показывает только цвет и имя Репо; плейсхолдер — полоска той же высоты.
- [x] При броске порядок в DOM меняется до ответа Сервера и отправляется `moveRepo`; отклонённый `moveRepo` возвращает прежний порядок и показывает ошибку обычным шаблоном.
- [x] `reposReordered` переставляет список в каждой вкладке; незнакомые id игнорируются, Репо не из списка сохраняют относительный порядок в конце.
- [x] Новые Репо по-прежнему появляются внизу; Репо с ненайденной папкой можно перемещать.
- [x] У ручки есть подсказка и `aria-label` в обоих наборах строк UI (английском и русском).
- [x] `pnpm check` проходит.
