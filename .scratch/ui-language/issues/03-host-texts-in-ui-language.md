# 03: Texts outside the web UI follow the UI Language

Spec: `.scratch/ui-language/spec.md`

**What to build:** Everything DevPanel shows outside the web UI speaks the UI Language. `HOST_STRINGS` gains an English twin of the same shape. The launcher reads the stored UI Language from the app data folder at start and prints its console lines (starting, started, already running, port taken, key mismatch, not built, browser failed) in it. The dimmed restart separator in a Service's terminal is written in the UI Language current at that restart; lines already written stay as they are. The desktop app shows its start-failure dialogs in the stored UI Language, builds the tray tooltip and menu in the current one, and rebuilds them right after the language changes in the window, without a restart.

**Blocked by:** 02 (EN/RU switch, UI Language stored by the Server)

**Status:** ready-for-agent

- [ ] An English `HOST_STRINGS` set exists beside the Russian one; both have the same type, and removing a key from either fails to compile.
- [ ] Launcher console lines are in English with no stored language and in Russian with `ru` stored.
- [ ] A restart after switching to `ru` writes a Russian separator; earlier separators are unchanged.
- [ ] The desktop tray tooltip and menu are in the stored UI Language at start and are rebuilt in the new language after `uiLanguageChanged`.
- [ ] Desktop start-failure dialogs use the stored UI Language.
- [ ] The `HOST_STRINGS` header comment and `docs/architecture.md` no longer call these strings Russian.
- [ ] `pnpm check` passes.

## Русский перевод

# 03: Тексты вне веб-UI следуют Языку интерфейса

Спека: `.scratch/ui-language/spec.md`

**Что сделать:** Всё, что DevPanel показывает вне веб-UI, говорит на Языке интерфейса. `HOST_STRINGS` получает английского двойника той же формы. Лаунчер при старте читает сохранённый Язык интерфейса из папки данных и печатает на нём строки консоли (запуск, запущено, уже работает, порт занят, чужой ключ, не собрано, браузер не открылся). Тусклый разделитель перезапуска в терминале Сервиса пишется на Языке интерфейса, активном в момент перезапуска; уже написанные строки остаются как есть. Десктоп показывает диалоги ошибок запуска на сохранённом Языке интерфейса, строит подсказку и меню трея на текущем и перестраивает их сразу после смены языка в окне, без перезапуска.

**Блокируется:** 02 (переключатель EN/RU, Язык интерфейса хранит Сервер)

**Статус:** ready-for-agent

- [ ] Рядом с русским `HOST_STRINGS` есть английский набор; у обоих один тип, и удаление ключа из любого не компилируется.
- [ ] Строки консоли лаунчера на английском без сохранённого языка и на русском при сохранённом `ru`.
- [ ] Перезапуск после переключения на `ru` пишет русский разделитель; ранее написанные разделители не меняются.
- [ ] Подсказка и меню трея на сохранённом Языке интерфейса при старте и перестраиваются на новом языке после `uiLanguageChanged`.
- [ ] Диалоги ошибок запуска десктопа используют сохранённый Язык интерфейса.
- [ ] Комментарий в начале `HOST_STRINGS` и `docs/architecture.md` больше не называют эти строки русскими.
- [ ] `pnpm check` проходит.
