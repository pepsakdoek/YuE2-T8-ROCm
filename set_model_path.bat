@echo off
setlocal
chcp 65001 >nul
title T8star-Aix - YuE2 Model Path
call "%~dp0configure_models.bat" %*
