import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../lib/queue/machine';
test('Supabase adapter uses current key headers and retries a concurrent CAS conflict', async () => {
  process.env.STORAGE_DRIVER = 'supabase';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://unit-test.invalid';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_unit-test-only';
  const original = globalThis.fetch;
  let stored = initialState(),
    conflict = true;
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      headers = new Headers(init?.headers);
    assert.equal(headers.get('apikey'), 'sb_secret_unit-test-only');
    assert.equal(headers.has('Authorization'), false);
    if (url.includes('installation?')) return Response.json([{ payload: structuredClone(stored) }]);
    if (url.endsWith('rpc/save_installation')) {
      const body = JSON.parse(init!.body as string);
      if (conflict) {
        conflict = false;
        stored.version++;
        stored.rendererEpoch = 10;
        return Response.json(false);
      }
      assert.equal(body.expected_version, stored.version);
      stored = body.new_payload;
      return Response.json(true);
    }
    throw new Error('Unexpected database call.');
  };
  try {
    const { transact } = await import('../lib/database/store');
    const { state } = await transact((s) => {
      s.rendererEpoch++;
    });
    assert.equal(state.rendererEpoch, 11);
    assert.equal(state.version, 2);
  } finally {
    globalThis.fetch = original;
  }
});
