@echo off
setlocal enabledelayedexpansion

REM Ejecución manual (o programada) de la purga:
REM Notification.read=true AND Notification.createdAt < NOW() - INTERVAL '60 days'
REM Requiere:
REM - psql en PATH
REM - variable de entorno DATABASE_URL (backend/.env) o equivalentes
REM - Idealmente PGPASSWORD en entorno. Si no existe, este script intenta extraerla desde DATABASE_URL.
REM
REM Programador de Tareas (ejemplo semanal):
REM - Trigger: cada 7 días (o semanal) en un día/hora fijo.
REM - Acción: ejecutar este .bat con la misma cuenta/entorno donde se cargan DATABASE_URL y (si aplica) PGPASSWORD.
REM ============================================================

set "SCRIPT_DIR=%~dp0"

if "%DATABASE_URL%"=="" (
  REM Intentar cargar DATABASE_URL desde backend/.env (sin imprimir secretos).
  if exist "%SCRIPT_DIR%..\\backend\\.env" (
    for /f "delims=" %%D in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%..\\ops\\extract_database_url.ps1" "%SCRIPT_DIR%..\\backend\\.env"') do set "DATABASE_URL=%%D"
  )
)

if "%DATABASE_URL%"=="" (
  echo [ERROR] Falta DATABASE_URL (backend/.env). Setéalo antes de ejecutar.
  exit /b 1
)

REM Extraer host/port/user/db (y password si PGPASSWORD no está definida) desde DATABASE_URL
for /f "tokens=1-6 delims=|" %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%parse_database_url.ps1" "%DATABASE_URL%"') do (
  set "DB_USER=%%A"
  set "DB_PASSWORD=%%B"
  set "DB_HOST=%%C"
  set "DB_PORT=%%D"
  set "DB_NAME=%%E"
)

if "%PGPASSWORD%"=="" (
  set "PGPASSWORD=%DB_PASSWORD%"
)

set "LOG_DIR=%SCRIPT_DIR%..\\backups\\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%T"
set "LOG_FILE=%LOG_DIR%\\purge-notifications-%STAMP%.log"

echo [INFO] Ejecutando purge notificaciones leídas... > "%LOG_FILE%"

REM ON_ERROR_STOP=1 => si falla la SQL, el script falla.
psql --host "%DB_HOST%" --port "%DB_PORT%" --username "%DB_USER%" --dbname "%DB_NAME%" --set ON_ERROR_STOP=1 -f "%SCRIPT_DIR%purge_notifications.sql" >> "%LOG_FILE%" 2>&1

echo [INFO] Purga completada. >> "%LOG_FILE%"
exit /b 0

