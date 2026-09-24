import { NextRequest } from 'next/server';
import { safe, json, HttpError } from '@/lib/api';
import { transact } from '@/lib/database/store';
import { advance, snapshot } from '@/lib/queue/machine';
import { isOperator } from '@/lib/auth/session';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  return safe(async () => {
    if (!isOperator(req)) throw new HttpError(401, 'Sign in to control the installation.');
    const now = Date.now();
    const { state } = await transact((s) => advance(s, now));
    return json(snapshot(state, now, true));
  });
}
