import { NextRequest } from 'next/server';
import { safe, json } from '@/lib/api';
import { transact } from '@/lib/database/store';
import { advance, snapshot } from '@/lib/queue/machine';
import { hash } from '@/lib/auth/session';
export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  return safe(async () => {
    const now = Date.now();
    const { state } = await transact((s) => advance(s, now));
    const receipt = req.headers.get('x-receipt');
    return json(
      snapshot(state, now, false, receipt && receipt.length < 200 ? hash(receipt) : undefined),
    );
  });
}
