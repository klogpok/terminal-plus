# 02: The sidecar runs the desktop behaviour over the stdio protocol

Spec: `.scratch/tauri-desktop/spec.md`

**What to build:** A headless desktop sidecar: a Node entry point that runs the DevPanel Server and the desktop behaviour (`runDesktop`) and talks to a shell through JSON lines. The shell writes to stdin, the sidecar writes to stdout, and the sidecar's own logs go to stderr. The message set is the one in the spec:
- shell → sidecar: `start`, `trayClicked`, `trayItemClicked`, `windowCloseRequested`, `quitRequested`, `autostartChanged`, `errorDismissed`;
- sidecar → shell: `openWindow`, `showWindow`, `hideWindow`, `setTray`, `showError`, `setAutostart`, `setCrashTexts`, `exit`.

The message types are defined once in TypeScript. A protocol fixture holds one sample line per message so the Rust side can check against it later. The production desktop host is now an adapter over this protocol. Electron is untouched and still ships. The sidecar is verifiable on its own: an end-to-end test plays the shell and drives the real sidecar with real Services and Sessions.

**Blocked by:** 01

**Status:** resolved

- [x] A sidecar bundle can be built and started with plain Node; it reads `DEVPANEL_APP_DATA`, `DEVPANEL_PORT` and the hidden-start flag from `start`.
- [x] Protocol message types are defined in one place in TypeScript; malformed or unknown incoming lines are logged to stderr and ignored, never crash the sidecar.
- [x] Nothing but protocol lines is written to stdout (Service and Session output never leaks there).
- [x] A protocol fixture with one sample line per message exists and a TS test parses every line against the types.
- [x] End-to-end test (fake shell, temporary app data, random port, in `pnpm test`):
  - after `openWindow` the Server answers `/api/hello` and the URL carries the Access Key;
  - a Service and a shell Session run through node-pty;
  - `windowCloseRequested` yields `hideWindow` and stops nothing;
  - `quitRequested` stops every recorded process before `exit`;
  - a forced kill of the sidecar leaves every surviving recorded process detectable as an Orphan on the next start;
  - a port held by DevPanel or another program yields `showError` with the plain-language message, and `exit` only after the test sends `errorDismissed`;
  - "Exit DevPanel" through the WebSocket yields `exit`.
- [x] `pnpm check` passes.

## Comments

- Orchestrator addition: in the Tauri app the sidecar runs inside a Job Object with kill-on-close, so a browser or Explorer window the sidecar spawned (`windowsShell.openUrl` / `openFolder`) could live in the Job and die when DevPanel exits. Two more sidecar → shell messages, `openUrl` (url) and `openFolder` (path), hand these to the shell: the sidecar passes `startDevPanel` a `DesktopShell` whose `openUrl` (http(s) only, as `windowsShell`) and `openFolder` send them; `pickFolder` stays the PowerShell picker. Both are in the protocol types and the fixture, and the e2e test covers them.

## Русский перевод

# 02: Sidecar выполняет поведение десктопа через stdio-протокол

Спецификация: `.scratch/tauri-desktop/spec.md`

**Что сделать:** Безоконный sidecar десктопа: точка входа на Node, которая запускает Сервер DevPanel и поведение десктопа (`runDesktop`) и общается с оболочкой строками JSON. Оболочка пишет в stdin, sidecar — в stdout, собственные логи sidecar идут в stderr. Набор сообщений — из спецификации:
- оболочка → sidecar: `start`, `trayClicked`, `trayItemClicked`, `windowCloseRequested`, `quitRequested`, `autostartChanged`, `errorDismissed`;
- sidecar → оболочка: `openWindow`, `showWindow`, `hideWindow`, `setTray`, `showError`, `setAutostart`, `setCrashTexts`, `exit`.

Типы сообщений определены один раз на TypeScript. Фикстура протокола содержит по одной образцовой строке на сообщение, чтобы позже с ней сверялась Rust-сторона. Боевой десктопный хост теперь — адаптер над этим протоколом. Electron не трогаем, он по-прежнему поставляется. Sidecar проверяется сам по себе: e2e-тест играет роль оболочки и управляет настоящим sidecar с настоящими Сервисами и Сессиями.

**Блокируется:** 01

**Статус:** resolved

- [x] Бандл sidecar собирается и запускается обычным Node; он читает `DEVPANEL_APP_DATA`, `DEVPANEL_PORT`, а признак скрытого старта — из `start`.
- [x] Типы сообщений протокола определены в одном месте на TypeScript; некорректные или неизвестные входящие строки пишутся в stderr и игнорируются, sidecar от них не падает.
- [x] В stdout не пишется ничего, кроме строк протокола (вывод Сервисов и Сессий туда не попадает).
- [x] Есть фикстура протокола с одной образцовой строкой на сообщение, и TS-тест разбирает каждую строку по типам.
- [x] E2e-тест (фейковая оболочка, временный каталог данных, случайный порт, в `pnpm test`):
  - после `openWindow` Сервер отвечает на `/api/hello`, а URL содержит Ключ доступа;
  - Сервис и Сессия оболочки работают через node-pty;
  - `windowCloseRequested` даёт `hideWindow` и ничего не останавливает;
  - `quitRequested` останавливает все записанные процессы до `exit`;
  - после принудительного убийства sidecar каждый выживший записанный процесс находится как Зомби при следующем старте;
  - порт, занятый DevPanel или другой программой, даёт `showError` с понятным сообщением, а `exit` — только после того, как тест отправит `errorDismissed`;
  - «Выход из DevPanel» через WebSocket даёт `exit`.
- [x] `pnpm check` проходит.

## Комментарии

- Дополнение оркестратора: в приложении на Tauri sidecar работает внутри Job Object с завершением при закрытии, поэтому окно браузера или Проводника, запущенное sidecar (`windowsShell.openUrl` / `openFolder`), могло бы оказаться в Job и умереть при выходе из DevPanel. Два новых сообщения sidecar → оболочка, `openUrl` (url) и `openFolder` (path), передают это оболочке: sidecar отдаёт `startDevPanel` `DesktopShell`, у которого `openUrl` (только http(s), как в `windowsShell`) и `openFolder` отправляют эти сообщения; `pickFolder` остаётся выбором папки через PowerShell. Оба сообщения есть в типах протокола и в фикстуре, e2e-тест их покрывает.
