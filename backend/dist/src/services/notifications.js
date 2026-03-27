"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findManyByUserId = findManyByUserId;
exports.findManyByUserIdPaginated = findManyByUserIdPaginated;
exports.markAsRead = markAsRead;
exports.markAllAsRead = markAllAsRead;
exports.countUnreadForUser = countUnreadForUser;
exports.countRecentUnreadForUser = countRecentUnreadForUser;
const notificationInclude = {
    item: {
        include: {
            columnValues: true,
            group: { include: { board: true } },
        },
    },
};
async function findManyByUserId(prisma, userId) {
    // TODO(db/perf): reemplazar include profundo por select mínimo y payload acotado.
    return prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: notificationInclude,
    });
}
async function findManyByUserIdPaginated(prisma, userId, opts) {
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
async function markAsRead(prisma, id, userId) {
    // IDOR guard: esta operación debe estar acotada a un usuario.
    return prisma.notification.updateMany({
        where: { id, userId },
        data: { read: true },
    });
}
async function markAllAsRead(prisma, userId) {
    return prisma.notification.updateMany({
        where: { userId },
        data: { read: true },
    });
}
/** Conteo exacto de notificaciones no leídas (badge, sin depender de paginación). */
async function countUnreadForUser(prisma, userId) {
    return prisma.notification.count({
        where: { userId, read: false },
    });
}
/** No leídas creadas en la ventana temporal (p. ej. últimos 2 min) — indicador “reciente”. */
async function countRecentUnreadForUser(prisma, userId, withinMs) {
    const since = new Date(Date.now() - withinMs);
    return prisma.notification.count({
        where: {
            userId,
            read: false,
            createdAt: { gte: since },
        },
    });
}
