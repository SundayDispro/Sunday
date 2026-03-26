/**
 * Servicio de notificaciones (Fase 5 — extracción desde index.ts).
 * Centraliza la lógica de persistencia para el dominio de notificaciones.
 */
import type { PrismaClient } from '@prisma/client';

const notificationInclude = {
  item: {
    include: {
      columnValues: true,
      group: { include: { board: true } },
    },
  },
} as const;

export async function findManyByUserId(prisma: PrismaClient, userId: string) {
  // TODO(db/perf): reemplazar include profundo por select mínimo y payload acotado.
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: notificationInclude,
  });
}

export async function findManyByUserIdPaginated(
  prisma: PrismaClient,
  userId: string,
  opts: { skip?: number; take?: number; type?: string }
) {
  const take = Math.min(Math.max(opts.take ?? 20, 1), 50);
  const skip = Math.max(opts.skip ?? 0, 0);
  const where = {
    userId,
    ...(opts.type ? { type: opts.type } : {}),
  };
  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip,
    take: take + 1,
    include: notificationInclude,
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, hasMore, nextSkip: skip + items.length };
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

/** Conteo exacto de notificaciones no leídas (badge, sin depender de paginación). */
export async function countUnreadForUser(prisma: PrismaClient, userId: string) {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}

/** No leídas creadas en la ventana temporal (p. ej. últimos 2 min) — indicador “reciente”. */
export async function countRecentUnreadForUser(prisma: PrismaClient, userId: string, withinMs: number) {
  const since = new Date(Date.now() - withinMs);
  return prisma.notification.count({
    where: {
      userId,
      read: false,
      createdAt: { gte: since },
    },
  });
}
