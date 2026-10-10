# 12: Launch for the team member

**What to build:** The team member starts DevPanel by double-clicking a desktop shortcut. A `.bat` launcher starts the built Server and opens the browser at the Server address with the Access Key in the URL fragment. If DevPanel is already running (port 7777 held by our Server), the launcher only opens another browser tab with the stored Access Key, which is a normal peer client. Closing the launcher's console window means Exit.

**Blocked by:** 07 (Exit and Orphans).

**Status:** ready-for-agent

- [ ] The launcher starts the built Server and opens the browser with the Access Key; the UI connects without any manual step.
- [ ] Launching again while DevPanel runs starts no second Server and opens a working tab using the stored Access Key.
- [ ] If port 7777 is held by something other than DevPanel, the team member gets a plain-Russian message.
- [ ] Closing the console window stops all Services and Sessions (manual check).
- [ ] Instructions for creating the desktop shortcut exist (or the shortcut is created by a helper).

---

## Русский перевод

# 12: Запуск для пользователя

**Что сделать:** Член команды запускает DevPanel двойным кликом по ярлыку на рабочем столе. `.bat`-запускалка стартует собранный Сервер и открывает браузер на адресе Сервера с Ключом доступа во фрагменте URL. Если DevPanel уже работает (порт 7777 занят нашим Сервером), запускалка только открывает ещё одну вкладку браузера с сохранённым Ключом доступа — это обычный равноправный клиент. Закрытие консольного окна запускалки означает Выход.

**Блокируется:** 07 (Выход и Зомби).

**Статус:** ready-for-agent

- [ ] Запускалка стартует собранный Сервер и открывает браузер с Ключом доступа; UI подключается без ручных шагов.
- [ ] Повторный запуск, пока DevPanel работает, не запускает второй Сервер и открывает рабочую вкладку с сохранённым Ключом доступа.
- [ ] Если порт 7777 занят не DevPanel, член команды получает сообщение на понятном русском.
- [ ] Закрытие консольного окна останавливает все Сервисы и Сессии (ручная проверка).
- [ ] Есть инструкция по созданию ярлыка на рабочем столе (или ярлык создаёт вспомогательный скрипт).
