@echo off
setlocal
chcp 65001 >nul
title T8star-Aix - YuE2 Model Path
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configure_models.ps1" %*
echo.
if errorlevel 1 echo [FAILED] Could not save the model path. See the message above.
pause
