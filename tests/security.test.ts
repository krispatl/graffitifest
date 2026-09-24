import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify, validPassword } from '../lib/auth/session';
import { commandSchema, nameSchema } from '../lib/api';
process.env.SESSION_SECRET = 'unit-test-session-secret-at-least-32-characters';
process.env.CONTROL_PASSWORD = 'unit-test-password';
test('session signatures reject edits, wrong roles, expired tokens, and password rotation', () => {
  const token = sign('operator', 60);
  assert.equal(verify(token, 'operator'), true);
  assert.equal(verify(token, 'projector'), false);
  assert.equal(verify(token + 'x', 'operator'), false);
  assert.equal(verify(sign('operator', -1), 'operator'), false);
  process.env.CONTROL_PASSWORD = 'rotated-test-password';
  assert.equal(verify(token, 'operator'), false);
  process.env.CONTROL_PASSWORD = 'unit-test-password';
  assert.ok(validPassword('unit-test-password'));
  assert.ok(!validPassword('wrong-password'));
});
test('input normalization rejects HTML/control characters and out-of-bounds settings', () => {
  assert.equal(nameSchema.parse('  María  '), 'MARÍA');
  assert.throws(() => nameSchema.parse('<script>'));
  assert.throws(() => nameSchema.parse('A\nB'));
  assert.throws(() => nameSchema.parse('ABCDEFGHIJKLMNOPQ'));
  assert.throws(() => commandSchema.parse({ id: 'invalid', action: 'next' }));
  assert.throws(() =>
    commandSchema.parse({
      id: '59493331-4326-4c1a-98ea-f5ba41fe752a',
      action: 'settings',
      settings: { drawTime: -1 },
    }),
  );
});
