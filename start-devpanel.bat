@echo off
rem DevPanel launcher: the team member's desktop shortcut points here.
rem Starts the built Server and opens the browser, or only opens another tab when DevPanel already runs.
rem Closing this window means Exit: all Services and Sessions are stopped.
rem Requires `pnpm install` and `pnpm build` once (and after every update).
chcp 65001 >nul
title DevPanel
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Попросите разработчика установить Node.js 24 или новее.
  pause
  exit /b 1
)

if not exist "packages\server\dist\launch-main.js" (
  echo DevPanel не собран. Попросите разработчика выполнить в папке DevPanel: pnpm install, затем pnpm build.
  pause
  exit /b 1
)

node "packages\server\dist\launch-main.js"
if errorlevel 1 (
  echo.
  pause
)
