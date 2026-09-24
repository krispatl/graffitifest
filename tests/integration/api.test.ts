import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

test(
  'three independent clients: authentication, pairing, submit, moderate, hold, refresh, next, blackout',
  { timeout: 90000 },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'graffiti-api-')),
      origin = 'http://127.0.0.1:3100';
    const child = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '--port', '3100', '--hostname', '127.0.0.1'],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          STORAGE_DRIVER: 'local',
          LOCAL_DB_PATH: path.join(directory, 'test.sqlite'),
          NEXT_PUBLIC_APP_URL: origin,
          CONTROL_PASSWORD: 'integration-only-password',
          SESSION_SECRET: 'integration-only-secret-more-than-thirty-two-characters',
          VERCEL: '',
        },
      },
    );
    let logs = '';
    child.stdout.on('data', (x) => (logs += x));
    child.stderr.on('data', (x) => (logs += x));
    let operator = '',
      projector = '';
    async function call(
      route: string,
      method = 'GET',
      data?: unknown,
      cookie = '',
      extra: Record<string, string> = {},
    ) {
      return fetch(origin + route, {
        method,
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
          ...extra,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    }
    async function command(action: string, extra: Record<string, unknown> = {}) {
      const res = await call(
        '/api/control/command',
        'POST',
        { id: randomUUID(), action, ...extra },
        operator,
      );
      assert.equal(res.status, 200, await res.clone().text());
      return res.json();
    }
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await call('/api/state')).ok) {
            ready = true;
            break;
          }
        } catch {}
        if (child.exitCode !== null) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(ready, logs);
      assert.equal((await call('/api/control/state')).status, 401);
      assert.equal(
        (await call('/api/control/command', 'POST', { id: randomUUID(), action: 'next' })).status,
        401,
      );
      assert.equal((await call('/api/wall/heartbeat', 'POST')).status, 401);
      assert.equal(
        (
          await call('/api/submit', 'POST', { name: 'KRIS', receipt: randomUUID() }, '', {
            Origin: 'https://untrusted.example',
          })
        ).status,
        403,
      );
      const login = await call('/api/control/login', 'POST', {
        password: 'integration-only-password',
      });
      assert.equal(login.status, 200);
      operator = login.headers.get('set-cookie')!.split(';')[0];
      assert.match(login.headers.get('set-cookie')!, /HttpOnly/i);
      assert.match(login.headers.get('set-cookie')!, /SameSite=strict/i);
      const pair = await (await call('/api/control/pair', 'POST', undefined, operator)).json();
      const token = new URLSearchParams(new URL(pair.url).hash.slice(1)).get('pair');
      const linked = await call('/api/wall/pair', 'POST', { token });
      assert.equal(linked.status, 200);
      projector = linked.headers.get('set-cookie')!.split(';')[0];
      assert.equal((await call('/api/wall/pair', 'POST', { token })).status, 401);
      await command('settings', {
        settings: {
          autoAdvance: false,
          style: 'BLOCK',
          introTime: 0.2,
          drawTime: 1,
          detailTime: 0.2,
          heroTime: 1,
          transitionTime: 0.5,
        },
      });
      const receipt = randomUUID();
      const submit = await call('/api/submit', 'POST', { name: '  Kris ', receipt });
      assert.equal(submit.status, 201);
      const { id } = await submit.json();
      assert.equal((await call('/api/submit', 'POST', { name: 'KRIS', receipt })).status, 200);
      const audience = await (
        await call('/api/state', 'GET', undefined, '', { 'x-receipt': receipt })
      ).json();
      assert.equal(audience.receipt.position, 1);
      assert.equal(audience.receipt.status, 'pending');
      assert.equal(audience.queue, undefined);
      assert.ok(!JSON.stringify(audience).includes('receiptHash'));
      let control = await (await call('/api/control/state', 'GET', undefined, operator)).json();
      assert.equal(control.queue.length, 1);
      assert.equal(control.queue[0].name, 'KRIS');
      assert.ok(!JSON.stringify(control).includes('receiptHash'));
      await call('/api/wall/heartbeat', 'POST', undefined, projector);
      control = await command('play', { submissionId: id });
      assert.equal(control.current.name, 'KRIS');
      const performanceId = control.current.id;
      await new Promise((r) => setTimeout(r, 1700));
      const hero = await (await call('/api/wall/heartbeat', 'POST', undefined, projector)).json();
      assert.equal(hero.phase, 'HERO');
      await command('hold', { performanceId });
      const hold = await (await call('/api/state')).json();
      assert.ok(hold.heldAt);
      const morph = await command('morph', {
        performanceId,
        style: hero.current.settings.style === 'TAG' ? 'BLOCK' : 'TAG',
      });
      assert.equal(morph.current.id, performanceId);
      assert.equal(morph.heldAt, hold.heldAt);
      assert.ok(morph.current.morph.id);
      const fx = await command('effect', { performanceId, effect: 'WAVE' });
      assert.equal(fx.current.effect.kind, 'WAVE');
      const projectedFx = await (await call('/api/state')).json();
      assert.equal(projectedFx.current.effect.id, fx.current.effect.id);
      assert.equal(projectedFx.current.morph.id, morph.current.morph.id);
      await command('stop_effect', { performanceId });
      assert.equal((await (await call('/api/state')).json()).current.effect, undefined);

      await command('blackout');
      assert.equal((await (await call('/api/state')).json()).blackout, true);
      await command('blackout');
      await command('resume', { performanceId });
      const mariaReceipt = randomUUID();
      const maria = await (
        await call('/api/submit', 'POST', { name: 'MARIA', receipt: mariaReceipt })
      ).json();
      await command('approve', { submissionId: maria.id });
      const next = await command('next', { performanceId });
      assert.equal(next.phase, 'TRANSITIONING');
      assert.equal(next.current.name, 'KRIS');
      await new Promise((r) => setTimeout(r, 650));
      const wall = await (await call('/api/wall/heartbeat', 'POST', undefined, projector)).json();
      assert.equal(wall.current.name, 'MARIA');
      assert.equal(wall.phase, 'GENERATING');
      const previous = await (
        await call('/api/state', 'GET', undefined, '', { 'x-receipt': receipt })
      ).json();
      assert.equal(previous.receipt.status, 'done');
      const stale = await call(
        '/api/control/command',
        'POST',
        { id: randomUUID(), action: 'skip', performanceId },
        operator,
      );
      assert.equal(stale.status, 409);
      await command('clear');
      assert.equal((await (await call('/api/state')).json()).current, null);
      for (let i = 0; i < 7; i++) await call('/api/control/login', 'POST', { password: 'wrong' });
      assert.equal((await call('/api/control/login', 'POST', { password: 'wrong' })).status, 429);
    } finally {
      child.kill();
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) resolve();
        else child.once('exit', () => resolve());
      });
      await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
);
