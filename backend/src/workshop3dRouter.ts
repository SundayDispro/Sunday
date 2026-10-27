// ============================================================================
// Sunday 3D Workshop — Router factory
//
// Se mantiene sin imports de `auth.ts` ni de `PrismaClient` para poder probar
// las rutas con `node --test` y un store en memoria (sin base de datos).
// El cableado de producción vive en `workshop3dRoutes.ts`.
//
// ALCANCE REAL (limitación del esquema): no existe membresía usuario↔workspace.
// Por tanto la autorización verificable es:
//   1. autenticación (la aplica el middleware inyectado),
//   2. el workspace declarado debe existir,
//   3. el proyecto debe pertenecer a ese workspace (sin IDs cruzados),
//   4. el catálogo global solo lo escribe ADMIN (comentario del esquema).
// No se simula aislamiento multiusuario que el modelo actual no puede respaldar:
// cualquier usuario autenticado puede operar sobre cualquier workspace existente,
// igual que en docs/diseños. Ver informe para la limitación pendiente.
// ============================================================================

import { Router, type Request, type RequestHandler, type Response } from 'express';

// Se mantiene sin imports internos (igual que `httpAuth.ts`) para poder
// ejecutarse con `node --test` y type stripping. El clasificador de fallos de
// BD y los mensajes públicos se inyectan desde el cableado de producción.
const INTERNAL_ERROR_MESSAGE = 'Error interno del servidor';
const SERVICE_UNAVAILABLE_MESSAGE =
  'Servicio temporalmente no disponible. Inténtalo de nuevo en unos segundos.';

/** Registro mínimo de workspace que consultan las rutas. */
export interface Workshop3DWorkspaceRef {
  id: string;
}

/**
 * Superficie mínima del cliente Prisma que usan las rutas. Se declara con tipos
 * estructurales (no `PrismaClient`) para poder inyectar un store en memoria en
 * las pruebas. Los `where`/`data` se pasan tal cual a Prisma.
 */
export interface Workshop3DStore {
  workspace: {
    findUnique(args: {
      where: { id: string };
      select?: unknown;
    }): PromiseLike<Workshop3DWorkspaceRef | null>;
  };
  workshop3DProject: {
    findMany(args: {
      where?: unknown;
      orderBy?: unknown;
      select?: unknown;
    }): PromiseLike<unknown[]>;
    findFirst(args: {
      where: unknown;
      select?: unknown;
      include?: unknown;
    }): PromiseLike<unknown | null>;
    create(args: { data: unknown }): PromiseLike<unknown>;
    /**
     * Mutaciones atómicas acotadas al workspace. Prisma 5.21.1 devuelve
     * `{ count }`; `count === 0` significa que el proyecto no existe o no
     * pertenece al workspace declarado.
     */
    updateMany(args: {
      where: { id: string; workspaceId: string };
      data: unknown;
    }): PromiseLike<{ count: number }>;
    deleteMany(args: {
      where: { id: string; workspaceId: string };
    }): PromiseLike<{ count: number }>;
  };
  workshop3DQuotation: {
    create(args: { data: unknown }): PromiseLike<unknown>;
  };
  workshop3DCatalogEntry: {
    findMany(args: { orderBy?: unknown }): PromiseLike<unknown[]>;
    create(args: { data: unknown }): PromiseLike<unknown>;
  };
}

export interface Workshop3DRouterOptions {
  store: Workshop3DStore;
  /** Middlewares de identidad (en producción: authenticateToken + requireAuth). */
  authenticate: RequestHandler[];
  /** Middleware que exige el rol de escritura del catálogo (en producción: ADMIN). */
  catalogWriter: RequestHandler;
  /**
   * Clasificador de fallos de BD: 503 si no está disponible, 500 si es interno.
   * En producción se inyecta `classifyDatabaseFailure` de `httpAuth.ts`.
   */
  classifyFailure: (err: unknown) => { status: 500 | 503 };
}

export const PROJECT_NOT_FOUND = 'Proyecto 3D no encontrado';
export const WORKSPACE_NOT_FOUND = 'Workspace no encontrado';

/**
 * Roles con acceso al Taller 3D. `TALLER` queda fuera a propósito: su flujo es
 * la vista operativa de tablero/calendario, no el editor 3D.
 * Se exporta para que el cableado de producción y las pruebas usen la misma
 * lista y no se desincronicen.
 */
export const WORKSHOP_3D_ALLOWED_ROLES = ['ADMIN', 'VENTAS', 'DISENO', 'USER'] as const;

/** Express 5 tipa params/query como `string | string[]`; normaliza a string o null. */
export function normalizeWorkshopId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    const trimmed = value[0].trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPrismaCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function createWorkshop3DRouter(options: Workshop3DRouterOptions): Router {
  const { store } = options;
  const router = Router();

  /**
   * Traduce fallos de Prisma a respuestas honestas:
   * - P2025 → 404 (registro inexistente, p. ej. borrado entre la lectura y la escritura)
   * - P2003 → 400 (referencia inválida)
   * - P2002 → 409 (conflicto de unicidad)
   * - BD no disponible → 503 (nunca 401/403)
   * - cualquier otro → 500 (nunca 401/403)
   */
  function sendFailure(
    res: Response,
    err: unknown,
    context: string,
    notFoundMessage: string = 'Recurso no encontrado'
  ): void {
    const code = readPrismaCode(err);
    if (code === 'P2025') {
      res.status(404).json({ error: notFoundMessage });
      return;
    }
    if (code === 'P2003') {
      res.status(400).json({ error: 'Referencia inválida' });
      return;
    }
    if (code === 'P2002') {
      res.status(409).json({ error: 'Conflicto: el registro ya existe' });
      return;
    }

    console.error(context, err);
    const { status } = options.classifyFailure(err);
    res.status(status).json({
      error: status === 503 ? SERVICE_UNAVAILABLE_MESSAGE : INTERNAL_ERROR_MESSAGE,
    });
  }

  // Permisos específicos del módulo; no concede bypass automático a ADMIN.
  function requireWorkshopRoles(rolesAllowed: readonly string[]): RequestHandler {
    const allowed = new Set(rolesAllowed);

    return (req, res, next) => {
      if (!req.authUser) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      if (!allowed.has(req.authUser.role)) {
        return res.status(403).json({ error: 'No autorizado' });
      }

      return next();
    };
  }
  // Todas las rutas exigen identidad (401 si falta).
  router.use(...options.authenticate);

  async function workspaceExists(workspaceId: string): Promise<boolean> {
    const workspace = await store.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    return workspace !== null;
  }

  /**
   * Resuelve y valida el workspace declarado por el cliente.
   * Devuelve el id ya estrechado a `string`, o `null` si ya se envió el error.
   */
  async function requireWorkspace(
    res: Response,
    workspaceId: string | null
  ): Promise<string | null> {
    if (!workspaceId) {
      res.status(400).json({ error: 'workspaceId es obligatorio' });
      return null;
    }
    if (!(await workspaceExists(workspaceId))) {
      res.status(404).json({ error: WORKSPACE_NOT_FOUND });
      return null;
    }
    return workspaceId;
  }

  // -------------------------------------------------------------------------
  // Projects CRUD
  // -------------------------------------------------------------------------

  // Listar proyectos del workspace indicado (nunca de todos los workspaces).
  router.get('/projects', async (req: Request, res: Response) => {
    try {
      const workspaceId = await requireWorkspace(
        res,
        normalizeWorkshopId(req.query.workspaceId)
      );
      if (!workspaceId) return;

      const projects = await store.workshop3DProject.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          thumbnailUrl: true,
          workspaceId: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      res.json(projects);
    } catch (err: unknown) {
      sendFailure(res, err, 'Error fetching 3D workshop projects:');
    }
  });

  // Obtener un proyecto por ID, siempre dentro del workspace declarado.
  router.get('/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = normalizeWorkshopId(req.params.id);
      if (!id) {
        return res.status(400).json({ error: 'Identificador de proyecto inválido' });
      }
      const workspaceId = await requireWorkspace(
        res,
        normalizeWorkshopId(req.query.workspaceId)
      );
      if (!workspaceId) return;

      const project = await store.workshop3DProject.findFirst({
        where: { id, workspaceId },
        include: {
          quotations: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      // Un proyecto de otro workspace se trata como inexistente (no se filtra su existencia).
      if (!project) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }

      res.json(project);
    } catch (err: unknown) {
      sendFailure(res, err, 'Error fetching 3D workshop project:', PROJECT_NOT_FOUND);
    }
  });

  // Crear un proyecto: el workspace es obligatorio y debe existir.
  router.post('/projects', requireWorkshopRoles(['ADMIN', 'VENTAS', 'DISENO']), async (req: Request, res: Response) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      const body = isPlainObject(req.body) ? req.body : {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'El nombre del proyecto es obligatorio' });
      }

      const workspaceId = await requireWorkspace(
        res,
        normalizeWorkshopId(body.workspaceId)
      );
      if (!workspaceId) return;

      const sceneData = body.sceneData === undefined ? {} : body.sceneData;
      if (!isPlainObject(sceneData)) {
        return res.status(400).json({ error: 'sceneData debe ser un objeto' });
      }
      const catalogData = body.catalogData;
      if (catalogData !== undefined && catalogData !== null && !isPlainObject(catalogData)) {
        return res.status(400).json({ error: 'catalogData debe ser un objeto o null' });
      }

      const project = await store.workshop3DProject.create({
        data: {
          name,
          description: typeof body.description === 'string' ? body.description.trim() || null : null,
          sceneData,
          catalogData: catalogData ?? null,
          workspaceId,
          // Autoría derivada del token, nunca del cuerpo.
          createdById: authUser.id,
        },
      });

      res.status(201).json(project);
    } catch (err: unknown) {
      sendFailure(res, err, 'Error creating 3D workshop project:');
    }
  });

  // Actualizar un proyecto existente del workspace declarado.
  router.put('/projects/:id', requireWorkshopRoles(['ADMIN', 'VENTAS', 'DISENO']), async (req: Request, res: Response) => {
    try {
      const id = normalizeWorkshopId(req.params.id);
      if (!id) {
        return res.status(400).json({ error: 'Identificador de proyecto inválido' });
      }
      const workspaceId = await requireWorkspace(
        res,
        normalizeWorkshopId(req.query.workspaceId)
      );
      if (!workspaceId) return;

      const body = isPlainObject(req.body) ? req.body : {};
      const data: Record<string, unknown> = {};

      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || !body.name.trim()) {
          return res.status(400).json({ error: 'El nombre del proyecto no puede estar vacío' });
        }
        data.name = body.name.trim();
      }
      if (body.description !== undefined) {
        if (body.description !== null && typeof body.description !== 'string') {
          return res.status(400).json({ error: 'description debe ser texto o null' });
        }
        data.description = typeof body.description === 'string' ? body.description.trim() || null : null;
      }
      if (body.sceneData !== undefined) {
        if (!isPlainObject(body.sceneData)) {
          return res.status(400).json({ error: 'sceneData debe ser un objeto' });
        }
        data.sceneData = body.sceneData;
      }
      if (body.catalogData !== undefined) {
        if (body.catalogData !== null && !isPlainObject(body.catalogData)) {
          return res.status(400).json({ error: 'catalogData debe ser un objeto o null' });
        }
        data.catalogData = body.catalogData;
      }
      if (body.thumbnailUrl !== undefined) {
        if (body.thumbnailUrl !== null && typeof body.thumbnailUrl !== 'string') {
          return res.status(400).json({ error: 'thumbnailUrl debe ser texto o null' });
        }
        data.thumbnailUrl = body.thumbnailUrl;
      }

      // Comprobación y mutación en una sola operación: el where incluye el
      // workspace, así que un ID de otro workspace no puede actualizarse.
      const result = await store.workshop3DProject.updateMany({
        where: { id, workspaceId },
        data,
      });
      if (result.count === 0) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }

      // Se relee para conservar el contrato de respuesta (el proyecto completo),
      // que `updateMany` no devuelve. El where vuelve a incluir el workspace.
      const updated = await store.workshop3DProject.findFirst({
        where: { id, workspaceId },
      });
      if (!updated) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }
      res.json(updated);
    } catch (err: unknown) {
      sendFailure(res, err, 'Error updating 3D workshop project:', PROJECT_NOT_FOUND);
    }
  });

  // Eliminar un proyecto existente del workspace declarado.
  router.delete('/projects/:id', requireWorkshopRoles(['ADMIN']), async (req: Request, res: Response) => {
    try {
      const id = normalizeWorkshopId(req.params.id);
      if (!id) {
        return res.status(400).json({ error: 'Identificador de proyecto inválido' });
      }
      const workspaceId = await requireWorkspace(
        res,
        normalizeWorkshopId(req.query.workspaceId)
      );
      if (!workspaceId) return;

      // Borrado atómico acotado al workspace: count 0 cubre tanto "no existe"
      // como "existe en otro workspace", sin filtrar su existencia.
      const result = await store.workshop3DProject.deleteMany({
        where: { id, workspaceId },
      });
      if (result.count === 0) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }

      res.json({ success: true, message: 'Proyecto 3D eliminado' });
    } catch (err: unknown) {
      sendFailure(res, err, 'Error deleting 3D workshop project:', PROJECT_NOT_FOUND);
    }
  });

  // -------------------------------------------------------------------------
  // Catalog
  // -------------------------------------------------------------------------

  // Lectura del catálogo global: cualquier usuario autenticado.
  router.get('/catalog', async (_req: Request, res: Response) => {
    try {
      const entries = await store.workshop3DCatalogEntry.findMany({
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });
      res.json(entries);
    } catch (err: unknown) {
      sendFailure(res, err, 'Error fetching 3D catalog:');
    }
  });

  // Escritura del catálogo global: solo el rol que ya usa la app para
  // configuración global (ADMIN; ver comentario del modelo en el esquema).
  router.post('/catalog', options.catalogWriter, async (req: Request, res: Response) => {
    try {
      const body = isPlainObject(req.body) ? req.body : {};
      const category = typeof body.category === 'string' ? body.category.trim() : '';
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const pricePerUnit = body.pricePerUnit;

      if (!category || !name) {
        return res.status(400).json({ error: 'Datos de catálogo incompletos' });
      }
      if (typeof pricePerUnit !== 'number' || !Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
        return res.status(400).json({ error: 'pricePerUnit debe ser un número no negativo' });
      }
      if (body.properties !== undefined && body.properties !== null && !isPlainObject(body.properties)) {
        return res.status(400).json({ error: 'properties debe ser un objeto o null' });
      }

      const entry = await store.workshop3DCatalogEntry.create({
        data: {
          category,
          name,
          unit: typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : 'unidad',
          pricePerUnit,
          currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'MXN',
          properties: body.properties ?? null,
          inStock: typeof body.inStock === 'boolean' ? body.inStock : true,
        },
      });

      res.status(201).json(entry);
    } catch (err: unknown) {
      sendFailure(res, err, 'Error creating 3D catalog entry:');
    }
  });

  // -------------------------------------------------------------------------
  // Quotations
  // -------------------------------------------------------------------------

  // Guardar una cotización: el proyecto debe existir y su workspace debe ser válido.
  // El workspace autorizado se deriva del proyecto en BD, nunca del cliente.
  router.post('/quotations', requireWorkshopRoles(['ADMIN', 'VENTAS', 'DISENO']), async (req: Request, res: Response) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      const body = isPlainObject(req.body) ? req.body : {};
      const projectId = normalizeWorkshopId(body.projectId);
      if (!projectId) {
        return res.status(400).json({ error: 'projectId es obligatorio' });
      }
      if (typeof body.totalPrice !== 'number' || !Number.isFinite(body.totalPrice)) {
        return res.status(400).json({ error: 'totalPrice debe ser un número' });
      }
      if (!isPlainObject(body.breakdownData)) {
        return res.status(400).json({ error: 'breakdownData debe ser un objeto' });
      }

      const project = (await store.workshop3DProject.findFirst({
        where: { id: projectId },
        select: { id: true, workspaceId: true },
      })) as { id: string; workspaceId: string } | null;

      if (!project) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }

      // Si el cliente declara un workspace, debe coincidir con el real.
      // La discrepancia se responde como inexistente para no filtrar proyectos.
      const requestedWorkspaceId = normalizeWorkshopId(body.workspaceId);
      if (requestedWorkspaceId && requestedWorkspaceId !== project.workspaceId) {
        return res.status(404).json({ error: PROJECT_NOT_FOUND });
      }

      if (!(await workspaceExists(project.workspaceId))) {
        return res.status(404).json({ error: WORKSPACE_NOT_FOUND });
      }

      const totalCost = body.totalCost;
      if (totalCost !== undefined && (typeof totalCost !== 'number' || !Number.isFinite(totalCost))) {
        return res.status(400).json({ error: 'totalCost debe ser un número' });
      }
      const grossMargin = body.grossMargin;
      if (grossMargin !== undefined && grossMargin !== null && (typeof grossMargin !== 'number' || !Number.isFinite(grossMargin))) {
        return res.status(400).json({ error: 'grossMargin debe ser un número o null' });
      }

      const quotation = await store.workshop3DQuotation.create({
        data: {
          projectId: project.id,
          cliente: typeof body.cliente === 'string' ? body.cliente.trim() || null : null,
          currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'MXN',
          breakdownData: body.breakdownData,
          totalPrice: body.totalPrice,
          totalCost: typeof totalCost === 'number' ? totalCost : 0,
          grossMargin: typeof grossMargin === 'number' ? grossMargin : null,
          notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
          // Autoría derivada del token, nunca del cuerpo.
          createdById: authUser.id,
        },
      });

      res.status(201).json(quotation);
    } catch (err: unknown) {
      sendFailure(res, err, 'Error saving 3D quotation:', PROJECT_NOT_FOUND);
    }
  });

  return router;
}
