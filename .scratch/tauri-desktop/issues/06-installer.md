# 06: Windows installer for the Tauri app

Spec: `.scratch/tauri-desktop/spec.md`

**What to build:** `pnpm desktop:dist` produces a per-user NSIS installer for the Tauri app that a new team member can run. It has no Electron. The installed app carries:
- a pinned `node.exe` (win-x64, satisfying the repo's `engines.node`, downloaded by the build and verified against the official checksums) as the sidecar binary;
- the sidecar bundle and `node-pty` (N-API, its prebuilt `win32-x64` binary, no rebuild; sources and other platforms dropped);
- the built web UI and the icon.

WebView2 is installed through the download bootstrapper only when missing. As today, the installer speaks English and Russian, lets the user choose the install folder, and creates Start menu and desktop shortcuts named DevPanel. The installed app works without any developer tools on the machine. An optional end-to-end test runs against the built app when `DEVPANEL_DESKTOP_EXE` points at it, and is skipped otherwise. It proves the guarantees only the real shell can give: a second launch exits and leaves the running app alone, killing the shell kills the sidecar and every Service and Session, and Exit through the UI ends the app.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [x] `pnpm desktop:dist` builds the web UI, the sidecar bundle and the Tauri shell and outputs an NSIS installer; a wrong `node.exe` checksum fails the build.
- [x] The installed app (on a machine or user profile without Node) starts, runs Services and Sessions through node-pty, and Exit stops everything.
- [x] The installer uses the WebView2 download bootstrapper, installs per user, offers English and Russian, lets the user choose the folder, and creates Start menu and desktop shortcuts.
- [x] Measured sizes are recorded in the ticket's comments: installer (target ≈ 45 MB) and installed folder (target ≈ 110 MB).
- [x] The optional built-app end-to-end test exists, is skipped without `DEVPANEL_DESKTOP_EXE`, and passes against the built app: second launch exits without a second `node.exe`; killing the shell kills the sidecar and every recorded process; Exit through the UI ends the app.
- [x] `desktop:check` and `pnpm check` pass.

## Comments

**Measured sizes (2026-10-12, node.exe v24.21.0):**
- Installer `DevPanel_0.1.0_x64-setup.exe`: 26,085,297 bytes (24.9 MiB), target ≈ 45 MB.
- Installed folder: 29 files, 98.9 MiB, target ≈ 110 MB. node.exe is 89.2 MiB of that, DevPanel.exe 3.3 MiB, sidecar.cjs 3.0 MiB, node-pty (no `*.pdb`) 2.5 MiB, web UI 0.7 MiB.

**How it was verified:**
- `pnpm desktop:dist` ran end to end. With the pinned SHA-256 changed by one digit, `fetch-node.ts` threw "Checksum mismatch", deleted the cached file and `tauri build` never ran. The download check is also unit-tested (`test/fetch-node.test.ts`, local HTTP server).
- Silent install (`/S /D=<temp folder>`) into a scratch folder: Start menu and desktop shortcuts `DevPanel.lnk` and an `HKCU` uninstall entry appeared. The generated `installer.nsi` has `INSTALLMODE currentUser`, `INSTALLWEBVIEW2MODE downloadBootstrapper`, `DISPLAYLANGUAGESELECTOR true` with English and Russian, and `MUI_PAGE_DIRECTORY`. The interactive pages (language picker, folder page) were not clicked through.
- `tauri.e2e.test.ts` passed 3/3 against the installed `DevPanel.exe`, six runs in a row after the last change to the test. The app ran with a temporary `DEVPANEL_APP_DATA`, a free port and a PATH with only Windows folders (no Node), so the shipped node.exe and node-pty ran the Service and the Session. The user's own running DevPanel was not touched.
- Then silent uninstall. The uninstaller left `HKCU\Software\devpanel\DevPanel` (install path) behind, and it was removed by hand. No installs, Run entries or processes are left.
- The built exe and resources also land in `src-tauri/target/release` (`node.exe`, `sidecar/`, `web/`), so the e2e should also work against `target\release\DevPanel.exe` without installing. That was not run.

## Русский перевод

# 06: Установщик Windows для Tauri-приложения

Спецификация: `.scratch/tauri-desktop/spec.md`

**Что сделать:** `pnpm desktop:dist` собирает NSIS-установщик Tauri-приложения для текущего пользователя, который может запустить новый участник команды. Electron в нём нет. Установленное приложение содержит:
- закреплённый `node.exe` (win-x64, удовлетворяет `engines.node` репозитория, скачивается сборкой и сверяется с официальными контрольными суммами) как sidecar-бинарь;
- бандл sidecar и `node-pty` (N-API, готовый бинарь `win32-x64`, без пересборки; исходники и другие платформы отброшены);
- собранный веб-UI и значок.

WebView2 ставится через загрузочный bootstrapper, только если его нет. Как сейчас, установщик говорит на английском и русском, даёт выбрать папку установки и создаёт ярлыки DevPanel в меню «Пуск» и на рабочем столе. Установленное приложение работает без каких-либо инструментов разработчика на машине. Необязательный e2e-тест запускается против собранного приложения, если на него указывает `DEVPANEL_DESKTOP_EXE`, и пропускается в противном случае. Он доказывает гарантии, которые может дать только настоящая оболочка: повторный запуск завершается и не трогает работающее приложение, убийство оболочки убивает sidecar и все Сервисы и Сессии, Выход через UI завершает приложение.

**Блокируется:** 04, 05

**Статус:** ready-for-agent

- [x] `pnpm desktop:dist` собирает веб-UI, бандл sidecar и оболочку Tauri и выдаёт NSIS-установщик; неверная контрольная сумма `node.exe` проваливает сборку.
- [x] Установленное приложение (на машине или в профиле без Node) запускается, выполняет Сервисы и Сессии через node-pty, а Выход всё останавливает.
- [x] Установщик использует загрузочный bootstrapper WebView2, ставит приложение для текущего пользователя, предлагает английский и русский, даёт выбрать папку и создаёт ярлыки в меню «Пуск» и на рабочем столе.
- [x] Замеренные размеры записаны в комментариях тикета: установщик (цель ≈ 45 МБ) и папка установки (цель ≈ 110 МБ).
- [x] Необязательный e2e-тест собранного приложения существует, пропускается без `DEVPANEL_DESKTOP_EXE` и проходит против собранного приложения: повторный запуск завершается без второго `node.exe`; убийство оболочки убивает sidecar и все записанные процессы; Выход через UI завершает приложение.
- [x] `desktop:check` и `pnpm check` проходят.

## Комментарии

**Замеренные размеры (2026-10-12, node.exe v24.21.0):**
- Установщик `DevPanel_0.1.0_x64-setup.exe`: 26 085 297 байт (24,9 МиБ), цель ≈ 45 МБ.
- Папка установки: 29 файлов, 98,9 МиБ, цель ≈ 110 МБ. Из них node.exe занимает 89,2 МиБ, DevPanel.exe 3,3 МиБ, sidecar.cjs 3,0 МиБ, node-pty (без `*.pdb`) 2,5 МиБ, веб-UI 0,7 МиБ.

**Как проверено:**
- `pnpm desktop:dist` прошёл целиком. Когда в закреплённом SHA-256 поменяли одну цифру, `fetch-node.ts` выбросил «Checksum mismatch», удалил кэшированный файл, и `tauri build` не запускался. Проверка загрузки покрыта и unit-тестом (`test/fetch-node.test.ts`, локальный HTTP-сервер).
- Тихая установка (`/S /D=<временная папка>`) во временную папку: появились ярлыки `DevPanel.lnk` в меню «Пуск» и на рабочем столе и запись удаления в `HKCU`. В сгенерированном `installer.nsi` есть `INSTALLMODE currentUser`, `INSTALLWEBVIEW2MODE downloadBootstrapper`, `DISPLAYLANGUAGESELECTOR true` с английским и русским и `MUI_PAGE_DIRECTORY`. Интерактивные страницы (выбор языка, выбор папки) вручную не прокликивались.
- `tauri.e2e.test.ts` прошёл 3/3 против установленного `DevPanel.exe`, шесть запусков подряд после последнего изменения теста. Приложение работало с временным `DEVPANEL_APP_DATA`, свободным портом и PATH только из папок Windows (без Node), так что Сервис и Сессию выполняли поставляемые node.exe и node-pty. Запущенный DevPanel пользователя не трогали.
- Затем тихое удаление. Деинсталлятор оставил `HKCU\Software\devpanel\DevPanel` (путь установки), его удалили вручную. Ни установок, ни записей Run, ни процессов не осталось.
- Собранный exe и ресурсы также лежат в `src-tauri/target/release` (`node.exe`, `sidecar/`, `web/`), так что e2e должен работать и против `target\release\DevPanel.exe` без установки. Это не запускалось.
