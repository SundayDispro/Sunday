import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTH_ERROR_MESSAGE,
  INFRA_ERROR_MESSAGE,
  classifyConnectError,
  computeRetryDelay,
  createRetryScheduler,
  decideConnectErrorAction,
  handleConnectError,
  reconnectOnConnectivityRecovery,
  type BackoffOptions,
} from '../src/store/socketRetry.ts';

/** Parámetros reales configurados en `store/socket.ts`. */
const BACKOFF: BackoffOptions = {
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.5,
};

type FakeTimer = { id: number; callback: () => void; delay: number };

/** Reloj falso: el programador nunca depende de temporizadores reales. */
function createFakeClock() {
  const timers: FakeTimer[] = [];
  let nextId = 1;

  const setTimeoutFn = (callback: () => void, delay: number): unknown => {
    const timer: FakeTimer = { id: nextId, callback, delay };
    nextId += 1;
    timers.push(timer);
    return timer.id;
  };

  const clearTimeoutFn = (handle: unknown): void => {
    const index = timers.findIndex((timer) => timer.id === handle);
    if (index !== -1) timers.splice(index, 1);
  };

  const runNext = (): FakeTimer => {
    const timer = timers.shift();
    assert.ok(timer, 'esperaba un temporizador pendiente');
    timer.callback();
    return timer;
  };

  return { timers, setTimeoutFn, clearTimeoutFn, runNext };
}

function createSchedulerHarness(
  onAttempt: () => void,
  random: () => number = () => 0
) {
  const clock = createFakeClock();
  const scheduler = createRetryScheduler({
    attempt: onAttempt,
    backoff: BACKOFF,
    random,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });
  return { clock, scheduler };
}

/**
 * Socket mínimo con la misma semántica observable que socket.io-client:
 * `connect()` marca `active = true` (handshake en curso) y un CONNECT_ERROR
 * volvería a dejarlo en `false`.
 */
function createGateSocket(initial: { connected?: boolean; active?: boolean } = {}) {
  let connects = 0;
  const socket = {
    connected: initial.connected ?? false,
    active: initial.active ?? false,
    connect: (): void => {
      connects += 1;
      socket.active = true;
    },
  };
  return { socket, connects: () => connects };
}

// ---------------------------------------------------------------------------
// Clasificación del mensaje del `connect_error`
// ---------------------------------------------------------------------------

test('un JWT inválido/caducado (`unauthorized`) se clasifica como auth', () => {
  assert.equal(classifyConnectError(AUTH_ERROR_MESSAGE), 'auth');
  assert.equal(AUTH_ERROR_MESSAGE, 'unauthorized');
});

test('una caída de PostgreSQL (`server_error`) se clasifica como infra', () => {
  assert.equal(classifyConnectError(INFRA_ERROR_MESSAGE), 'infra');
  assert.equal(INFRA_ERROR_MESSAGE, 'server_error');
});

test('otros mensajes no se confunden con auth ni con infra', () => {
  const otros = [
    'xhr poll error',
    'websocket error',
    'timeout',
    'Unauthorized',
    ' unauthorized',
    'server error',
    '',
    null,
    undefined,
    42,
    {},
  ];
  for (const mensaje of otros) {
    assert.equal(classifyConnectError(mensaje), 'unknown');
  }
});

// ---------------------------------------------------------------------------
// Decisión (auth vs. reintento vs. delegar en el manager)
// ---------------------------------------------------------------------------

test('auth cierra sesión', () => {
  assert.equal(decideConnectErrorAction('auth'), 'expire_session');
});

test('infra reintenta aunque el socket haya sido destruido por CONNECT_ERROR', () => {
  assert.equal(decideConnectErrorAction('infra'), 'retry');
});

test('un mensaje desconocido nunca inicia el programador propio', () => {
  // Debe quedar en manos del comportamiento nativo del manager/socket.
  assert.equal(decideConnectErrorAction('unknown'), 'ignore');
});

// ---------------------------------------------------------------------------
// Efectos: qué NO debe pasar ante un error temporal
// ---------------------------------------------------------------------------

test('server_error no expira la sesión ni vacía la cola de escrituras pendientes', () => {
  let expiraciones = 0;
  let reintentos = 0;

  const accion = handleConnectError(INFRA_ERROR_MESSAGE, {
    // En `socket.ts` este es el ÚNICO camino que llama a clearPendingCellWrites().
    expireSession: () => {
      expiraciones += 1;
    },
    scheduleRetry: () => {
      reintentos += 1;
    },
  });

  assert.equal(accion, 'retry');
  assert.equal(expiraciones, 0, 'un error temporal no debe cerrar la sesión');
  assert.equal(reintentos, 1, 'debe programarse exactamente un reintento');
});

test('unauthorized cierra la sesión y no programa reintentos', () => {
  let expiraciones = 0;
  let reintentos = 0;

  const accion = handleConnectError(AUTH_ERROR_MESSAGE, {
    expireSession: () => {
      expiraciones += 1;
    },
    scheduleRetry: () => {
      reintentos += 1;
    },
  });

  assert.equal(accion, 'expire_session');
  assert.equal(expiraciones, 1);
  assert.equal(reintentos, 0);
});

// ---------------------------------------------------------------------------
// Backoff: réplica de backo2 (manager de socket.io-client)
// ---------------------------------------------------------------------------

test('computeRetryDelay replica backo2 para un random fijo', () => {
  assert.equal(computeRetryDelay(0, BACKOFF, () => 0.5), 1250);
  assert.equal(computeRetryDelay(1, BACKOFF, () => 0.5), 2500);
  assert.equal(computeRetryDelay(2, BACKOFF, () => 0.5), 5000);
});

test('respeta el tope reconnectionDelayMax en todos los escalones', () => {
  for (let intento = 0; intento < 50; intento += 1) {
    const delay = computeRetryDelay(intento, BACKOFF, () => 0.99);
    assert.ok(delay > 0, `delay no positivo en el intento ${intento}: ${delay}`);
    assert.ok(delay <= 10000, `delay ${delay} supera el máximo en el intento ${intento}`);
  }
});

test('crece de forma monótona hasta el tope', () => {
  const delays = [0, 1, 2, 3, 4, 5].map((intento) =>
    computeRetryDelay(intento, BACKOFF, () => 0)
  );
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 10000, 10000]);
});

test('randomizationFactor fuera de (0, 1] desactiva el jitter, como backo2', () => {
  assert.equal(
    computeRetryDelay(0, { ...BACKOFF, randomizationFactor: 0 }, () => 0.99),
    1000
  );
  assert.equal(
    computeRetryDelay(0, { ...BACKOFF, randomizationFactor: 2 }, () => 0.99),
    1000
  );
});

test('usa los defaults del manager si faltan opciones y tolera intentos inválidos', () => {
  assert.equal(computeRetryDelay(0, {}, () => 0), 1000);
  assert.equal(computeRetryDelay(Number.NaN, BACKOFF, () => 0), 1000);
  assert.equal(computeRetryDelay(-3, BACKOFF, () => 0), 1000);
});

// ---------------------------------------------------------------------------
// Programador: un único temporizador, sin tormentas ni duplicados
// ---------------------------------------------------------------------------

test('una tormenta de connect_error deja un único temporizador pendiente', () => {
  let intentos = 0;
  const { clock, scheduler } = createSchedulerHarness(() => {
    intentos += 1;
  });

  for (let i = 0; i < 100; i += 1) scheduler.schedule();

  assert.equal(clock.timers.length, 1, 'no debe haber temporizadores en paralelo');
  assert.equal(intentos, 0, 'no debe haber intentos inmediatos');
  assert.equal(clock.timers[0].delay, 1000);
});

test('cada disparo programa el siguiente escalón sin dejar timers huérfanos', () => {
  let intentos = 0;
  const { clock, scheduler } = createSchedulerHarness(() => {
    intentos += 1;
  });

  scheduler.schedule();
  const primerTimer = clock.runNext();
  assert.equal(primerTimer.delay, 1000);
  assert.equal(intentos, 1);
  assert.equal(scheduler.isPending(), false);

  scheduler.schedule();
  const segundoTimer = clock.runNext();
  assert.equal(segundoTimer.delay, 2000);
  assert.equal(intentos, 2);
  assert.equal(scheduler.attempts(), 2);
});

test('cancel descarta el reintento pendiente sin reiniciar el backoff', () => {
  let intentos = 0;
  const { clock, scheduler } = createSchedulerHarness(() => {
    intentos += 1;
  });

  scheduler.schedule();
  scheduler.cancel();
  assert.equal(clock.timers.length, 0);
  assert.equal(scheduler.isPending(), false);

  scheduler.schedule();
  assert.equal(clock.timers[0].delay, 2000, 'cancel no debe reiniciar el contador');
});

test('reset vuelve al primer escalón (login/recuperación)', () => {
  let intentos = 0;
  const { clock, scheduler } = createSchedulerHarness(() => {
    intentos += 1;
  });

  scheduler.schedule();
  scheduler.schedule(); // ignorado: ya hay uno pendiente
  scheduler.reset();
  assert.equal(clock.timers.length, 0);
  assert.equal(scheduler.attempts(), 0);

  scheduler.schedule();
  assert.equal(clock.timers[0].delay, 1000);
  assert.equal(intentos, 0);
});

// ---------------------------------------------------------------------------
// Coordinación con online/visibilitychange/pageshow
// ---------------------------------------------------------------------------

test('la primera señal de conectividad conecta y el resto de la ráfaga no duplica el intento', () => {
  const gate = createGateSocket();
  let iniciados = 0;

  for (let i = 0; i < 100; i += 1) {
    const inicio = reconnectOnConnectivityRecovery({
      socket: gate.socket,
      retryPending: false,
      hasToken: true,
      online: true,
    });
    if (inicio) iniciados += 1;
  }

  assert.equal(iniciados, 1, 'solo la primera señal debe iniciar el intento');
  assert.equal(gate.connects(), 1);
  assert.equal(gate.socket.active, true, 'el handshake queda en curso');
});

test('un handshake ya en curso no se duplica con más eventos de conectividad', () => {
  const gate = createGateSocket({ active: true });

  for (let i = 0; i < 100; i += 1) {
    assert.equal(
      reconnectOnConnectivityRecovery({
        socket: gate.socket,
        retryPending: false,
        hasToken: true,
        online: true,
      }),
      false
    );
  }

  assert.equal(gate.connects(), 0);
});

test('un reintento ya programado no se adelanta ni se cancela con eventos', () => {
  const gate = createGateSocket();

  for (let i = 0; i < 100; i += 1) {
    assert.equal(
      reconnectOnConnectivityRecovery({
        socket: gate.socket,
        retryPending: true,
        hasToken: true,
        online: true,
      }),
      false
    );
  }

  assert.equal(gate.connects(), 0);
});

test('sin JWT, sin red o ya conectado no se inicia ningún intento', () => {
  const sinToken = createGateSocket();
  assert.equal(
    reconnectOnConnectivityRecovery({
      socket: sinToken.socket,
      retryPending: false,
      hasToken: false,
      online: true,
    }),
    false
  );
  assert.equal(sinToken.connects(), 0);

  const sinRed = createGateSocket();
  assert.equal(
    reconnectOnConnectivityRecovery({
      socket: sinRed.socket,
      retryPending: false,
      hasToken: true,
      online: false,
    }),
    false
  );
  assert.equal(sinRed.connects(), 0);

  const yaConectado = createGateSocket({ connected: true });
  assert.equal(
    reconnectOnConnectivityRecovery({
      socket: yaConectado.socket,
      retryPending: false,
      hasToken: true,
      online: true,
    }),
    false
  );
  assert.equal(yaConectado.connects(), 0);
});

test('una ráfaga de conectividad no adelanta el backoff mientras el servidor sigue caído', () => {
  const clock = createFakeClock();
  const gate = createGateSocket();
  let intentos = 0;
  let scheduler!: ReturnType<typeof createRetryScheduler>;

  const fallarHandshake = (): void => {
    // CONNECT_ERROR de namespace: socket.io destruye el socket (active = false)
    // y el manejador de producción programa el siguiente escalón.
    gate.socket.active = false;
    scheduler.schedule();
  };

  scheduler = createRetryScheduler({
    attempt: () => {
      intentos += 1;
      gate.socket.connect(); // active = true: handshake en curso
      fallarHandshake();
    },
    backoff: BACKOFF,
    random: () => 0,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  // Primer handshake rechazado con `server_error`.
  gate.socket.connect();
  fallarHandshake();
  assert.equal(clock.timers.length, 1);
  assert.equal(clock.timers[0].delay, 1000);

  const rafaga = (): void => {
    for (let i = 0; i < 100; i += 1) {
      assert.equal(
        reconnectOnConnectivityRecovery({
          socket: gate.socket,
          retryPending: scheduler.isPending(),
          hasToken: true,
          online: true,
        }),
        false
      );
    }
  };

  // Ráfaga de online + visibilitychange + pageshow antes del primer reintento.
  rafaga();
  assert.equal(gate.connects(), 1, 'la ráfaga no debe iniciar conexiones');
  assert.equal(clock.timers.length, 1, 'el temporizador programado sigue intacto');

  assert.equal(clock.runNext().delay, 1000);
  assert.equal(intentos, 1);
  assert.equal(gate.connects(), 2);
  assert.equal(clock.timers.length, 1, 'un fallo debe reprogramar el siguiente escalón');

  // Nueva ráfaga durante el segundo escalón: tampoco lo adelanta.
  rafaga();
  assert.equal(gate.connects(), 2);
  assert.equal(clock.timers[0].delay, 2000);

  assert.equal(clock.runNext().delay, 2000);
  assert.equal(intentos, 2);
  assert.equal(clock.timers[0].delay, 4000);
  assert.equal(scheduler.attempts(), 3);
});

test('tras un login explícito (reset + nuevo JWT) la reconexión vuelve a habilitarse', () => {
  const gate = createGateSocket();
  const { scheduler } = createSchedulerHarness(() => {});

  scheduler.schedule();
  assert.equal(scheduler.isPending(), true);
  assert.equal(
    reconnectOnConnectivityRecovery({
      socket: gate.socket,
      retryPending: scheduler.isPending(),
      hasToken: true,
      online: true,
    }),
    false,
    'con un reintento pendiente no se adelanta'
  );

  // Login: `reconnectSocketWithAuth()` hace reset() y luego connect().
  scheduler.reset();
  assert.equal(scheduler.isPending(), false);
  assert.equal(scheduler.attempts(), 0);
  assert.equal(
    reconnectOnConnectivityRecovery({
      socket: gate.socket,
      retryPending: scheduler.isPending(),
      hasToken: true,
      online: true,
    }),
    true
  );
  assert.equal(gate.connects(), 1);
});

test('simulación: PostgreSQL caído, reintentos acotados y reconexión al volver', () => {
  const clock = createFakeClock();
  let fallos = 0;
  let conectado = false;
  let scheduler!: ReturnType<typeof createRetryScheduler>;
  const delays: number[] = [];

  scheduler = createRetryScheduler({
    attempt: () => {
      fallos += 1;
      if (fallos < 3) {
        // El servidor sigue sin base de datos: nuevo CONNECT_ERROR → mismo flujo.
        scheduler.schedule();
      } else {
        // PostgreSQL volvió: el handshake se acepta sin recargar la aplicación.
        conectado = true;
      }
    },
    backoff: BACKOFF,
    random: () => 0,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  scheduler.schedule();
  assert.deepEqual(
    [clock.runNext().delay, clock.runNext().delay, clock.runNext().delay],
    [1000, 2000, 4000]
  );

  assert.equal(fallos, 3);
  assert.equal(conectado, true);
  assert.equal(clock.timers.length, 0, 'no debe quedar ningún reintento tras conectar');

  // Al conectar de verdad, socket.ts llama a reset(): un fallo posterior empieza en 1000 ms.
  scheduler.reset();
  scheduler.schedule();
  assert.equal(clock.timers[0].delay, 1000);
});

test('un mensaje desconocido no programa reintentos ni cierra la sesión', () => {
  let expiraciones = 0;
  let reintentos = 0;

  const accion = handleConnectError('xhr poll error', {
    expireSession: () => {
      expiraciones += 1;
    },
    scheduleRetry: () => {
      reintentos += 1;
    },
  });

  assert.equal(accion, 'ignore');
  assert.equal(expiraciones, 0);
  assert.equal(reintentos, 0);
});

test('varios connect_error de infraestructura comparten un único temporizador', () => {
  let intentos = 0;
  const { clock, scheduler } = createSchedulerHarness(() => {
    intentos += 1;
  });

  for (let i = 0; i < 10; i += 1) {
    handleConnectError(INFRA_ERROR_MESSAGE, {
      expireSession: () => {
        throw new Error('un error temporal nunca debe cerrar la sesión');
      },
      scheduleRetry: () => scheduler.schedule(),
    });
  }

  assert.equal(clock.timers.length, 1);
  assert.equal(scheduler.attempts(), 1);
  assert.equal(intentos, 0);
});
