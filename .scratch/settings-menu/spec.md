# Spec: Settings menu and opening a Service's terminal tab on start

Status: ready-for-agent

## Problem Statement

When a Service starts, its terminal tab does not open by itself. To watch it come up, the user has to find the Service in its Repo and open the tab by hand, once per Service. With several Services starting at once ("Start all", soon Service Sets), that is several clicks before the user can see the output. There is also no place for settings: the UI Language and Theme switches sit directly in the header, and every new option would add one more control there.

## Solution

A "Settings" button (gear icon) in the header opens a small Settings panel. It holds every setting in one place: the UI Language and Theme switches move into it from the header, and it adds a new option, **"Open the terminal tab when a Service starts"**. With the option on, every Service that starts, however it was started, gets its terminal tab added to the tab strip. The tab shown on screen does not change, so the screen does not jump and a Claude Code Session the user is typing in stays in view; if no tab was open, the first new one is shown. The option is off by default and, like the Theme, is remembered per browser.

## User Stories

### Settings button

1. As a team member, I want a gear "Settings" button in the header, so that I know where all settings are.
2. As a team member, I want the UI Language and Theme choices inside Settings instead of the header, so that the header stays uncluttered as settings grow.
3. As a team member who does not read the current UI Language, I want the gear to be recognizable without words and each language still named in its own language, so that I can still find my language.
4. As a team member, I want Settings to close with Escape, a click outside, or the gear again, so that it never gets in the way.
5. As a keyboard user, I want to reach the gear with Tab and operate every setting with the keyboard, so that I do not need a mouse.
6. As a screen reader user, I want the gear announced as "Settings" in my language and its open/closed state announced, so that I know what it does.
7. As a team member, I want changing the UI Language or Theme in Settings to behave exactly as before (language reloads every tab; Theme applies at once and follows other tabs of the same browser), so that nothing I relied on changes.

### Opening terminal tabs on start

8. As a team member, I want a setting "Open the terminal tab when a Service starts", so that I see a Service's output without hunting for it.
9. As a team member, I want it to work for every way a Service starts (Start, Restart, "Start all", a Service Set, a dependency started for another Service), so that the behaviour is predictable.
10. As a team member, I want a Service whose tab is already open not to get a second tab, so that the tab strip stays tidy.
11. As a team member, I want the tab I am looking at to stay on screen when Services start, so that a Session I am typing in is not taken away.
12. As a team member with no tab open, I want the first newly opened tab to be shown, so that I see something right away.
13. As a team member, I want the setting off by default, so that DevPanel behaves as before until I choose otherwise.
14. As a team member, I want the setting remembered in this browser after a reload or a restart, so that I set it once.
15. As a team member using two browsers, I want each to have its own choice, so that a small window can keep tabs closed while a big one opens them, the same way tabs and Theme are per browser.
16. As a team member, I want a change of the setting in one tab to apply in other tabs of the same browser at once, so that tabs of one browser never disagree.
17. As a team member, I want the setting's label and hint in the current UI Language, so that I understand it.

## Implementation Decisions

- **Web only.** No command, event, Snapshot field or core change. Which tabs are open is already per browser (localStorage), so the new setting is per browser too, like the Theme.
- **Settings panel.** A gear button in the header toggles a popover/panel holding three settings: UI Language (the existing switch, moved), Theme (the existing switch, moved), and the new checkbox. The existing `data-ui-language` / `data-theme-choice` hooks and `aria-pressed` behaviour stay, so current specs keep finding them once the panel is open. Language names stay in their own language.
- **The new setting.** A small root service next to the Theme one: a boolean stored under its own localStorage key, read with try/catch (unavailable or unknown value = off), and followed across tabs of the same browser through the `storage` event, as the Theme already does.
- **Behaviour.** On `statusChanged` to `starting` for a Service, while the setting is on, the web UI adds that Service's tab to the terminal tabs without changing the active tab. When no tab is active, the added tab becomes active. This needs a new operation on the terminal tabs service: "add a tab without showing it" (the existing `open` adds and shows). Tabs that are already open are left as they are.
- **Strings.** A label for the gear ("Settings"), a label and hint for the new checkbox, in both UI string sets.

## Testing Decisions

- A good test drives the UI through the DOM and `FakeTransport` events and checks what the user sees (tabs in the strip, which one is active, pressed buttons), not component internals.
- **Seam — web through `BackendTransport` (`FakeTransport`)** with `FakeTerminalView.factory`:
  - the gear opens and closes Settings (click, Escape);
  - language and Theme switches work from inside it;
  - with the setting off, `statusChanged → starting` opens no tab;
  - with it on, the tab is added, the active tab is unchanged, and the first tab becomes active when none was;
  - no duplicate for an already open tab;
  - the setting is restored from localStorage and defaults to off when storage throws;
  - a `storage` event from another tab updates it.

  Prior art: `theme.spec.ts`, `ui-language.spec.ts`, `service-terminal.spec.ts`.
- Existing specs that click the language or Theme switches open Settings first.

## Out of Scope

- Settings stored on the Server or shared between browsers.
- Per-Service or per-Service-Set choices about opening tabs.
- Closing a Service's tab automatically when it stops.
- Opening tabs for Sessions (they already open their tab when the user opens them).
- Other new settings.

## Further Notes

- Independent of Service Sets (`.scratch/service-sets/spec.md`). With both done, starting a Service Set with the setting on shows the terminals of its Services.
- Moving the language switch behind a gear makes it slightly harder to find for someone who cannot read the current language. This was accepted because the gear is recognizable without words.

## Русский перевод

# Спецификация: меню «Настройки» и открытие вкладки терминала Сервиса при запуске

Status: ready-for-agent

## Постановка проблемы

Когда Сервис запускается, вкладка его терминала сама не открывается. Чтобы посмотреть, как он поднимается, пользователю нужно найти Сервис в его Репо и открыть вкладку вручную, отдельно для каждого Сервиса. Когда стартуют сразу несколько Сервисов («Запустить всё», а скоро и Наборы), это несколько кликов, прежде чем пользователь увидит вывод. Кроме того, для настроек нет места: переключатели Языка интерфейса и Темы стоят прямо в шапке, и каждая новая опция добавит туда ещё один элемент.

## Решение

Кнопка «Настройки» (шестерёнка) в шапке открывает небольшую панель Настроек. В ней собраны все настройки. Переключатели Языка интерфейса и Темы переезжают туда из шапки, и появляется новая опция **«Открывать вкладку терминала при запуске Сервиса»**. Когда опция включена, каждый запускающийся Сервис, как бы его ни запустили, получает свою вкладку терминала в полоске вкладок. Вкладка на экране не меняется: экран не скачет, и сессия Claude Code, в которой пользователь печатает, остаётся на виду. Если ни одной вкладки не было открыто, показывается первая новая. По умолчанию опция выключена и, как Тема, запоминается для каждого браузера отдельно.

## Пользовательские истории

### Кнопка настроек

1. Как член команды, я хочу кнопку «Настройки» с шестерёнкой в шапке, чтобы знать, где все настройки.
2. Как член команды, я хочу, чтобы выбор Языка интерфейса и Темы был внутри Настроек, а не в шапке, чтобы шапка не загромождалась по мере роста числа настроек.
3. Как член команды, который не читает на текущем Языке интерфейса, я хочу, чтобы шестерёнка узнавалась без слов, а каждый язык по-прежнему назывался на самом себе, чтобы я всё равно нашёл свой язык.
4. Как член команды, я хочу, чтобы Настройки закрывались по Escape, клику снаружи или повторному нажатию шестерёнки, чтобы они никогда не мешали.
5. Как пользователь клавиатуры, я хочу дойти до шестерёнки по Tab и управлять каждой настройкой с клавиатуры, чтобы не нуждаться в мыши.
6. Как пользователь экранного диктора, я хочу, чтобы шестерёнка озвучивалась как «Настройки» на моём языке, а её открытое или закрытое состояние тоже озвучивалось, чтобы понимать, что она делает.
7. Как член команды, я хочу, чтобы смена Языка интерфейса или Темы в Настройках работала ровно как раньше (язык перезагружает все вкладки; Тема применяется сразу и следует за другими вкладками того же браузера), чтобы ничего привычного не поменялось.

### Открытие вкладок терминала при запуске

8. Как член команды, я хочу настройку «Открывать вкладку терминала при запуске Сервиса», чтобы видеть вывод Сервиса, не разыскивая его.
9. Как член команды, я хочу, чтобы она работала при любом способе запуска Сервиса («Старт», «Перезапуск», «Запустить всё», Набор, запуск Зависимости ради другого Сервиса), чтобы поведение было предсказуемым.
10. Как член команды, я хочу, чтобы Сервис, вкладка которого уже открыта, не получал вторую вкладку, чтобы полоска вкладок оставалась аккуратной.
11. Как член команды, я хочу, чтобы вкладка, на которую я смотрю, оставалась на экране при запуске Сервисов, чтобы сессия, в которой я печатаю, не уходила из вида.
12. Как член команды без открытых вкладок, я хочу, чтобы показывалась первая из новых вкладок, чтобы сразу что-то видеть.
13. Как член команды, я хочу, чтобы по умолчанию настройка была выключена, чтобы DevPanel вела себя как раньше, пока я не решу иначе.
14. Как член команды, я хочу, чтобы настройка запоминалась в этом браузере после перезагрузки страницы или перезапуска, чтобы задать её один раз.
15. Как член команды, работающий в двух браузерах, я хочу, чтобы у каждого был свой выбор, чтобы маленькое окно могло держать вкладки закрытыми, а большое открывать их, так же как вкладки и Тема у каждого браузера свои.
16. Как член команды, я хочу, чтобы изменение настройки в одной вкладке сразу применялось в других вкладках того же браузера, чтобы вкладки одного браузера не расходились.
17. Как член команды, я хочу, чтобы подпись и подсказка настройки были на текущем Языке интерфейса, чтобы я её понимал.

## Решения по реализации

- **Только web.** Никаких изменений в командах, событиях, полях `Snapshot` и core. Какие вкладки открыты, уже хранит каждый браузер отдельно (localStorage), поэтому новая настройка тоже своя у каждого браузера, как Тема.
- **Панель настроек.** Кнопка-шестерёнка в шапке открывает и закрывает всплывающую панель с тремя настройками: Язык интерфейса (существующий переключатель, перенесён), Тема (существующий переключатель, перенесён) и новая галочка. Существующие хуки `data-ui-language` / `data-theme-choice` и поведение `aria-pressed` сохраняются, так что текущие спеки находят их после открытия панели. Названия языков остаются на самих этих языках.
- **Новая настройка.** Небольшой root-сервис рядом с сервисом Темы: булево значение под своим ключом localStorage, чтение в try/catch (хранилище недоступно или значение неизвестно — выключено). Изменения синхронизируются между вкладками одного браузера через событие `storage`, как уже сделано для Темы.
- **Поведение.** Когда для Сервиса приходит `statusChanged` в `starting` и настройка включена, web UI добавляет вкладку этого Сервиса в полоску вкладок, не меняя активную вкладку. Если активной вкладки нет, добавленная становится активной. Для этого сервису вкладок терминала нужна новая операция «добавить вкладку, не показывая её»: существующая `open` добавляет и показывает. Уже открытые вкладки остаются как есть.
- **Строки.** Подпись шестерёнки («Настройки»), подпись и подсказка новой галочки — в обоих наборах строк UI.

## Решения по тестированию

- Хороший тест управляет UI через DOM и события `FakeTransport` и проверяет то, что видит пользователь (вкладки в полоске, какая из них активна, нажатые кнопки), а не внутренности компонентов.
- **Шов — web через `BackendTransport` (`FakeTransport`)** с `FakeTerminalView.factory`:
  - шестерёнка открывает и закрывает Настройки (клик, Escape);
  - переключатели языка и Темы работают изнутри панели;
  - при выключенной настройке `statusChanged → starting` не открывает вкладку;
  - при включённой вкладка добавляется, активная вкладка не меняется, а первая вкладка становится активной, если активной не было;
  - для уже открытой вкладки дубликат не появляется;
  - настройка восстанавливается из localStorage и выключена по умолчанию, когда хранилище бросает исключение;
  - событие `storage` из другой вкладки обновляет настройку.

  Прецеденты: `theme.spec.ts`, `ui-language.spec.ts`, `service-terminal.spec.ts`.
- Существующие спеки, которые нажимают переключатели языка или Темы, сначала открывают Настройки.

## Вне рамок

- Настройки, хранящиеся на Сервере или общие для разных браузеров.
- Выбор про открытие вкладок для отдельного Сервиса или Набора.
- Автоматическое закрытие вкладки Сервиса при его остановке.
- Открытие вкладок для Сессий (они и так открывают свою вкладку, когда пользователь их открывает).
- Другие новые настройки.

## Дополнительные заметки

- Не зависит от Наборов (`.scratch/service-sets/spec.md`). Когда готово и то, и другое, запуск Набора при включённой настройке показывает терминалы его Сервисов.
- Перенос переключателя языка за шестерёнку чуть усложняет поиск для того, кто не читает текущий язык. Это принято, потому что шестерёнка узнаётся без слов.
