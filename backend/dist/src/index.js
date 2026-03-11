"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient({
    datasources: {
        db: { url: 'file:./prisma/dev.db' }
    }
});
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
});
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Get a full Board with its groups, items and all dynamic column values
app.get('/api/boards/:id', async (req, res) => {
    try {
        const board = await prisma.board.findUnique({
            where: { id: req.params.id },
            include: {
                groups: {
                    orderBy: { position: 'asc' },
                    include: {
                        items: {
                            orderBy: { position: 'asc' },
                            include: { columnValues: true }
                        }
                    }
                },
                columns: {
                    orderBy: { position: 'asc' }
                }
            }
        });
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        res.json(board);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch board' });
    }
});
// Socket.io real-time connection handler
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    // Update item (like name changes)
    socket.on('update_item_name', async (data) => {
        try {
            const updated = await prisma.item.update({
                where: { id: data.itemId },
                data: { name: data.name }
            });
            socket.broadcast.emit('item_updated', updated);
        }
        catch (e) {
            console.error('Error updating item name:', e);
        }
    });
    // Upsert dynamic column values (like choosing a Status on a specific row)
    socket.on('update_column_value', async (data) => {
        try {
            const { itemId, columnId, value } = data;
            const updated = await prisma.columnValue.upsert({
                where: { itemId_columnId: { itemId, columnId } },
                update: { value },
                create: { itemId, columnId, value }
            });
            // Broadcast to other clients to patch their local table states instantly
            socket.broadcast.emit('column_value_updated', updated);
        }
        catch (e) {
            console.error('Error updating column value:', e);
        }
    });
    // Reorder or Move items across groups
    socket.on('move_item', async (data) => {
        try {
            const { itemId, newGroupId, newPosition } = data;
            const updated = await prisma.item.update({
                where: { id: itemId },
                data: { groupId: newGroupId, position: newPosition }
            });
            socket.broadcast.emit('item_moved', updated);
        }
        catch (err) {
            console.error('Error moving item:', err);
        }
    });
    // Reorder block of groups
    socket.on('move_group', async (data) => {
        try {
            const { groupId, newPosition } = data;
            const updated = await prisma.group.update({
                where: { id: groupId },
                data: { position: newPosition }
            });
            socket.broadcast.emit('group_moved', updated);
        }
        catch (e) {
            console.error('Error moving group:', e);
        }
    });
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Sunday Server running on port ${PORT}`);
});
