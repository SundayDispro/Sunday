import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Sunday (Monday Clone) base data...');

  // 1. Flush existing data (Optional, useful for rapid testing)
  await prisma.columnValue.deleteMany({});
  await prisma.boardColumn.deleteMany({});
  await prisma.item.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.board.deleteMany({});
  await prisma.workspace.deleteMany({});

  // --- Create ADMIN User ---
  const admin = await prisma.user.create({
    data: {
      username: 'ADMIN',
      name: 'Administrador Principal',
      initials: 'AD',
      color: '#00c875',
      password: 'root', // As requested
      role: 'ADMIN',
    }
  });

  // 2. Create default Workspace
  const workspace = await prisma.workspace.create({
    data: { name: 'Main Workspace' },
  });

  // 3. Create Demo Board
  const board = await prisma.board.create({
    data: { name: 'Ejemplo', workspaceId: workspace.id },
  });

  // 4. Create Groups (Pendientes and Completado)
  const group1 = await prisma.group.create({
    data: { name: 'Pendientes', color: '#1d60f5', position: 1, boardId: board.id },
  });
  
  const group2 = await prisma.group.create({
    data: { name: 'Completado', color: '#00c875', position: 2, boardId: board.id },
  });

  // 5. Create Dynamic Columns (As requested in image)
  const colResponsable = await prisma.boardColumn.create({ data: { title: 'Responsable', type: 'person', position: 1, boardId: board.id } });
  
  const colEstado = await prisma.boardColumn.create({ 
    data: { 
      title: 'Estado', type: 'status', position: 2, boardId: board.id,
      settings: JSON.stringify({ 
         options: [
            { id: 'listo', label: 'Listo', color: '#00c875' },
            { id: 'curso', label: 'En curso', color: '#fdab3d' },
            { id: 'detenido', label: 'Detenido', color: '#e2445c' },
            { id: 'default', label: '', color: '#c4c4c4' }
         ] 
      })
    } 
  });
  
  const colVencimiento = await prisma.boardColumn.create({ data: { title: 'Vencimiento', type: 'date', position: 3, boardId: board.id } });
  
  const colPrioridad = await prisma.boardColumn.create({ 
      data: { 
        title: 'Prioridad', type: 'status', position: 4, boardId: board.id,
        settings: JSON.stringify({
            options: [
                { id: 'alta', label: 'Alta', color: '#401694' },
                { id: 'media', label: 'Media', color: '#5559df' },
                { id: 'baja', label: 'Baja', color: '#579bfc' },
                { id: 'default', label: '', color: '#c4c4c4' }
            ]
        })
      } 
  });

  const colArchivos = await prisma.boardColumn.create({ data: { title: 'Archivos', type: 'file', position: 5, boardId: board.id } });
  const colCronograma = await prisma.boardColumn.create({ data: { title: 'Cronograma', type: 'timeline', position: 6, boardId: board.id } });

  // 6. Create Items with their exact requested states
  const item1 = await prisma.item.create({ data: { name: 'Tarea 1', position: 1, groupId: group1.id } });
  const item2 = await prisma.item.create({ data: { name: 'Tarea 2', position: 2, groupId: group1.id } });
  const item3 = await prisma.item.create({ data: { name: 'Tarea 3', position: 3, groupId: group1.id } });

  // "Tarea 1": En curso (Naranja), Prioridad Baja (Azul)
  await prisma.columnValue.createMany({
      data: [
          { itemId: item1.id, columnId: colEstado.id, value: JSON.stringify({ optionId: 'curso' }) },
          { itemId: item1.id, columnId: colPrioridad.id, value: JSON.stringify({ optionId: 'baja' }) }
      ]
  });

  // "Tarea 2": Listo (Verde), Prioridad Alta (Morada)
  await prisma.columnValue.createMany({
      data: [
          { itemId: item2.id, columnId: colEstado.id, value: JSON.stringify({ optionId: 'listo' }) },
          { itemId: item2.id, columnId: colPrioridad.id, value: JSON.stringify({ optionId: 'alta' }) }
      ]
  });

  // "Tarea 3": Detenido (Rojo), Prioridad Media (Azul oscuro)
  await prisma.columnValue.createMany({
      data: [
          { itemId: item3.id, columnId: colEstado.id, value: JSON.stringify({ optionId: 'detenido' }) },
          { itemId: item3.id, columnId: colPrioridad.id, value: JSON.stringify({ optionId: 'media' }) }
      ]
  });

  console.log('✅ Seed successful.');
  console.log(`👉 Open http://localhost:3001/api/boards/${board.id} to see raw JSON`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
