# Spec: English UI Language by default

Status: ready-for-agent

## Problem Statement

Every text DevPanel shows is in Russian: the web UI, the launcher's console, the desktop tray and dialogs, and the restart separator written into a Service's terminal. A team member who does not read Russian cannot use DevPanel at all, and English is the language the wider team shares. The strings were collected in two files so that English could be added later, but there is no English set and no way to choose a language.

## Solution

DevPanel speaks English by default and still speaks Russian. The UI Language is one setting for the whole DevPanel on this machine: the DevPanel Server stores it in its app data folder, so every browser tab, the launcher and the desktop app show the same language. A compact EN/RU switch in the header, next to "Exit DevPanel", changes it; every open tab then reloads in the new language, and no Service or Session is touched. Without a stored choice, DevPanel is in English, including for existing installations after the update; a Russian speaker presses RU once.

## User Stories

### Default language

1. As a new team member, I want DevPanel to be in English when I open it for the first time, so that I can use it without reading Russian.
2. As a team member who already used DevPanel in Russian, I want the update to switch me to English like everyone else, so that the default is the same on every machine.
3. As a team member, I want every message (errors, hints, confirmations, Status names, Orphan notices, port conflicts, dependency failures) to be in plain English that says what happened and what to press, so that the English UI is as understandable as the Russian one was.
4. As a team member, I want technical details still folded away under "Details" in English, so that the error pattern stays the same in both languages.
5. As a team member, I want domain words in English to match the glossary's English names (Repo, Service, Session, Workspace, Orphan, Access Key), so that the UI, docs and conversations use the same words.

### Switching

6. As a Russian-speaking team member, I want an EN/RU switch in the header, so that I can turn DevPanel to Russian with one click.
7. As a team member, I want each language in the switch named in its own language (English / Русский), so that I can find my language even when the UI is in a language I do not read.
8. As a team member, I want the switch to show which language is active, so that I know the current state.
9. As a team member, I want my choice remembered after I close the tab, Exit DevPanel, or restart the computer, so that I choose only once.
10. As a team member, I want every open DevPanel tab to switch together, so that two tabs never disagree.
11. As a team member, I want the switch to reload the page and not touch any running Service or Session, so that changing the language never interrupts my work.
12. As a team member, I want Service output and Session terminals restored after the reload as after any reload, so that I lose nothing.
13. As a team member, I want the page to open directly in my language after a reload, without flashing the other language, so that the UI feels steady.
14. As a team member, I want pressing the already active language to do nothing, so that a misclick costs nothing.
15. As a team member, I want a clear error if the language could not be saved, so that I know the choice did not stick.

### Outside the web UI

16. As a team member starting DevPanel from the desktop shortcut, I want the launcher's console lines (starting, started, already running, port taken, not built) in my UI Language, so that the first thing I see matches the app.
17. As a desktop app user, I want the tray menu and tooltip in my UI Language, so that the tray matches the window.
18. As a desktop app user, I want the tray menu to switch language right after I change it in the window, without restarting the app, so that the app is consistent.
19. As a desktop app user, I want start-failure dialogs in my UI Language, so that I understand why DevPanel did not start.
20. As a team member, I want the dimmed restart separator in a Service's terminal written in the UI Language active at that restart, so that new output reads in my language; earlier lines stay as they were written.

### Accessibility and page

21. As a screen reader user, I want the page's `lang` attribute to match the UI Language, so that text is pronounced correctly.
22. As a screen reader user, I want `aria-label`s and tooltips translated too, so that icon buttons (▶ ■ ⟳ ✕ 📂 ↑ ↓) are announced in my language.
23. As a team member, I want the page title in the UI Language, so that the browser tab reads correctly.

### Maintainers

24. As a maintainer, I want the English and Russian string sets to have the same shape enforced by the type checker, so that a missing translation is a compile error.
25. As a maintainer, I want components to keep reading strings from one place without knowing which language is active, so that adding a string stays a one-file change per language.
26. As a maintainer, I want tests to assert on English text by default, so that the default language is what is tested most.
27. As a maintainer, I want a few tests to prove the Russian set is used after switching, so that Russian does not silently break.
28. As a maintainer, I want the main DevPanel spec and glossary to say "plain language (English by default, Russian)" instead of "plain Russian", so that docs match the product.

## Implementation Decisions

- **UI Language** (glossary term) has two values, `en` and `ru`; `en` is the default when nothing is stored. It is one value per DevPanel app data folder, not per Workspace, tab or Repo.
- **Strings.** Both string sets keep their current homes and gain an English twin of the same type: the web UI's set and `HOST_STRINGS`. English is written by the agent, in plain language for a non-programmer, with glossary English terms; the user reviews it in the diff. The Russian sets stay as they are. Each home exposes the set for a given UI Language; the type of the Russian set is derived from (or checked against) the English one so a missing key fails to compile.
- **`core`** owns the UI Language:
  - It reads the stored value from a small file in the app data folder at start (missing or unreadable → `en`).
  - New command `setUiLanguage { language }` stores it and emits a new event `uiLanguageChanged { language }`; setting the current value again is a no-op without an event.
  - `Snapshot` gains `uiLanguage`.
  - The restart separator uses `HOST_STRINGS` of the UI Language current at that restart.
  - A plain reader of the stored value (no `DevPanelCore` needed) is exported for the launcher and the desktop app's pre-start dialogs.
- **Server**: a handler for `setUiLanguage` (zod: `'en' | 'ru'`), and `uiLanguageChanged` added to the forwarded events, following the "adding a command/event end to end" recipes.
- **`web`**:
  - The UI string set is chosen once at page load, before Angular bootstraps, from a per-viewer cache of the last UI Language in `localStorage` (missing or unavailable → `en`). Components keep reading `STRINGS`; it is not reactive.
  - When the snapshot's `uiLanguage` differs from the loaded set, the app stores the new value in the cache and reloads once. The Server is the source of truth; the cache only avoids a flash of the wrong language.
  - On `uiLanguageChanged` every tab stores the value and reloads.
  - Reloading goes through an injectable function so tests can observe it instead of reloading.
  - `<html lang>` and the document title follow the loaded set.
  - The header switch is two buttons "English" / "Русский" next to "Exit DevPanel"; the active one is marked (`aria-pressed`). Pressing the inactive one sends `setUiLanguage`; a failure shows through the usual error pattern.
- **Launcher**: reads the stored UI Language from the app data folder at start and prints its console lines in that language.
- **Desktop app**: pre-start dialogs use the stored UI Language. `RunningServer` exposes the current UI Language and a subscription to its changes; the tray tooltip and menu are built in the current language and rebuilt on change. `DesktopHost` gains a way to set the tray tooltip if it lacks one.
- **No migration**: existing installations have no stored value and therefore get English.
- **Docs**: the DevPanel MVP spec's "plain Russian" wording becomes "plain language (English by default, Russian)", and "An English UI" leaves its Out of Scope. The comments that call the strings files "Russian now" are updated. `GLOSSARY.md` already has **Язык интерфейса (UI Language)**.
- No ADR: the decision is cheap to reverse and involved no surprising trade-off.

## Testing Decisions

- Good tests exercise external behaviour only: commands in, events and visible text out, files on disk; never internal state.
- **Seam 1 — `core` public interface** (harness, temporary app data folder): default `en` in the snapshot; `setUiLanguage('ru')` emits `uiLanguageChanged` and a new core on the same folder reports `ru`; setting the same value emits nothing; a restart separator after switching is in Russian; the exported reader returns `en` for a missing or garbled file. Prior art: existing `core` tests through `Harness`, Local Config persistence tests.
- **Seam 2 — `BackendTransport`** (`FakeTransport`): existing specs switch their text assertions and Russian `aria-label` hooks to English; new specs cover the switch sending `setUiLanguage`, `aria-pressed` on the active language, reload on `uiLanguageChanged`, a reload when the snapshot language differs from the loaded set and none when it matches, the cache being written, and Russian text shown when the Russian set is loaded. Prior art: `app.spec.ts`, `exit-and-orphans.spec.ts`.
- **Seam 3 — launcher `deps`** (`launch.test.ts`): console lines follow the stored UI Language, English when none.
- **Seam 4 — `DesktopHost` fakes** (desktop unit tests): tray menu in the stored language at start and rebuilt after a change; start-failure dialog in the stored language.
- **Server**: the existing round-trip test pattern can cover `setUiLanguage` → `uiLanguageChanged`; optional.
- `pnpm check` must pass.

## Out of Scope

- Languages other than English and Russian, and any translation tooling or i18n framework.
- Choosing the language automatically from the OS or browser.
- A per-tab or per-viewer language.
- Changing the language without a page reload.
- A language item in the tray menu.
- Translating Service output, `claude`, shell or `cmd.exe` text, or technical error details (they stay in English as now).
- Translating Repo Config and Local Config content.
- Re-translating restart separators already written into a terminal.

## Further Notes

- The `cmd.exe` "Terminate batch job" answer already handles both English and Russian wording and is unaffected.
- The uncommitted splitter work on `ui-fixes-1` adds a `resizeLeft` string; it needs an English twin like any other string.

## Русский перевод

# Спека: английский Язык интерфейса по умолчанию

Status: ready-for-agent

## Постановка проблемы

Все тексты DevPanel сейчас на русском: веб-UI, консоль лаунчера, трей и диалоги десктопа, разделитель перезапуска в терминале Сервиса. Член команды, который не читает по-русски, не может пользоваться DevPanel вообще, а общий язык команды — английский. Строки собраны в два файла, чтобы потом добавить английский, но английского набора нет, и выбрать язык нельзя.

## Решение

DevPanel по умолчанию говорит по-английски и по-прежнему умеет по-русски. Язык интерфейса — одна настройка на всю DevPanel на этой машине: Сервер DevPanel хранит её в своей папке данных, поэтому все вкладки браузера, лаунчер и десктоп показывают один и тот же язык. Компактный переключатель EN/RU в шапке рядом с «Выйти из DevPanel» меняет его; после этого каждая открытая вкладка перезагружается на новом языке, а Сервисы и Сессии не затрагиваются. Без сохранённого выбора DevPanel на английском, в том числе в уже установленных копиях после обновления; русскоязычный пользователь один раз нажимает RU.

## Пользовательские истории

### Язык по умолчанию

1. Как новый член команды, я хочу, чтобы DevPanel при первом открытии была на английском, чтобы пользоваться ей, не читая по-русски.
2. Как член команды, который уже пользовался DevPanel на русском, я хочу, чтобы обновление переключило меня на английский, как всех, чтобы язык по умолчанию был одинаков на всех машинах.
3. Как член команды, я хочу, чтобы каждое сообщение (ошибки, подсказки, подтверждения, названия Статусов, сообщения о Зомби, конфликты портов, сбои Зависимостей) было на простом английском и говорило, что случилось и что нажать, чтобы английский UI был так же понятен, как русский.
4. Как член команды, я хочу, чтобы технические детали по-прежнему были спрятаны под «Details» на английском, чтобы шаблон ошибок был одинаков в обоих языках.
5. Как член команды, я хочу, чтобы предметные слова на английском совпадали с английскими названиями из глоссария (Repo, Service, Session, Workspace, Orphan, Access Key), чтобы UI, документы и разговоры использовали одни и те же слова.

### Переключение

6. Как русскоязычный член команды, я хочу переключатель EN/RU в шапке, чтобы перевести DevPanel на русский одним кликом.
7. Как член команды, я хочу, чтобы каждый язык в переключателе назывался на самом себе (English / Русский), чтобы найти свой язык, даже если UI на языке, которого я не читаю.
8. Как член команды, я хочу, чтобы переключатель показывал активный язык, чтобы знать текущее состояние.
9. Как член команды, я хочу, чтобы выбор запоминался после закрытия вкладки, Выхода из DevPanel и перезагрузки компьютера, чтобы выбирать только один раз.
10. Как член команды, я хочу, чтобы все открытые вкладки DevPanel переключались вместе, чтобы две вкладки никогда не расходились.
11. Как член команды, я хочу, чтобы переключение перезагружало страницу и не трогало запущенные Сервисы и Сессии, чтобы смена языка не прерывала работу.
12. Как член команды, я хочу, чтобы вывод Сервисов и терминалы Сессий восстанавливались после перезагрузки, как после любой перезагрузки, чтобы ничего не терять.
13. Как член команды, я хочу, чтобы после перезагрузки страница сразу открывалась на моём языке, без мелькания другого, чтобы UI выглядел стабильно.
14. Как член команды, я хочу, чтобы нажатие на уже активный язык ничего не делало, чтобы случайный клик ничего не стоил.
15. Как член команды, я хочу понятную ошибку, если язык не удалось сохранить, чтобы знать, что выбор не применился.

### Вне веб-UI

16. Как член команды, запускающий DevPanel с ярлыка на рабочем столе, я хочу, чтобы строки консоли лаунчера (запуск, запущено, уже работает, порт занят, не собрано) были на моём Языке интерфейса, чтобы первое, что я вижу, совпадало с приложением.
17. Как пользователь десктопа, я хочу меню и подсказку трея на моём Языке интерфейса, чтобы трей совпадал с окном.
18. Как пользователь десктопа, я хочу, чтобы меню трея переключалось сразу после смены языка в окне, без перезапуска приложения, чтобы приложение было согласованным.
19. Как пользователь десктопа, я хочу диалоги ошибок запуска на моём Языке интерфейса, чтобы понимать, почему DevPanel не запустилась.
20. Как член команды, я хочу, чтобы тусклый разделитель перезапуска в терминале Сервиса писался на Языке интерфейса, активном в момент перезапуска, чтобы новый вывод читался на моём языке; ранее написанные строки остаются как были.

### Доступность и страница

21. Как пользователь экранного диктора, я хочу, чтобы атрибут `lang` страницы совпадал с Языком интерфейса, чтобы текст произносился правильно.
22. Как пользователь экранного диктора, я хочу, чтобы `aria-label` и подсказки тоже переводились, чтобы кнопки-иконки (▶ ■ ⟳ ✕ 📂 ↑ ↓) озвучивались на моём языке.
23. Как член команды, я хочу заголовок страницы на Языке интерфейса, чтобы вкладка браузера читалась правильно.

### Сопровождающие

24. Как сопровождающий, я хочу, чтобы у английского и русского наборов строк была одна форма, которую проверяет компилятор, чтобы пропущенный перевод был ошибкой компиляции.
25. Как сопровождающий, я хочу, чтобы компоненты по-прежнему брали строки из одного места, не зная, какой язык активен, чтобы добавление строки оставалось правкой одного файла на язык.
26. Как сопровождающий, я хочу, чтобы тесты по умолчанию проверяли английский текст, чтобы язык по умолчанию был проверен лучше всего.
27. Как сопровождающий, я хочу несколько тестов, доказывающих, что после переключения используется русский набор, чтобы русский не сломался незаметно.
28. Как сопровождающий, я хочу, чтобы основная спека DevPanel и глоссарий говорили «понятный язык (по умолчанию английский, есть русский)» вместо «понятный русский», чтобы документы соответствовали продукту.

## Решения по реализации

- **Язык интерфейса** (термин глоссария) имеет два значения, `en` и `ru`; `en` — значение по умолчанию, если ничего не сохранено. Одно значение на папку данных DevPanel, а не на Workspace, вкладку или Репо.
- **Строки.** Оба набора остаются на своих местах и получают английского двойника того же типа: набор веб-UI и `HOST_STRINGS`. Английский пишет агент, простым языком для непрограммиста, с английскими терминами из глоссария; пользователь проверяет его в диффе. Русские наборы не меняются. Каждое место отдаёт набор для заданного Языка интерфейса; тип русского набора выводится из английского (или сверяется с ним), так что пропущенный ключ не компилируется.
- **`core`** владеет Языком интерфейса:
  - При старте читает сохранённое значение из небольшого файла в папке данных (нет или не читается → `en`).
  - Новая команда `setUiLanguage { language }` сохраняет его и испускает новое событие `uiLanguageChanged { language }`; повторная установка текущего значения ничего не делает и события не испускает.
  - `Snapshot` получает `uiLanguage`.
  - Разделитель перезапуска берёт `HOST_STRINGS` того Языка интерфейса, что активен в момент перезапуска.
  - Экспортируется простая функция чтения сохранённого значения (без `DevPanelCore`) для лаунчера и диалогов десктопа до старта.
- **Сервер**: обработчик `setUiLanguage` (zod: `'en' | 'ru'`) и `uiLanguageChanged` в пересылаемых событиях — по рецептам «добавить команду/событие насквозь».
- **`web`**:
  - Набор строк UI выбирается один раз при загрузке страницы, до старта Angular, по кешу последнего Языка интерфейса в `localStorage` для этого зрителя (нет или недоступен → `en`). Компоненты по-прежнему читают `STRINGS`; он не реактивный.
  - Если `uiLanguage` в снимке отличается от загруженного набора, приложение записывает новое значение в кеш и перезагружается один раз. Источник истины — Сервер; кеш только убирает мелькание не того языка.
  - На `uiLanguageChanged` каждая вкладка записывает значение и перезагружается.
  - Перезагрузка идёт через внедряемую функцию, чтобы тесты могли наблюдать её вместо настоящей перезагрузки.
  - `<html lang>` и заголовок документа следуют загруженному набору.
  - Переключатель в шапке — две кнопки «English» / «Русский» рядом с «Выйти из DevPanel»; активная помечена (`aria-pressed`). Нажатие на неактивную отправляет `setUiLanguage`; ошибка показывается обычным шаблоном ошибок.
- **Лаунчер**: при старте читает сохранённый Язык интерфейса из папки данных и печатает строки консоли на нём.
- **Десктоп**: диалоги до старта используют сохранённый Язык интерфейса. `RunningServer` отдаёт текущий Язык интерфейса и подписку на его изменения; подсказка и меню трея строятся на текущем языке и перестраиваются при смене. `DesktopHost` получает способ задать подсказку трея, если его нет.
- **Без миграции**: в существующих установках значения нет, поэтому они получают английский.
- **Документы**: в спеке DevPanel MVP «plain Russian» становится «plain language (English by default, Russian)», а «An English UI» уходит из «Вне рамок». Комментарии, где файлы строк названы «пока на русском», обновляются. В `GLOSSARY.md` уже есть **Язык интерфейса (UI Language)**.
- ADR не нужен: решение дёшево откатить, и неожиданного компромисса в нём нет.

## Решения по тестированию

- Хорошие тесты проверяют только внешнее поведение: команды на входе, события и видимый текст на выходе, файлы на диске; никогда не внутреннее состояние.
- **Шов 1 — публичный интерфейс `core`** (харнесс, временная папка данных): по умолчанию `en` в снимке; `setUiLanguage('ru')` испускает `uiLanguageChanged`, и новый core на той же папке сообщает `ru`; установка того же значения ничего не испускает; разделитель перезапуска после переключения на русском; экспортированная функция чтения возвращает `en` для отсутствующего или испорченного файла. Прецеденты: существующие тесты `core` через `Harness`, тесты сохранения Локального конфига.
- **Шов 2 — `BackendTransport`** (`FakeTransport`): существующие спеки переводят проверки текста и русские `aria-label`-хуки на английский; новые спеки покрывают отправку `setUiLanguage` переключателем, `aria-pressed` у активного языка, перезагрузку на `uiLanguageChanged`, перезагрузку при расхождении языка снимка с загруженным набором и её отсутствие при совпадении, запись кеша и показ русского текста при загруженном русском наборе. Прецеденты: `app.spec.ts`, `exit-and-orphans.spec.ts`.
- **Шов 3 — `deps` лаунчера** (`launch.test.ts`): строки консоли следуют сохранённому Языку интерфейса, английский, если его нет.
- **Шов 4 — фейки `DesktopHost`** (юнит-тесты десктопа): меню трея на сохранённом языке при старте и перестроено после смены; диалог ошибки запуска на сохранённом языке.
- **Сервер**: существующий шаблон round-trip теста может покрыть `setUiLanguage` → `uiLanguageChanged`; необязательно.
- `pnpm check` должен проходить.

## Вне рамок

- Языки, кроме английского и русского, а также любые инструменты перевода и i18n-фреймворки.
- Автоматический выбор языка по ОС или браузеру.
- Язык на вкладку или на зрителя.
- Смена языка без перезагрузки страницы.
- Пункт выбора языка в меню трея.
- Перевод вывода Сервисов, текста `claude`, оболочки или `cmd.exe` и технических деталей ошибок (они остаются на английском, как сейчас).
- Перевод содержимого Конфига репо и Локального конфига.
- Повторный перевод разделителей перезапуска, уже записанных в терминал.

## Дополнительные заметки

- Ответ на «Terminate batch job» в `cmd.exe` уже понимает английскую и русскую формулировки и не затрагивается.
- Незакоммиченная работа над разделителем на `ui-fixes-1` добавляет строку `resizeLeft`; ей, как и любой другой строке, нужен английский двойник.
