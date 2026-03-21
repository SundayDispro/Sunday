@echo off
REM Requiere: winget install Cloudflare.cloudflared
REM Expone Nginx (5173) por HTTPS. Anade el origen https://....trycloudflare.com a ALLOWED_ORIGINS si NODE_ENV=production.

echo Iniciando Cloudflare Quick Tunnel hacia http://127.0.0.1:5173 ...
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo ERROR: cloudflared no esta en PATH. Instala con: winget install Cloudflare.cloudflared
  pause
  exit /b 1
)
cloudflared tunnel --url http://127.0.0.1:5173
pause
