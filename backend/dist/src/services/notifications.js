"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findManyByUserId = findManyByUserId;
exports.markAsRead = markAsRead;
exports.markAllAsRead = markAllAsRead;
async function findManyByUserId(prisma, userId) {
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
