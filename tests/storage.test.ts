import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
test('SQLite persists across processes, serializes concurrent updates, and limits attempts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'graffiti-test-'));
  process.env.LOCAL_DB_PATH = path.join(directory, 'state.sqlite');
  process.env.STORAGE_DRIVER = 'local';
  const { readState, transact, allowRate } = await import('../lib/database/store');
  await Promise.all(
    Array.from({ length: 18 }, () =>
      transact((s) => {
        s.rendererEpoch++;
      }),
    ),
  );
  assert.equal((await readState()).rendererEpoch, 18);
  assert.equal((await readState()).version, 18);
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "import {readState} from './lib/database/store.ts';console.log((await readState()).rendererEpoch)",
    ],
    { encoding: 'utf8', env: process.env },
  );
  assert.equal(output.trim(), '18');
  const results = await Promise.all(
    Array.from({ length: 10 }, () => allowRate('test-login', 3, 60000)),
  );
  assert.equal(results.filter(Boolean).length, 3);
  // SQLite stays open until this isolated test process exits; cleanup is best effort on Windows.
  await rm(directory, { recursive: true, force: true }).catch(() => {});
});
