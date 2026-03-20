import path from 'path';
import dotenv from 'dotenv';

// Prioridad a backend/.env sobre variables del sistema (p. ej. DATABASE_URL antigua en :5432).
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
