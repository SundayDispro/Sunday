## Fase 1 – Migración a PostgreSQL con campos JSONB sombra

Esta guía resume los pasos para preparar y usar PostgreSQL como base de datos de Sunday en entorno **local** sin perder datos de SQLite (`backend/prisma/dev.db`).

### 1. Cambios de esquema (resumen)

- `Workspace`:
  - `panelNotes: String?` (legacy) + `panelNotesJson: Json?`
  - `docGroups: String?` (legacy) + `docGroupsJson: Json?`
- `BoardColumn`:
  - `settings: String?` (legacy) + `settingsJson: Json?`
- `ColumnValue`:
  - `value: String` (legacy) + `valueJson: Json?`
- `Doc`:
  - `content: String` (legacy) + `contentJson: Json?`
- `TemplateConfig`:
  - `fieldPositions: String` (legacy) + `fieldPositionsJson: Json?`
  - `customBoxes: String` (legacy) + `customBoxesJson: Json?`
- `FeedPost`:
  - `mentionedUserIds: String` (legacy) + `mentionedUserIdsJson: Json?`

Índices nuevos:

- `Notification`:
  - `@@index([userId, read, createdAt(sort: desc)])`
  - `@@index([itemId, createdAt])`
- `FeedPost`:
  - `@@index([createdAt(sort: desc)])`
  - `@@index([authorId, createdAt(sort: desc)])`

### 2. Preparar PostgreSQL local

1. Instala PostgreSQL en la máquina local (o en una VM accesible).
2. Crea una base de datos para Sunday, por ejemplo `sunday_local`.
3. Crea un usuario con permisos sobre esa base de datos.

Ejemplo de cadena de conexión (ajústala a tu entorno):

```txt
DATABASE_URL="postgresql://usuario:password@localhost:5432/sunday_local?schema=public"
```

### 3. Configurar `.env` del backend

En `backend/.env` define (o actualiza) la variable:

```txt
DATABASE_URL="postgresql://usuario:password@localhost:5432/sunday_local?schema=public"
```

Asegúrate de que el backend está detenido antes de cambiar de SQLite a Postgres.

### 4. Crear el esquema en PostgreSQL con Prisma Migrate

Desde PowerShell:

```powershell
Set-Location "c:\Users\aleja\Desktop\Sunday\Sunday\backend"
npx prisma migrate dev --name init_postgres_jsonb
```

Esto creará en PostgreSQL todas las tablas, campos legacy y campos JSONB sombra, junto con los índices.

Para un servidor nuevo (sin datos previos) bastaría con:

```powershell
Set-Location "c:\Users\aleja\Desktop\Sunday\Sunday\backend"
npx prisma migrate deploy
```

### 5. Exportar datos desde SQLite

Hay dos opciones principales:

#### Opción A – Exportar con `sqlite3` a JSON (rápida para desarrollo)

1. Asegúrate de que el backend está detenido.
2. Desde PowerShell, sitúate en la carpeta del backend:

```powershell
Set-Location "c:\Users\aleja\Desktop\Sunday\Sunday\backend"
```

3. Ejecuta exportaciones por tabla (requiere tener `sqlite3` en el PATH):

```powershell
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM User;"           > ".\sqlite-export\user.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM Workspace;"      > ".\sqlite-export\workspace.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM Board;"          > ".\sqlite-export\board.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM Group;"          > ".\sqlite-export\group.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM Item;"           > ".\sqlite-export\item.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM BoardColumn;"    > ".\sqlite-export\boardColumn.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM ColumnValue;"    > ".\sqlite-export\columnValue.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM Doc;"            > ".\sqlite-export\doc.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM TemplateConfig;" > ".\sqlite-export\templateConfig.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM Notification;"   > ".\sqlite-export\notification.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM FeedPost;"       > ".\sqlite-export\feedPost.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM PushSubscription;" > ".\sqlite-export\pushSubscription.json"
sqlite3 ".\prisma\dev.db" ".mode json" ".headers on" "SELECT * FROM CalendarEvent;"  > ".\sqlite-export\calendarEvent.json"
```

Cada fichero JSON contendrá las filas de la tabla correspondiente.

#### Opción B – Script Node para exportar a un único JSON

Como alternativa más cómoda, se puede escribir un script Node/TypeScript que use Prisma con SQLite para leer todas las tablas y generar un solo fichero `sqlite-dump.json`. Esta opción se dejará para una iteración posterior si se necesita.

### 6. Importar datos en PostgreSQL y rellenar campos JSONB

Se recomienda usar un script dedicado, por ejemplo:

- `backend/scripts/migrateSqliteToPostgres.ts`

Flujo general del script:

1. Leer los JSON exportados desde `backend/sqlite-export/*.json` o un `sqlite-dump.json` único.
2. Insertar datos en PostgreSQL en este orden (respetando IDs existentes):
   - `User`
   - `Workspace`
   - `Board`
   - `Group`
   - `Item`
   - `BoardColumn`
   - `ColumnValue`
   - `Doc`
   - `TemplateConfig`
   - `Notification`
   - `FeedPost`
   - `PushSubscription`
   - `CalendarEvent`
3. Por cada registro, copiar los campos legacy (`String`) y rellenar los campos `Json?` con un helper de parseo seguro:
   - Si el `String` es JSON válido → guardar el objeto en el campo `Json`.
   - Si el `String` está vacío o es inválido → dejar el campo `Json` en `null` y conservar solo el legacy.
4. Procesar en lotes (por ejemplo, de 100 o 500 registros) para evitar picos de memoria.
5. Al final, comparar conteos de filas por tabla entre el origen (SQLite) y el destino (Postgres).

Ejecución esperada en PowerShell (tras compilar a JS o usando ts-node):

```powershell
Set-Location "c:\Users\aleja\Desktop\Sunday\Sunday\backend"
node .\scripts\migrateSqliteToPostgres.js
```

o bien:

```powershell
npx ts-node .\scripts\migrateSqliteToPostgres.ts
```

### 7. Reiniciar backend apuntando a PostgreSQL

Una vez ejecutado el script de migración y verificado que las tablas en Postgres contienen el mismo número de filas que en SQLite:

1. Asegúrate de que en `backend/.env` `DATABASE_URL` apunta al PostgreSQL correcto.
2. Inicia el backend en modo desarrollo:

```powershell
Set-Location "c:\Users\aleja\Desktop\Sunday\Sunday\backend"
npm run dev
```

3. Desde el frontend, valida:
   - Login de usuarios.
   - Listado de tableros y workspaces.
   - Items, columnas y valores.
   - Docs, feed y notificaciones.
   - Eventos de calendario.

Si todo funciona igual que antes, la migración de la Fase 1 en entorno local se considera completada.

