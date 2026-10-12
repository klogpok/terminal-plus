# 06: Windows installer for the Tauri app

Spec: `.scratch/tauri-desktop/spec.md`

**What to build:** `pnpm desktop:dist` produces a per-user NSIS installer for the Tauri app that a new team member can run. It has no Electron. The installed app carries:
- a pinned `node.exe` (win-x64, satisfying the repo's `engines.node`, downloaded by the build and verified against the official checksums) as the sidecar binary;
- the sidecar bundle and `node-pty` (N-API, its prebuilt `win32-x64` binary, no rebuild; sources and other platforms dropped);
- the built web UI and the icon.

WebView2 is installed through the download bootstrapper only when missing. As today, the installer speaks English and Russian, lets the user choose the install folder, and creates Start menu and desktop shortcuts named DevPanel. The installed app works without any developer tools on the machine. An optional end-to-end test runs against the built app when `DEVPANEL_DESKTOP_EXE` points at it, and is skipped otherwise. It proves the guarantees only the real shell can give: a second launch exits and leaves the running app alone, killing the shell kills the sidecar and every Service and Session, and Exit through the UI ends the app.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] `pnpm desktop:dist` builds the web UI, the sidecar bundle and the Tauri shell and outputs an NSIS installer; a wrong `node.exe` checksum fails the build.
- [ ] The installed app (on a machine or user profile without Node) starts, runs Services and Sessions through node-pty, and Exit stops everything.
- [ ] The installer uses the WebView2 download bootstrapper, installs per user, offers English and Russian, lets the user choose the folder, and creates Start menu and desktop shortcuts.
- [ ] Measured sizes are recorded in the ticket's comments: installer (target ≈ 45 MB) and installed folder (target ≈ 110 MB).
- [ ] The optional built-app end-to-end test exists, is skipped without `DEVPANEL_DESKTOP_EXE`, and passes against the built app: second launch exits without a second `node.exe`; killing the shell kills the sidecar and every recorded process; Exit through the UI ends the app.
- [ ] `desktop:check` and `pnpm check` pass.

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

- [ ] `pnpm desktop:dist` собирает веб-UI, бандл sidecar и оболочку Tauri и выдаёт NSIS-установщик; неверная контрольная сумма `node.exe` проваливает сборку.
- [ ] Установленное приложение (на машине или в профиле без Node) запускается, выполняет Сервисы и Сессии через node-pty, а Выход всё останавливает.
- [ ] Установщик использует загрузочный bootstrapper WebView2, ставит приложение для текущего пользователя, предлагает английский и русский, даёт выбрать папку и создаёт ярлыки в меню «Пуск» и на рабочем столе.
- [ ] Замеренные размеры записаны в комментариях тикета: установщик (цель ≈ 45 МБ) и папка установки (цель ≈ 110 МБ).
- [ ] Необязательный e2e-тест собранного приложения существует, пропускается без `DEVPANEL_DESKTOP_EXE` и проходит против собранного приложения: повторный запуск завершается без второго `node.exe`; убийство оболочки убивает sidecar и все записанные процессы; Выход через UI завершает приложение.
- [ ] `desktop:check` и `pnpm check` проходят.
