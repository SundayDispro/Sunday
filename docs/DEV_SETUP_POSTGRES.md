# PostgreSQL para Sunday (Windows)

El backend usa **Prisma** con **PostgreSQL**. La cadena de conexión va en `backend/.env` como `DATABASE_URL`.

## Problemas habituales

- **500 en login** o mensaje de error de conexión: el backend no puede conectar con la URL configurada.
- **Variable de entorno del sistema**: si en Windows tienes otra `DATABASE_URL` definida a nivel de usuario o máquina, podría pisar el `.env`. El backend carga `backend/src/env.ts` con `override: true` para que **gane el archivo `backend/.env`** del proyecto.

## Desarrollo local o servidor con PostgreSQL nativo

1. Instala [PostgreSQL para Windows](https://www.postgresql.org/download/windows/) (o usa el instalador de EnterpriseDB) y deja el servicio en marcha (puerto por defecto **5432**).

2. Crea usuario y base de datos. Puedes usar **pgAdmin** o **psql** como superusuario (`postgres`) y ejecutar el script:

   `ops/setup-local-postgres.sql`

   (Crea el rol `sunday_user` con contraseña `sunday_pass` y la base `sunday`, alineado con `backend/.env.example`.)

3. Copia `backend/.env.example` a `backend/.env` y ajusta `DATABASE_URL` si usas otro usuario, contraseña, host o puerto:

   ```txt
   DATABASE_URL="postgresql://sunday_user:sunday_pass@127.0.0.1:5432/sunday?schema=public"
   ```

4. En la carpeta `backend`:

   ```powershell
   Set-Location "ruta\al\repo\backend"
   npx prisma migrate deploy
   npm run seed
   ```

5. Reinicia el backend (`npm run dev`). Credenciales de prueba tras el seed: usuario **`ADMIN`**, contraseña **`root`**.

## Servidor Windows (implementación final)

- Instala PostgreSQL en el mismo equipo que servirá la app y configura **firewall** solo si expones el puerto (en muchos despliegues el backend y Postgres van en la misma máquina y no hace falta abrir 5432 al exterior).
- Usa `DATABASE_URL` con el usuario/contraseña reales de producción (no los del ejemplo).
- Genera un **`JWT_SECRET`** fuerte y único; no reutilices el de desarrollo.
- Ajusta **`ALLOWED_ORIGINS`** a la URL HTTPS desde la que se servirá el frontend.
- Planifica **copias de seguridad** de la base de datos (pg_dump u otra herramienta) y prueba la restauración.

## Comprobar conexión

```powershell
Set-Location backend
npx prisma studio
```

O, si prefieres SQL directo, desde pgAdmin o `psql` contra la base `sunday`.
