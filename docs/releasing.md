# Releasing the desktop app

1. `pnpm check` and `pnpm desktop:check` pass.
2. `pnpm desktop:dist` builds `packages/desktop/src-tauri/target/release/bundle/nsis/DevPanel_<version>_x64-setup.exe`. Install it (per user, no admin).
3. Built-app end-to-end test against the installed app (second launch exits, killing the shell kills the sidecar and every Service and Session, Exit ends the app):
   `cd packages/desktop && DEVPANEL_DESKTOP_EXE=%LOCALAPPDATA%\DevPanel\DevPanel.exe npx vitest run test/tauri.e2e.test.ts`
4. The smoke checklist below, by hand, on the installed app.
5. Release notes go in `docs/releases/<version>.md`.

## Smoke checklist

Run steps 1 to 4 in English and again in Russian (switch the UI Language in DevPanel's settings; the tray menu must follow at once, without a restart).

1. **Tray.** Start the installed app. Right-click the tray icon: Show DevPanel, Stop everything in all Repos, Start with Windows (checkbox), Exit DevPanel; hover shows the tooltip. Left-click: no menu, the window comes to the front.
2. **Tray follows the UI Language.** Switch the UI Language in the window, right-click the tray icon again: menu and tooltip are in the new language.
3. **Stop everything.** Start a Service and a Session. Tray > "Stop everything in all Repos": the Service stops, the Session and the window stay.
4. **Exit.** Tray > "Exit DevPanel": the app ends, no `node.exe` or Service process stays behind (Task Manager), the port is free.
5. **Second launch.** With DevPanel running (window closed to the tray), start it again from the Start menu: the running window comes to the front and no second `node.exe` appears.
6. **Start with Windows.** Turn it on in the tray, sign out and in: DevPanel starts in the tray without a window. Turn it off: the next sign-in starts nothing.
7. **DevPanel already runs.** Start the web version (`start-devpanel.bat`), then the desktop app: the box "DevPanel did not start / already running" in the UI Language, OK only; after OK the desktop app is gone and the web DevPanel still answers.
8. **Taken port.** Hold the port with another program (`node -e "require('net').createServer().listen(7777,'127.0.0.1')"`), start the desktop app: the "port is taken by another program" box; after OK the app is gone.
9. **Kill the shell.** Start a Service and a Session, then end `DevPanel.exe` in Task Manager: its `node.exe`, the Service and the Session are gone too and the port is free (the built-app test checks this as well).
10. **Uninstall.** Turn Start with Windows off, then uninstall from Settings > Apps: the app folder and shortcuts are gone; the Workspace in `%APPDATA%\DevPanel` stays.

---

## Русский перевод

# Выпуск десктопного приложения

1. `pnpm check` и `pnpm desktop:check` проходят.
2. `pnpm desktop:dist` собирает `packages/desktop/src-tauri/target/release/bundle/nsis/DevPanel_<версия>_x64-setup.exe`. Установите его (для текущего пользователя, без прав администратора).
3. E2e-тест собранного приложения на установленной версии (повторный запуск завершается, убийство оболочки убивает sidecar и все Сервисы и Сессии, Выход завершает приложение):
   `cd packages/desktop && DEVPANEL_DESKTOP_EXE=%LOCALAPPDATA%\DevPanel\DevPanel.exe npx vitest run test/tauri.e2e.test.ts`
4. Чек-лист смоука ниже, вручную, на установленном приложении.
5. Заметки к релизу кладутся в `docs/releases/<версия>.md`.

## Чек-лист смоука

Шаги 1–4 пройдите на английском и ещё раз на русском (Язык интерфейса переключается в настройках DevPanel; меню трея должно сменить язык сразу, без перезапуска).

1. **Трей.** Запустите установленное приложение. Правый клик по значку в трее: Показать DevPanel, Остановить всё во всех репо, Запускать вместе с Windows (флажок), Выйти из DevPanel; при наведении видна подсказка. Левый клик: меню нет, окно выходит на передний план.
2. **Трей следует Языку интерфейса.** Смените Язык интерфейса в окне, снова правый клик по значку: меню и подсказка на новом языке.
3. **Остановить всё.** Запустите Сервис и Сессию. Трей > «Остановить всё во всех репо»: Сервис останавливается, Сессия и окно остаются.
4. **Выход.** Трей > «Выйти из DevPanel»: приложение завершается, ни `node.exe`, ни процессов Сервисов не остаётся (Диспетчер задач), порт свободен.
5. **Повторный запуск.** Пока DevPanel работает (окно свёрнуто в трей), запустите его ещё раз из меню «Пуск»: работающее окно выходит на передний план, второго `node.exe` не появляется.
6. **Запуск вместе с Windows.** Включите в трее, выйдите из системы и войдите снова: DevPanel запускается в трее без окна. Выключите: при следующем входе ничего не запускается.
7. **DevPanel уже работает.** Запустите веб-версию (`start-devpanel.bat`), затем десктопное приложение: окно «DevPanel не запустился / уже работает» на Языке интерфейса, только с OK; после OK десктопного приложения нет, а веб-DevPanel по-прежнему отвечает.
8. **Занятый порт.** Займите порт другой программой (`node -e "require('net').createServer().listen(7777,'127.0.0.1')"`), запустите десктопное приложение: окно «порт занят другой программой»; после OK приложения нет.
9. **Убить оболочку.** Запустите Сервис и Сессию, затем завершите `DevPanel.exe` в Диспетчере задач: его `node.exe`, Сервис и Сессия тоже исчезают, порт свободен (это проверяет и тест собранного приложения).
10. **Удаление.** Выключите «Запускать вместе с Windows», затем удалите через Параметры > Приложения: папка приложения и ярлыки исчезают; Workspace в `%APPDATA%\DevPanel` остаётся.
