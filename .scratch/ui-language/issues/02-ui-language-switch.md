# 02: EN/RU switch, UI Language stored by the Server

Spec: `.scratch/ui-language/spec.md`

**What to build:** The header has two buttons, "English" and "Русский", next to "Exit DevPanel"; the active one is marked with `aria-pressed`. Pressing the inactive one asks the DevPanel Server to set the UI Language (`setUiLanguage`). `core` stores it in a small file in the app data folder and broadcasts `uiLanguageChanged`; every open tab writes the value into its cache and reloads in the new language. Services and Sessions keep running and their output is restored as after any reload. The snapshot carries `uiLanguage`: if a tab loaded a different set than the Server's (for example a fresh browser), it updates its cache and reloads once. The choice survives closing tabs, Exit and a computer restart. A failure to save shows through the usual error pattern. Reloading goes through an injectable function so tests observe it. The main DevPanel spec stops saying "plain Russian".

**Blocked by:** 01 (English web UI by default)

**Status:** resolved

- [ ] A fresh app data folder reports `uiLanguage: 'en'` in the snapshot; a missing or garbled stored file also means `en`.
- [ ] `setUiLanguage('ru')` emits `uiLanguageChanged` to every client, and a new core on the same app data folder reports `ru`.
- [ ] Setting the current value again does nothing and emits no event; pressing the active button sends nothing.
- [ ] The Server validates the payload (`'en' | 'ru'`) and forwards `uiLanguageChanged`.
- [ ] The header switch shows both languages named in their own language, marks the active one, and sends `setUiLanguage` for the other.
- [ ] On `uiLanguageChanged` a tab stores the value in its cache and reloads; on a snapshot whose `uiLanguage` differs from the loaded set it does the same once; on a matching snapshot it does not reload.
- [ ] A rejected `setUiLanguage` shows an error message in the current language.
- [ ] A plain reader of the stored UI Language (no `DevPanelCore` needed) is exported for ticket 03.
- [ ] `.scratch/devpanel/spec.md` says "plain language (English by default, Russian)" instead of "plain Russian", and "An English UI" is gone from its Out of Scope (both in the English text and the Russian translation).
- [ ] `pnpm check` passes.

## Русский перевод

# 02: Переключатель EN/RU, Язык интерфейса хранит Сервер

Спека: `.scratch/ui-language/spec.md`

**Что сделать:** В шапке рядом с «Выйти из DevPanel» две кнопки, «English» и «Русский»; активная помечена `aria-pressed`. Нажатие на неактивную просит Сервер DevPanel установить Язык интерфейса (`setUiLanguage`). `core` сохраняет его в небольшой файл в папке данных и рассылает `uiLanguageChanged`; каждая открытая вкладка записывает значение в свой кеш и перезагружается на новом языке. Сервисы и Сессии продолжают работать, их вывод восстанавливается, как после любой перезагрузки. Снимок несёт `uiLanguage`: если вкладка загрузила не тот набор, что на Сервере (например, в новом браузере), она обновляет кеш и перезагружается один раз. Выбор переживает закрытие вкладок, Выход и перезагрузку компьютера. Ошибка сохранения показывается обычным шаблоном ошибок. Перезагрузка идёт через внедряемую функцию, чтобы тесты могли её наблюдать. Основная спека DevPanel перестаёт говорить «plain Russian».

**Блокируется:** 01 (веб-UI на английском по умолчанию)

**Статус:** resolved

- [ ] Новая папка данных даёт `uiLanguage: 'en'` в снимке; отсутствующий или испорченный файл тоже означает `en`.
- [ ] `setUiLanguage('ru')` рассылает `uiLanguageChanged` всем клиентам, и новый core на той же папке данных сообщает `ru`.
- [ ] Повторная установка текущего значения ничего не делает и не испускает событие; нажатие на активную кнопку ничего не отправляет.
- [ ] Сервер проверяет payload (`'en' | 'ru'`) и пересылает `uiLanguageChanged`.
- [ ] Переключатель в шапке показывает оба языка, названных на самих себе, помечает активный и отправляет `setUiLanguage` для другого.
- [ ] На `uiLanguageChanged` вкладка записывает значение в кеш и перезагружается; на снимок, чей `uiLanguage` отличается от загруженного набора, — то же один раз; на совпадающий снимок — не перезагружается.
- [ ] Отклонённый `setUiLanguage` показывает сообщение об ошибке на текущем языке.
- [ ] Экспортируется простая функция чтения сохранённого Языка интерфейса (без `DevPanelCore`) для тикета 03.
- [ ] `.scratch/devpanel/spec.md` говорит «plain language (English by default, Russian)» вместо «plain Russian», и «An English UI» убрано из его «Вне рамок» (и в английском тексте, и в русском переводе).
- [ ] `pnpm check` проходит.
