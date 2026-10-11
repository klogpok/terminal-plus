# 01: Add and remove Services of a Local Config from the UI

**What to build:** Once a Local Config is saved, the team member can still change the list of Services without editing YAML. Under the Services of a Repo that has no Repo Config, a "+ Add Service" button opens an inline form in the Repo card. The form adds one Service to the Local Config. Each Service of a Local Config gets a "Remove" button. Everything is written only to the Local Config in the app data directory, never into the Repo folder. A Repo with a Repo Config shows neither the button nor "Remove": its Services are described by developers.

**Blocked by:** none (builds on the resolved devpanel 10, Config lifecycle).

**Status:** resolved

## Decisions

- **Where it applies:** only Repos without a Repo Config. Only the Local Config is edited.
- **Button placement:** "+ Add Service" at the end of the Repo's Services list; the form expands in place inside the Repo card, no dialog.
- **Also available with no Local Config yet:** next to the auto-detection suggestions before the first save, and in a Repo where auto-detection found nothing (npm/yarn Repos, today's "Found nothing to run" text). There the form creates the Local Config.
- **Command source:** a pick list of auto-detected scripts not yet in the Local Config, plus a free-text field for an own command.
- **Fields:** name and command. The `id` is generated from the name. A collapsed "More" section holds `port`, `url`, `readyPattern`, `dependsOn`.
- **Validation:** errors are shown next to the field: a name already in use ("A Service with this name already exists"), and any config validation error (port in use, etc.).
- **After adding:** the Service appears as `stopped`; it is not started automatically.
- **Remove a running Service:** confirmation "The Service is running — stop and remove it?"; on confirm it is stopped and then removed.
- **Remove a Service others depend on:** the confirmation lists the dependent Services; the removed Service is dropped from their `dependsOn`.
- **Remove the last Service:** the Local Config file is deleted, and the Repo goes back to auto-detection suggestions.
- **No editing:** to change a Service, remove it and add it again.
- All new texts exist in both UI Languages (English and Russian).

## Acceptance criteria

- [x] A Repo with a Local Config shows "+ Add Service" under its Services; the form expands inline in the Repo card.
- [x] The form offers auto-detected scripts not yet in the Local Config and a field for an own command; name and command are required, `port`/`url`/`readyPattern`/`dependsOn` sit in a collapsed "More" section.
- [x] Adding a Service writes it to the Local Config only (test asserts the Repo folder is unchanged); the new Service appears as `stopped`.
- [x] A duplicate name, or any other config validation error, is shown in the form next to the field, and nothing is saved.
- [x] In a Repo without any config, "+ Add Service" is available next to the suggestions and in the "Found nothing to run" state, and creates the Local Config.
- [x] A Repo with a Repo Config shows neither "+ Add Service" nor "Remove".
- [x] "Remove" on a stopped Service removes it from the Local Config.
- [x] "Remove" on a running Service asks for confirmation, then stops it and removes it.
- [x] Removing a Service that others depend on lists them in the confirmation and removes it from their `dependsOn`.
- [x] Removing the last Service deletes the Local Config file and shows the auto-detection suggestions again.
- [x] All new texts are present in English and Russian.

---

## Русский перевод

# 01: Добавление и удаление Сервисов Локального конфига из UI

**Что сделать:** После сохранения Локального конфига член команды может менять список Сервисов, не правя YAML. Под Сервисами Репо без Конфига репо кнопка «+ Добавить Сервис» раскрывает в карточке Репо форму. Форма добавляет один Сервис в Локальный конфиг. У каждого Сервиса Локального конфига появляется кнопка «Убрать». Всё пишется только в Локальный конфиг в каталоге данных приложения, никогда в папку Репо. У Репо с Конфигом репо нет ни кнопки, ни «Убрать»: его Сервисы описывают разработчики.

**Блокируется:** ничем (опирается на завершённый devpanel 10, Жизненный цикл конфига).

**Статус:** resolved

## Решения

- **Где работает:** только у Репо без Конфига репо. Правится только Локальный конфиг.
- **Размещение кнопки:** «+ Добавить Сервис» в конце списка Сервисов Репо; форма раскрывается на её месте внутри карточки Репо, без диалога.
- **Доступна и без Локального конфига:** рядом с предложениями автоопределения до первого сохранения и в Репо, где автоопределение ничего не нашло (npm/yarn-Репо, нынешний текст «Found nothing to run»). Там форма создаёт Локальный конфиг.
- **Источник команды:** список найденных автоопределением скриптов, которых ещё нет в Локальном конфиге, плюс поле для своей команды.
- **Поля:** имя и команда. `id` генерируется из имени. В свёрнутом блоке «Дополнительно» — `port`, `url`, `readyPattern`, `dependsOn`.
- **Проверки:** ошибки показываются у поля: имя уже занято («Сервис с таким именем уже есть») и любая ошибка валидации конфига (порт занят и т. п.).
- **После добавления:** Сервис появляется в статусе `stopped` и сам не запускается.
- **Удаление запущенного Сервиса:** подтверждение «Сервис работает — остановить и убрать?»; после подтверждения он останавливается и удаляется.
- **Удаление Сервиса, от которого зависят другие:** подтверждение перечисляет зависящие Сервисы; удалённый Сервис убирается из их `dependsOn`.
- **Удаление последнего Сервиса:** файл Локального конфига удаляется, и Репо возвращается к предложениям автоопределения.
- **Изменения нет:** чтобы изменить Сервис, его убирают и добавляют заново.
- Все новые тексты есть на обоих Языках интерфейса (английском и русском).

## Критерии приёмки

- [x] У Репо с Локальным конфигом под Сервисами есть «+ Добавить Сервис»; форма раскрывается в карточке Репо.
- [x] Форма предлагает найденные скрипты, которых ещё нет в Локальном конфиге, и поле для своей команды; имя и команда обязательны, `port`/`url`/`readyPattern`/`dependsOn` — в свёрнутом блоке «Дополнительно».
- [x] Добавление Сервиса пишет только в Локальный конфиг (тест проверяет, что папка Репо не изменилась); новый Сервис появляется в статусе `stopped`.
- [x] Дубль имени или любая другая ошибка валидации конфига показывается в форме у поля, и ничего не сохраняется.
- [x] В Репо без конфига «+ Добавить Сервис» доступна рядом с предложениями и в состоянии «Found nothing to run» и создаёт Локальный конфиг.
- [x] У Репо с Конфигом репо нет ни «+ Добавить Сервис», ни «Убрать».
- [x] «Убрать» у остановленного Сервиса удаляет его из Локального конфига.
- [x] «Убрать» у запущенного Сервиса спрашивает подтверждение, затем останавливает и удаляет его.
- [x] Удаление Сервиса, от которого зависят другие, перечисляет их в подтверждении и убирает его из их `dependsOn`.
- [x] Удаление последнего Сервиса удаляет файл Локального конфига и снова показывает предложения автоопределения.
- [x] Все новые тексты есть на английском и русском.
