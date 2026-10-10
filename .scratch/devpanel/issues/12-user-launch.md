# 12: Launch for the team member

**What to build:** The team member starts DevPanel by double-clicking a desktop shortcut. A `.bat` launcher starts the built Server and opens the browser at the Server address with the Access Key in the URL fragment. If DevPanel is already running (port 7777 held by our Server), the launcher only opens another browser tab with the stored Access Key, which is a normal peer client. Closing the launcher's console window means Exit.

**Blocked by:** 07 (Exit and Orphans).

**Status:** resolved

- [x] The launcher starts the built Server and opens the browser with the Access Key; the UI connects without any manual step.
- [x] Launching again while DevPanel runs starts no second Server and opens a working tab using the stored Access Key.
- [x] If port 7777 is held by something other than DevPanel, the team member gets a plain-Russian message.
- [x] Closing the console window stops all Services and Sessions (manual check).
- [x] Instructions for creating the desktop shortcut exist (or the shortcut is created by a helper).

## Comments

- Implemented: `start-devpanel.bat` → `packages/server/dist/launch-main.js` (`launch()` in `src/launch.ts`, probing `GET /api/hello`); `create-desktop-shortcut.bat` creates the shortcut; instructions in the spec's Further Notes. The Access Key file is now written only after the Server holds its port, so a second launcher racing for the port cannot overwrite the running Server's key.
- Console close check: done on port 17880 in a classic `conhost.exe` window by sending WM_CLOSE (same as clicking X): the running Service's listener and process were gone in under 1 s, the Server and the window closed, and `processes.json` was emptied. Not checked inside Windows Terminal (the Windows 11 default terminal). The real double-click with a real browser on 7777 was not tried (the UI connection was checked with a headless browser on 17877).

---

## Русский перевод

# 12: Запуск для пользователя

**Что сделать:** Член команды запускает DevPanel двойным кликом по ярлыку на рабочем столе. `.bat`-запускалка стартует собранный Сервер и открывает браузер на адресе Сервера с Ключом доступа во фрагменте URL. Если DevPanel уже работает (порт 7777 занят нашим Сервером), запускалка только открывает ещё одну вкладку браузера с сохранённым Ключом доступа — это обычный равноправный клиент. Закрытие консольного окна запускалки означает Выход.

**Блокируется:** 07 (Выход и Зомби).

**Статус:** resolved

- [x] Запускалка стартует собранный Сервер и открывает браузер с Ключом доступа; UI подключается без ручных шагов.
- [x] Повторный запуск, пока DevPanel работает, не запускает второй Сервер и открывает рабочую вкладку с сохранённым Ключом доступа.
- [x] Если порт 7777 занят не DevPanel, член команды получает сообщение на понятном русском.
- [x] Закрытие консольного окна останавливает все Сервисы и Сессии (ручная проверка).
- [x] Есть инструкция по созданию ярлыка на рабочем столе (или ярлык создаёт вспомогательный скрипт).

## Комментарии

- Реализовано: `start-devpanel.bat` → `packages/server/dist/launch-main.js` (`launch()` в `src/launch.ts`, проверка через `GET /api/hello`); ярлык создаёт `create-desktop-shortcut.bat`; инструкция — в разделе «Дополнительные заметки» спецификации. Файл Ключа доступа теперь пишется только после того, как Сервер занял порт, поэтому вторая запускалка, гонящаяся за портом, не может перезаписать ключ работающего Сервера.
- Проверка закрытия консоли: сделана на порту 17880 в классическом окне `conhost.exe` отправкой WM_CLOSE (то же, что нажать крестик): слушатель и процесс работающего Сервиса исчезли меньше чем за 1 с, Сервер и окно закрылись, `processes.json` опустел. Внутри Windows Terminal (терминал по умолчанию в Windows 11) не проверялось. Настоящий двойной клик с настоящим браузером на 7777 не пробовался (подключение UI проверено headless-браузером на 17877).
