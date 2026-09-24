import { NextRequest } from 'next/server';
import { safe, json, origin, body, commandSchema, HttpError } from '@/lib/api';
import { transact } from '@/lib/database/store';
import { applyCommand, advance, snapshot } from '@/lib/queue/machine';
import { isOperator } from '@/lib/auth/session';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return safe(async () => {
    origin(req);
    if (!isOperator(req)) throw new HttpError(401, 'Your session expired. Sign in again.');
    const command = commandSchema.parse(await body(req)),
      now = Date.now();
    const { state } = await transact((s) => {
      advance(s, now);
      try {
        applyCommand(s, command, now);
      } catch (e) {
        throw new HttpError(409, (e as Error).message);
      }
    });
    return json(snapshot(state, now, true));
  });
}
