/**
 * Asigna rol ADMIN a un usuario por username.
 * Uso: npm run set-admin -- <username>
 * Ejemplo: npm run set-admin -- ADMIN
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2]?.trim();
  if (!username) {
    console.error('Uso: npx ts-node scripts/set-admin.ts <username>');
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`Usuario no encontrado: "${username}"`);
    process.exit(1);
  }
  if (user.role === 'ADMIN') {
    console.log(`El usuario "${username}" ya tiene rol ADMIN.`);
    process.exit(0);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN' },
  });
  console.log(`Rol ADMIN asignado a "${username}" (id: ${user.id}). Cierra sesión y vuelve a entrar para que el frontend use el nuevo rol.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
