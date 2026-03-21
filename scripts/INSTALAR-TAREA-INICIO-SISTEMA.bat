@echo off
REM Clic derecho > Ejecutar como administrador.
cd /d "%~dp0"
powershell.exe -NoProfile -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0register-sunday-scheduled-task.ps1')"
echo Si aceptaste el UAC, la tarea "Sunday Server" deberia estar registrada.
pause
