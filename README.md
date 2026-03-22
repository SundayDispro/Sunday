# Sunday

Aplicación web (React + Vite) con API en Node.js (Express), tiempo real (Socket.IO) y persistencia en **PostgreSQL** vía Prisma.

## Estructura del repositorio

| Carpeta | Contenido |
|--------|-----------|
| `backend/` | API REST, WebSockets, Prisma, generación de PDF |
| `frontend/` | SPA React, PWA, proxy de desarrollo hacia el API |
| `docs/` | Guías (p. ej. PostgreSQL en Windows) |
| `ops/` | Scripts auxiliares (p. ej. creación de usuario/base en Postgres) |

## Requisitos

- **Node.js** (LTS recomendado) y npm
- **PostgreSQL** instalado y en marcha (puerto típico `5432`)

## Inicio rápido (desarrollo)

1. **Base de datos**  
   Sigue [`docs/DEV_SETUP_POSTGRES.md`](docs/DEV_SETUP_POSTGRES.md): crea usuario/base (puedes usar [`ops/setup-local-postgres.sql`](ops/setup-local-postgres.sql)) y alinea `DATABASE_URL` con tu instalación.

2. **Backend**

   ```powershell
   Set-Location backend
   Copy-Item .env.example .env
   # Edita .env: DATABASE_URL, JWT_SECRET (obligatorio), ALLOWED_ORIGINS si hace falta
   npm install
   npx prisma generate
   npx prisma migrate deploy
   npm run seed
   npm run dev
   ```

   El API queda en **http://localhost:3001** (o el `PORT` definido en `.env`).

3. **Frontend** (otra terminal)

   ```powershell
   Set-Location frontend
   npm install
   npm run dev
   ```

   Abre la URL que indique Vite (por defecto **http://localhost:5173**). Las rutas `/api` y `/uploads` se proxifican al backend.

Tras el seed, credenciales de prueba habituales: usuario **`ADMIN`**, contraseña **`root`** (ver documentación del seed si cambia).

## Documentación

- [`docs/DEV_SETUP_POSTGRES.md`](docs/DEV_SETUP_POSTGRES.md) — PostgreSQL nativo en Windows, migraciones, seed, producción
- [`docs/CLOUDFLARE_QUICK_TUNNEL.md`](docs/CLOUDFLARE_QUICK_TUNNEL.md) — probar la app desde otra red con Cloudflare Quick Tunnel (`npm run tunnel` en `frontend/`)
- [`docs/ACCESO_REMOTO_SSH_Y_TUNEL.md`](docs/ACCESO_REMOTO_SSH_Y_TUNEL.md) — SSH desde casa (Tailscale / NAT), túnel Cloudflare **nombrado** para URL estable
- [`SUNDAY_TECHNICAL_AUDIT.md`](SUNDAY_TECHNICAL_AUDIT.md) — auditoría técnica y arquitectura

## README por paquete

- [`backend/README.md`](backend/README.md)
- [`frontend/README.md`](frontend/README.md)
