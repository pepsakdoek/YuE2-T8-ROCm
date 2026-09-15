@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1"
if errorlevel 1 (
  echo.
  echo Installation failed. Keep this window open and read the error above.
  pause
  exit /b 1
)
pause
