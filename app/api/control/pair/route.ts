import { NextRequest } from 'next/server';
import { safe, json, origin, HttpError } from '@/lib/api';
import { isOperator, sign } from '@/lib/auth/session';
export async function POST(req: NextRequest) {
  return safe(async () => {
    origin(req);
    if (!isOperator(req)) throw new HttpError(401, 'Sign in first.');
    return json({
      url: `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/wall#pair=${sign('pair', 300)}`,
    });
  });
}
