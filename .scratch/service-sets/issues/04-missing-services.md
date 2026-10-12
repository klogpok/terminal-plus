# 04: Services missing from a Service Set ("not found")

**What to build:** When a Service of a Set is removed from its Repo's config, or its Repo is removed from the Workspace, the entry stays in the Set and is marked "not found". Starting the Set skips it, starts the rest, and the panel's message names the not-found Services. The Service Set dialog lists not-found entries separately so the user can uncheck them. When the Service comes back (config restored, Repo added again at the same path), the entry is found again and the Set uses it. Entries are never removed automatically. Spec: `.scratch/service-sets/spec.md`.

**Blocked by:** 02 (Start a Service Set from the panel), 03 (Edit and delete a Service Set).

**Status:** ready-for-agent

- [ ] Core: each entry's `found` reflects the current Workspace and configs; `serviceSetsChanged` is emitted when a Workspace or config change flips any entry; saving not-found entries is allowed.
- [ ] Core: `startServiceSet` skips not-found entries and lists them in `notFound`.
- [ ] Web: the start message names not-found Services; the dialog lists not-found entries (announced as "not found") with checkboxes; unchecking and saving drops them.
- [ ] Core harness tests: removed Service and removed Repo become not found and land in `notFound`; re-adding the Repo at the same path makes the entry found again; the event fires on each flip. Web specs through `FakeTransport`.
- [ ] `pnpm check` passes.

## Русский перевод

# 04: Пропавшие Сервисы Набора («не найден»)

**Что сделать:** Когда Сервис Набора убирают из конфига его Репо или его Репо удаляют из Workspace, запись остаётся в Наборе и помечается «не найден». Запуск Набора пропускает её и запускает остальные, а сообщение панели называет не найденные Сервисы. Диалог Набора показывает не найденные записи отдельным списком, чтобы пользователь мог снять с них галочку. Когда Сервис возвращается (конфиг восстановлен, Репо снова добавлен по тому же пути), запись снова находится, и Набор её использует. Записи никогда не удаляются автоматически. Спецификация: `.scratch/service-sets/spec.md`.

**Заблокирован:** 02 (Запустить Набор из панели), 03 (Править и удалять Набор).

**Статус:** ready-for-agent

- [ ] Core: `found` у каждой записи соответствует текущему Workspace и конфигам. `serviceSetsChanged` отправляется, когда изменение Workspace или конфига меняет `found` у какой-либо записи. Сохранять не найденные записи разрешено.
- [ ] Core: `startServiceSet` пропускает не найденные записи и перечисляет их в `notFound`.
- [ ] Web: сообщение о запуске называет не найденные Сервисы. Диалог показывает не найденные записи (озвучиваются как «не найден») с галочками. Снятие галочки и сохранение убирает их.
- [ ] Тесты через harness core: удалённый Сервис и удалённый Репо становятся не найденными и попадают в `notFound`; повторное добавление Репо по тому же пути снова делает запись найденной; событие приходит при каждом изменении. Спеки web через `FakeTransport`.
- [ ] `pnpm check` проходит.
