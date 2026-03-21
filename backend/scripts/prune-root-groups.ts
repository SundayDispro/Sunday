/**
 * Deja como máximo N grupos raíz (sin parentGroupId) por tablero.
 * Borra el resto; items y subgrupos asociados se eliminan en cascada (schema Prisma).
 *
 * Uso: npx ts-node scripts/prune-root-groups.ts
 * Opcional: KEEP=3 npx ts-node scripts/prune-root-groups.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const KEEP = Math.max(1, parseInt(process.env.KEEP || '2', 10) || 2);

async function main() {
  const boards = await prisma.board.findMany({
    select: { id: true, name: true, workspace: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });

  let totalDeleted = 0;

  for (const board of boards) {
    const roots = await prisma.group.findMany({
      where: { boardId: board.id, parentGroupId: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, position: true },
    });

    if (roots.length <= KEEP) {
      console.log(
        `[OK] ${board.workspace.name} / ${board.name}: ${roots.length} grupo(s) raíz (nada que borrar)`
      );
      continue;
    }

    const toDelete = roots.slice(KEEP);
    for (const g of toDelete) {
      await prisma.group.delete({ where: { id: g.id } });
    }
    totalDeleted += toDelete.length;
    console.log(
      `[DEL] ${board.workspace.name} / ${board.name}: mantenidos ${KEEP}, eliminados ${toDelete.length} → ${toDelete.map((x) => x.name).join(', ')}`
    );
  }

  console.log(`\nListo. Grupos raíz eliminados en total: ${totalDeleted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
