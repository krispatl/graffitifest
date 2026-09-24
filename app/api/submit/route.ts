import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { safe, json, origin, body, nameSchema, HttpError, clientIp } from '@/lib/api';
import { transact, allowRate, readState } from '@/lib/database/store';
import { hash } from '@/lib/auth/session';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  return safe(async () => {
    origin(req);
    const { name, receipt } = z
      .object({ name: nameSchema, receipt: z.string().uuid() })
      .strict()
      .parse(await body(req));
    const receiptHash = hash(receipt);
    const before = await readState(),
      prior = [...before.queue, ...before.history].find((x) => x.receiptHash === receiptHash);
    if (prior) return json({ id: prior.id });
    if (!(await allowRate(`submit:${hash(clientIp(req))}`, 120, 60000)))
      throw new HttpError(429, 'Too many tags. Please wait a minute.');
    const id = randomUUID(),
      now = Date.now();
    const { result } = await transact((s) => {
      const existing = [...s.queue, ...s.history].find((x) => x.receiptHash === receiptHash);
      if (existing) return existing.id;
      if (s.queue.length >= 250) throw new HttpError(409, 'The queue is full. Try again shortly.');
      if (s.blockedNames.includes(name)) throw new HttpError(400, 'Please choose another tag.');
      s.queue.push({
        id,
        name,
        receiptHash,
        createdAt: now,
        status: s.settings.requireApproval ? 'pending' : 'queued',
      });
      return id;
    });
    return json({ id: result }, 201);
  });
}
