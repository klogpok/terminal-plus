# 03: Service terminal

**What to build:** Clicking a Service opens its terminal in a tab on the right, colored like its Repo. The tab first shows the buffered recent output, then streams live. The team member can type into it (to answer a dev server's prompt or press its hotkeys), the terminal follows the tab size, and the log survives a restart with a timestamped separator. "Clear", "Copy all" and search work in every Service tab.

**Blocked by:** 02 (Control a Service from the browser).

**Status:** resolved

- [x] `core` keeps an in-memory ring buffer of about 10,000 lines per Service; nothing is written to disk.
- [x] Opening a tab, reloading the page, or connecting a second client replays the buffer, then streams live output, with colors preserved.
- [x] Keyboard input in a Service tab reaches the Service's pty (`writeToPty`); a `core` test with the echo fixture proves it.
- [x] Tab resizes are propagated to the pty (`resizePty`); with several clients, the most recent resize wins.
- [x] Restarting a Service appends a "── restart HH:MM ──" separator instead of clearing the buffer.
- [x] "Clear", "Copy all" and search (xterm search addon) work.
- [x] Tab color matches the Repo color.

---

## Русский перевод

# 03: Терминал Сервиса

**Что сделать:** Клик по Сервису открывает его терминал во вкладке справа, окрашенной в цвет Репо. Вкладка сначала показывает буферизованный недавний вывод, затем живой поток. В неё можно печатать (ответить на вопрос dev-сервера или нажать его горячую клавишу), терминал следует за размером вкладки, а лог переживает перезапуск с разделителем со временем. В каждой вкладке Сервиса работают «Очистить», «Копировать всё» и поиск.

**Блокируется:** 02 (Управление Сервисом из браузера).

**Статус:** resolved

- [x] `core` держит в памяти кольцевой буфер примерно на 10 000 строк для каждого Сервиса; на диск ничего не пишется.
- [x] Открытие вкладки, перезагрузка страницы или подключение второго клиента сначала воспроизводят буфер, затем идёт живой вывод, цвета сохраняются.
- [x] Ввод с клавиатуры во вкладке Сервиса доходит до его pty (`writeToPty`); это доказывает тест `core` с фикстурой-эхо.
- [x] Изменение размера вкладки передаётся в pty (`resizePty`); при нескольких клиентах побеждает последний resize.
- [x] Перезапуск Сервиса добавляет разделитель «── перезапуск ЧЧ:ММ ──» вместо очистки буфера.
- [x] Работают «Очистить», «Копировать всё» и поиск (xterm search addon).
- [x] Цвет вкладки совпадает с цветом Репо.
