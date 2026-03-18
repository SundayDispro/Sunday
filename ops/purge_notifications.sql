-- Purga semanal de notificaciones leídas antiguas (> 60 días).
-- Criterio: read = true AND createdAt < NOW() - INTERVAL '60 days'
--
-- Nota: Prisma usa nombres de modelo/fields con comillas en PostgreSQL:
-- - Tabla: "Notification"
-- - Columnas: "read", "createdAt"

DELETE FROM "Notification"
WHERE "read" = true
  AND "createdAt" < NOW() - INTERVAL '60 days';

