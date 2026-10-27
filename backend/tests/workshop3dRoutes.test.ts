/**
 * Pruebas de autorización y validación de las rutas del Taller 3D.
 *
 * No usan PostgreSQL: inyectan un store en memoria en `createWorkshop3DRouter`,
 * igual que `httpAuth.test.ts` inyecta `findUser`. Cubren el alcance que el
 * esquema actual permite verificar: workspace existente, proyecto existente,
 * proyecto dentro del workspace declarado, rol de escritura del catálogo y
 * traducción honesta de errores de base de datos (nunca 401/403).
 */
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import express, { type RequestHandler } from 'express';

import {
  createWorkshop3DRouter,
  type Workshop3DStore,
} from '../src/workshop3dRouter.ts';
import { classifyDatabaseFailure } from '../src/httpAuth.ts';
import { requireRoles } from '../src/roles.ts';

type ProjectRow = {
  id: string;
  name: string;
  workspaceId: string;
  createdById: string;
  sceneData: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function prismaError(code: string): Error {
  return Object.assign(new Error(`prisma ${code}`), { code });
}

function createFakeStore(seed?: { workspaces?: string[]; projects?: ProjectRow[] }) {
  const workspaces = new Set(seed?.workspaces ?? ['ws-1', 'ws-2']);
  const projects = new Map<string, ProjectRow>();
  for (const project of seed?.projects ?? []) projects.set(project.id, { ...project });

  const state: { failNext: { op: string; error: unknown } | null } = { failNext: null };

  function maybeFail(op: string): void {
    if (state.failNext && state.failNext.op === op) {
      const { error } = state.failNext;
      state.failNext = null;
      throw error;
    }
  }

  const store: Workshop3DStore = {
    workspace: {
      async findUnique(args: { where: { id: string } }) {
        const { id } = args.where;
        return workspaces.has(id) ? { id } : null;
      },
    },
    workshop3DProject: {
      async findMany(args: { where?: { workspaceId?: string } }) {
        const workspaceId = args.where?.workspaceId;
        return [...projects.values()]
          .filter((project) => !workspaceId || project.workspaceId === workspaceId)
          .map((project) => ({ ...project, sceneData: undefined }));
      },
      async findFirst(args: { where: { id?: string; workspaceId?: string } }) {
        maybeFail('findFirst');
        const { id, workspaceId } = args.where;
        const project = id ? projects.get(id) : undefined;
        if (!project) return null;
        if (workspaceId !== undefined && project.workspaceId !== workspaceId) return null;
        return { ...project };
      },
      async create(args: { data: Record<string, unknown> }) {
        maybeFail('create');
        const data = args.data;
        const workspaceId = String(data.workspaceId);
        if (!workspaces.has(workspaceId)) throw prismaError('P2003');
        const row: ProjectRow = {
          id: `p-${projects.size + 1}`,
          name: String(data.name),
          workspaceId,
          createdById: String(data.createdById),
          sceneData: data.sceneData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        projects.set(row.id, row);
        return { ...row };
      },
      async updateMany(args: {
        where: { id: string; workspaceId: string };
        data: Record<string, unknown>;
      }) {
        maybeFail('updateMany');
        const project = projects.get(args.where.id);
        if (!project || project.workspaceId !== args.where.workspaceId) {
          return { count: 0 };
        }
        Object.assign(project, args.data, { updatedAt: new Date() });
        return { count: 1 };
      },
      async deleteMany(args: { where: { id: string; workspaceId: string } }) {
        maybeFail('deleteMany');
        const project = projects.get(args.where.id);
        if (!project || project.workspaceId !== args.where.workspaceId) {
          return { count: 0 };
        }
        projects.delete(args.where.id);
        return { count: 1 };
      },
    },
    workshop3DQuotation: {
      async create(args: { data: Record<string, unknown> }) {
        maybeFail('createQuotation');
        return { id: 'q-1', ...args.data };
      },
    },
    workshop3DCatalogEntry: {
      async findMany() {
        return [];
      },
      async create(args: { data: Record<string, unknown> }) {
        return { id: 'c-1', ...args.data };
      },
    },
  };

  return { store, projects, workspaces, state };
}

function authAs(role: string, id = 'user-1'): RequestHandler {
  return (req, _res, next) => {
    req.authUser = { id, role, username: 'tester', name: 'Tester' };
    next();
  };
}

type TestServer = { base: string; close: () => Promise<void> };

async function startServer(
  store: Workshop3DStore,
  options?: { role?: string; userId?: string; catalogWriter?: RequestHandler }
): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/workshop',
    createWorkshop3DRouter({
      store,
      authenticate: [
        authAs(options?.role ?? 'ADMIN', options?.userId),
        requireRoles(['ADMIN', 'VENTAS', 'DISENO', 'USER']),
      ],
      catalogWriter: options?.catalogWriter ?? requireRoles(['ADMIN']),
      classifyFailure: classifyDatabaseFailure,
    })
  );

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    base: `http://127.0.0.1:${port}/api/workshop`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function request(
  server: TestServer,
  path: string,
  init?: RequestInit
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${server.base}${path}`, init);
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function jsonBody(value: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  };
}

function project(id: string, workspaceId: string): ProjectRow {
  return {
    id,
    name: `Proyecto ${id}`,
    workspaceId,
    createdById: 'owner-1',
    sceneData: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('Workshop 3D — matriz de autorización', () => {
  test('USER puede leer proyectos y catálogo, pero no crear proyectos ni cotizaciones', async () => {
    const { store } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    const server = await startServer(store, { role: 'USER' });
    try {
      assert.equal((await request(server, '/projects?workspaceId=ws-1')).status, 200);
      assert.equal((await request(server, '/catalog')).status, 200);

      assert.equal(
        (await request(server, '/projects', jsonBody({
          name: 'No permitido',
          workspaceId: 'ws-1',
        }))).status,
        403
      );

      assert.equal(
        (await request(server, '/quotations', jsonBody({
          projectId: 'p-1',
          totalPrice: 100,
          breakdownData: {},
        }))).status,
        403
      );
    } finally {
      await server.close();
    }
  });

  test('VENTAS y DISENO pueden crear y editar proyectos, pero no eliminarlos', async () => {
    for (const role of ['VENTAS', 'DISENO']) {
      const { store, projects } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
      const server = await startServer(store, { role });
      try {
        const created = await request(server, '/projects', jsonBody({
          name: `Proyecto ${role}`,
          workspaceId: 'ws-1',
        }));
        assert.equal(created.status, 201, `${role} debe poder crear proyectos`);

        const updated = await request(server, '/projects/p-1?workspaceId=ws-1', {
          ...jsonBody({ name: `Editado ${role}` }),
          method: 'PUT',
        });
        assert.equal(updated.status, 200, `${role} debe poder editar proyectos`);

        const deleted = await request(server, '/projects/p-1?workspaceId=ws-1', {
          method: 'DELETE',
        });
        assert.equal(deleted.status, 403, `${role} no debe poder eliminar proyectos`);
        assert.equal(projects.has('p-1'), true);
      } finally {
        await server.close();
      }
    }
  });

  test('TALLER recibe 403 en todas las rutas del módulo', async () => {
    const { store } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    const server = await startServer(store, { role: 'TALLER' });
    try {
      const checks: Array<[string, RequestInit?]> = [
        ['/projects?workspaceId=ws-1'],
        ['/projects/p-1?workspaceId=ws-1'],
        ['/projects', jsonBody({ name: 'X', workspaceId: 'ws-1' })],
        ['/projects/p-1?workspaceId=ws-1', {
          ...jsonBody({ name: 'X' }),
          method: 'PUT',
        }],
        ['/projects/p-1?workspaceId=ws-1', { method: 'DELETE' }],
        ['/catalog'],
        ['/catalog', jsonBody({
          category: 'filamento',
          name: 'PLA',
          pricePerUnit: 10,
        })],
        ['/quotations', jsonBody({
          projectId: 'p-1',
          totalPrice: 100,
          breakdownData: {},
        })],
      ];

      for (const [path, init] of checks) {
        const result = await request(server, path, init);
        assert.equal(result.status, 403, `${path} debe denegar a TALLER`);
      }
    } finally {
      await server.close();
    }
  });

  test('solo ADMIN puede eliminar proyectos y escribir el catálogo', async () => {
    const { store, projects } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    const server = await startServer(store, { role: 'ADMIN' });
    try {
      assert.equal(
        (await request(server, '/projects/p-1?workspaceId=ws-1', {
          method: 'DELETE',
        })).status,
        200
      );
      assert.equal(projects.has('p-1'), false);

      assert.equal(
        (await request(server, '/catalog', jsonBody({
          category: 'filamento',
          name: 'PLA',
          pricePerUnit: 10,
        }))).status,
        201
      );
    } finally {
      await server.close();
    }
  });
});
describe('Workshop 3D — proyectos acotados por workspace', () => {
  test('GET /projects sin workspaceId responde 400', async () => {
    const { store } = createFakeStore();
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects');
      assert.equal(res.status, 400);
    } finally {
      await server.close();
    }
  });

  test('GET /projects con workspace inexistente responde 404', async () => {
    const { store } = createFakeStore();
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects?workspaceId=ws-inexistente');
      assert.equal(res.status, 404);
    } finally {
      await server.close();
    }
  });

  test('GET /projects solo devuelve proyectos del workspace solicitado', async () => {
    const { store } = createFakeStore({
      projects: [project('p-1', 'ws-1'), project('p-2', 'ws-2')],
    });
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects?workspaceId=ws-1');
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.map((p: { id: string }) => p.id),
        ['p-1']
      );
    } finally {
      await server.close();
    }
  });

  test('GET /projects/:id de otro workspace responde 404', async () => {
    const { store } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    const server = await startServer(store);
    try {
      const cross = await request(server, '/projects/p-1?workspaceId=ws-2');
      assert.equal(cross.status, 404);

      const own = await request(server, '/projects/p-1?workspaceId=ws-1');
      assert.equal(own.status, 200);
      assert.equal(own.body.id, 'p-1');
    } finally {
      await server.close();
    }
  });

  test('GET /projects/:id inexistente responde 404', async () => {
    const { store } = createFakeStore();
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects/p-inexistente?workspaceId=ws-1');
      assert.equal(res.status, 404);
    } finally {
      await server.close();
    }
  });

  test('POST /projects exige workspaceId y que exista', async () => {
    const { store } = createFakeStore();
    const server = await startServer(store);
    try {
      const missing = await request(server, '/projects', jsonBody({ name: 'Nuevo' }));
      assert.equal(missing.status, 400);

      const unknown = await request(
        server,
        '/projects',
        jsonBody({ name: 'Nuevo', workspaceId: 'ws-inexistente' })
      );
      assert.equal(unknown.status, 404);
    } finally {
      await server.close();
    }
  });

  test('POST /projects usa el workspace y la autoría del servidor', async () => {
    const { store } = createFakeStore();
    const server = await startServer(store, { role: 'DISENO', userId: 'disenador-1' });
    try {
      const res = await request(
        server,
        '/projects',
        jsonBody({
          name: 'Proyecto válido',
          workspaceId: 'ws-1',
          createdById: 'suplantado',
          sceneData: { objects: [] },
        })
      );
      assert.equal(res.status, 201);
      assert.equal(res.body.workspaceId, 'ws-1');
      assert.equal(res.body.createdById, 'disenador-1');
    } finally {
      await server.close();
    }
  });

  test('PUT /projects/:id no permite actualizar un proyecto de otro workspace', async () => {
    const { store, projects } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects/p-1?workspaceId=ws-2', {
        ...jsonBody({ name: 'Secuestrado' }),
        method: 'PUT',
      });
      assert.equal(res.status, 404);
      assert.equal(projects.get('p-1')?.name, 'Proyecto p-1');
    } finally {
      await server.close();
    }
  });

  test('DELETE /projects/:id no permite borrar un proyecto de otro workspace', async () => {
    const { store, projects } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects/p-1?workspaceId=ws-2', { method: 'DELETE' });
      assert.equal(res.status, 404);
      assert.equal(projects.has('p-1'), true);
    } finally {
      await server.close();
    }
  });
  test('PUT /projects/:id inexistente responde 404', async () => {
    const { store } = createFakeStore();
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects/p-inexistente?workspaceId=ws-1', {
        ...jsonBody({ name: 'Nuevo nombre' }),
        method: 'PUT',
      });
      assert.equal(res.status, 404);
    } finally {
      await server.close();
    }
  });

  test('DELETE /projects/:id inexistente responde 404', async () => {
    const { store, projects } = createFakeStore();
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects/p-inexistente?workspaceId=ws-1', {
        method: 'DELETE',
      });
      assert.equal(res.status, 404);
      assert.equal(projects.size, 0);
    } finally {
      await server.close();
    }
  });

  test('PUT y DELETE válidos operan dentro del workspace declarado', async () => {
    const { store, projects } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    const server = await startServer(store);
    try {
      const updated = await request(server, '/projects/p-1?workspaceId=ws-1', {
        ...jsonBody({ name: 'Renombrado' }),
        method: 'PUT',
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.name, 'Renombrado');

      const deleted = await request(server, '/projects/p-1?workspaceId=ws-1', {
        method: 'DELETE',
      });
      assert.equal(deleted.status, 200);
      assert.equal(projects.has('p-1'), false);
    } finally {
      await server.close();
    }
  });
});

describe('Workshop 3D — catálogo', () => {
  test('POST /catalog rechaza a un usuario sin rol ADMIN (403)', async () => {
    const { store } = createFakeStore();
    const server = await startServer(store, { role: 'VENTAS' });
    try {
      const res = await request(
        server,
        '/catalog',
        jsonBody({ category: 'filamento', name: 'PLA', pricePerUnit: 10 })
      );
      assert.equal(res.status, 403);
    } finally {
      await server.close();
    }
  });

  test('POST /catalog permite a ADMIN y valida el precio', async () => {
    const { store } = createFakeStore();
    const server = await startServer(store, { role: 'ADMIN' });
    try {
      const invalid = await request(
        server,
        '/catalog',
        jsonBody({ category: 'filamento', name: 'PLA', pricePerUnit: -1 })
      );
      assert.equal(invalid.status, 400);

      const valid = await request(
        server,
        '/catalog',
        jsonBody({ category: 'filamento', name: 'PLA', pricePerUnit: 10 })
      );
      assert.equal(valid.status, 201);
      assert.equal(valid.body.name, 'PLA');
    } finally {
      await server.close();
    }
  });
});

describe('Workshop 3D — cotizaciones', () => {
  test('POST /quotations con proyecto inexistente responde 404', async () => {
    const { store } = createFakeStore();
    const server = await startServer(store);
    try {
      const res = await request(
        server,
        '/quotations',
        jsonBody({ projectId: 'p-inexistente', totalPrice: 100, breakdownData: {} })
      );
      assert.equal(res.status, 404);
    } finally {
      await server.close();
    }
  });

  test('POST /quotations rechaza un workspaceId que no coincide con el proyecto', async () => {
    const { store } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    const server = await startServer(store);
    try {
      const res = await request(
        server,
        '/quotations',
        jsonBody({
          projectId: 'p-1',
          workspaceId: 'ws-2',
          totalPrice: 100,
          breakdownData: {},
        })
      );
      assert.equal(res.status, 404);
    } finally {
      await server.close();
    }
  });

  test('POST /quotations válida deriva proyecto y autoría del servidor', async () => {
    const { store } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    const server = await startServer(store, { role: 'VENTAS', userId: 'vendedor-1' });
    try {
      const res = await request(
        server,
        '/quotations',
        jsonBody({
          projectId: 'p-1',
          workspaceId: 'ws-1',
          totalPrice: 100,
          breakdownData: { lineItems: [] },
          createdById: 'suplantado',
        })
      );
      assert.equal(res.status, 201);
      assert.equal(res.body.projectId, 'p-1');
      assert.equal(res.body.createdById, 'vendedor-1');
    } finally {
      await server.close();
    }
  });
});

describe('Workshop 3D — errores de base de datos', () => {
  test('P2025 se traduce a 404, no a 401/403', async () => {
    const { store, state } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    state.failNext = { op: 'updateMany', error: prismaError('P2025') };
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects/p-1?workspaceId=ws-1', {
        ...jsonBody({ name: 'Nuevo nombre' }),
        method: 'PUT',
      });
      assert.equal(res.status, 404);
    } finally {
      await server.close();
    }
  });

  test('BD no disponible se traduce a 503, no a 401/403', async () => {
    const { store, state } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    state.failNext = { op: 'findFirst', error: prismaError('P1001') };
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects/p-1?workspaceId=ws-1');
      assert.equal(res.status, 503);
    } finally {
      await server.close();
    }
  });

  test('error interno desconocido se traduce a 500, no a 401/403', async () => {
    const { store, state } = createFakeStore({ projects: [project('p-1', 'ws-1')] });
    state.failNext = { op: 'deleteMany', error: new Error('boom') };
    const server = await startServer(store);
    try {
      const res = await request(server, '/projects/p-1?workspaceId=ws-1', { method: 'DELETE' });
      assert.equal(res.status, 500);
    } finally {
      await server.close();
    }
  });
});
