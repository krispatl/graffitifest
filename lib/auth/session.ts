import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
export const OPERATOR_COOKIE = 'graffiti_operator';
export const WALL_COOKIE = 'graffiti_projector';
export function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function key() {
  const secret = process.env.SESSION_SECRET,
    password = process.env.CONTROL_PASSWORD;
  if (!secret || secret.length < 32 || !password || password.length < 8)
    throw new Error('Set CONTROL_PASSWORD (8+ characters) and SESSION_SECRET (32+ characters).');
  return createHmac('sha256', secret).update(password).digest();
}
export function validPassword(input: string) {
  key();
  return timingSafeEqual(
    Buffer.from(hash(input)),
    Buffer.from(hash(process.env.CONTROL_PASSWORD!)),
  );
}
export function sign(role: 'operator' | 'projector' | 'pair', seconds: number) {
  const payload = Buffer.from(
    JSON.stringify({ role, exp: Date.now() + seconds * 1000, jti: randomUUID() }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', key()).update(payload).digest('base64url')}`;
}
export function verify(token: string | undefined, role: string): boolean {
  if (!token || token.length > 2048) return false;
  try {
    const [payload, sig, ...extra] = token.split('.');
    if (extra.length || !sig) return false;
    const expected = createHmac('sha256', key()).update(payload).digest();
    const got = Buffer.from(sig, 'base64url');
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return false;
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return value.role === role && value.exp > Date.now();
  } catch {
    return false;
  }
}
export const isOperator = (req: NextRequest) =>
  verify(req.cookies.get(OPERATOR_COOKIE)?.value, 'operator');
export const isProjector = (req: NextRequest) =>
  verify(req.cookies.get(WALL_COOKIE)?.value, 'projector');
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};
