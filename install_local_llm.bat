@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "runtime\python.exe" (
  echo Run install_environment.bat first to upgrade to the unified Python runtime.
  pause
  exit /b 1
)
"runtime\python.exe" -X utf8 "scripts\install_llm.py"
if errorlevel 1 (
  echo Local LLM component check failed. Keep the error above.
) else (
  echo Local LLM uses the unified Python. Choose a GGUF in the AI assistant and test the connection.
)
pause
