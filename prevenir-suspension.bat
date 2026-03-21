@echo off
setlocal EnableExtensions
title Sunday - Evitar suspension por inactividad (AC)

REM Opcion A: aplica powercfg en el plan activo (corriente) y muestra estado.
REM Si no hay admin, se relanza con UAC.

net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo Se necesitan permisos de administrador para cambiar el plan de energia.
    echo Acepta el aviso de Windows...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

cd /d "%~dp0"
echo.
echo ========================================
echo  Sunday - No suspender / hibernar (AC)
echo ========================================
echo.
echo Aplicando: standby, hibernacion y apagado de disco = nunca (solo con corriente).
echo No impide el apagado manual desde el menu Inicio.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\set-pc-no-sleep-ac.ps1" -Action Apply
if errorlevel 1 (
    echo.
    echo ERROR: no se pudo aplicar powercfg. Revisa que tengas permisos de administrador.
    pause
    exit /b 1
)

echo.
echo --- Plan de energia activo ---
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\set-pc-no-sleep-ac.ps1" -Action Status

echo.
echo Listo. El PC no entrara en suspension por inactividad mientras este enchufado (AC).
echo Para revertir al plan Equilibrado: scripts\set-pc-no-sleep-ac.ps1 -Action RestoreBalanced
echo.
pause
endlocal
