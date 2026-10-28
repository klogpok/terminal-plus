# DevPanel

A local panel through which a person with no programming experience starts, stops and watches the services of several repositories, and opens Claude Code and a terminal in them.

Each term gives its Russian name (RU), used by the Russian UI string set.

## Repos and configuration

**Workspace** (RU: Workspace):
The personal list of Repos of one DevPanel user on their machine.
_Avoid_: project, working space

**Repo** (RU: Репо):
A folder with code added to the Workspace. A Repo is identified by its path. It has a name, unique within the Workspace, and a color.
_Avoid_: project, folder

**Repo Config** (RU: Конфиг репо):
The description of a Repo's Services that the team's developers write and commit (`.devpanel.yml`).
_Avoid_: repo settings

**Local Config** (RU: Локальный конфиг):
The description of a Repo's Services that is saved only on the user's machine and never goes into the Repo. Used only while the Repo has no Repo Config. The user builds it from auto-detection suggestions and their own commands, adding and removing Services. A Local Config does not exist without Services.
_Avoid_: auto-config

## Processes

**Service** (RU: Сервис):
A long-lived process of a Repo whose command is set in the config. A Service has a Status, and text can be typed into its terminal.
_Avoid_: task, script, process

**Session** (RU: Сессия):
An interactive terminal in a Repo's folder that the user opens themselves: a Claude Code or shell session. A Session has no Status, port or dependencies. One tab in the UI is one Session: closing the tab ends the Session.
_Avoid_: tab, console

**Service Status** (RU: Статус сервиса):
One of: stopped, starting, running, unhealthy, stopping, crashed, exited.

**unhealthy**:
The Service's process is alive, but Readiness never came within the allotted time.
_Avoid_: hung, crashed

**Build Error** (RU: Ошибка сборки):
A mark on a live Service (starting, running or unhealthy): the tool that watches its files reported that the last build failed, or that the app it restarted after a build exited. It is not a Status. It goes away on the next successful build, on Stop and on restart.
_Avoid_: failing, problems, crashed

**Stop all** (RU: Остановить всё):
Stopping every Service of one Repo or of all Repos. Sessions are not affected.

**Service Set** (RU: Набор):
A named list of Services from any Repos of the Workspace that the user starts with one click. Stored only on the user's machine and never goes into a Repo. Starting a Service Set starts its Services that are not running yet, with their Dependencies, and leaves the others alone; a Service that no longer exists stays in the Set as "not found" and is skipped.
_Avoid_: template, preset, group

**crashed**:
The Service ended with a non-zero exit code although the user did not press Stop.
_Avoid_: failed, error

**exited**:
The Service ended with exit code 0 although the user did not press Stop.
_Avoid_: stopped

**Dismiss** (RU: Скрыть итог):
Moving a crashed or exited Service to stopped without starting it. The information about how it ended disappears in every window. Done only explicitly; Stop all does not do it.
_Avoid_: close, delete, reset

**Readiness** (RU: Готовность):
The moment a Service moves from starting to running: readyPattern matched, healthUrl answered, the port started listening, or, when none of these is set, the process stayed alive for a few seconds.

**Dependency** (`dependsOn`, RU: Зависимость):
A Service of the same Repo that must become running before the Service depending on it starts. Stopping or crashing a Dependency does not affect the Services that depend on it.

**Orphan** (RU: Зомби):
A process of a Service or Session that stayed alive after the previous run of the DevPanel Server. Recognized by PID and process start time.
_Avoid_: zombie, dead process, leftover

## Application

**DevPanel Server** (RU: Сервер DevPanel):
The DevPanel process that owns every Service and Session. They live as long as the Server runs, not as long as a browser tab is open.
_Avoid_: backend, app

**Exit DevPanel** (RU: Выход из DevPanel):
Stopping the DevPanel Server together with all its Services and Sessions.
_Avoid_: closing the app

**UI Language** (RU: Язык интерфейса):
The language of every text DevPanel shows the user: English (default) or Russian. One for the whole DevPanel on this machine; the user changes it themselves.
_Avoid_: locale, location, region

**Theme** (RU: Тема):
The look of the DevPanel UI: as in the system (default), light or dark. Unlike the UI Language, each browser (and the desktop app) has its own. The terminal is always dark and does not depend on the Theme.
_Avoid_: skin, color scheme

**Settings** (RU: Настройки):
The panel behind the gear button in the DevPanel header that holds the UI preferences: the UI Language, the Theme and Open Tab on Start. Apart from the UI Language, each browser (and the desktop app) has its own. Not to be confused with the Repo Config, which describes a Repo's Services and goes into the Repo.
_Avoid_: preferences, options, repo settings

**Open Tab on Start** (RU: Открывать вкладку при запуске):
A setting in Settings, off by default: while it is on, a Service that starts gets its terminal tab, without changing the shown tab (with no tab shown, the new one is shown). Like the Theme, each browser (and the desktop app) has its own.
_Avoid_: auto-open, follow starts

**Access Key** (RU: Ключ доступа):
A random secret the DevPanel Server creates on start. Without it a client cannot connect to the Server.
_Avoid_: session token, password

## Русский перевод

# DevPanel

Локальная панель, через которую человек без опыта программирования запускает, останавливает и наблюдает сервисы нескольких репозиториев, а также открывает в них Claude Code и терминал.

## Репозитории и конфигурация

**Workspace**:
Личный список Репо одного пользователя DevPanel на его машине.
_Avoid_: проект, рабочее пространство

**Репо (Repo)**:
Папка с кодом, добавленная в Workspace. Репо определяется своим путём. У него есть имя, уникальное в пределах Workspace, и цвет.
_Avoid_: проект, папка

**Конфиг репо (Repo Config)**:
Описание Сервисов Репо, которое пишут и коммитят разработчики команды (`.devpanel.yml`).
_Avoid_: настройки репо

**Локальный конфиг (Local Config)**:
Описание Сервисов Репо, которое сохраняется только на машине пользователя и никогда не попадает в Репо. Используется, только пока у Репо нет Конфига репо. Пользователь сам собирает его из предложений автоопределения и своих команд, добавляя и удаляя Сервисы. Без Сервисов Локального конфига не существует.
_Avoid_: автоконфиг

## Процессы

**Сервис (Service)**:
Долгоживущий процесс Репо, команда которого задана в конфиге. У Сервиса есть Статус, и в его терминал можно вводить текст.
_Avoid_: задача, скрипт, процесс

**Сессия (Session)**:
Интерактивный терминал в папке Репо, который пользователь открывает сам: сессия Claude Code или оболочки. Статусов, порта и зависимостей у Сессии нет. Одна вкладка в UI соответствует одной Сессии: закрыть вкладку значит завершить Сессию.
_Avoid_: вкладка, консоль

**Статус сервиса (Service Status)**:
Одно из состояний: stopped, starting, running, unhealthy, stopping, crashed, exited.

**unhealthy**:
Процесс Сервиса жив, но Готовность так и не наступила за отведённое время.
_Avoid_: завис, упал

**Ошибка сборки (Build Error)**:
Отметка на живом Сервисе (starting, running или unhealthy): инструмент, который следит за его файлами, сообщил, что последняя сборка не прошла или что приложение, перезапущенное им после сборки, завершилось. Это не Статус. Отметка снимается следующей успешной сборкой, по «Стоп» и при перезапуске.
_Avoid_: проблемы, упал, crashed

**Остановить всё (Stop all)**:
Остановка всех Сервисов одного Репо или всех Репо. Сессии при этом не затрагиваются.

**Набор (Service Set)**:
Именованный список Сервисов из любых Репо Workspace, который пользователь запускает одним кликом. Хранится только на машине пользователя и никогда не попадает в Репо. Запуск Набора стартует его незапущенные Сервисы с их Зависимостями и не трогает остальные; Сервис, которого больше нет, остаётся в Наборе как «не найден» и пропускается.
_Avoid_: шаблон, пресет, группа

**crashed**:
Сервис завершился с ненулевым кодом, хотя пользователь не нажимал «Стоп».
_Avoid_: упал, ошибка

**exited**:
Сервис завершился с кодом 0, хотя пользователь не нажимал «Стоп».
_Avoid_: stopped

**Скрыть итог (Dismiss)**:
Перевод crashed или exited Сервиса в stopped без запуска. Сведения о том, как он завершился, пропадают во всех окнах. Делается только явно; «Остановить всё» этого не делает.
_Avoid_: закрыть, удалить, сбросить

**Готовность (Readiness)**:
Момент перехода Сервиса из starting в running: сработал readyPattern, ответил healthUrl, начал слушаться порт, а если ничего из этого не задано — процесс прожил несколько секунд.

**Зависимость (dependsOn)**:
Сервис того же Репо, который должен стать running до старта зависящего от него Сервиса. Остановка или падение Зависимости на зависящие Сервисы не влияет.

**Зомби (Orphan)**:
Процесс Сервиса или Сессии, который остался жив после предыдущего запуска Сервера DevPanel. Опознаётся по PID и времени старта процесса.
_Avoid_: висяк, мёртвый процесс

## Приложение

**Сервер DevPanel (DevPanel Server)**:
Процесс DevPanel, которому принадлежат все Сервисы и Сессии. Они живут, пока работает Сервер, а не пока открыта вкладка браузера.
_Avoid_: бэкенд, приложение

**Выход из DevPanel (Exit DevPanel)**:
Остановка Сервера DevPanel вместе со всеми его Сервисами и Сессиями.
_Avoid_: закрытие приложения

**Язык интерфейса (UI Language)**:
Язык всех текстов, которые DevPanel показывает пользователю: английский (по умолчанию) или русский. Один на всю DevPanel на этой машине; пользователь меняет его сам.
_Avoid_: локаль, локация, регион

**Тема (Theme)**:
Оформление интерфейса DevPanel: как в системе (по умолчанию), светлое или тёмное. В отличие от Языка интерфейса, у каждого браузера (и у десктопного приложения) она своя. Терминал всегда тёмный и от Темы не зависит.
_Avoid_: скин, цветовая схема

**Настройки (Settings)**:
Панель за кнопкой-шестерёнкой в шапке DevPanel с настройками интерфейса: Язык интерфейса, Тема и «Открывать вкладку при запуске». Кроме Языка интерфейса, у каждого браузера (и у десктопного приложения) они свои. Не путать с Конфигом репо, который описывает Сервисы Репо и попадает в Репо.
_Avoid_: предпочтения, опции, настройки репо

**Открывать вкладку при запуске (Open Tab on Start)**:
Настройка в Настройках, по умолчанию выключена: пока она включена, у запускающегося Сервиса открывается вкладка терминала, а показанная вкладка не меняется (если не показана ни одна, показывается новая). Как и Тема, у каждого браузера (и у десктопного приложения) она своя.
_Avoid_: автооткрытие, следить за запусками

**Запуск вместе с Windows (Start with Windows)**:
Настройка десктопного приложения DevPanel: при входе пользователя в Windows оно запускается само и остаётся в трее, без окна. Пользователь включает и выключает её в меню трея (выключить её можно и во вкладке «Автозагрузка» диспетчера задач).
_Avoid_: автозапуск, автостарт

**Ключ доступа (Access Key)**:
Случайный секрет, который Сервер DevPanel создаёт при старте. Без него клиент не может подключиться к Серверу.
_Avoid_: токен сессии, пароль
