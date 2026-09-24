import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initialState, applyCommand, advance, snapshot } from '../lib/queue/machine';
import type { Installation, Command, Submission } from '../lib/types';
import { rowsFor } from '../lib/graffiti/StyleEngine';
import { random } from '../lib/graffiti/PaletteEngine';
function entry(name: string, status: Submission['status'] = 'queued'): Submission {
  return { id: randomUUID(), name, receiptHash: name, createdAt: 0, status };
}
function cmd(
  s: Installation,
  action: Command['action'],
  now: number,
  extra: Partial<Command> = {},
) {
  applyCommand(s, { id: randomUUID(), action, ...extra }, now);
}
function tick(s: Installation, now: number) {
  s.projectorSeenAt = now;
  advance(s, now);
}
function playing() {
  const s = initialState();
  s.queue.push(entry('KRIS'), entry('MARIA'));
  tick(s, 1000);
  return s;
}
test('only one current piece; phase deadlines are persisted and next starts at reconnect time', () => {
  const s = playing();
  assert.equal(s.current?.name, 'KRIS');
  assert.equal(s.queue.length, 1);
  tick(s, 2000);
  assert.equal(s.phase, 'DRAWING');
  tick(s, 10000);
  assert.equal(s.phase, 'DETAIL');
  tick(s, 13000);
  assert.equal(s.phase, 'HERO');
  tick(s, 27000);
  assert.equal(s.phase, 'TRANSITIONING');
  tick(s, 999999);
  assert.equal(s.current?.name, 'MARIA');
  assert.equal(s.phaseStartedAt, 999999);
  assert.equal(s.history[0].status, 'done');
});
test('pending names require explicit approval; empty polls do not write', () => {
  const s = initialState();
  s.queue.push(entry('KRIS', 'pending'));
  s.projectorSeenAt = 1000;
  const before = JSON.stringify(s);
  advance(s, 1000);
  assert.equal(JSON.stringify(s), before);
  cmd(s, 'approve', 1000, { submissionId: s.queue[0].id });
  tick(s, 1000);
  assert.equal(s.current?.name, 'KRIS');
});
test('no connected projector leaves queued names intact', () => {
  const s = initialState();
  s.queue.push(entry('KRIS'));
  advance(s, 20000);
  assert.equal(s.current, null);
  assert.equal(s.queue.length, 1);
});
test('HOLD pauses lifecycle and RESUME preserves remaining duration', () => {
  const s = playing();
  tick(s, 15000);
  cmd(s, 'hold', 17000);
  tick(s, 60000);
  assert.equal(s.phase, 'HERO');
  cmd(s, 'resume', 60000);
  assert.equal(s.phaseStartedAt, 56000);
  tick(s, 69999);
  assert.equal(s.phase, 'HERO');
  tick(s, 70000);
  assert.equal(s.phase, 'TRANSITIONING');
});
test('blackout preserves queue and pauses clock, including an already held piece', () => {
  const s = playing();
  tick(s, 14000);
  cmd(s, 'blackout', 15000);
  const queue = structuredClone(s.queue);
  tick(s, 90000);
  assert.deepEqual(s.queue, queue);
  cmd(s, 'blackout', 90000);
  assert.equal(s.phaseStartedAt, 88000);
  cmd(s, 'hold', 92000);
  cmd(s, 'blackout', 93000);
  cmd(s, 'blackout', 100000);
  assert.equal(s.heldAt, 92000);
  cmd(s, 'resume', 110000);
  assert.equal(s.phaseStartedAt, 106000);
});
test('manual and auto advance off hold HERO, while NEXT explicitly transitions', () => {
  for (const manual of [true, false]) {
    const s = playing();
    if (manual) s.settings.preset = 'MANUAL';
    else s.settings.autoAdvance = false;
    tick(s, 90000);
    assert.equal(s.phase, 'HERO');
    cmd(s, 'next', 90000);
    assert.equal(s.phase, 'TRANSITIONING');
    tick(s, 93000);
    assert.equal(s.current?.name, 'MARIA');
  }
});
test('repeated command IDs and late NEXT cannot consume multiple pieces', () => {
  const s = playing(),
    c: Command = { id: randomUUID(), action: 'skip', performanceId: s.current!.id };
  applyCommand(s, c, 1100);
  const id = s.current!.id;
  applyCommand(s, c, 1200);
  assert.equal(s.current?.id, id);
  assert.throws(() => applyCommand(s, { ...c, id: randomUUID() }, 1300), /moved on/);
});
test('play now retains one current piece during transition; replay preserves seed', () => {
  const s = playing(),
    next = s.queue[0].id,
    old = s.current;
  cmd(s, 'play', 3000, { submissionId: next });
  assert.equal(s.current?.id, old?.id);
  tick(s, 6000);
  assert.equal(s.current?.submissionId, next);
  const seed = s.current?.seed;
  cmd(s, 'replay', 7000);
  assert.equal(s.current?.seed, seed);
  assert.equal(s.phase, 'GENERATING');
});
test('queue reorder/edit/block and private receipt views', () => {
  const s = initialState();
  s.queue.push(entry('A'), entry('B'), entry('B'));
  const id = s.queue[0].id;
  cmd(s, 'down', 0, { submissionId: id });
  assert.equal(s.queue[1].name, 'A');
  cmd(s, 'edit', 0, { submissionId: id, name: 'KRIS' });
  cmd(s, 'block', 0, { submissionId: s.queue[0].id });
  assert.deepEqual(
    s.queue.map((x) => x.name),
    ['KRIS'],
  );
  assert.deepEqual(s.blockedNames, ['B']);
  const publicState = snapshot(s, 0, false, 'A');
  assert.equal(publicState.queue, undefined);
  assert.equal(publicState.receipt?.name, 'KRIS');
  assert.equal(publicState.receipt?.position, 1);
  assert.ok(!JSON.stringify(snapshot(s, 0, true)).includes('receiptHash'));
});
test('clear does not silently restart the queued artwork', () => {
  const s = playing();
  cmd(s, 'clear', 2000);
  tick(s, 5000);
  assert.equal(s.current, null);
  assert.equal(s.phase, 'IDLE');
  assert.equal(s.queue.length, 1);
  assert.equal(s.settings.autoAdvance, false);
});
test('settings are snapshotted into each performance', () => {
  const s = playing();
  const before = s.current!.settings.drawTime;
  cmd(s, 'settings', 1000, { settings: { drawTime: 22, palette: 'BLOOD' } });
  assert.equal(s.current?.settings.drawTime, before);
  cmd(s, 'regenerate', 2000);
  assert.equal(s.current?.settings.drawTime, 22);
});
test('long names recompose without dropping letters; seeded randomness repeats', () => {
  for (const name of ['KRIS', 'ABCDEFGHIJKL', 'MARIA JOSE', 'ALEXANDER']) {
    assert.equal(
      rowsFor(name, 16 / 9)
        .join('')
        .replaceAll(' ', ''),
      name.replaceAll(' ', ''),
    );
  }
  assert.equal(rowsFor('ABCDEFGHIJKL', 16 / 9).length, 2);
  const a = random(123),
    b = random(123);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('morph changes only the live style and survives HOLD, deduplication, and refresh', () => {
  const s = playing();
  tick(s, 13000);
  cmd(s, 'hold', 14000);
  s.current!.settings.style = 'BLOCK';
  const before = structuredClone(s);
  const command: Command = {
    id: randomUUID(),
    action: 'morph',
    style: 'TAG',
    performanceId: s.current!.id,
  };
  applyCommand(s, command, 15000);
  assert.equal(s.current!.id, before.current!.id);
  assert.equal(s.current!.seed, before.current!.seed);
  assert.equal(s.current!.name, before.current!.name);
  assert.equal(s.current!.settings.style, 'TAG');
  assert.deepEqual(s.current!.morph!.fromSettings, before.current!.settings);
  assert.equal(s.phaseStartedAt, before.phaseStartedAt);
  assert.equal(s.heldAt, before.heldAt);
  assert.deepEqual(s.queue, before.queue);
  assert.deepEqual(s.settings, before.settings, 'future pieces keep their existing art settings');
  applyCommand(s, command, 16000);
  assert.equal(s.current!.morph!.startedAt, 15000);
  assert.throws(() => cmd(s, 'morph', 16000, { style: 'CHROME' }), /finish/);
  const restored = JSON.parse(JSON.stringify(s));
  cmd(restored, 'morph', 19000, { style: 'CHROME', performanceId: s.current!.id });
  assert.equal(restored.current.morph.fromSettings.style, 'TAG');
  assert.equal(restored.current.settings.style, 'CHROME');
});

test('live effects are scoped to the piece and reject stale or invisible targets', () => {
  const s = playing();
  tick(s, 13000);
  cmd(s, 'hold', 14000);
  const currentId = s.current!.id;
  cmd(s, 'effect', 15000, { effect: 'WAVE', performanceId: currentId });
  assert.equal(s.current!.effect!.kind, 'WAVE');
  assert.equal(s.heldAt, 14000);
  assert.equal(snapshot(s, 16000).current!.effect!.startedAt, 15000);
  cmd(s, 'stop_effect', 16000, { performanceId: currentId });
  assert.equal(s.current!.effect, undefined);
  assert.throws(
    () => cmd(s, 'effect', 16000, { effect: 'PULSE', performanceId: randomUUID() }),
    /moved on/,
  );
  cmd(s, 'blackout', 17000);
  assert.throws(() => cmd(s, 'effect', 17000, { effect: 'PULSE' }), /visible/);
  assert.throws(() => cmd(s, 'morph', 17000), /visible/);
  cmd(s, 'blackout', 18000);
  cmd(s, 'effect', 18000, { effect: 'SPRAY' });
  cmd(s, 'next', 19000);
  assert.throws(() => cmd(s, 'morph', 19000), /transition/);
  tick(s, 23000);
  assert.equal(s.current!.name, 'MARIA');
  assert.equal(s.current!.effect, undefined);
  assert.equal(s.current!.morph, undefined);
});
