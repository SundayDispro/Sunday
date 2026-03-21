# Cloudflare Quick Tunnel (URL aleatoria, gratis)

Sirve para probar Sunday desde el móvil u otra red sin abrir puertos en el router. El túnel apunta al **frontend de Vite**; las rutas `/api`, `/uploads` y `/socket.io` siguen yendo al backend vía proxy de Vite (puerto **5173** → **3001** en local).

## Requisito: `cloudflared`

- **Windows:** [Descargar cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) o `winget install Cloudflare.cloudflared`
- Comprueba en PowerShell: `cloudflared --version`

## Pasos

1. Arranca el **backend**: `npm run dev` en `backend/` (puerto 3001).
2. Arranca el **frontend**: `npm run dev` en `frontend/` (puerto 5173).
3. En otra terminal, desde `frontend/`:

   ```powershell
   npm run tunnel
   ```

   Equivale a: `cloudflared tunnel --url http://localhost:5173`

4. En la salida verás una URL tipo `https://xxxx.trycloudflare.com`. Ábrela en el navegador o compártela.

`vite.config.ts` ya incluye `allowedHosts: ['.trycloudflare.com']` para que Vite acepte el host del túnel.

## Notas

- La URL cambia cada vez que reinicias el quick tunnel (salvo que uses un túnel nombrado con cuenta Cloudflare).
- No uses esto como producción; es solo para pruebas.
- Si el backend no está en marcha, la app cargará pero fallarán las peticiones API.
