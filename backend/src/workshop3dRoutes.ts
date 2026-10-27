// ============================================================================
// Sunday 3D Workshop — Backend API wiring
// Projects, Quotations & Materials Catalog persistence
//
// La lógica vive en `workshop3dRouter.ts` (probable sin base de datos).
// Aquí solo se conecta Prisma y la autorización real de la app.
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireAuth, requireRoles } from './auth';
import { classifyDatabaseFailure } from './httpAuth';
import {
  createWorkshop3DRouter,
  WORKSHOP_3D_ALLOWED_ROLES,
  type Workshop3DStore,
} from './workshop3dRouter';

const prisma = new PrismaClient();

// Los delegados de Prisma son genéricos y más estrictos que la superficie
// mínima que consumen las rutas; el cast queda confinado a este cableado.
const store = prisma as unknown as Workshop3DStore;

const router = createWorkshop3DRouter({
  store,
  // La restricción de rol se aplica en el backend a todas las rutas del taller;
  // ocultar la sección en el frontend es solo UX. `TALLER` queda fuera.
  authenticate: [
    authenticateToken,
    requireAuth,
    requireRoles([...WORKSHOP_3D_ALLOWED_ROLES]),
  ],
  // El catálogo es global y el esquema lo documenta como editable por ADMIN.
  catalogWriter: requireRoles(['ADMIN']),
  classifyFailure: classifyDatabaseFailure,
});

export default router;
