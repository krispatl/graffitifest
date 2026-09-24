import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Installation } from '../types';
import { initialState } from '../queue/machine';

const remote = () => process.env.STORAGE_DRIVER === 'supabase';
function assertLocal() {
  if (process.env.VERCEL) throw new Error('Vercel requires STORAGE_DRIVER=supabase.');
}
let dbPromise: Promise<DatabaseSync> | undefined;
async function localDb() {
  assertLocal();
  if (!dbPromise)
    dbPromise = (async () => {
      const file =
        process.env.LOCAL_DB_PATH ?? path.join(process.cwd(), '.data', 'graffitifest.sqlite');
      await mkdir(path.dirname(file), { recursive: true });
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(file);
      db.exec(
        'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS installation (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);',
      );
      db.prepare('INSERT OR IGNORE INTO installation VALUES (1,0,?)').run(
        JSON.stringify(initialState()),
      );
      return db;
    })();
  return dbPromise;
}
async function rest(route: string, init: RequestInit = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase server configuration is missing.');
  const res = await fetch(`${url}/rest/v1/${route}`, {
    ...init,
    cache: 'no-store',
    headers: { apikey: key, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    console.error('Database request failed', res.status, route.split('?')[0]);
    throw new Error('Persistent storage is unavailable.');
  }
  return res.status === 204 ? null : res.json();
}
export async function readState(): Promise<Installation> {
  if (remote()) {
    let rows = await rest('installation?id=eq.1&select=payload');
    if (!rows.length) {
      await rest('installation', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ id: 1, version: 0, payload: initialState() }),
      });
      rows = await rest('installation?id=eq.1&select=payload');
    }
    return rows[0].payload;
  }
  const db = await localDb();
  return JSON.parse(
    (db.prepare('SELECT payload FROM installation WHERE id=1').get() as { payload: string })
      .payload,
  );
}
async function compareAndSwap(expected: number, state: Installation): Promise<boolean> {
  if (remote())
    return Boolean(
      await rest('rpc/save_installation', {
        method: 'POST',
        body: JSON.stringify({ expected_version: expected, new_payload: state }),
      }),
    );
  const db = await localDb();
  return (
    db
      .prepare('UPDATE installation SET payload=?,version=? WHERE id=1 AND version=?')
      .run(JSON.stringify(state), state.version, expected).changes === 1
  );
}
// Optimistic transactions retry the PURE callback against the newest database row.
// No authoritative queue or locks live in a serverless process.
export async function transact<T>(
  fn: (state: Installation) => T,
): Promise<{ state: Installation; result: T }> {
  for (let i = 0; i < 24; i++) {
    const state = await readState(),
      before = JSON.stringify(state),
      version = state.version;
    const result = fn(state);
    if (JSON.stringify(state) === before) return { state, result };
    state.version = version + 1;
    if (await compareAndSwap(version, state)) return { state, result };
    await new Promise((r) => setTimeout(r, 10 + Math.random() * 40));
  }
  throw new Error('The queue is busy. Please try again.');
}
export async function allowRate(key: string, maximum: number, windowMs: number): Promise<boolean> {
  if (remote())
    return Boolean(
      await rest('rpc/consume_rate', {
        method: 'POST',
        body: JSON.stringify({ rate_key: key, maximum, window_ms: windowMs }),
      }),
    );
  const db = await localDb(),
    now = Date.now();
  db.prepare('DELETE FROM limits WHERE expires < ?').run(now);
  const row = db
    .prepare(
      'INSERT INTO limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=limits.count+1 RETURNING count',
    )
    .get(key, now + windowMs) as { count: number };
  return row.count <= maximum;
}
