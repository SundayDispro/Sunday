/**
 * Política de sesión del cliente ante respuestas HTTP.
 *
 * `api.ts` no se puede importar en Node directamente porque usa `import.meta.env`
 * y `window`; por eso la decisión vive en `apiSession.ts` y aquí se prueba la
 * misma función que usa `apiFetch`. La integración HTTP real se cubre en
 * `backend/tests/httpAuth.test.ts` (503) y con el typecheck del frontend.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyApiFailure,
  isServiceUnavailable,
  shouldExpireSession,
} from '../src/apiSession.ts';

const TOKEN = 'jwt-de-la-sesion';

test('clasificación de estados HTTP', () => {
  assert.equal(classifyApiFailure(401), 'auth');
  assert.equal(classifyApiFailure(503), 'service_unavailable');
  assert.equal(classifyApiFailure(403), 'forbidden');
  assert.equal(classifyApiFailure(400), 'other');
  assert.equal(classifyApiFailure(500), 'other');
  assert.equal(classifyApiFailure(502), 'other');
  assert.equal(classifyApiFailure(504), 'other');
});

test('401 con el mismo token: expira la sesión (comportamiento existente)', () => {
  assert.equal(shouldExpireSession(401, TOKEN, TOKEN), true);
});

test('401 sin token o con otro token: no expira la sesión', () => {
  assert.equal(shouldExpireSession(401, null, null), false);
  assert.equal(shouldExpireSession(401, TOKEN, null), false);
  assert.equal(shouldExpireSession(401, TOKEN, 'otro-token'), false);
});

test('503 por caída del servicio: NO expira la sesión aunque el token no cambie', () => {
  assert.equal(shouldExpireSession(503, TOKEN, TOKEN), false);
  assert.equal(isServiceUnavailable(503), true);
});

test('500/502/504 y 403 no expiran la sesión', () => {
  for (const status of [500, 502, 504, 403, 400, 200]) {
    assert.equal(shouldExpireSession(status, TOKEN, TOKEN), false, `status ${status}`);
    assert.equal(isServiceUnavailable(status), false, `status ${status}`);
  }
});

test('simulación de la política de apiFetch ante una caída de infraestructura', () => {
  // El servidor responde 503 aunque el JWT siga siendo válido.
  const status = 503;
  const tokenUsedForRequest = TOKEN;
  const tokenNow = TOKEN;

  const expires = shouldExpireSession(status, tokenUsedForRequest, tokenNow);

  // Ningún efecto de logout: no se limpia el JWT ni la cola offline.
  assert.equal(expires, false);
  assert.equal(tokenNow, TOKEN);
});
