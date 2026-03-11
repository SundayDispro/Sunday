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
const prisma = new client_1.PrismaClient();
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
// Health check (for frontend to verify backend is up)
app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true });
});
// Get all boards (for sidebar list)
app.get('/api/boards', async (req, res) => {
    try {
        const boards = await prisma.board.findMany({
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, workspaceId: true },
        });
        res.json(boards);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch boards' });
    }
});
// Create a new board (REST – no dependency on socket)
app.post('/api/boards', async (req, res) => {
    try {
        let workspace = await prisma.workspace.findFirst();
        if (!workspace) {
            workspace = await prisma.workspace.create({
                data: { name: 'Main Workspace' },
            });
        }
        const name = (req.body?.name && String(req.body.name).trim()) || 'Nuevo tablero';
        const newBoard = await prisma.board.create({
            data: { name, workspaceId: workspace.id },
            select: { id: true, name: true, workspaceId: true },
        });
        res.status(201).json(newBoard);
    }
    catch (error) {
        console.error('Error creating board:', error);
        res.status(500).json({ error: 'Failed to create board' });
    }
});
// Get the first Board dynamically
app.get('/api/boards/first', async (req, res) => {
    try {
        const board = await prisma.board.findFirst({
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
        res.json(board);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch' });
    }
});
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
        if (!board)
            return res.status(404).json({ error: 'Board not found' });
        res.json(board);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch board' });
    }
});
// Get updates for an item
app.get('/api/items/:itemId/updates', async (req, res) => {
    try {
        const updates = await prisma.update.findMany({
            where: { itemId: req.params.itemId },
            orderBy: { createdAt: 'desc' },
            include: {
            // Since we didn't define a relation name, Prisma allows us to include the User if we had a relation.
            // Wait, schema.prisma doesn't have a formal relation from Update to User!
            // Let's just return what we have and we'll fix the schema in a bit if needed. For now, authorId is just a string.
            }
        });
        // Let's manually fetch users for now to avoid another schema migration just for a relation
        const userIds = [...new Set(updates.map(u => u.authorId))];
        const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
        const userMap = users.reduce((acc, u) => ({ ...acc, [u.id]: u }), {});
        const enriched = updates.map(u => ({ ...u, authorUser: userMap[u.authorId] }));
        res.json(enriched);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch updates' });
    }
});
// --- Auth & Users API ---
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
        }
        const user = await prisma.user.findUnique({ where: { username } });
        // In a real app use bcrypt.compare, here we use simple text for demo since it's a clone test
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        res.json(user);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error en el login' });
    }
});
// Admin endpoint to create a new user
app.post('/api/users', async (req, res) => {
    try {
        const { username, name, password, adminId } = req.body;
        // Simple admin check
        const reqAdmin = await prisma.user.findUnique({ where: { id: adminId } });
        if (!reqAdmin || reqAdmin.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Sólo los administradores pueden crear usuarios' });
        }
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'El usuario ya está registrado' });
        }
        const initials = name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
        const colors = ['#00c875', '#fdab3d', '#e2445c', '#5559df', '#6e3cbb', '#0073ea'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const newUser = await prisma.user.create({
            data: {
                username,
                name,
                initials,
                color,
                password, // Accept password from admin
                role: 'USER'
            }
        });
        io.emit('user_added', newUser); // Broadcast if needed
        res.json(newUser);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
});
// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
        res.json(users);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});
// Socket.io real-time connection handler
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    // ── ITEM EVENTS ──────────────────────────────────────────────────────────
    socket.on('update_item_name', async (data) => {
        try {
            const updated = await prisma.item.update({
                where: { id: data.itemId },
                data: { name: data.name },
                include: { columnValues: true },
            });
            io.emit('item_updated', updated);
        }
        catch (e) {
            console.error('Error updating item name:', e);
        }
    });
    socket.on('add_item', async (data) => {
        try {
            const { groupId, name, position } = data;
            const newItem = await prisma.item.create({
                data: { groupId, name, position },
                include: { columnValues: true }
            });
            io.emit('item_added', newItem);
        }
        catch (e) {
            console.error('Error adding item:', e);
        }
    });
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
    // ── COLUMN VALUE EVENTS ──────────────────────────────────────────────────
    socket.on('update_column_value', async (data) => {
        try {
            const { itemId, columnId, value } = data;
            const updated = await prisma.columnValue.upsert({
                where: { itemId_columnId: { itemId, columnId } },
                update: { value },
                create: { itemId, columnId, value }
            });
            io.emit('column_value_updated', updated);
        }
        catch (e) {
            console.error('Error updating column value:', e);
        }
    });
    // ── BOARD EVENTS ───────────────────────────────────────────────────────────
    socket.on('rename_board', async (data) => {
        try {
            const { boardId, name } = data;
            const updated = await prisma.board.update({ where: { id: boardId }, data: { name: name.trim() } });
            io.emit('board_renamed', updated);
        }
        catch (e) {
            console.error('Error renaming board:', e);
        }
    });
    socket.on('add_board', async (data) => {
        try {
            let workspace = await prisma.workspace.findFirst();
            if (!workspace) {
                workspace = await prisma.workspace.create({
                    data: { name: 'Main Workspace' },
                });
            }
            const name = (data.name && String(data.name).trim()) || 'Nuevo tablero';
            const newBoard = await prisma.board.create({
                data: { name, workspaceId: workspace.id },
            });
            io.emit('board_added', newBoard);
        }
        catch (e) {
            console.error('Error adding board:', e);
        }
    });
    // ── GROUP EVENTS ──────────────────────────────────────────────────────────
    socket.on('delete_group', async (data) => {
        try {
            const { groupId } = data;
            await prisma.group.delete({ where: { id: groupId } });
            io.emit('group_deleted', { groupId });
        }
        catch (e) {
            console.error('Error deleting group:', e);
        }
    });
    socket.on('add_group', async (data) => {
        try {
            const { boardId, name, color, position } = data;
            const newGroup = await prisma.group.create({
                data: { boardId, name, color, position },
                include: { items: { include: { columnValues: true } } }
            });
            io.emit('group_added', newGroup);
        }
        catch (e) {
            console.error('Error adding group:', e);
        }
    });
    socket.on('rename_group', async (data) => {
        try {
            const { groupId, name } = data;
            const updated = await prisma.group.update({ where: { id: groupId }, data: { name } });
            io.emit('group_renamed', updated);
        }
        catch (e) {
            console.error('Error renaming group:', e);
        }
    });
    socket.on('move_group', async (data) => {
        try {
            const { groupId, newPosition } = data;
            const updated = await prisma.group.update({ where: { id: groupId }, data: { position: newPosition } });
            socket.broadcast.emit('group_moved', updated);
        }
        catch (e) {
            console.error('Error moving group:', e);
        }
    });
    // ── COLUMN EVENTS ─────────────────────────────────────────────────────────
    socket.on('add_column', async (data) => {
        try {
            const { boardId, title, type, position, settings } = data;
            const newColumn = await prisma.boardColumn.create({
                data: { boardId, title, type, position, settings: settings || null }
            });
            io.emit('column_added', newColumn);
        }
        catch (e) {
            console.error('Error adding column:', e);
        }
    });
    socket.on('rename_column', async (data) => {
        try {
            const { columnId, title } = data;
            const updated = await prisma.boardColumn.update({ where: { id: columnId }, data: { title } });
            io.emit('column_renamed', updated);
        }
        catch (e) {
            console.error('Error renaming column:', e);
        }
    });
    socket.on('delete_column', async (data) => {
        try {
            const { columnId } = data;
            await prisma.columnValue.deleteMany({ where: { columnId } });
            await prisma.boardColumn.delete({ where: { id: columnId } });
            io.emit('column_deleted', { columnId });
        }
        catch (e) {
            console.error('Error deleting column:', e);
        }
    });
    // ── UPDATE / COMMENT EVENTS ───────────────────────────────────────────────
    socket.on('add_update', async (data) => {
        try {
            const { itemId, content, authorId } = data;
            const newUpdate = await prisma.update.create({
                data: { itemId, content, authorId: authorId }
            });
            // Let's also fetch the author user to send back the full object
            const user = await prisma.user.findUnique({ where: { id: authorId } });
            const enrichedUpdate = { ...newUpdate, authorUser: user };
            io.emit('update_added', enrichedUpdate);
        }
        catch (e) {
            console.error('Error adding update:', e);
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
