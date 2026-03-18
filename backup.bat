@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM Sunday - Backup & Restore (PostgreSQL + backend/uploads)
REM ============================================================
REM Objetivo (iteración: Antes del lanzamiento):
REM - pg_dump de la DB (PostgreSQL).
REM - Backup de backend/uploads (carpeta runtime del backend).
REM - Retención: 7 días.
REM - Logs por ejecución.
REM - Purga opcional de notificaciones leídas > 60 días.
REM
REM Seguridad:
REM - Este script NO hardcodea credenciales.
REM - Debes tener backend/.env cargado en el entorno del proceso (o exportar DATABASE_URL).
REM - Si no tienes PGPASSWORD seteado, el script intenta extraer la password desde DATABASE_URL.
REM
REM Variables opcionales:
REM - PURGE_NOTIFICATIONS_ENABLED=1  (ejecuta la purga cuando aplique)
REM - PURGE_NOTIFICATIONS_WEEKDAY=Monday|Tuesday|... (día en el que se ejecuta la purga)
REM - RETENTION_DAYS=7
REM ============================================================

set "REPO_ROOT=%~dp0"
set "BACKUP_ROOT=%REPO_ROOT%backups"
set "RETENTION_DAYS=%RETENTION_DAYS%"
if "%RETENTION_DAYS%"=="" set "RETENTION_DAYS=7"

set "UPLOADS_SRC=%REPO_ROOT%backend\uploads"
set "RUN_DIR=%BACKUP_ROOT%\run-%STAMP%"

if "%DATABASE_URL%"=="" (
  REM Intentar cargar DATABASE_URL desde backend/.env (sin imprimir secretos).
  if exist "%REPO_ROOT%backend\.env" (
    for /f "delims=" %%D in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%ops\extract_database_url.ps1" "%REPO_ROOT%backend\.env"') do set "DATABASE_URL=%%D"
  )
)

if "%DATABASE_URL%"=="" (
  echo [ERROR] Falta DATABASE_URL (backend/.env). Setéalo antes de ejecutar.
  exit /b 1
)

for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%T"
set "RUN_DIR=%BACKUP_ROOT%\run-%STAMP%"
set "LOG_DIR=%BACKUP_ROOT%\logs"
set "LOG_FILE=%LOG_DIR%\backup-%STAMP%.log"

if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
mkdir "%RUN_DIR%" 2>nul
mkdir "%RUN_DIR%\db" 2>nul
mkdir "%RUN_DIR%\uploads" 2>nul

echo [INFO] Backup iniciado: %STAMP% > "%LOG_FILE%"

REM ------------------------------------------------------------
REM Extraer parámetros DB desde DATABASE_URL
REM ------------------------------------------------------------
for /f "tokens=1-6 delims=|" %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%ops\parse_database_url.ps1" "%DATABASE_URL%"') do (
  set "DB_USER=%%A"
  set "DB_PASSWORD=%%B"
  set "DB_HOST=%%C"
  set "DB_PORT=%%D"
  set "DB_NAME=%%E"
  set "DB_SCHEMA=%%F"
)

if "%PGPASSWORD%"=="" (
  set "PGPASSWORD=%DB_PASSWORD%"
)

REM ------------------------------------------------------------
REM 1) pg_dump
REM ------------------------------------------------------------
set "DB_DUMP_FILE=%RUN_DIR%\db\postgres-%DB_NAME%-%DB_SCHEMA%-%STAMP%.dump"
echo [INFO] Ejecutando pg_dump -> "%DB_DUMP_FILE%" >> "%LOG_FILE%"
pg_dump -Fc --no-owner --no-privileges --verbose ^
  --host "%DB_HOST%" --port "%DB_PORT%" --username "%DB_USER%" ^
  --dbname "%DB_NAME%" ^
  --schema "%DB_SCHEMA%" ^
  --file "%DB_DUMP_FILE%" >> "%LOG_FILE%" 2>&1

if errorlevel 1 (
  echo [ERROR] pg_dump falló. >> "%LOG_FILE%"
  exit /b 1
)

REM ------------------------------------------------------------
REM 2) Backup uploads
REM ------------------------------------------------------------
echo [INFO] Backup de uploads -> "%RUN_DIR%\uploads" >> "%LOG_FILE%"
if exist "%UPLOADS_SRC%" (
  mkdir "%RUN_DIR%\uploads" 2>nul
  robocopy "%UPLOADS_SRC%" "%RUN_DIR%\uploads" /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS >> "%LOG_FILE%" 2>&1
) else (
  echo [WARN] No existe directorio: "%UPLOADS_SRC%". Se crea vacío. >> "%LOG_FILE%"
  mkdir "%RUN_DIR%\uploads" 2>nul
)

REM ------------------------------------------------------------
REM 3) Purga opcional: notificaciones leídas > 60 días
REM ------------------------------------------------------------
set "PURGE_NOTIFICATIONS_ENABLED=%PURGE_NOTIFICATIONS_ENABLED%"
if "%PURGE_NOTIFICATIONS_ENABLED%"=="" set "PURGE_NOTIFICATIONS_ENABLED=0"

set "PURGE_NOTIFICATIONS_WEEKDAY=%PURGE_NOTIFICATIONS_WEEKDAY%"
if "%PURGE_NOTIFICATIONS_WEEKDAY%"=="" set "PURGE_NOTIFICATIONS_WEEKDAY=Monday"

for /f "delims=" %%D in ('powershell -NoProfile -Command "(Get-Date).DayOfWeek.ToString()"') do set "TODAY_DOW=%%D"

if /i "%PURGE_NOTIFICATIONS_ENABLED%"=="1" (
  if /i "%TODAY_DOW%"=="%PURGE_NOTIFICATIONS_WEEKDAY%" (
    echo [INFO] Ejecutando purga de notificaciones leídas >60d... >> "%LOG_FILE%"
    call "%REPO_ROOT%ops\run_purge_notifications.bat" >> "%LOG_FILE%" 2>&1
  ) else (
    echo [INFO] Purga deshabilitada por día (hoy=%TODAY_DOW%, configurado=%PURGE_NOTIFICATIONS_WEEKDAY%). >> "%LOG_FILE%"
  )
)

REM ------------------------------------------------------------
REM 4) Retención: borrar ejecuciones antiguas (> RETENTION_DAYS)
REM ------------------------------------------------------------
echo [INFO] Aplicando retención (%RETENTION_DAYS% días)... >> "%LOG_FILE%"
powershell -NoProfile -Command ^
  "Get-ChildItem -Path '%BACKUP_ROOT%' -Directory -Filter 'run-*' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-%RETENTION_DAYS%) } | ForEach-Object { Remove-Item -Recurse -Force -Path $_.FullName }" ^
  >> "%LOG_FILE%" 2>&1

echo [INFO] Backup finalizado OK: %STAMP% >> "%LOG_FILE%"

REM ============================================================
REM Procedimiento para probar restauración (mínimo)
REM ============================================================
REM 1) Crear una DB de prueba (ej: sunday_test) en tu Postgres.
REM 2) Restaurar el dump:
REM    pg_restore --no-owner --no-privileges --clean --if-exists --schema "%DB_SCHEMA%" ^
REM      -d "sunday_test" "PATH_AL_DB_DUMP.dump"
REM 3) Validar:
REM    psql -d "sunday_test" -c "SELECT count(*) FROM \"Notification\";"
REM    psql -d "sunday_test" -c "SELECT count(*) FROM \"ColumnValue\";"
REM 4) Restaurar uploads:
REM    - Parar backend
REM    - Copiar backups/run-<STAMP>/uploads/* -> backend/uploads/
REM    - Volver a arrancar backend

exit /b 0

