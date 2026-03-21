# Cloudflare Tunnel con Sunday

El túnel cifra el tráfico y expone tu app por HTTPS **sin abrir puertos en el router**. Sunday está preparado para dos escenarios: **desarrollo (Vite)** y **producción (Nginx)**.

## Requisito: `cloudflared`

- **Windows:** [Instalar cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) o `winget install Cloudflare.cloudflared`
- Comprueba: `cloudflared --version`

---

## ¿Lo que ya configuramos (migraciones, build, `.env`) afecta al túnel?

**No lo rompe.** El túnel solo reenvía HTTP(S) a un puerto local. Lo que sí debe cuadrar es:

| Pieza | Quick tunnel (`*.trycloudflare.com`) | Producción `NODE_ENV=production` |
|--------|--------------------------------------|-----------------------------------|
| **Vite `allowedHosts`** | Incluye `*.trycloudflare.com` en `vite.config.ts`. Opcional: `VITE_TUNNEL_ALLOWED_HOSTS` en `.env` para un hostname de túnel nombrado (dominio propio). | No aplica (no usas Vite en prod). |
| **`ALLOWED_ORIGINS` (backend)** | Con `NODE_ENV` distinto de `production`, el backend suele ser permisivo en CORS (desarrollo). | Debes listar **todos** los orígenes reales: LAN (`http://IP:5173`), `http://localhost:5173` y **la URL HTTPS del túnel** (`https://….trycloudflare.com` o tu dominio). Sin eso, Socket.IO/CORS pueden fallar. |
| **`FRONTEND_URL` (backend)** | Puppeteer abre `/docs/export` en esta URL para PDFs. En el **servidor** debe seguir siendo **loopback hacia Nginx**, p. ej. `http://127.0.0.1:5173`, aunque los usuarios entren por el túnel. | Igual: no pongas solo la URL pública si el navegador headless no puede resolverla desde el PC servidor. |
| **Frontend compilado** | — | Sin `VITE_API_URL`: rutas relativas `/api`, `/socket.io` → mismo origen a través del túnel. Correcto. |

---

## Modo 1: Desarrollo (Vite en 5173)

El túnel apunta al **frontend de Vite**; `/api`, `/uploads` y `/socket.io` van al backend **3001** vía proxy de Vite.

1. Backend: `npm run dev` en `backend/`
2. Frontend: `npm run dev` en `frontend/`
3. En otra terminal, desde `frontend/`:

   ```powershell
   npm run tunnel
   ```

   Equivale a: `cloudflared tunnel --url http://localhost:5173`

4. Abre la URL tipo `https://xxxx.trycloudflare.com`.

**Túnel nombrado (dominio fijo) con Vite:** si el `Host` no es `*.trycloudflare.com`, añade en `frontend/.env`:

```env
VITE_TUNNEL_ALLOWED_HOSTS=sunday.tudominio.com
```

(varios hosts separados por comas)

---

## Modo 2: Producción (Nginx en 5173) + túnel

1. Backend: `npm start` en `backend/` (o servicio equivalente).
2. Nginx sirviendo `frontend/dist` en **5173** (según la guía de instalación).
3. Túnel hacia el mismo puerto:

   ```powershell
   cloudflared tunnel --url http://127.0.0.1:5173
   ```

4. En `backend/.env` (producción):

   - `NODE_ENV=production`
   - `ALLOWED_ORIGINS` incluyendo al menos: `http://127.0.0.1:5173`, la IP LAN si aplica, y **`https://<tu-subdominio>.trycloudflare.com`** (o tu dominio con túnel nombrado). La URL del quick tunnel **cambia** al reiniciar `cloudflared`; habrá que actualizar `ALLOWED_ORIGINS` o usar **túnel nombrado + dominio propio**.
   - `FRONTEND_URL=http://127.0.0.1:5173` (recomendado para generación de PDF en el mismo equipo).

---

## Notas

- Quick tunnel: URL nueva en cada arranque salvo túnel nombrado en Cloudflare.
- Si el backend no está en marcha, la SPA puede cargar pero fallarán login y API.
- Para acceso solo LAN, el túnel no es obligatorio; la guía de servidor usa Nginx en la red local.
