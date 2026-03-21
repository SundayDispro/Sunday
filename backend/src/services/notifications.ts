/**
 * Servicio de notificaciones (Fase 5 — extracción desde index.ts).
 * Centraliza la lógica de persistencia para el dominio de notificaciones.
 */
import type { PrismaClient } from '@prisma/client';

export async function findManyByUserId(prisma: PrismaClient, userId: string) {
  // TODO(db/perf): reemplazar include profundo por select mínimo y payload acotado.
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      item: {
        include: {
          columnValues: true,
          group: { include: { board: true } },
        },
      },
    },
  });
}

export async function markAsRead(prisma: PrismaClient, id: string, userId: string) {
  // IDOR guard: esta operación debe estar acotada a un usuario.
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { read: true },
  });
}

export async function markAllAsRead(prisma: PrismaClient, userId: string) {
  return prisma.notification.updateMany({
    where: { userId },
    data: { read: true },
  });
}
