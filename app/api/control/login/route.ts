import { NextRequest } from 'next/server';
import { z } from 'zod';
import { safe, json, origin, body, HttpError, clientIp } from '@/lib/api';
import { allowRate } from '@/lib/database/store';
import { cookieOptions, hash, OPERATOR_COOKIE, sign, validPassword } from '@/lib/auth/session';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return safe(async () => {
    origin(req);
    const { password } = z.object({ password: z.string().max(200) }).parse(await body(req));
    if (!(await allowRate(`login:${hash(clientIp(req))}`, 8, 15 * 60000)))
      throw new HttpError(429, 'Too many login attempts. Wait 15 minutes.');
    if (!validPassword(password)) throw new HttpError(401, 'Incorrect operator password.');
    const res = json({ ok: true });
    res.cookies.set(OPERATOR_COOKIE, sign('operator', 43200), { ...cookieOptions, maxAge: 43200 });
    return res;
  });
}
export async function DELETE(req: NextRequest) {
  return safe(async () => {
    origin(req);
    const res = json({ ok: true });
    res.cookies.set(OPERATOR_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    return res;
  });
}
