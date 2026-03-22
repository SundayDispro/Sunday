# Cloudflare Tunnel con Sunday

El túnel cifra el tráfico y expone tu app por HTTPS **sin abrir puertos en el router**. Sunday está preparado para dos escenarios: **desarrollo (Vite)** y **producción (Nginx)**.

> **URL que no cambie y servicio permanente:** el modo *quick* (`cloudflared tunnel --url …` → `*.trycloudflare.com`) **no** ofrece URL fija ni SLA. Para un hostname estable (`https://sunday.tudominio.com`) y `cloudflared` como servicio de Windows, sigue [`docs/ACCESO_REMOTO_SSH_Y_TUNEL.md`](ACCESO_REMOTO_SSH_Y_TUNEL.md) y `ops/cloudflared-named-tunnel.example.yml`.

## Requisito: `cloudflared`

- **Windows:** [Instalar cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) o `winget install Cloudflare.cloudflared`
- Comprueba: `cloudflared --version`

---

## ¿Lo que ya configuramos (migraciones, build, `.env`) afecta al túnel?

**No lo rompe.** El túnel solo reenvía HTTP(S) a un puerto local. Lo que sí debe cuadrar es:

| Pieza | Quick tunnel (`*.trycloudflare.com`) | Producción `NODE_ENV=production` |
|--------|--------------------------------------|-----------------------------------|
| **Vite `allowedHosts`** | Incluye `*.trycloudflare.com` en `vite.config.ts`. Opcional: `VITE_TUNNEL_ALLOWED_HOSTS` en `.env` para un hostname de túnel nombrado (dominio propio). | No aplica (no usas Vite en prod). |
| **`ALLOWED_ORIGINS` (backend)** | Con `NODE_ENV` distinto de `production`, el backend suele ser permisivo en CORS (desarrollo). | Lista LAN + localhost. Para **Quick Tunnel** (`*.trycloudflare.com`), cada reinicio de `cloudflared` cambia la URL: usa **`ALLOW_TRYCLOUDFLARE_ORIGINS=1`** en `backend/.env` para aceptar cualquier `https://*.trycloudflare.com` (además de tu lista), o añade cada URL nueva a `ALLOWED_ORIGINS`. Sin coincidencia de origen, la app carga en blanco o sin datos (CORS bloquea `/api`). |
| **`FRONTEND_URL` (backend)** | Puppeteer abre `/docs/export` en esta URL para PDFs. En el **servidor** debe seguir siendo **loopback hacia Nginx**, p. ej. `http://127.0.0.1:5173`, aunque los usuarios entren por el túnel. | Igual: no pongas solo la URL pública si el navegador headless no puede resolverla desde el PC servidor. |
| **Frontend compilado** | — | Sin `VITE_API_URL`: rutas relativas `/api`, `/socket.io` → mismo origen a través del túnel. Correcto. |
| **Socket.IO en `npm run dev`** | En localhost/LAN el cliente usa el puerto **3001** directo; en `*.trycloudflare.com` (u host no local) usa **mismo origen** para que Vite proxye `/socket.io`. | Igual que producción: mismo origen vía Nginx. |

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

---

## Si entras por la URL de Cloudflare y “no ves” la app o los datos

Comprueba en este orden:

1. **Backend y Vite en marcha** en el PC servidor (`npm run dev` en `backend/` y en `frontend/`). El túnel solo reenvía al puerto **5173**; si Vite no está levantado, verás error de conexión o página en blanco.
2. **`NODE_ENV=production` y CORS:** en `backend/.env`, `ALLOWED_ORIGINS` debe incluir la URL HTTPS exacta del túnel (`https://….trycloudflare.com`). Si reinicias `cloudflared` y cambia el subdominio, actualiza `ALLOWED_ORIGINS` y reinicia el backend.
3. **Socket.IO:** en desarrollo, si el socket intentara `https://tu-tunel.trycloudflare.com:3001`, fallaría (el 3001 no está expuesto en Internet). El código de Sunday usa **mismo origen** en hosts de túnel para que `/socket.io` pase por Vite → backend.

---

## Cómo seguir desarrollando desde el PC de casa

Tienes el **servidor Sunday** en un PC (oficina) y quieres **editar código** desde casa. El túnel Cloudflare sirve para **probar** la app en el navegador; para **cambiar archivos** lo habitual es no depender del túnel y usar **red + Git + SSH** (o escritorio remoto).

### Opción A — Git (recomendada)

1. **En el PC servidor:** sube el repo a GitHub/GitLab (o un remoto privado) si aún no está: `git remote add origin …`, `git push`.
2. **En el PC de casa:** instala Git y Node.js, clona el mismo repo (`git clone …`).
3. Trabaja en casa con `npm run dev` en `frontend/` y `backend/` como en la oficina (o solo editas y haces `git commit` / `git push`).
4. **En el servidor:** `git pull` y, si aplica, `npm ci`, migraciones Prisma, `npm run build`, reinicio de backend/Nginx según tu despliegue.

Ventaja: no necesitas abrir puertos SSH al mundo; el código viaja por Git.

### Opción B — SSH al PC servidor (edición remota en tiempo real)

1. En el **servidor Windows**, deja el **OpenSSH Server** instalado y el servicio `sshd` en ejecución (ya comprobaste puerto 22 en local).
2. En el **router** de la oficina, si quieres entrar desde fuera de la LAN, tendrías que configurar **reenvío de puerto (NAT)** del puerto 22 hacia ese PC, o usar **VPN** (Tailscale, ZeroTier, WireGuard). Sin eso, SSH solo funciona **dentro de la misma red** (o por VPN).
3. Desde casa, con la IP pública o el nombre de Tailscale:

   ```powershell
   ssh usuario@IP_O_HOST_SERVIDOR
   ```

4. Con **Cursor / VS Code**, la extensión **Remote - SSH** permite abrir la carpeta del proyecto en el servidor y editar allí como si fuera local.

**Seguridad:** si expones SSH a Internet, usa **solo clave pública**, desactiva contraseña, y considera cambiar el puerto o `fail2ban`. Muchas personas prefieren **VPN + SSH** sin abrir el 22 al mundo.

### Opción C — Escritorio remoto

**Escritorio remoto de Windows** o **AnyDesk / Parsec**: controlas el PC servidor en vivo. Útil si no quieres configurar Git o SSH; menos cómodo para flujos con terminal y varias ventanas.

### Resumen práctico

| Objetivo | Herramienta |
|----------|-------------|
| Probar la app desde fuera sin abrir puertos HTTP | **Cloudflare Quick Tunnel** → `https://….trycloudflare.com` |
| Bajar/subir código entre PCs | **Git** + remoto (GitHub, etc.) |
| Editar en el servidor como si estuvieras delante | **SSH** + Cursor/VS Code Remote, o **VPN** + SSH |
| Control total del escritorio | **RDP** / AnyDesk |

Tras cambiar código en el servidor, reinicia **backend** y **frontend** si corres en modo dev, o ejecuta tu script de despliegue si usas Nginx + build.
