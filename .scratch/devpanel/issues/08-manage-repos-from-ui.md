# 08: Manage Repos from the UI

**What to build:** The team member builds their Workspace without touching files. "Add Repo" opens a folder picker (shown by the backend, since a browser cannot return a folder path), defaults the name to the folder name, and assigns a color. The same folder cannot be added twice and names must be unique. Removing a Repo lists what runs in it, stops everything after confirmation, deletes its Local Config, and never touches the folder. A Repo whose folder disappeared stays greyed out with "Folder not found", "Choose new location" (keeps name and color) and "Remove". Each Repo shows its current git branch, refreshed periodically, and has "Open folder"; Services with a URL get "Open in browser". Folders and URLs open through the backend.

**Blocked by:** 02 (Control a Service from the browser).

**Status:** resolved

- [x] `addRepo` rejects a path already in the Workspace and a name already taken; the UI asks for another name on a clash.
- [x] Added Repos are persisted in the Workspace file and get a default name and color.
- [x] `removeRepo` stops every process owned by the Repo after a confirmation that lists them, removes the Repo and its Local Config, and leaves the folder untouched.
- [x] A Repo with a missing folder is reported via `repoChanged`, shown greyed with "Folder not found", and cannot start Services; `relocateRepo` changes its path and keeps name and color.
- [x] The git branch is shown per Repo and refreshed at the configured interval; non-git folders show no branch.
- [x] "Open folder" (`openFolder`) and "Open in browser" (`openUrl`) work through the backend, never through browser APIs.

---

## Русский перевод

# 08: Управление Репо из UI

**Что сделать:** Член команды собирает свой Workspace, не трогая файлы. «Добавить Репо» открывает выбор папки (его показывает бэкенд, потому что браузер не может вернуть путь к папке), по умолчанию даёт имя по папке и назначает цвет. Одну папку нельзя добавить дважды, имена должны быть уникальными. Удаление Репо показывает, что в нём работает, после подтверждения всё останавливает, удаляет его Локальный конфиг и никогда не трогает саму папку. Репо, у которого пропала папка, остаётся серым с «Папка не найдена», «Указать новое расположение» (имя и цвет сохраняются) и «Удалить». У каждого Репо видна текущая git-ветка с периодическим обновлением и есть «Открыть папку»; у Сервисов с URL есть «Открыть в браузере». Папки и URL открываются через бэкенд.

**Блокируется:** 02 (Управление Сервисом из браузера).

**Статус:** resolved

- [x] `addRepo` отклоняет путь, который уже есть в Workspace, и уже занятое имя; при совпадении имени UI просит другое.
- [x] Добавленные Репо сохраняются в файл Workspace и получают имя и цвет по умолчанию.
- [x] `removeRepo` после подтверждения со списком процессов останавливает все процессы Репо, удаляет Репо и его Локальный конфиг и не трогает папку.
- [x] Репо с пропавшей папкой сообщается через `repoChanged`, показывается серым с «Папка не найдена» и не может запускать Сервисы; `relocateRepo` меняет его путь, сохраняя имя и цвет.
- [x] Git-ветка показывается для каждого Репо и обновляется с настроенным интервалом; у папок без git ветка не показывается.
- [x] «Открыть папку» (`openFolder`) и «Открыть в браузере» (`openUrl`) работают через бэкенд, никогда через API браузера.
