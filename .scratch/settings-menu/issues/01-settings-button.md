# 01: Settings button holding UI Language and Theme

**What to build:** A gear "Settings" button in the header opens a small Settings panel. The UI Language switch and the Theme switch move from the header into this panel and behave exactly as before: choosing a language reloads every tab in it; choosing a Theme applies at once and follows other tabs of the same browser. The panel closes with Escape, a click outside, or the gear again. Language names stay in their own language. Spec: `.scratch/settings-menu/spec.md`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The header shows a gear button labelled "Settings" (in the current UI Language) with its expanded state exposed to assistive tech; the language and Theme switches are no longer in the header itself.
- [ ] Opening Settings shows the UI Language and Theme switches with their existing `data-*` hooks and `aria-pressed` behaviour.
- [ ] Choosing a language or Theme in Settings has the same effect as before (existing behaviour covered by specs).
- [ ] Escape, a click outside and a second click on the gear close the panel; everything is keyboard operable.
- [ ] Existing specs that use the language or Theme switches open Settings first and pass; new specs cover opening/closing.
- [ ] New strings exist in both UI string sets; `pnpm check` passes.

## Русский перевод

# 01: Кнопка «Настройки» с Языком интерфейса и Темой

**Что сделать:** Кнопка «Настройки» с шестерёнкой в шапке открывает небольшую панель Настроек. Переключатели Языка интерфейса и Темы переезжают из шапки в эту панель и работают ровно как раньше: выбор языка перезагружает в нём каждую вкладку, а выбор Темы применяется сразу и следует за другими вкладками того же браузера. Панель закрывается по Escape, клику снаружи или повторному нажатию шестерёнки. Названия языков остаются на самих этих языках. Спецификация: `.scratch/settings-menu/spec.md`.

**Заблокирован:** Нет (можно начинать сразу).

**Статус:** ready-for-agent

- [ ] В шапке есть кнопка-шестерёнка с подписью «Настройки» (на текущем Языке интерфейса), её раскрытое состояние доступно вспомогательным технологиям. Переключателей языка и Темы в самой шапке больше нет.
- [ ] Открытые Настройки показывают переключатели Языка интерфейса и Темы с прежними `data-*`-хуками и поведением `aria-pressed`.
- [ ] Выбор языка или Темы в Настройках действует так же, как раньше (существующее поведение покрыто спеками).
- [ ] Escape, клик снаружи и повторный клик по шестерёнке закрывают панель. Всем можно управлять с клавиатуры.
- [ ] Существующие спеки, использующие переключатели языка или Темы, сначала открывают Настройки и проходят. Новые спеки покрывают открытие и закрытие панели.
- [ ] Новые строки есть в обоих наборах строк UI, `pnpm check` проходит.
