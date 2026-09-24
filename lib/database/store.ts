import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { documents, documentPath } from './blob';
import type { DatabaseSync } from 'node:sqlite';
import type { Installation } from '../types';
import { initialState } from '../queue/machine';

const remote = () => process.env.STORAGE_DRIVER === 'blob' || Boolean(process.env.VERCEL);
function assertLocal() {
  if (process.env.VERCEL) throw new Error('Vercel requires a connected private Blob store.');
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
export async function readState(): Promise<Installation> {
  if (remote()) return documents.read(documentPath('installation'), initialState);
  const db = await localDb();
  return JSON.parse(
    (db.prepare('SELECT payload FROM installation WHERE id=1').get() as { payload: string })
      .payload,
  );
}
async function compareAndSwap(expected: number, state: Installation): Promise<boolean> {
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
  if (remote()) {
    const { value: state, result } = await documents.transact(
      documentPath('installation'),
      initialState,
      (state) => {
        const before = JSON.stringify(state);
        const result = fn(state);
        if (JSON.stringify(state) !== before) state.version++;
        return result;
      },
    );
    return { state, result };
  }
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
  if (remote()) {
    const hash = createHash('sha256').update(key).digest('hex');
    const { result } = await documents.transact<
      Record<string, { count: number; expires: number }>,
      boolean
    >(
      documentPath(`rates-${hash[0]}`),
      () => ({}),
      (rates) => {
        const now = Date.now();
        for (const id of Object.keys(rates)) if (rates[id].expires <= now) delete rates[id];
        const row = (rates[hash] ??= { count: 0, expires: now + windowMs });
        if (row.count >= maximum) return false;
        row.count++;
        return true;
      },
    );
    return result;
  }
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
