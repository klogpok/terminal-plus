# 01: Create a Service Set and see it in the menu

**What to build:** A "Service Sets" menu in the header lists the user's Service Sets and offers "New Service Set…". The dialog takes a name and shows every Service of every Repo with a checkbox, grouped by Repo (name and color); Services running right now are pre-checked. Saving creates the Set on the Server: it is stored only on this machine (its own file in the app data directory, never in a Repo), survives a Server restart, and appears at once in every open window. Empty name, a name another Set already has (ignoring case), and no checked Services are refused with plain-language messages. Starting, editing and deleting come in later tickets. Spec: `.scratch/service-sets/spec.md`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Shared: `ServiceSetView` (id, name, entries with `ref` and `found`), the `createServiceSet` command, the `serviceSetsChanged` event, Service Sets in `Snapshot`, error codes `serviceSetNameTaken` and `serviceSetEmpty` worded in both UI string sets.
- [ ] Core, in its own module: create with a generated id, trimmed unique (ignoring case) non-empty name, at least one Service; persisted with temp file + rename and validated on read (missing file = none); `serviceSetsChanged` emitted; included in the snapshot.
- [ ] Server: zod-validated handler and the event forwarded.
- [ ] Web: menu with the Sets from the snapshot that follows `serviceSetsChanged`; create dialog with grouped checkboxes (labelled with Repo and Service name), running Services pre-checked, Server refusals shown.
- [ ] Core harness tests: create, each refusal, persistence across a new core on the same app data dir, the event. Web specs through `FakeTransport`: menu, dialog, pre-check, refusal.
- [ ] `pnpm check` passes.

## Русский перевод

# 01: Создать Набор и увидеть его в меню

**Что сделать:** Меню «Наборы» в шапке показывает Наборы пользователя и пункт «Новый Набор…». В диалоге задаётся имя и показаны все Сервисы всех Репо с галочками, сгруппированные по Репо (имя и цвет). Запущенные сейчас Сервисы отмечены заранее. Сохранение создаёт Набор на Сервере. Он хранится только на этой машине (в отдельном файле в папке данных приложения, никогда в Репо), переживает перезапуск Сервера и сразу появляется во всех открытых окнах. Пустое имя, имя, которое уже есть у другого Набора (без учёта регистра), и отсутствие отмеченных Сервисов отклоняются с сообщениями простыми словами. Запуск, правка и удаление — в следующих тикетах. Спецификация: `.scratch/service-sets/spec.md`.

**Заблокирован:** Нет (можно начинать сразу).

**Статус:** ready-for-agent

- [ ] Shared: `ServiceSetView` (id, имя, записи с `ref` и `found`), команда `createServiceSet`, событие `serviceSetsChanged`, Наборы в `Snapshot`, коды ошибок `serviceSetNameTaken` и `serviceSetEmpty` с текстами в обоих наборах строк UI.
- [ ] Core, в отдельном модуле: создание со сгенерированным id. Имя обрезается по краям, не пустое и уникально без учёта регистра. Хотя бы один Сервис. Сохранение через временный файл + переименование, проверка при чтении (нет файла — нет Наборов). Отправляется `serviceSetsChanged`. Наборы входят в снимок.
- [ ] Сервер: обработчик с zod-проверкой и пересылка события.
- [ ] Web: меню с Наборами из снимка, которое следует за `serviceSetsChanged`. Диалог создания со сгруппированными галочками (подписаны именем Репо и Сервиса), запущенные Сервисы отмечены заранее, отказы Сервера показываются.
- [ ] Тесты через harness core: создание, каждый отказ, сохранение при новом core на той же папке данных, событие. Спеки web через `FakeTransport`: меню, диалог, предварительная отметка, отказ.
- [ ] `pnpm check` проходит.
