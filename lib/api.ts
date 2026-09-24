import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { STYLES, PALETTES, TRANSITIONS, LIVE_EFFECTS } from './types';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
export function origin(req: NextRequest) {
  const allowed = new Set([req.nextUrl.origin]);
  // Next can canonicalize 127.0.0.1 / 0.0.0.0 internally. Browser Host remains
  // the requested origin; comparing it to Origin also preserves CSRF protection.
  const host = req.headers.get('host');
  if (host) allowed.add(`${req.nextUrl.protocol}//${host}`);
  if (process.env.NEXT_PUBLIC_APP_URL) allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  if (!allowed.has(req.headers.get('origin') ?? ''))
    throw new HttpError(403, 'Request origin is not allowed.');
}
export async function body(req: NextRequest) {
  if (Number(req.headers.get('content-length') ?? 0) > 16000)
    throw new HttpError(413, 'Request too large.');
  const raw = await req.text();
  if (raw.length > 16000) throw new HttpError(413, 'Request too large.');
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
export async function safe(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof z.ZodError)
      return json({ error: e.issues[0]?.message ?? 'Invalid input.' }, 400);
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e instanceof Error ? e.message : e);
    return json(
      { error: 'The installation is unavailable. Check the server configuration or try again.' },
      503,
    );
  }
}
export function clientIp(req: NextRequest) {
  return process.env.VERCEL
    ? (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown')
    : 'local-network';
}
export const nameSchema = z
  .string()
  .trim()
  .transform((x) => x.normalize('NFKC').toUpperCase())
  .pipe(
    z
      .string()
      .min(1, 'Enter your name.')
      .max(16, 'Keep your tag to 16 characters.')
      .regex(/^[\p{L}\p{N} '\-_.]+$/u, 'Use letters, numbers, spaces, or simple punctuation.'),
  );
const amount = z.number().min(0).max(100);
export const settingsSchema = z
  .object({
    style: z.enum(STYLES),
    palette: z.enum(PALETTES),
    transition: z.enum(TRANSITIONS),
    intensity: z.number().int().min(1).max(5),
    drips: amount,
    splatter: amount,
    overspray: amount,
    distortion: amount,
    particles: amount,
    complexity: amount,
    speed: z.number().min(0.25).max(3),
    customColors: z.tuple([
      z.string().regex(/^#[0-9a-f]{6}$/i),
      z.string().regex(/^#[0-9a-f]{6}$/i),
      z.string().regex(/^#[0-9a-f]{6}$/i),
    ]),
    introTime: z.number().min(0.2).max(10),
    drawTime: z.number().min(1).max(60),
    detailTime: z.number().min(0.2).max(20),
    heroTime: z.number().min(1).max(600),
    transitionTime: z.number().min(0.5).max(20),
    preset: z.enum(['FAST', 'NORMAL', 'LONG', 'MANUAL']),
    autoAdvance: z.boolean(),
    requireApproval: z.boolean(),
    calibration: z
      .object({
        scale: z.number().min(0.5).max(1.4),
        x: z.number().min(-0.3).max(0.3),
        y: z.number().min(-0.3).max(0.3),
        rotation: z.number().min(-15).max(15),
      })
      .strict(),
  })
  .partial()
  .strict();
export const commandSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum([
      'next',
      'skip',
      'hold',
      'resume',
      'replay',
      'randomize',
      'regenerate',
      'morph',
      'effect',
      'stop_effect',
      'clear',
      'blackout',
      'reset_renderer',
      'reconnect_wall',
      'play',
      'approve',
      'up',
      'down',
      'remove',
      'block',
      'edit',
      'unblock',
      'settings',
    ]),
    style: z.enum(STYLES).optional(),
    effect: z.enum(LIVE_EFFECTS).optional(),
    submissionId: z.string().uuid().optional(),
    name: nameSchema.optional(),
    settings: settingsSchema.optional(),
    performanceId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (['morph', 'effect', 'stop_effect'].includes(c.action) && !c.performanceId)
      ctx.addIssue({
        code: 'custom',
        message: 'Select an active performance.',
        path: ['performanceId'],
      });
    if (c.action === 'effect' && !c.effect)
      ctx.addIssue({ code: 'custom', message: 'Choose an animation effect.', path: ['effect'] });
  });
