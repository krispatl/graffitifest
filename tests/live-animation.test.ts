import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveAnimationAt } from '../lib/graffiti/AnimationDirector';
import { initialState, applyCommand, snapshot } from '../lib/queue/machine';
import { commandSchema } from '../lib/api';
import { randomUUID } from 'node:crypto';

test('live animations use persisted wall time during HOLD and never replay after expiry', () => {
  const state = initialState();
  state.queue.push({
    id: randomUUID(),
    name: 'CYBER',
    receiptHash: 'x',
    status: 'queued',
    createdAt: 0,
  });
  applyCommand(state, { id: randomUUID(), action: 'next' }, 1000);
  state.current!.settings.style = 'BLOCK';
  state.heldAt = 2000;
  applyCommand(state, { id: randomUUID(), action: 'morph', style: 'TAG' }, 3000);
  applyCommand(state, { id: randomUUID(), action: 'effect', effect: 'WAVE' }, 3000);
  const s = snapshot(state, 3000);
  assert.equal(liveAnimationAt(s, 2000).effect, 0);
  assert.equal(liveAnimationAt(s, 4500).morph, 0.5);
  assert.equal(liveAnimationAt(s, 5000).amount, 1);
  assert.equal(liveAnimationAt(s, 5000).effect, 2);
  const expired = liveAnimationAt(JSON.parse(JSON.stringify(s)), 9000);
  assert.equal(expired.effect, 0);
  assert.equal(expired.morph, 1);
  assert.equal(liveAnimationAt({ ...s, blackout: true }, 5000).effect, 0);
});

test('live command validation requires valid effect and performance target', () => {
  const base = { id: randomUUID(), performanceId: randomUUID() };
  assert.equal(
    commandSchema.safeParse({ ...base, action: 'effect', effect: 'WAVE' }).success,
    true,
  );
  assert.equal(
    commandSchema.safeParse({ ...base, action: 'effect', effect: 'STROBE' }).success,
    false,
  );
  assert.equal(commandSchema.safeParse({ ...base, action: 'effect' }).success, false);
  assert.equal(commandSchema.safeParse({ id: randomUUID(), action: 'morph' }).success, false);
  assert.equal(commandSchema.safeParse({ ...base, action: 'morph', style: 'FAKE' }).success, false);
});
