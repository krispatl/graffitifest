import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { createDocumentStore, documents, type DocumentTransport } from '../lib/database/blob';
// Fail mock mismatches immediately instead of entering the SDK network retry loop.
process.env.VERCEL_BLOB_RETRIES = '0';

test('independent Blob clients preserve concurrent initialization and updates', async () => {
  let stored: { text: string; etag: string } | null = null;
  let version = 0;
  let conflicts = 0;
  const io: DocumentTransport = {
    async read() {
      return stored && { ...stored };
    },
    async write(_path, text, etag) {
      if (etag !== (stored?.etag ?? null)) {
        conflicts++;
        return false;
      }
      stored = { text, etag: String(++version) };
      return true;
    },
  };
  const clients = Array.from({ length: 18 }, () => createDocumentStore(io));
  await Promise.all(
    clients.map((client, id) =>
      client.transact(
        'installation',
        () => ({ ids: [] as number[] }),
        (s) => {
          s.ids.push(id);
        },
      ),
    ),
  );
  const state = await createDocumentStore(io).read('installation', () => ({ ids: [] as number[] }));
  assert.equal(state.ids.length, 18);
  assert.equal(new Set(state.ids).size, 18);
  assert.ok(conflicts > 0);
  assert.equal(version, 18);
  await clients[0].transact(
    'installation',
    () => ({ ids: [] }),
    () => undefined,
  );
  assert.equal(version, 18, 'read-only transactions do not spend a write');
});

test('storage outages and corrupt documents fail closed', async () => {
  const failed = createDocumentStore({
    async read() {
      throw new Error('unavailable');
    },
    async write() {
      throw new Error('must not write');
    },
  });
  await assert.rejects(
    failed.transact(
      'x',
      () => ({}),
      () => {},
    ),
    /unavailable/,
  );
  const corrupt = createDocumentStore({
    async read() {
      return { text: 'broken', etag: '1' };
    },
    async write() {
      throw new Error('must not write');
    },
  });
  await assert.rejects(
    corrupt.read('x', () => ({})),
    SyntaxError,
  );
});

test('private Blob SDK reads bypass CDN, authenticate server-side, and reject missing ETags', async () => {
  const original = getGlobalDispatcher();
  const mock = new MockAgent();
  mock.disableNetConnect();
  setGlobalDispatcher(mock);
  const priorToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_unittest';
  const pool = mock.get('https://teststore.private.blob.vercel-storage.com');
  const request = {
    path: '/installation.json?cache=0',
    method: 'GET',
    headers: { authorization: 'Bearer vercel_blob_rw_teststore_unittest' },
  };
  pool.intercept(request).reply(200, { count: 1 }, { headers: { etag: '"version-1"' } });
  pool.intercept(request).reply(200, { count: 1 });
  try {
    assert.deepEqual(await documents.read('installation.json', () => ({})), { count: 1 });
    await assert.rejects(
      documents.read('installation.json', () => ({})),
      /concurrency token/,
    );
  } finally {
    mock.assertNoPendingInterceptors();
    setGlobalDispatcher(original);
    await mock.close();
    if (priorToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = priorToken;
  }
});

test('Blob SDK sends conditional writes and retries with the winning document', async () => {
  const original = getGlobalDispatcher();
  const mock = new MockAgent();
  mock.disableNetConnect();
  setGlobalDispatcher(mock);
  const priorToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore_unittest';
  const reads = mock.get('https://teststore.private.blob.vercel-storage.com');
  const writes = mock.get('https://vercel.com');
  const read = { path: '/race.json?cache=0', method: 'GET' };
  // A different function creates the document between our read and first write.
  reads.intercept(read).reply(404, '');
  writes
    .intercept({
      path: '/api/blob/?pathname=race.json',
      method: 'PUT',
      headers: { 'x-allow-overwrite': '0' },
    })
    .reply(400, { error: { code: 'bad_request', message: 'Blob already exists' } });
  reads
    .intercept(read)
    .reply(200, { count: 10 }, { headers: { etag: '"v1"' } })
    .times(2);
  // Another write wins again: the retry must apply to 20, not stale 10.
  writes
    .intercept({
      path: '/api/blob/?pathname=race.json',
      method: 'PUT',
      headers: { 'x-if-match': '"v1"', 'x-allow-overwrite': '1' },
    })
    .reply(412, { error: { code: 'precondition_failed' } });
  reads.intercept(read).reply(200, { count: 20 }, { headers: { etag: '"v2"' } });
  writes
    .intercept({
      path: '/api/blob/?pathname=race.json',
      method: 'PUT',
      headers: {
        'x-if-match': '"v2"',
        'x-allow-overwrite': '1',
        'x-vercel-blob-access': 'private',
      },
      body: '{"count":21}',
    })
    .reply(200, { pathname: 'race.json', etag: '"v3"' });
  try {
    const { value } = await documents.transact(
      'race.json',
      () => ({ count: 0 }),
      (s) => {
        s.count++;
      },
    );
    assert.equal(value.count, 21);
    mock.assertNoPendingInterceptors();
  } finally {
    setGlobalDispatcher(original);
    await mock.close();
    if (priorToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = priorToken;
  }
});
