# 01: English web UI by default

Spec: `.scratch/ui-language/spec.md`

**What to build:** The team member opens DevPanel and the whole web UI is in plain English: headers, buttons, Status names, confirmations, error messages with "Details", Orphan notices, port conflicts, dependency failures, tooltips and `aria-label`s, using the glossary's English terms (Repo, Service, Session, Workspace, Orphan, Access Key). The web UI string set gains an English twin of exactly the same shape as the Russian one, so a missing translation is a compile error. The set is chosen once at page load, before Angular starts, from a per-viewer cache of the last UI Language in `localStorage`; a missing value or unavailable storage means English. Components keep reading `STRINGS` without knowing the language. `<html lang>` and the page title follow the loaded set. Nothing can switch the language yet besides the cache (ticket 02 adds the switch).

**Blocked by:** None (can start immediately)

**Status:** resolved

- [ ] An English UI string set exists beside the Russian one; both have the same type, and removing a key from either fails to compile.
- [ ] English texts are plain language for a non-programmer: each message says what happened and what to press; technical details stay under "Details".
- [ ] Without a cached UI Language (or with storage unavailable) the UI renders in English; with `ru` cached it renders in Russian.
- [ ] `<html lang>` and the document title match the loaded set.
- [ ] No user-facing Russian text remains outside the Russian string set in `web` (templates, components, `index.html`).
- [ ] Existing `web` specs assert on English text and English `aria-label` hooks; one spec proves the Russian set is used when `ru` is cached.
- [ ] The strings file's header comment no longer says "Russian now; English later".
- [ ] `pnpm check` passes.

## Русский перевод

# 01: Веб-UI на английском по умолчанию

Спека: `.scratch/ui-language/spec.md`

**Что сделать:** Член команды открывает DevPanel, и весь веб-UI на простом английском: заголовки, кнопки, названия Статусов, подтверждения, сообщения об ошибках с «Details», сообщения о Зомби, конфликты портов, сбои Зависимостей, подсказки и `aria-label`, с английскими терминами глоссария (Repo, Service, Session, Workspace, Orphan, Access Key). Набор строк веб-UI получает английского двойника ровно той же формы, что и русский, так что пропущенный перевод — ошибка компиляции. Набор выбирается один раз при загрузке страницы, до старта Angular, по кешу последнего Языка интерфейса в `localStorage` для этого зрителя; если значения нет или хранилище недоступно — английский. Компоненты по-прежнему читают `STRINGS`, не зная языка. `<html lang>` и заголовок страницы следуют загруженному набору. Переключить язык пока можно только через кеш (переключатель добавит тикет 02).

**Блокируется:** ничего (можно начинать сразу)

**Статус:** resolved

- [ ] Рядом с русским набором строк UI есть английский; у обоих один тип, и удаление ключа из любого не компилируется.
- [ ] Английские тексты написаны простым языком для непрограммиста: каждое сообщение говорит, что случилось и что нажать; технические детали остаются под «Details».
- [ ] Без закешированного Языка интерфейса (или при недоступном хранилище) UI на английском; с закешированным `ru` — на русском.
- [ ] `<html lang>` и заголовок документа соответствуют загруженному набору.
- [ ] В `web` не осталось пользовательского русского текста вне русского набора строк (шаблоны, компоненты, `index.html`).
- [ ] Существующие спеки `web` проверяют английский текст и английские `aria-label`-хуки; одна спека доказывает, что при закешированном `ru` используется русский набор.
- [ ] Комментарий в начале файла строк больше не говорит «Russian now; English later».
- [ ] `pnpm check` проходит.
