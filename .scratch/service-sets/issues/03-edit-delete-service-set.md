# 03: Edit and delete a Service Set

**What to build:** Each Service Set in the "Service Sets" menu has an edit action that opens the same dialog filled with its name and checked Services. The user can rename it, change its Services and save, or delete it after confirming. The Set keeps its id when renamed. Changes show at once in every open window. The same refusals as on create apply (empty name, taken name ignoring case except its own, no Services); an unknown Set is refused. Spec: `.scratch/service-sets/spec.md`.

**Blocked by:** 01 (Create a Service Set and see it in the menu).

**Status:** resolved

- [x] Shared: `updateServiceSet` and `deleteServiceSet` commands; `serviceSetNotFound` error code (add it here if ticket 02 has not landed yet).
- [x] Core: update (same validation as create, its own name allowed) and delete, both persisted and followed by `serviceSetsChanged`.
- [x] Server: zod-validated handlers.
- [x] Web: edit action per Set; dialog prefilled; Save sends update; Delete asks for confirmation then sends delete; refusals shown.
- [x] Core harness tests: rename keeps the id, validation, delete, persistence, unknown id, events. Web specs through `FakeTransport`.
- [x] `pnpm check` passes.

## Русский перевод

# 03: Править и удалять Набор

**Что сделать:** У каждого Набора в меню «Наборы» есть действие правки. Оно открывает тот же диалог, заполненный именем Набора и отмеченными Сервисами. Пользователь может переименовать Набор, поменять его Сервисы и сохранить или удалить Набор после подтверждения. При переименовании id Набора сохраняется. Изменения сразу появляются во всех открытых окнах. Действуют те же отказы, что при создании (пустое имя, занятое имя без учёта регистра, кроме собственного, нет Сервисов). Неизвестный Набор отклоняется. Спецификация: `.scratch/service-sets/spec.md`.

**Заблокирован:** 01 (Создать Набор и увидеть его в меню).

**Статус:** resolved

- [x] Shared: команды `updateServiceSet` и `deleteServiceSet`. Код ошибки `serviceSetNotFound` (добавить здесь, если тикет 02 ещё не влит).
- [x] Core: правка (те же проверки, что при создании, собственное имя разрешено) и удаление. Оба действия сохраняются и сопровождаются `serviceSetsChanged`.
- [x] Сервер: обработчики с zod-проверкой.
- [x] Web: действие правки у каждого Набора; диалог заполнен заранее; «Сохранить» отправляет правку; «Удалить» просит подтверждение, затем отправляет удаление; отказы показываются.
- [x] Тесты через harness core: переименование сохраняет id, проверки, удаление, сохранение, неизвестный id, события. Спеки web через `FakeTransport`.
- [x] `pnpm check` проходит.
