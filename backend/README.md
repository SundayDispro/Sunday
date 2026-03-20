# Sunday — Backend

API **Express** con **Prisma** (PostgreSQL), **Socket.IO**, JWT, subida de archivos y generación de PDF.

## Requisitos

- Node.js y npm
- PostgreSQL accesible según `DATABASE_URL`

## Configuración

1. Copia el ejemplo de entorno:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Edita **`.env`** (mínimo):

   - **`DATABASE_URL`** — cadena `postgresql://...` (ver [`../docs/DEV_SETUP_POSTGRES.md`](../docs/DEV_SETUP_POSTGRES.md))
   - **`JWT_SECRET`** — obligatorio en runtime; puedes generar uno con:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - **`PORT`** — por defecto `3001`
   - **`ALLOWED_ORIGINS`** — orígenes del frontend (p. ej. `http://localhost:5173,http://localhost:5174`)

El archivo [`src/env.ts`](src/env.ts) carga `.env` con prioridad sobre variables del sistema Windows (`override: true`), para que el proyecto no quede oculto por un `DATABASE_URL` global.

## Instalación y base de datos

```powershell
Set-Location backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
```

- **Seed**: datos y usuario de prueba (ver salida de `prisma/seed.ts` / documentación principal).
- **Prisma Studio**: `npx prisma studio`

## Desarrollo

```powershell
npm run dev
```

Arranca `ts-node` sobre `src/index.ts` (sin build previo).

## Build y producción

```powershell
npm run build
npm start
```

Ejecuta el JS compilado en `dist/`.

## Scripts útiles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor en caliente (ts-node) |
| `npm run seed` | Ejecuta el seed de Prisma |
| `npm run set-admin` | Script auxiliar de administrador (ver `scripts/set-admin.ts`) |

## Documentación relacionada

- [Guía PostgreSQL (Windows)](../docs/DEV_SETUP_POSTGRES.md)
- [Auditoría técnica](../SUNDAY_TECHNICAL_AUDIT.md)
