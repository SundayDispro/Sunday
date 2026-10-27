import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SOCKET_AUTH_ERROR,
  SOCKET_INFRA_ERROR,
  SOCKET_INFRA_LOG_EVENT,
  buildInfraErrorLog,
  createSocketAuthMiddleware,
  describeInfraError,
  resolveSocketIdentity,
  type InfraErrorDetails,
  type SocketAuthMiddlewareDeps,
  type SocketIdentityDeps,
} from '../src/socketAuth.ts';

const ALLOWED_ROLES = new Set(['ADMIN', 'VENTAS', 'DISENO', 'TALLER', 'USER']);

const JWT_LIKE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1MSIsInJvbGUiOiJBRE1JTiJ9.firma-falsa';

function makeDeps(overrides: Partial<SocketIdentityDeps> = {}): SocketIdentityDeps {
  return {
    verifyToken: () => ({ userId: 'u1', role: 'ADMIN' }),
    findUser: async () => ({ id: 'u1', role: 'ADMIN' }),
    allowedRoles: ALLOWED_ROLES,
    ...overrides,
  };
}

function prismaDownError(): Error {
  return Object.assign(
    new Error(
      'Can\'t reach database server at postgresql://sunday:s3cr3t@db.interno:5432/sunday'
    ),
    { name: 'PrismaClientInitializationError', code: 'P1001' }
  );
}

/** Middleware real de `io.use()` con dependencias controladas. */
function makeMiddleware(overrides: Partial<SocketAuthMiddlewareDeps> = {}) {
  const logs: InfraErrorDetails[] = [];
  const middleware = createSocketAuthMiddleware({
    verifyToken: () => ({ userId: 'u1', role: 'ADMIN' }),
    findUser: async () => ({ id: 'u1', role: 'ADMIN' }),
    allowedRoles: ALLOWED_ROLES,
    roomForUser: (id) => `user:${id}`,
    logInfraError: (details) => logs.push(details),
    ...overrides,
  });
  return { middleware, logs };
}

function makeSocket(
  join: (room: string) => void | Promise<void>,
  auth: unknown = { token: 'token-valido' }
) {
  return {
    handshake: { auth },
    data: undefined as unknown,
    join,
  };
}

// ---------------------------------------------------------------------------
// 1. Token inválido / ausente → rechazo de autenticación
// ---------------------------------------------------------------------------

test('sin token se rechaza como unauthorized y no se consulta la base de datos', async () => {
  let consultas = 0;
  const result = await resolveSocketIdentity(
    '   ',
    makeDeps({
      findUser: async () => {
        consultas += 1;
        return null;
      },
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, SOCKET_AUTH_ERROR);
  assert.equal(consultas, 0);
});

test('un token con firma/expiración inválida se rechaza como unauthorized', async () => {
  let consultas = 0;
  const result = await resolveSocketIdentity(
    'token-manipulado',
    makeDeps({
      verifyToken: () => {
        throw new Error('invalid signature');
      },
      findUser: async () => {
        consultas += 1;
        return null;
      },
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, SOCKET_AUTH_ERROR);
  assert.equal(consultas, 0, 'un token inválido no debe llegar a Prisma');
});

// ---------------------------------------------------------------------------
// 2. Usuario eliminado / sin permisos → no se concede acceso
// ---------------------------------------------------------------------------

test('un usuario eliminado se rechaza como unauthorized', async () => {
  const result = await resolveSocketIdentity('token-valido', makeDeps({ findUser: async () => null }));

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, SOCKET_AUTH_ERROR);
});

test('un rol sin acceso se rechaza como unauthorized', async () => {
  const result = await resolveSocketIdentity(
    'token-valido',
    makeDeps({ findUser: async () => ({ id: 'u1', role: 'INVITADO' }) })
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, SOCKET_AUTH_ERROR);
});

// ---------------------------------------------------------------------------
// 3. PostgreSQL no disponible → server_error, NUNCA unauthorized
// ---------------------------------------------------------------------------

test('una caída de PostgreSQL produce server_error y no unauthorized', async () => {
  const result = await resolveSocketIdentity(
    'token-valido',
    makeDeps({
      findUser: async () => {
        throw prismaDownError();
      },
    })
  );

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.error, SOCKET_INFRA_ERROR);
  assert.notEqual(result.error, SOCKET_AUTH_ERROR);

  if (result.error === SOCKET_INFRA_ERROR) {
    assert.equal(result.infra.userId, 'u1', 'el log debe identificar al usuario del JWT');
    assert.equal(result.infra.errorName, 'PrismaClientInitializationError');
    assert.equal(result.infra.prismaCode, 'P1001');
    assert.deepEqual(Object.keys(result.infra).sort(), ['errorName', 'prismaCode', 'userId']);
  }
});

test('un fallo no-Error (string lanzado) también se trata como infraestructura', async () => {
  const result = await resolveSocketIdentity(
    'token-valido',
    makeDeps({
      findUser: async () => {
        throw 'connection reset';
      },
    })
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, SOCKET_INFRA_ERROR);
});

// ---------------------------------------------------------------------------
// 4. PostgreSQL vuelve → el handshake se resuelve sin reiniciar el backend
// ---------------------------------------------------------------------------

test('cuando la base de datos vuelve, el siguiente handshake se acepta', async () => {
  let disponible = false;
  const deps = makeDeps({
    findUser: async () => {
      if (!disponible) throw prismaDownError();
      return { id: 'u1', role: 'ADMIN' };
    },
  });

  const caido = await resolveSocketIdentity('token-valido', deps);
  assert.equal(caido.ok, false);
  if (!caido.ok) assert.equal(caido.error, SOCKET_INFRA_ERROR);

  disponible = true;
  const recuperado = await resolveSocketIdentity('token-valido', deps);
  assert.deepEqual(recuperado, { ok: true, userId: 'u1', role: 'ADMIN' });
});

// ---------------------------------------------------------------------------
// 5. El log de infraestructura respeta el contrato autorizado
// ---------------------------------------------------------------------------

test('el detalle de infraestructura solo contiene userId/errorName/prismaCode', () => {
  const detalle = describeInfraError(prismaDownError(), 'u1');

  assert.deepEqual(detalle, {
    userId: 'u1',
    errorName: 'PrismaClientInitializationError',
    prismaCode: 'P1001',
  });
});

test('un token o credenciales en el mensaje de error no llegan al resultado', async () => {
  const result = await resolveSocketIdentity(
    'token-valido',
    makeDeps({
      findUser: async () => {
        throw new Error(`fallo al validar el handshake para Bearer ${JWT_LIKE}`);
      },
    })
  );

  const serializado = JSON.stringify(result);
  assert.ok(!serializado.includes(JWT_LIKE), 'el token no debe aparecer en el resultado/log');
  assert.ok(!serializado.includes('token-valido'), 'el token de entrada tampoco debe filtrarse');
  assert.ok(!serializado.includes('fallo al validar'), 'no debe incluir el mensaje del error');
  assert.ok(!serializado.includes('errorMessage'), 'el contrato no admite errorMessage');
});

test('el objeto completo del log usa el literal exacto y solo los campos autorizados', () => {
  const log = buildInfraErrorLog(describeInfraError(prismaDownError(), 'u1'));

  assert.equal(SOCKET_INFRA_LOG_EVENT, 'socket_handshake_infra_error');
  assert.deepEqual(log, {
    event: 'socket_handshake_infra_error',
    userId: 'u1',
    errorName: 'PrismaClientInitializationError',
    prismaCode: 'P1001',
  });
  assert.deepEqual(Object.keys(log), ['event', 'userId', 'errorName', 'prismaCode']);
});

test('el log omite prismaCode no público y solo admite userId null sin identidad', () => {
  const log = buildInfraErrorLog(describeInfraError(new Error('boom'), null));

  assert.deepEqual(log, {
    event: 'socket_handshake_infra_error',
    userId: null,
    errorName: 'Error',
  });
  assert.equal('prismaCode' in log, false);
  assert.deepEqual(Object.keys(log), ['event', 'userId', 'errorName']);
});

test('el log no filtra mensajes, tokens, SQL, cadenas de conexión ni credenciales', () => {
  const err = Object.assign(
    new Error(
      `connect failed: postgresql://sunday:s3cr3t@db.interno:5432/sunday token=${JWT_LIKE}`
    ),
    { name: 'PrismaClientInitializationError', code: 'P1001' }
  );

  const serializado = JSON.stringify(buildInfraErrorLog(describeInfraError(err, 'u1')));
  for (const prohibido of [
    JWT_LIKE,
    'postgresql://',
    's3cr3t',
    'connect failed',
    'db.interno',
    'errorMessage',
    'errorCode',
    'stack',
  ]) {
    assert.ok(!serializado.includes(prohibido), `el log no debe incluir "${prohibido}"`);
  }
});

test('solo se registra un código público de Prisma; otros códigos se omiten', () => {
  const econn = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
  assert.deepEqual(describeInfraError(econn, 'u7'), {
    userId: 'u7',
    errorName: 'Error',
  });

  const sinCodigo = describeInfraError(new Error('boom'), null);
  assert.deepEqual(Object.keys(sinCodigo).sort(), ['errorName', 'userId']);
});

test('describeInfraError no revienta con valores primitivos y nunca incluye mensaje', () => {
  assert.deepEqual(describeInfraError('boom', null), { userId: null, errorName: 'Error' });

  const nulo = describeInfraError(null, null);
  assert.equal('prismaCode' in nulo, false);
  assert.equal('errorMessage' in nulo, false);
  assert.equal('errorCode' in nulo, false);
});

// ---------------------------------------------------------------------------
// 6. Callback real de io.use(): promesas de socket.join
// ---------------------------------------------------------------------------

test('un rechazo asíncrono de socket.join se captura como server_error', async () => {
  const { middleware, logs } = makeMiddleware();
  const eventos: string[] = [];
  const socket = makeSocket(async (room) => {
    eventos.push(`join:${room}`);
    // Rechazo asíncrono: no se lanza en la misma pila de la llamada.
    await Promise.resolve();
    throw Object.assign(new Error('fallo del adaptador con token-secreto'), {
      name: 'Error',
    });
  });

  let nextError: Error | undefined;
  await middleware(socket, (err) => {
    eventos.push('next');
    nextError = err;
  });

  assert.equal(nextError?.message, SOCKET_INFRA_ERROR);
  assert.notEqual(nextError?.message, SOCKET_AUTH_ERROR);

  // El join se intentó antes de responder y el error llegó después de su rechazo.
  assert.deepEqual(eventos, ['join:user:u1', 'next']);
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], { userId: 'u1', errorName: 'Error' });
  assert.ok(!JSON.stringify(logs).includes('token-secreto'));
  assert.ok(!JSON.stringify(logs).includes('fallo del adaptador'));
});

test('el middleware espera socket.join antes de llamar a next', async () => {
  const { middleware, logs } = makeMiddleware();
  const eventos: string[] = [];
  const socket = makeSocket(async (room) => {
    await Promise.resolve();
    eventos.push(`join:${room}`);
  });

  let nextError: Error | undefined = new Error('next no llamado');
  await middleware(socket, (err) => {
    eventos.push('next');
    nextError = err;
  });

  assert.equal(nextError, undefined);
  assert.deepEqual(eventos, ['join:user:u1', 'next']);
  assert.deepEqual(socket.data, { userId: 'u1', role: 'ADMIN' });
  assert.equal(logs.length, 0);
});

test('el callback real mantiene unauthorized para un token inválido y no hace join', async () => {
  const { middleware, logs } = makeMiddleware({
    verifyToken: () => {
      throw new Error('invalid signature');
    },
    findUser: async () => {
      throw new Error('no debe consultarse');
    },
  });
  let joins = 0;
  const socket = makeSocket(() => {
    joins += 1;
  });

  let nextError: Error | undefined;
  await middleware(socket, (err) => {
    nextError = err;
  });

  assert.equal(nextError?.message, SOCKET_AUTH_ERROR);
  assert.equal(joins, 0);
  assert.equal(logs.length, 0);
});

test('el callback real mantiene unauthorized para un rol sin acceso', async () => {
  const { middleware, logs } = makeMiddleware({
    findUser: async () => ({ id: 'u1', role: 'INVITADO' }),
  });
  let joins = 0;
  const socket = makeSocket(() => {
    joins += 1;
  });

  let nextError: Error | undefined;
  await middleware(socket, (err) => {
    nextError = err;
  });

  assert.equal(nextError?.message, SOCKET_AUTH_ERROR);
  assert.equal(joins, 0);
  assert.equal(logs.length, 0);
});

test('el callback real mantiene server_error si Prisma falla antes del join', async () => {
  const { middleware, logs } = makeMiddleware({
    findUser: async () => {
      throw prismaDownError();
    },
  });
  let joins = 0;
  const socket = makeSocket(() => {
    joins += 1;
  });

  let nextError: Error | undefined;
  await middleware(socket, (err) => {
    nextError = err;
  });

  assert.equal(nextError?.message, SOCKET_INFRA_ERROR);
  assert.equal(joins, 0);
  assert.deepEqual(logs, [
    {
      userId: 'u1',
      errorName: 'PrismaClientInitializationError',
      prismaCode: 'P1001',
    },
  ]);
});

test('el middleware emite el evento de infraestructura como un único objeto estructurado', () => {
  const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const authSource = readFileSync(new URL('../src/socketAuth.ts', import.meta.url), 'utf8');

  // Un único punto de emisión; los tres caminos pasan por el mismo callback.
  assert.equal(indexSource.includes("console.error('[socket-auth]"), false);
  assert.equal((indexSource.match(/console\.error\(buildInfraErrorLog\(/g) ?? []).length, 1);
  assert.equal((authSource.match(/deps\.logInfraError\(/g) ?? []).length, 3);
});
