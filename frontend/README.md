# Sunday — Frontend

SPA con **React 19**, **Vite 7**, **Tailwind CSS**, **Socket.IO client** y soporte **PWA**.

## Requisitos

- Node.js y npm
- Backend en marcha en el puerto configurado (por defecto **3001**), ya que en desarrollo el proxy envía `/api` y `/uploads` allí.

## Instalación y desarrollo

```powershell
Set-Location frontend
npm install
npm run dev
```

Vite suele exponer **http://localhost:5173** (si el puerto está ocupado, elige el siguiente, p. ej. 5174). Asegúrate de que `ALLOWED_ORIGINS` en el backend incluya ese origen.

La configuración del proxy está en [`vite.config.ts`](vite.config.ts) (`/api` → `http://localhost:3001`).

## Build de producción

```powershell
npm run build
```

Genera la carpeta `dist/`. El `prebuild` ejecuta la generación de íconos PWA cuando aplique.

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo Vite |
| `npm run build` | Typecheck + build estático |
| `npm run generate:pwa-icons` | Regenera assets PWA desde el script en `scripts/` |

## Documentación relacionada

- [README raíz](../README.md) — arranque completo monorepo
- [Guía PostgreSQL / backend](../docs/DEV_SETUP_POSTGRES.md)
- [Auditoría técnica](../SUNDAY_TECHNICAL_AUDIT.md)
