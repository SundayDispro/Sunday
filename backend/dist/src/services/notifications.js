"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findManyByUserId = findManyByUserId;
exports.markAsRead = markAsRead;
exports.markAllAsRead = markAllAsRead;
async function findManyByUserId(prisma, userId) {
    return prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
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
async function markAsRead(prisma, id) {
    return prisma.notification.update({
        where: { id },
        data: { read: true },
    });
}
async function markAllAsRead(prisma, userId) {
    return prisma.notification.updateMany({
        where: { userId },
        data: { read: true },
    });
}
