# 09: Claude Code and shell Sessions

**What to build:** Each Repo header gets "Claude Code" and "Terminal" buttons. Each opens an interactive Session in the Repo folder in its own tab, colored like the Repo; several Sessions per Repo are allowed. One tab is one Session: closing the tab ends the Session, with a confirmation if it is still running. A Session whose process exits by itself keeps its tab marked "Session finished". Open Sessions and their output are restored after a page reload. If Claude Code is not installed, the team member gets a clear message. Removing a Repo also ends its Sessions.

**Blocked by:** 03 (Service terminal), 08 (Manage Repos from the UI).

**Status:** resolved

- [x] `openClaude` checks `where claude` and, if missing, returns a plain-Russian error; otherwise it spawns `claude` through `cmd.exe` in the Repo folder.
- [x] `openTerminal` spawns a shell in the Repo folder; `core` tests use it as the Session fixture.
- [x] Session tabs support input, resize, buffered replay and the same Repo coloring as Service tabs.
- [x] Closing a Session tab calls `closeSession` (with confirmation if alive) and kills the Session's process tree.
- [x] A self-exited Session stays listed as finished until its tab is closed.
- [x] After a page reload, open Sessions reappear with their buffered output.
- [ ] Sessions are recorded for Orphan detection and stopped on Exit. (Stopped on Exit: done. PID-file recording belongs to ticket 07, see Comments.)
- [x] "Stop all" commands leave Sessions running (test); `removeRepo` ends the Repo's Sessions (test).

---

## Русский перевод

# 09: Сессии Claude Code и оболочки

**Что сделать:** В заголовке каждого Репо появляются кнопки «Claude Code» и «Терминал». Каждая открывает интерактивную Сессию в папке Репо в отдельной вкладке цвета Репо; на одно Репо можно открыть несколько Сессий. Одна вкладка — одна Сессия: закрытие вкладки завершает Сессию, с подтверждением, если она ещё работает. Если процесс Сессии завершился сам, её вкладка остаётся с пометкой «Сессия завершена». Открытые Сессии и их вывод восстанавливаются после перезагрузки страницы. Если Claude Code не установлен, член команды получает понятное сообщение. Удаление Репо также завершает его Сессии.

**Блокируется:** 03 (Терминал Сервиса), 08 (Управление Репо из UI).

**Статус:** resolved

- [x] `openClaude` проверяет `where claude` и, если его нет, возвращает ошибку на понятном русском; иначе запускает `claude` через `cmd.exe` в папке Репо.
- [x] `openTerminal` запускает оболочку в папке Репо; тесты `core` используют её как фикстуру Сессии.
- [x] Вкладки Сессий поддерживают ввод, resize, воспроизведение буфера и ту же окраску цветом Репо, что и вкладки Сервисов.
- [x] Закрытие вкладки Сессии вызывает `closeSession` (с подтверждением, если она жива) и убивает дерево процессов Сессии.
- [x] Сессия, завершившаяся сама, остаётся в списке как завершённая, пока её вкладку не закроют.
- [x] После перезагрузки страницы открытые Сессии появляются снова с буферизованным выводом.
- [ ] Сессии записываются для обнаружения Зомби и останавливаются при Выходе. (Остановка при Выходе: сделано. Запись в PID-файл — тикет 07, см. Комментарии.)
- [x] Команды «Остановить всё» оставляют Сессии работающими (тест); `removeRepo` завершает Сессии Репо (тест).

## Comments

- Implementer (t09): Sessions are spawned only in `DevPanelCore.openSession` and ended only in `DevPanelCore.closeSession` (also used by `removeRepo` and `shutdown`). Ticket 07 should record Session PIDs (kind `claude`/`shell`, Repo) in the PID file at those two spots; that part of the Orphan checkbox is left to 07. Session commands are separate from the Service ones: `getSessionOutput`, `writeToSession`, `resizeSession`; events `sessionChanged`, `sessionClosed`, `sessionOutput`; `Snapshot.sessions`.

### Русский перевод

- Исполнитель (t09): Сессии запускаются только в `DevPanelCore.openSession` и завершаются только в `DevPanelCore.closeSession` (его же используют `removeRepo` и `shutdown`). Тикет 07 должен записывать PID Сессий (вид `claude`/`shell`, Репо) в PID-файл в этих двух местах; эта часть пункта про Зомби оставлена тикету 07. Команды Сессий отделены от команд Сервисов: `getSessionOutput`, `writeToSession`, `resizeSession`; события `sessionChanged`, `sessionClosed`, `sessionOutput`; `Snapshot.sessions`.
