import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { io, type Socket } from 'socket.io-client';
import { WebSocketServer, type WebSocket } from 'ws';

import {
  createRetryScheduler,
  handleConnectError,
  reconnectOnConnectivityRecovery,
} from '../src/store/socketRetry.ts';

/**
 * Prueba de comportamiento REAL contra la versión instalada de socket.io-client
 * (4.8.3) y un servidor Socket.IO mínimo sobre `ws` (protocolo Engine.IO v4).
 *
 * No usa el backend de la aplicación: solo reproduce el frame `CONNECT_ERROR`
 * (`44{"message":…}`) que emite el middleware del namespace, que es justo lo que
 * el cliente interpreta como rechazo de handshake.
 *
 * No sustituye a una prueba de integración con PostgreSQL real (ver informe),
 * pero sí verifica las dos premisas del fix:
 *   1. Ante un CONNECT_ERROR de namespace, el manager NO reintenta solo.
 *   2. `socket.connect()` posterior reconecta el mismo objeto sin recargar nada.
 */

type ServerMode = 'infra' | 'auth' | 'ok' | 'unknown';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, what: string, timeoutMs = 1500): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timeout esperando: ${what}`);
    await sleep(5);
  }
}

/** Espera un evento del socket con timeout (evita que un fallo cuelgue el runner). */
function once(socket: Socket, event: string, timeoutMs = 2000): Promise<Error | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout esperando el evento "${event}"`));
    }, timeoutMs);
    const handler = (payload?: Error) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

/**
 * Servidor Socket.IO mínimo: handshake de Engine.IO, y responde al CONNECT del
 * namespace con el modo configurado (éxito o error de middleware).
 */
async function createFakeSocketServer() {
  const httpServer = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server: httpServer, path: '/socket.io/' });

  let mode: ServerMode = 'infra';
  let connections = 0;
  let connectPackets = 0;
  let connectDelayMs = 0;
  let seq = 0;

  wss.on('connection', (ws: WebSocket) => {
    connections += 1;
    const sid = `srv-${(seq += 1)}`;

    // Handshake Engine.IO v4 (EIO=4): sid + intervalos de latido.
    ws.send(
      `0${JSON.stringify({
        sid,
        upgrades: [],
        pingInterval: 25000,
        pingTimeout: 20000,
        maxPayload: 1000000,
      })}`
    );

    ws.on('message', (raw: Buffer) => {
      const text = raw.toString();

      // "40" = Engine.IO message(4) + Socket.IO CONNECT(0) al namespace "/".
      if (text.startsWith('40')) {
        connectPackets += 1;
        const responder = () => {
          // El socket pudo cerrarse durante el retardo del test.
          if (ws.readyState !== 1) return;
          if (mode === 'ok') ws.send(`40${JSON.stringify({ sid })}`);
          else if (mode === 'auth') ws.send(`44${JSON.stringify({ message: 'unauthorized' })}`);
          else if (mode === 'unknown') ws.send(`44${JSON.stringify({ message: 'error_desconocido' })}`);
          else ws.send(`44${JSON.stringify({ message: 'server_error' })}`);
        };
        if (connectDelayMs > 0) setTimeout(responder, connectDelayMs);
        else responder();
        return;
      }

      // Ping de Engine.IO.
      if (text === '2') ws.send('3');
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    setMode: (next: ServerMode) => {
      mode = next;
    },
    setConnectDelay: (ms: number) => {
      connectDelayMs = ms;
    },
    connections: () => connections,
    connectPackets: () => connectPackets,
    close: async () => {
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

/** Mismo perfil de reconexión que `store/socket.ts`, con tiempos cortos para el test. */
function createClient(url: string): Socket {
  return io(url, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 20,
    reconnectionDelayMax: 40,
    randomizationFactor: 0,
    timeout: 1000,
    forceNew: true,
  });
}

test('CONNECT_ERROR de namespace: el manager NO reintenta solo', async (t) => {
  const server = await createFakeSocketServer();
  const socket = createClient(server.url);
  t.after(async () => {
    socket.close();
    await server.close();
  });

  server.setMode('infra');
  const errorPromise = once(socket, 'connect_error');
  socket.connect();

  const error = await errorPromise;
  assert.equal(error?.message, 'server_error');

  // Premisa del fix: socket.io-client destruye el socket y desactiva la
  // reconexión automática del manager (skipReconnect = true).
  assert.equal(socket.connected, false);
  assert.equal(socket.active, false, 'el socket queda inactivo tras CONNECT_ERROR');

  await sleep(150);
  assert.equal(server.connections(), 1, 'el manager no debe haber reintentado por su cuenta');
});

test('sin gate, connect() durante un handshake en curso duplica el CONNECT del namespace', async (t) => {
  const server = await createFakeSocketServer();
  const socket = createClient(server.url);
  t.after(async () => {
    socket.close();
    await server.close();
  });

  server.setMode('ok');
  server.setConnectDelay(120);

  const connected = once(socket, 'connect', 2000);
  socket.connect();
  await waitFor(() => server.connectPackets() === 1, 'primer CONNECT del namespace');
  assert.equal(socket.active, true, 'el handshake sigue en curso');

  // Reproduce lo que hacía `reconectarSiHaceFalta()` con un evento de
  // visibilidad/conectividad: segundo `connect()` sin esperar al primero.
  socket.connect();
  await waitFor(() => server.connectPackets() === 2, 'CONNECT duplicado');

  await connected;
  assert.equal(socket.connected, true);
  assert.equal(server.connectPackets(), 2, 'socket.io-client 4.8.3 envía un CONNECT por llamada');
});

test('el gate de conectividad no duplica el CONNECT durante un handshake en curso', async (t) => {
  const server = await createFakeSocketServer();
  const socket = createClient(server.url);
  t.after(async () => {
    socket.close();
    await server.close();
  });

  server.setMode('ok');
  server.setConnectDelay(120);

  const connected = once(socket, 'connect', 2000);
  let iniciados = 0;
  for (let i = 0; i < 100; i += 1) {
    if (
      reconnectOnConnectivityRecovery({
        socket,
        retryPending: false,
        hasToken: true,
        online: true,
      })
    ) {
      iniciados += 1;
    }
  }

  assert.equal(iniciados, 1, 'solo la primera señal inicia el handshake');
  await waitFor(() => server.connectPackets() === 1, 'CONNECT del namespace');
  assert.equal(socket.active, true);

  await connected;
  assert.equal(socket.connected, true);
  assert.equal(server.connectPackets(), 1, 'no debe enviarse un segundo CONNECT');
  assert.equal(server.connections(), 1, 'tampoco una segunda conexión Engine.IO');
});

test('el gate no adelanta un reintento de server_error ya programado', async (t) => {
  const server = await createFakeSocketServer();
  const socket = createClient(server.url);
  const scheduler = createRetryScheduler({
    attempt: () => socket.connect(),
    backoff: { reconnectionDelay: 300, reconnectionDelayMax: 600, randomizationFactor: 0 },
  });
  t.after(async () => {
    scheduler.reset();
    socket.close();
    await server.close();
  });

  socket.on('connect_error', (err: Error) => {
    handleConnectError(err.message, {
      expireSession: () => {
        throw new Error('un server_error no debe cerrar la sesión');
      },
      scheduleRetry: () => scheduler.schedule(),
    });
  });

  server.setMode('infra');
  socket.connect();
  await waitFor(() => scheduler.isPending(), 'reintento programado');

  // Ráfaga de online/visibilitychange/pageshow durante el backoff.
  for (let i = 0; i < 100; i += 1) {
    assert.equal(
      reconnectOnConnectivityRecovery({
        socket,
        retryPending: scheduler.isPending(),
        hasToken: true,
        online: true,
      }),
      false
    );
  }
  assert.equal(server.connections(), 1, 'la ráfaga no debe abrir otra conexión');
  assert.equal(scheduler.isPending(), true);

  const connected = once(socket, 'connect', 2000);
  server.setMode('ok');
  await connected;

  assert.equal(socket.connected, true);
  assert.equal(server.connections(), 2, 'solo el reintento programado reconecta');
  assert.equal(scheduler.isPending(), false);
});

test('server_error: el reintento propio reconecta sin recargar la aplicación', async (t) => {
  const server = await createFakeSocketServer();
  const socket = createClient(server.url);
  const scheduler = createRetryScheduler({
    attempt: () => socket.connect(),
    backoff: { reconnectionDelay: 20, reconnectionDelayMax: 40, randomizationFactor: 0 },
  });
  t.after(async () => {
    scheduler.reset();
    socket.close();
    await server.close();
  });

  let expiraciones = 0;
  let reintentosProgramados = 0;

  // Mismo cableado que `store/socket.ts`: el handshake exitoso reinicia el backoff.
  socket.on('connect', () => scheduler.reset());

  socket.on('connect_error', (err: Error) => {
    handleConnectError(err.message, {
      expireSession: () => {
        expiraciones += 1;
      },
      scheduleRetry: () => {
        reintentosProgramados += 1;
        scheduler.schedule();
      },
    });
  });

  const connected = once(socket, 'connect');
  server.setMode('infra');
  socket.connect();

  await waitFor(() => reintentosProgramados === 1, 'primer reintento programado');
  assert.equal(expiraciones, 0, 'un error temporal no debe cerrar la sesión');

  // PostgreSQL vuelve antes de que dispare el reintento.
  server.setMode('ok');
  await connected;

  assert.equal(socket.connected, true);
  assert.equal(scheduler.isPending(), false, 'no debe quedar ningún temporizador pendiente');
  assert.equal(scheduler.attempts(), 0, 'el connect exitoso reinicia el backoff');
  assert.equal(server.connections(), 2, 'exactamente un reintento, sin tormenta');

  const socketId = socket.id;
  assert.ok(typeof socketId === 'string' && socketId.length > 0);
});

test('unauthorized: cierra la sesión y no reintenta', async (t) => {
  const server = await createFakeSocketServer();
  const socket = createClient(server.url);
  const scheduler = createRetryScheduler({
    attempt: () => socket.connect(),
    backoff: { reconnectionDelay: 20, reconnectionDelayMax: 40, randomizationFactor: 0 },
  });
  t.after(async () => {
    scheduler.reset();
    socket.close();
    await server.close();
  });

  let expiraciones = 0;
  let reintentosProgramados = 0;

  socket.on('connect_error', (err: Error) => {
    handleConnectError(err.message, {
      expireSession: () => {
        socket.io.reconnection(false);
        scheduler.cancel();
        expiraciones += 1;
      },
      scheduleRetry: () => {
        reintentosProgramados += 1;
        scheduler.schedule();
      },
    });
  });

  server.setMode('auth');
  socket.connect();

  await waitFor(() => expiraciones === 1, 'cierre de sesión por unauthorized');
  assert.equal(reintentosProgramados, 0, 'un token inválido no debe reintentarse');

  await sleep(150);
  assert.equal(server.connections(), 1);
  assert.equal(socket.connected, false);
});

test('un mensaje desconocido no activa reintentos personalizados ni cierra la sesión', async (t) => {
  const server = await createFakeSocketServer();
  const socket = createClient(server.url);
  t.after(async () => {
    socket.close();
    await server.close();
  });

  let expiraciones = 0;
  let reintentosProgramados = 0;

  socket.on('connect_error', (err: Error) => {
    handleConnectError(err.message, {
      expireSession: () => {
        expiraciones += 1;
      },
      scheduleRetry: () => {
        reintentosProgramados += 1;
      },
    });
  });

  server.setMode('unknown');
  const errorPromise = once(socket, 'connect_error');
  socket.connect();

  const error = await errorPromise;
  assert.equal(error?.message, 'error_desconocido');
  assert.equal(socket.active, false, 'el namespace queda destruido, sin reintento nativo');

  await sleep(150);
  assert.equal(expiraciones, 0, 'un mensaje desconocido no debe cerrar la sesión');
  assert.equal(reintentosProgramados, 0, 'tampoco debe programar un reintento propio');
  assert.equal(server.connections(), 1, 'el manager no reintenta un CONNECT_ERROR de namespace');
  assert.equal(server.connectPackets(), 1);
});
