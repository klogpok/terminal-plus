# 02: Collapse Repos

Spec: `.scratch/arrange-repos/spec.md`

**What to build:** A team member collapses a Repo card to one line with ▾/▸ before the Repo name, or by clicking the name. A collapsed Repo keeps its header row (name, branch, Claude / terminal / 📂 / ✕) and adds a row of status dots, one per Service, each telling the Service name and Status on hover. A ❗ with a tooltip appears when something in the Repo needs attention; the Repo stays collapsed. "Collapse all / Expand all" sits next to the panel title. Which Repos are collapsed is remembered per viewer in `localStorage`. Web only; no Server change.

**Blocked by:** none (touches the same header and list files as 01; whichever lands second rebases)

**Status:** ready-for-agent

- [ ] ▾/▸ is a `button` with `aria-expanded` and an accessible name in both UI string sets; clicking the Repo name toggles too.
- [ ] Collapsed, the card hides "Start all / Stop all", the Service list, config suggestions, Install, the unused Local Config notice and "+ Add Service"; the Remove confirmation and the "Folder not found" block still show.
- [ ] Collapsed, the card shows one status dot per Service with a tooltip naming the Service and its Status.
- [ ] ❗ shows in a collapsed Repo when a Service is `crashed` or `unhealthy`, a Service has a `portConflict`, `configError` is set, or `folderMissing` is set; its tooltip says which. The Repo does not expand by itself.
- [ ] "Collapse all" shows while at least one Repo is expanded, "Expand all" when all are collapsed; each does what it says.
- [ ] The set of collapsed `repoId`s is kept in `localStorage`, survives a page reload, and drops ids of Repos no longer in the Workspace; storage that throws means nothing is collapsed or remembered and rendering still works.
- [ ] A newly added Repo is expanded.
- [ ] All new texts are in both UI string sets (English and Russian).
- [ ] `pnpm check` passes.

## Русский перевод

# 02: Сворачивание Репо

Спека: `.scratch/arrange-repos/spec.md`

**Что сделать:** Член команды сворачивает карточку Репо в одну строку кнопкой ▾/▸ перед именем Репо или кликом по имени. Свёрнутый Репо сохраняет строку заголовка (имя, ветка, Claude / терминал / 📂 / ✕) и добавляет ряд точек статуса, по одной на Сервис; каждая при наведении называет Сервис и его Статус. Когда в Репо что-то требует внимания, появляется ❗ с подсказкой; Репо остаётся свёрнутым. «Свернуть всё / Развернуть всё» — рядом с заголовком панели. Какие Репо свёрнуты, запоминается для каждого зрителя в `localStorage`. Только web; Сервер не меняется.

**Блокируется:** ничем (затрагивает те же файлы заголовка и списка, что и 01; кто вливается вторым, тот делает rebase)

**Статус:** ready-for-agent

- [ ] ▾/▸ — `button` с `aria-expanded` и доступным именем в обоих наборах строк UI; клик по имени Репо тоже переключает.
- [ ] В свёрнутом виде карточка прячет «Start all / Stop all», список Сервисов, предложения конфига, Install, уведомление о неиспользуемом Локальном конфиге и «+ Add Service»; подтверждение удаления и блок «Папка не найдена» по-прежнему видны.
- [ ] В свёрнутом виде карточка показывает по одной точке статуса на Сервис с подсказкой, называющей Сервис и его Статус.
- [ ] ❗ показывается у свёрнутого Репо, когда Сервис `crashed` или `unhealthy`, у Сервиса есть `portConflict`, задан `configError` или `folderMissing`; подсказка говорит, что именно. Репо сам не разворачивается.
- [ ] «Свернуть всё» видно, пока хотя бы один Репо развёрнут, «Развернуть всё» — когда свёрнуты все; каждая делает то, что написано.
- [ ] Набор свёрнутых `repoId` хранится в `localStorage`, переживает перезагрузку страницы и теряет id Репо, которых больше нет в Workspace; хранилище, бросающее исключение, означает «ничего не свёрнуто и не запоминается», а отрисовка всё равно работает.
- [ ] Новый Репо добавляется развёрнутым.
- [ ] Все новые тексты — в обоих наборах строк UI (английском и русском).
- [ ] `pnpm check` проходит.
