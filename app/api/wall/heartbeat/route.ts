import { NextRequest } from 'next/server';
import { safe, json, origin, HttpError } from '@/lib/api';
import { isProjector, isOperator } from '@/lib/auth/session';
import { transact } from '@/lib/database/store';
import { advance, snapshot } from '@/lib/queue/machine';
export async function POST(req: NextRequest) {
  return safe(async () => {
    origin(req);
    if (!isProjector(req) && !isOperator(req))
      throw new HttpError(401, 'Pair this projector from Control.');
    const now = Date.now();
    const { state } = await transact((s) => {
      if (now - s.projectorSeenAt >= 1800) s.projectorSeenAt = now;
      advance(s, now);
    });
    return json(snapshot(state, now));
  });
}
