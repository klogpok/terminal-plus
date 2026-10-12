# 02: Open a Service's terminal tab when it starts

**What to build:** Settings gains a checkbox "Open the terminal tab when a Service starts", off by default and remembered per browser (like the Theme). While it is on, every Service that starts, however it was started (Start, Restart, "Start all", a Service Set, a dependency), gets its terminal tab added to the tab strip. The tab shown on screen does not change; when no tab was shown, the first new one is shown. An already open tab is not duplicated. A change in one tab of the browser applies in its other tabs at once. Spec: `.scratch/settings-menu/spec.md`.

**Blocked by:** 01 (Settings button holding UI Language and Theme).

**Status:** ready-for-agent

- [ ] Settings shows the checkbox with a label and hint in the current UI Language; it is off by default and when storage is unavailable or holds an unknown value.
- [ ] The choice survives a page reload and follows a `storage` change from another tab of the same browser.
- [ ] With the setting off, `statusChanged` to `starting` opens no tab.
- [ ] With it on, the Service's tab is added without changing the active tab; when no tab was active, the added tab becomes active; an open tab is not duplicated.
- [ ] The terminal tabs gain an "add without showing" operation; the existing open-and-show behaviour is unchanged.
- [ ] Specs through `FakeTransport` cover all of the above; `pnpm check` passes.

## Русский перевод

# 02: Открывать вкладку терминала Сервиса при его запуске

**Что сделать:** В Настройках появляется галочка «Открывать вкладку терминала при запуске Сервиса». По умолчанию она выключена и запоминается для каждого браузера отдельно, как Тема. Пока она включена, каждый запускающийся Сервис, как бы его ни запустили («Старт», «Перезапуск», «Запустить всё», Набор, Зависимость), получает вкладку терминала в полоске вкладок. Вкладка на экране не меняется. Если на экране не было ни одной вкладки, показывается первая новая. Уже открытая вкладка не дублируется. Изменение в одной вкладке браузера сразу применяется в остальных его вкладках. Спецификация: `.scratch/settings-menu/spec.md`.

**Заблокирован:** 01 (Кнопка «Настройки» с Языком интерфейса и Темой).

**Статус:** ready-for-agent

- [ ] Настройки показывают галочку с подписью и подсказкой на текущем Языке интерфейса. Она выключена по умолчанию, а также когда хранилище недоступно или содержит неизвестное значение.
- [ ] Выбор переживает перезагрузку страницы и следует за изменением `storage` из другой вкладки того же браузера.
- [ ] При выключенной настройке `statusChanged` в `starting` не открывает вкладку.
- [ ] При включённой вкладка Сервиса добавляется без смены активной вкладки. Если активной вкладки не было, добавленная становится активной. Открытая вкладка не дублируется.
- [ ] У вкладок терминала появляется операция «добавить, не показывая». Существующее поведение «открыть и показать» не меняется.
- [ ] Спеки через `FakeTransport` покрывают всё перечисленное, `pnpm check` проходит.
