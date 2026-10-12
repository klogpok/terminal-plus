# 04: Tauri shell: tray menu and error dialogs

Spec: `.scratch/tauri-desktop/spec.md`

**What to build:** The Tauri tray gets the same menu as the Electron app: Show, "Stop everything in all Repos", a Start with Windows checkbox and Quit, plus the tooltip, all in the current UI Language. The menu is rebuilt as soon as the language changes in the window. The menu opens on a right click only; a left click keeps showing the window (ticket 03). Menu clicks go to the sidecar as `trayItemClicked`, and the sidecar decides what happens: Quit runs the quit flow, and "Stop everything in all Repos" stops every Service and keeps Sessions. Every `showError` (start failures such as a taken port, a failed "Stop everything in all Repos") appears as today: a native message box in the dialog's UI Language with the plain-language message. When there are technical details, a "Details" button opens them in a second box. Closing the dialog sends `errorDismissed`, so a start failure ends the app only after the user has read it. The Start with Windows item is rendered from `setTray`; making the toggle actually change Windows autostart is ticket 05.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] The tray tooltip and menu render from `setTray` and are rebuilt on every `setTray`, in the UI Language the sidecar chose.
- [x] The menu opens on a right click; a left click does not open it and still shows the window.
- [x] Menu items send `trayItemClicked` with their id; Quit stops every Service and Session before the app ends; "Stop everything in all Repos" keeps DevPanel and Sessions running.
- [x] `showError` opens a native box with the title and plain message; with details, a "Details" button opens a second box with them; button labels and the details title are in the dialog's UI Language; closing sends `errorDismissed`.
- [x] A port held by the `.bat` DevPanel: the desktop app explains, and after the dialog is dismissed it exits, without a second Server.
- [x] Checked by hand in both UI Languages; the steps are noted for the release smoke in ticket 07.
- [x] `desktop:check` and `pnpm check` pass.

## Comments

- Implementation: the tray lives in `src-tauri/src/tray.rs` (created in `setup`, rebuilt from scratch on every `setTray`), the error boxes in `src-tauri/src/dialog.rs` (rfd TaskDialog with the sidecar's `ok`/`details` labels; Esc or the close box counts as OK, never as "Details"). Each `showError` box runs on its own thread, so the protocol reader keeps going while it is open; `errorDismissed` is sent once the box (and its details box) is closed.
- Checked on the debug build (`cargo build`, then `target\debug\devpanel-desktop.exe` with a temp `DEVPANEL_APP_DATA` and a free `DEVPANEL_PORT`): the menu renders in English, switches to Russian live after `setUiLanguage ru`, a left click opens no menu, "Exit DevPanel" from the tray ends the app and frees the port, "Stop everything in all Repos" leaves the app running; a running web Server on the same port and app data gives the "already running" box and the app exits after it is dismissed while the Server keeps running; another program on the port gives the Russian "port is taken" box; `DEVPANEL_PORT=99999` gives the "unexpected" box with a working "Подробности" button.
- Known look: in the details box, TaskDialog shortens long unbroken lines (file paths in a stack trace) with an ellipsis. The full text is still in the sidecar's stderr.

### Release smoke steps (for ticket 07)

Run each in English and again in Russian (switch the language in DevPanel's settings; the tray menu must follow at once, without a restart).

1. Start the installed app. Right-click the tray icon: Show DevPanel, Stop everything in all Repos, Start with Windows (checkbox), Exit DevPanel, separators as in the Electron app; hover shows the tooltip. Left-click the icon: no menu, the window comes to the front.
2. Switch the UI Language in the window, right-click the tray icon again: menu and tooltip are in the new language.
3. Start a Service and a Session. Tray > "Stop everything in all Repos": the Service stops, the Session and the window stay.
4. Tray > "Exit DevPanel": the app ends, no `node.exe` or Service process stays behind (Task Manager), the port is free.
5. Start DevPanel with `start-devpanel.bat` (web version), then start the desktop app: the box "DevPanel did not start / already running" appears in the UI Language, with OK only; after OK the desktop app is gone and the `.bat` DevPanel still answers.
6. Hold the port with another program (e.g. `node -e "require('net').createServer().listen(7777,'127.0.0.1')"`), start the desktop app: the "port is taken by another program" box; after OK the app is gone.
7. A start failure with details (for a test build: `DEVPANEL_PORT=99999`): the box has OK and Details; Details opens a second box titled "Details for a developer" with the message and the technical text; Esc on the first box closes it without opening Details; after the last box the app exits.

## Русский перевод

# 04: Оболочка Tauri: меню трея и диалоги ошибок

Спецификация: `.scratch/tauri-desktop/spec.md`

**Что сделать:** Трей Tauri получает то же меню, что и у Electron: «Показать», «Остановить всё во всех Репо», флажок «Запускать вместе с Windows» и «Выход», а также подсказку — всё на текущем Языке интерфейса. Меню перестраивается сразу после смены языка в окне. Меню открывается только правой кнопкой; щелчок левой по-прежнему показывает окно (тикет 03). Клики по пунктам уходят в sidecar как `trayItemClicked`, и решает sidecar: «Выход» запускает поток выхода, «Остановить всё во всех Репо» останавливает все Сервисы и не трогает Сессии. Каждый `showError` (ошибки старта, например занятый порт; неудачное «Остановить всё во всех Репо») показывается как сейчас: нативное окно сообщения на Языке интерфейса диалога с понятным текстом. Если есть технические подробности, кнопка «Подробности» открывает их во втором окне. Закрытие диалога отправляет `errorDismissed`, поэтому при ошибке старта приложение завершается только после того, как пользователь прочитал сообщение. Пункт «Запускать вместе с Windows» рисуется из `setTray`; чтобы переключатель действительно менял автозапуск Windows — это тикет 05.

**Блокируется:** 03

**Статус:** ready-for-agent

- [x] Подсказка и меню трея рисуются из `setTray` и перестраиваются при каждом `setTray` на Языке интерфейса, выбранном sidecar.
- [x] Меню открывается правой кнопкой; левая кнопка его не открывает и по-прежнему показывает окно.
- [x] Пункты меню отправляют `trayItemClicked` со своим id; «Выход» останавливает все Сервисы и Сессии до завершения приложения; «Остановить всё во всех Репо» оставляет DevPanel и Сессии работать.
- [x] `showError` открывает нативное окно с заголовком и понятным сообщением; если есть подробности, кнопка «Подробности» открывает их во втором окне; подписи кнопок и заголовок подробностей — на Языке интерфейса диалога; закрытие отправляет `errorDismissed`.
- [x] Порт занят DevPanel из `.bat`: десктопное приложение объясняет это и после закрытия диалога завершается, второй Сервер не поднимается.
- [x] Проверено вручную на обоих Языках интерфейса; шаги записаны для релизного смоука в тикете 07.
- [x] `desktop:check` и `pnpm check` проходят.

## Комментарии

- Реализация: трей — в `src-tauri/src/tray.rs` (создаётся в `setup`, полностью перестраивается при каждом `setTray`), окна ошибок — в `src-tauri/src/dialog.rs` (TaskDialog из rfd с подписями `ok`/`details` от sidecar; Esc или крестик считаются OK и никогда не открывают «Подробности»). Каждое окно `showError` работает в своём потоке, так что чтение протокола не останавливается, пока оно открыто; `errorDismissed` отправляется, когда закрыто окно (и окно подробностей).
- Проверено на debug-сборке (`cargo build`, затем `target\debug\devpanel-desktop.exe` с временным `DEVPANEL_APP_DATA` и свободным `DEVPANEL_PORT`): меню рисуется на английском и сразу переключается на русский после `setUiLanguage ru`; щелчок левой кнопкой меню не открывает; «Выйти из DevPanel» в трее завершает приложение и освобождает порт; «Остановить всё во всех Репо» оставляет приложение работать; запущенный веб-Сервер на том же порту и с той же папкой данных даёт окно «уже запущен», и после его закрытия приложение завершается, а Сервер продолжает работать; другая программа на порту даёт русское окно «порт занят»; `DEVPANEL_PORT=99999` даёт окно «непредвиденная ошибка» с работающей кнопкой «Подробности».
- Известная особенность вида: в окне подробностей TaskDialog сокращает длинные строки без пробелов (пути к файлам в стеке вызовов) многоточием. Полный текст по-прежнему есть в stderr sidecar.

### Шаги релизного смоука (для тикета 07)

Каждый шаг выполнить на английском и ещё раз на русском (язык переключается в настройках DevPanel; меню трея должно поменяться сразу, без перезапуска).

1. Запустить установленное приложение. Правый щелчок по значку в трее: «Показать DevPanel», «Остановить всё во всех Репо», «Запускать вместе с Windows» (флажок), «Выйти из DevPanel», разделители как в приложении на Electron; при наведении видна подсказка. Левый щелчок по значку: меню нет, окно выходит на передний план.
2. Сменить Язык интерфейса в окне, снова щёлкнуть правой кнопкой по значку: меню и подсказка на новом языке.
3. Запустить Сервис и Сессию. Трей > «Остановить всё во всех Репо»: Сервис останавливается, Сессия и окно остаются.
4. Трей > «Выйти из DevPanel»: приложение завершается, ни `node.exe`, ни процессов Сервисов не остаётся (Диспетчер задач), порт свободен.
5. Запустить DevPanel через `start-devpanel.bat` (веб-версия), затем десктопное приложение: появляется окно «DevPanel не запустился / уже запущен» на Языке интерфейса, только с кнопкой OK; после OK десктопного приложения нет, а DevPanel из `.bat` по-прежнему отвечает.
6. Занять порт другой программой (например, `node -e "require('net').createServer().listen(7777,'127.0.0.1')"`), запустить десктопное приложение: окно «порт занят другой программой»; после OK приложения нет.
7. Ошибка старта с подробностями (для тестовой сборки: `DEVPANEL_PORT=99999`): в окне кнопки OK и «Подробности»; «Подробности» открывает второе окно с заголовком «Подробности для разработчика», сообщением и техническим текстом; Esc в первом окне закрывает его, не открывая подробности; после последнего окна приложение завершается.
