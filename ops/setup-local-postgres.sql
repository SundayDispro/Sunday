-- Ejecutar en pgAdmin (Query Tool) o psql, conectado como superusuario (p. ej. postgres).
-- Si algún paso dice "already exists", puedes ignorarlo.

-- 1) Usuario (misma contraseña que backend/.env.example)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sunday_user') THEN
    CREATE ROLE sunday_user WITH LOGIN PASSWORD 'sunday_pass';
  END IF;
END
$$;

-- 2) Base de datos (si ya existe, omite esta línea)
CREATE DATABASE sunday OWNER sunday_user;
