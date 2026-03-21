import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL no definido');
  process.exit(1);
}

const adminUrl = url.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
const c = new pg.Client({ connectionString: adminUrl });
await c.connect();
const { rows } = await c.query("SELECT 1 FROM pg_database WHERE datname = 'sunday'");
if (rows.length) {
  console.log('Base de datos sunday ya existe.');
} else {
  await c.query('CREATE DATABASE sunday');
  console.log('Base de datos sunday creada.');
}
await c.end();
