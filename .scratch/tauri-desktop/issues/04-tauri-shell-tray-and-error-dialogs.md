# 04: Tauri shell: tray menu and error dialogs

Spec: `.scratch/tauri-desktop/spec.md`

**What to build:** The Tauri tray gets the same menu as the Electron app: Show, "Stop everything in all Repos", a Start with Windows checkbox and Quit, plus the tooltip, all in the current UI Language. The menu is rebuilt as soon as the language changes in the window. The menu opens on a right click only; a left click keeps showing the window (ticket 03). Menu clicks go to the sidecar as `trayItemClicked`, and the sidecar decides what happens: Quit runs the quit flow, and "Stop everything in all Repos" stops every Service and keeps Sessions. Every `showError` (start failures such as a taken port, a failed "Stop everything in all Repos") appears as today: a native message box in the dialog's UI Language with the plain-language message. When there are technical details, a "Details" button opens them in a second box. Closing the dialog sends `errorDismissed`, so a start failure ends the app only after the user has read it. The Start with Windows item is rendered from `setTray`; making the toggle actually change Windows autostart is ticket 05.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The tray tooltip and menu render from `setTray` and are rebuilt on every `setTray`, in the UI Language the sidecar chose.
- [ ] The menu opens on a right click; a left click does not open it and still shows the window.
- [ ] Menu items send `trayItemClicked` with their id; Quit stops every Service and Session before the app ends; "Stop everything in all Repos" keeps DevPanel and Sessions running.
- [ ] `showError` opens a native box with the title and plain message; with details, a "Details" button opens a second box with them; button labels and the details title are in the dialog's UI Language; closing sends `errorDismissed`.
- [ ] A port held by the `.bat` DevPanel: the desktop app explains, and after the dialog is dismissed it exits, without a second Server.
- [ ] Checked by hand in both UI Languages; the steps are noted for the release smoke in ticket 07.
- [ ] `desktop:check` and `pnpm check` pass.

## Русский перевод

# 04: Оболочка Tauri: меню трея и диалоги ошибок

Спецификация: `.scratch/tauri-desktop/spec.md`

**Что сделать:** Трей Tauri получает то же меню, что и у Electron: «Показать», «Остановить всё во всех Репо», флажок «Запускать вместе с Windows» и «Выход», а также подсказку — всё на текущем Языке интерфейса. Меню перестраивается сразу после смены языка в окне. Меню открывается только правой кнопкой; щелчок левой по-прежнему показывает окно (тикет 03). Клики по пунктам уходят в sidecar как `trayItemClicked`, и решает sidecar: «Выход» запускает поток выхода, «Остановить всё во всех Репо» останавливает все Сервисы и не трогает Сессии. Каждый `showError` (ошибки старта, например занятый порт; неудачное «Остановить всё во всех Репо») показывается как сейчас: нативное окно сообщения на Языке интерфейса диалога с понятным текстом. Если есть технические подробности, кнопка «Подробности» открывает их во втором окне. Закрытие диалога отправляет `errorDismissed`, поэтому при ошибке старта приложение завершается только после того, как пользователь прочитал сообщение. Пункт «Запускать вместе с Windows» рисуется из `setTray`; чтобы переключатель действительно менял автозапуск Windows — это тикет 05.

**Блокируется:** 03

**Статус:** ready-for-agent

- [ ] Подсказка и меню трея рисуются из `setTray` и перестраиваются при каждом `setTray` на Языке интерфейса, выбранном sidecar.
- [ ] Меню открывается правой кнопкой; левая кнопка его не открывает и по-прежнему показывает окно.
- [ ] Пункты меню отправляют `trayItemClicked` со своим id; «Выход» останавливает все Сервисы и Сессии до завершения приложения; «Остановить всё во всех Репо» оставляет DevPanel и Сессии работать.
- [ ] `showError` открывает нативное окно с заголовком и понятным сообщением; если есть подробности, кнопка «Подробности» открывает их во втором окне; подписи кнопок и заголовок подробностей — на Языке интерфейса диалога; закрытие отправляет `errorDismissed`.
- [ ] Порт занят DevPanel из `.bat`: десктопное приложение объясняет это и после закрытия диалога завершается, второй Сервер не поднимается.
- [ ] Проверено вручную на обоих Языках интерфейса; шаги записаны для релизного смоука в тикете 07.
- [ ] `desktop:check` и `pnpm check` проходят.
