@echo off
REM Requiere: winget install Cloudflare.cloudflared
REM Modo QUICK TUNNEL: cada arranque genera una URL aleatoria https://*.trycloudflare.com
REM (sin cuenta Cloudflare ni DNS). Apunta al frontend (Vite/Nginx en 5173).
REM CORS: en backend/.env usa ALLOW_TRYCLOUDFLARE_ORIGINS=1 o anade cada URL nueva a ALLOWED_ORIGINS.

echo Iniciando Cloudflare Quick Tunnel hacia http://127.0.0.1:5173 ...
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo ERROR: cloudflared no esta en PATH. Instala con: winget install Cloudflare.cloudflared
  pause
  exit /b 1
)
cloudflared tunnel --url http://127.0.0.1:5173
pause
