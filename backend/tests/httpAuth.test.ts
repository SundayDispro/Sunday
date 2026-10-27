/**
 * Pruebas HTTP de autenticación y disponibilidad.
 *
 * No usan PostgreSQL real: inyectan `findUser`, igual que `socketAuth.test.ts`
 * inyecta sus dependencias. Demuestran la POLÍTICA del middleware (401 vs 503),
 * no el comportamiento del driver de Prisma contra una base caída. Ese caso
 * queda cubierto por la clasificación de códigos (`P1001`, `ECONNREFUSED`, etc.)
 * y debe validarse además con una prueba de humo controlada.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type NextFunction, type Request, type Response } from 'express';

import {
  INTERNAL_ERROR_MESSAGE,
  SERVICE_UNAVAILABLE_MESSAGE,
  authServiceErrorResponse,
  createAttachUserFromJwt,
  createAuthenticateToken,
  extractBearerToken,
  isAuthServiceError,
  requireAuth,
  toAuthServiceError,
  type HttpAuthDeps,
  type HttpAuthUser,
} from '../src/httpAuth.ts';

const USER: HttpAuthUser = {
  id: 'u1',
  role: 'USER',
  username: 'usuario',
  name: 'Usuario de prueba',
};

function makeDeps(overrides: Partial<HttpAuthDeps> = {}): HttpAuthDeps {
  return {
    verifyToken: (token) => {
      if (token === 'valid-token') return { userId: USER.id, role: USER.role };
      const err = new Error('invalid signature');
      err.name = 'JsonWebTokenError';
      throw err;
    },
    findUser: async () => USER,
    ...overrides,
  };
}

/** App mínima que reproduce el orden real: attach → ruta → handler de errores. */
function createTestApp(deps: HttpAuthDeps, options: { withAttach?: boolean } = {}) {
  const app = express();
  if (options.withAttach !== false) app.use(createAttachUserFromJwt(deps));

  app.get('/protected', createAuthenticateToken(deps), (req, res) => {
    res.json({ ok: true, userId: req.authUser?.id ?? null });
  });
  app.get('/require-auth', requireAuth, (req, res) => {
    res.json({ ok: true, userId: req.authUser?.id ?? null });
  });
  app.get('/public', (_req, res) => {
    res.json({ ok: true });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isAuthServiceError(err)) {
      const { status, body } = authServiceErrorResponse(err);
      res.status(status).json(body);
      return;
    }
    res.status(500).json({ error: 'unhandled' });
  });

  return app;
}

async function withServer(
  app: express.Express,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se pudo obtener el puerto de prueba');

  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // undici mantiene keep-alive; sin esto el cierre puede tardar segundos.
      server.closeAllConnections();
    });
  }
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

test('extractBearerToken conserva el comportamiento existente', () => {
  assert.equal(extractBearerToken(undefined), '');
  assert.equal(extractBearerToken(''), '');
  assert.equal(extractBearerToken('Basic abc'), '');
  // El esquema es case-sensitive en la implementación original.
  assert.equal(extractBearerToken('bearer abc'), '');
  assert.equal(extractBearerToken('Bearer  token  '), 'token');
});

test('token válido y usuario existente: la ruta protegida responde 200', async () => {
  await withServer(createTestApp(makeDeps()), async (base) => {
    const res = await fetch(`${base}/protected`, { headers: authHeader('valid-token') });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, userId: USER.id });
  });
});

test('token inválido: 401 sin consultar la base de datos', async () => {
  let lookups = 0;
  const deps = makeDeps({
    findUser: async () => {
      lookups += 1;
      return USER;
    },
  });

  await withServer(createTestApp(deps), async (base) => {
    const res = await fetch(`${base}/protected`, { headers: authHeader('firma-invalida') });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'No autenticado' });
    assert.equal(lookups, 0);
  });
});

test('token caducado: 401 (no se convierte en 503)', async () => {
  const deps = makeDeps({
    verifyToken: () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      throw err;
    },
  });

  await withServer(createTestApp(deps), async (base) => {
    const res = await fetch(`${base}/protected`, { headers: authHeader('caducado') });
    assert.equal(res.status, 401);
  });
});

test('usuario inexistente: 401 (autenticación, no infraestructura)', async () => {
  const deps = makeDeps({ findUser: async () => null });

  await withServer(createTestApp(deps), async (base) => {
    const res = await fetch(`${base}/protected`, { headers: authHeader('valid-token') });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'No autenticado' });
  });
});

test('Prisma P1001 (BD inalcanzable): 503 y cuerpo genérico sin detalles', async () => {
  const deps = makeDeps({
    findUser: async () => {
      throw Object.assign(new Error('Can\'t reach database server at db:5432 user=secret'), {
        code: 'P1001',
      });
    },
  });

  await withServer(createTestApp(deps), async (base) => {
    const res = await fetch(`${base}/protected`, { headers: authHeader('valid-token') });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.deepEqual(body, { error: SERVICE_UNAVAILABLE_MESSAGE });
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes('P1001'), false);
    assert.equal(serialized.includes('secret'), false);
    assert.equal(serialized.includes('5432'), false);
  });
});

test('error de red ECONNREFUSED: 503', async () => {
  const deps = makeDeps({
    findUser: async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
        code: 'ECONNREFUSED',
      });
    },
  });

  await withServer(createTestApp(deps), async (base) => {
    const res = await fetch(`${base}/protected`, { headers: authHeader('valid-token') });
    assert.equal(res.status, 503);
  });
});

test('PrismaClientInitializationError: 503', async () => {
  const deps = makeDeps({
    findUser: async () => {
      const err = new Error('initialization failed');
      err.name = 'PrismaClientInitializationError';
      throw err;
    },
  });

  await withServer(createTestApp(deps), async (base) => {
    const res = await fetch(`${base}/protected`, { headers: authHeader('valid-token') });
    assert.equal(res.status, 503);
  });
});

test('error de datos P2002: 500 interno, nunca 401 ni 503', async () => {
  const deps = makeDeps({
    findUser: async () => {
      throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
    },
  });

  await withServer(createTestApp(deps), async (base) => {
    const res = await fetch(`${base}/protected`, { headers: authHeader('valid-token') });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: INTERNAL_ERROR_MESSAGE });
  });
});

test('error desconocido con datos sensibles: 500 sin filtrar el mensaje', async () => {
  const deps = makeDeps({
    findUser: async () => {
      throw new Error('SQL SELECT * FROM users; password=supersecreto');
    },
  });

  await withServer(createTestApp(deps), async (base) => {
    const res = await fetch(`${base}/protected`, { headers: authHeader('valid-token') });
    assert.equal(res.status, 500);
    const serialized = JSON.stringify(await res.json());
    assert.equal(serialized.includes('SQL'), false);
    assert.equal(serialized.includes('supersecreto'), false);
  });
});

test('sin token, una ruta pública no consulta la BD ni falla si Prisma está caído', async () => {
  let lookups = 0;
  const deps = makeDeps({
    findUser: async () => {
      lookups += 1;
      throw Object.assign(new Error('down'), { code: 'P1001' });
    },
  });

  await withServer(createTestApp(deps), async (base) => {
    const res = await fetch(`${base}/public`);
    assert.equal(res.status, 200);
    assert.equal(lookups, 0);
  });
});

test('requireAuth: 401 sin usuario y 200 cuando attach ya resolvió la identidad', async () => {
  await withServer(createTestApp(makeDeps()), async (base) => {
    const withoutToken = await fetch(`${base}/require-auth`);
    assert.equal(withoutToken.status, 401);

    const withToken = await fetch(`${base}/require-auth`, { headers: authHeader('valid-token') });
    assert.equal(withToken.status, 200);
    assert.deepEqual(await withToken.json(), { ok: true, userId: USER.id });
  });
});

test('authenticateToken sin attach previo: distingue 503 de infraestructura', async () => {
  const deps = makeDeps({
    findUser: async () => {
      throw Object.assign(new Error('pool timeout'), { code: 'P2024' });
    },
  });

  await withServer(createTestApp(deps, { withAttach: false }), async (base) => {
    const res = await fetch(`${base}/protected`, { headers: authHeader('valid-token') });
    assert.equal(res.status, 503);
  });
});

test('el log de infraestructura solo contiene campos allowlisted', () => {
  const err = Object.assign(
    new Error('postgresql://admin:clave@db:5432/sunday SELECT * FROM users'),
    { code: 'P1001' }
  );
  const serviceError = toAuthServiceError(err, 'u1');

  assert.equal(serviceError.status, 503);
  assert.equal(serviceError.kind, 'unavailable');
  assert.deepEqual(serviceError.log, {
    event: 'http_auth_infra_error',
    userId: 'u1',
    errorName: 'Error',
    kind: 'unavailable',
    prismaCode: 'P1001',
  });

  const serialized = JSON.stringify(serviceError.log);
  assert.equal(serialized.includes('postgresql://'), false);
  assert.equal(serialized.includes('clave'), false);
  assert.equal(serialized.includes('SELECT'), false);
});

test('el log identifica errores de red y códigos de datos sin mensaje', () => {
  const network = toAuthServiceError(
    Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    'u2'
  );
  assert.equal(network.status, 503);
  assert.equal(network.log.networkCode, 'ECONNREFUSED');
  assert.equal(network.log.prismaCode, undefined);

  const data = toAuthServiceError(Object.assign(new Error('unique'), { code: 'P2002' }), 'u3');
  assert.equal(data.status, 500);
  assert.equal(data.kind, 'internal');
  assert.equal(data.log.prismaCode, 'P2002');
});

test('un código no público no se registra en el log', () => {
  const serviceError = toAuthServiceError(
    Object.assign(new Error('raro'), { code: 'SOMETHING_INTERNO' }),
    'u4'
  );
  assert.equal(serviceError.status, 500);
  assert.equal(serviceError.log.prismaCode, undefined);
  assert.equal(serviceError.log.networkCode, undefined);
});
