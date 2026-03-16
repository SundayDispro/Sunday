import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth';

/**
 * Resetea la contraseña de un usuario dado su username.
 * Uso:
 *   npx ts-node scripts/reset-password.ts <username> <newPassword>
 *
 * Ejemplo:
 *   npx ts-node scripts/reset-password.ts ADMIN root
 */

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2]?.trim();
  const newPassword = process.argv[3]?.trim();

  if (!username || !newPassword) {
    console.error('Uso: npx ts-node scripts/reset-password.ts <username> <newPassword>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`Usuario no encontrado: "${username}"`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: passwordHash },
  });

  console.log(`✅ Contraseña actualizada para "${username}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

