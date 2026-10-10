@echo off
rem Creates a "DevPanel" shortcut to start-devpanel.bat on the desktop (or in the folder given as
rem the first argument). Run once by double-click after `pnpm install` and `pnpm build`.
chcp 65001 >nul
cd /d "%~dp0"
set "DEVPANEL_SHORTCUT_DIR=%~1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$dir = if ($env:DEVPANEL_SHORTCUT_DIR) { $env:DEVPANEL_SHORTCUT_DIR } else { [Environment]::GetFolderPath('Desktop') };" ^
  "$root = (Get-Location).Path;" ^
  "$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $dir 'DevPanel.lnk'));" ^
  "$link.TargetPath = Join-Path $root 'start-devpanel.bat';" ^
  "$link.WorkingDirectory = $root;" ^
  "$link.Description = 'DevPanel';" ^
  "$link.Save()"
if errorlevel 1 (
  echo Не удалось создать ярлык. Создайте его вручную: правый клик по start-devpanel.bat, "Отправить", "Рабочий стол (создать ярлык)".
) else (
  echo Ярлык DevPanel создан на рабочем столе. Запускайте DevPanel двойным кликом по нему.
)
pause
