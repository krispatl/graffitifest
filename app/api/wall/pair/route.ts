import { NextRequest } from 'next/server';
import { z } from 'zod';
import { safe, json, origin, body, HttpError } from '@/lib/api';
import { cookieOptions, hash, sign, verify, WALL_COOKIE } from '@/lib/auth/session';
import { allowRate } from '@/lib/database/store';
export async function POST(req: NextRequest) {
  return safe(async () => {
    origin(req);
    const { token } = z.object({ token: z.string().max(2048) }).parse(await body(req));
    if (!verify(token, 'pair') || !(await allowRate(`pair:${hash(token)}`, 1, 360000)))
      throw new HttpError(
        401,
        'Pairing link expired or already used. Create a new link in Control.',
      );
    const res = json({ ok: true });
    res.cookies.set(WALL_COOKIE, sign('projector', 604800), { ...cookieOptions, maxAge: 604800 });
    return res;
  });
}
