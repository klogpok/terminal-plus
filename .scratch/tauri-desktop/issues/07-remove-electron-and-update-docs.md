# 07: Remove Electron and update the docs

Spec: `.scratch/tauri-desktop/spec.md`

**What to build:** The Tauri app is the only desktop app. Electron is gone from the repo:
- the Electron dependency and electron-builder with its configuration;
- the Electron adapter and the Electron start script;
- the Electron end-to-end test, now covered by the sidecar end-to-end test and the optional built-app test.

The docs describe the new shape:
- the architecture doc's `desktop` section (shell, sidecar, protocol, who owns what, ADR-0003), running the desktop app, and the Windows gotchas (the `ELECTRON_RUN_AS_NODE` note goes, Tauri/WebView2 and Rust toolchain notes come in);
- a short release smoke checklist (second launch, tray in both UI Languages, taken port, kill the shell, Exit, the built-app test).

The first Tauri release notes tell Electron users to uninstall the old version first.

**Blocked by:** 06

**Status:** ready-for-agent

- [x] No Electron or electron-builder dependency, configuration, adapter, script or test remains; the lockfile is updated.
- [x] `pnpm desktop` and `pnpm desktop:dist` run the Tauri app and installer; `pnpm check` needs no Rust and no Electron.
- [x] The architecture doc describes the shell, the sidecar and the protocol, how to run and build the desktop app, the Rust toolchain needed for it, and `desktop:check`.
- [x] The release smoke checklist exists in the docs and names the built-app end-to-end test.
- [x] Release notes for the first Tauri release ask Electron users to uninstall the old version first: otherwise its Start with Windows entry keeps launching it and one of the two apps shows "DevPanel already runs" at every sign-in. They say the Workspace, Local Configs and UI Language are kept and the Theme falls back to "as in the system" once.
- [x] `desktop:check` and `pnpm check` pass.

## Русский перевод

# 07: Удалить Electron и обновить документацию

Спецификация: `.scratch/tauri-desktop/spec.md`

**Что сделать:** Tauri-приложение — единственное десктопное приложение. Electron удаляется из репозитория:
- зависимость Electron и electron-builder с его конфигурацией;
- Electron-адаптер и скрипт запуска Electron;
- Electron e2e-тест — теперь его покрывают e2e-тест sidecar и необязательный тест собранного приложения.

Документация описывает новое устройство:
- раздел `desktop` архитектурного документа (оболочка, sidecar, протокол, кто чем владеет, ADR-0003), запуск десктопного приложения и особенности Windows (заметка про `ELECTRON_RUN_AS_NODE` уходит, появляются заметки про Tauri/WebView2 и Rust-тулчейн);
- короткий чек-лист релизного смоука (повторный запуск, трей на обоих Языках интерфейса, занятый порт, убийство оболочки, Выход, тест собранного приложения).

Заметки к первому релизу на Tauri просят пользователей Electron сначала удалить старую версию.

**Блокируется:** 06

**Статус:** ready-for-agent

- [x] Не осталось ни зависимостей, ни конфигурации, ни адаптера, ни скриптов, ни тестов Electron или electron-builder; lock-файл обновлён.
- [x] `pnpm desktop` и `pnpm desktop:dist` запускают Tauri-приложение и собирают установщик; `pnpm check` не требует ни Rust, ни Electron.
- [x] Архитектурный документ описывает оболочку, sidecar и протокол, как запускать и собирать десктопное приложение, нужный Rust-тулчейн и `desktop:check`.
- [x] Чек-лист релизного смоука есть в документации и ссылается на e2e-тест собранного приложения.
- [x] Заметки к первому релизу на Tauri просят пользователей Electron сначала удалить старую версию: иначе её запись автозапуска продолжит её запускать, и одно из двух приложений будет при каждом входе в систему показывать «DevPanel уже работает». В них сказано, что Workspace, Локальные конфиги и Язык интерфейса сохранятся, а Тема один раз сбросится на «как в системе».
- [x] `desktop:check` и `pnpm check` проходят.
