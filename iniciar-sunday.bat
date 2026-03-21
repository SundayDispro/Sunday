@echo off
REM Arranque manual igual que al inicio del PC (sin ventanas). Log: %ProgramData%\Sunday\startup.log
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-sunday-at-boot.ps1"
if errorlevel 1 (
  echo Fallo al iniciar. Revisa el log: %ProgramData%\Sunday\startup.log
  pause
)
