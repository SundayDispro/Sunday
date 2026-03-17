"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
/**
 * Crea (o actualiza) un usuario ADMIN con credenciales conocidas.
 *
 * Uso por defecto (sin argumentos):
 *   npx ts-node scripts/force-create-admin.ts
 *
 * Crea/actualiza:
 *   username: admin
 *   password: Sunday2025!
 *
 * También puedes pasar username y password:
 *   npx ts-node scripts/force-create-admin.ts TU_USER TU_PASSWORD
 */
const prisma = new client_1.PrismaClient();
const BCRYPT_ROUNDS = 10;
async function main() {
    const username = (process.argv[2]?.trim() || 'admin').toUpperCase();
    const plainPassword = process.argv[3]?.trim() || 'Sunday2025!';
    console.log(`Forzando usuario ADMIN "${username}"...`);
    const passwordHash = await bcrypt_1.default.hash(plainPassword, BCRYPT_ROUNDS);
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
        await prisma.user.update({
            where: { id: existing.id },
            data: {
                password: passwordHash,
                role: 'ADMIN',
                status: 'offline',
            },
        });
        console.log(`✅ Usuario existente "${username}" actualizado como ADMIN.`);
    }
    else {
        const initials = username.slice(0, 2).toUpperCase();
        const colors = ['#00c875', '#fdab3d', '#e2445c', '#5559df', '#6e3cbb', '#0073ea'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        await prisma.user.create({
            data: {
                username,
                name: 'Admin Sunday',
                initials,
                color,
                password: passwordHash,
                role: 'ADMIN',
                status: 'offline',
            },
        });
        console.log(`✅ Usuario "${username}" creado como ADMIN.`);
    }
    console.log('------------------------------------');
    console.log(`Username: ${username}`);
    console.log(`Password: ${plainPassword}`);
    console.log('Usa estas credenciales en /api/login o en la pantalla de login del frontend.');
}
main()
    .catch((e) => {
    console.error('Error forzando ADMIN:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
