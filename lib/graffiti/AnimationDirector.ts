import type { Snapshot } from '../types';
import { LIVE_EFFECTS } from '../types';
export function animationAt(s: Snapshot, now: number) {
  const elapsed = Math.max(0, ((s.heldAt ?? now) - s.phaseStartedAt) / 1000),
    cfg = s.current?.settings ?? s.settings;
  const duration =
    s.phase === 'GENERATING'
      ? cfg.introTime
      : s.phase === 'DRAWING'
        ? cfg.drawTime
        : s.phase === 'DETAIL'
          ? cfg.detailTime
          : s.phase === 'HERO'
            ? cfg.heroTime
            : cfg.transitionTime;
  const progress = Math.min(1, elapsed / duration);
  return {
    elapsed,
    progress,
    draw: s.phase === 'GENERATING' ? 0 : s.phase === 'DRAWING' ? progress : 1,
    detail: s.phase === 'DETAIL' ? progress : ['HERO', 'TRANSITIONING'].includes(s.phase) ? 1 : 0,
    transition: s.phase === 'TRANSITIONING' ? progress : 0,
  };
}

// One-shot effects use server time, independent of the held lifecycle playhead.
// Refreshing or reconnecting resumes a live effect; expired effects never replay.
export function liveAnimationAt(s: Snapshot, now: number) {
  const morph = s.current?.morph;
  const effect = s.current?.effect;
  const progress = effect
    ? Math.max(0, Math.min(1, (now - effect.startedAt) / effect.duration))
    : 1;
  return {
    morph: morph ? Math.max(0, Math.min(1, (now - morph.startedAt) / morph.duration)) : 1,
    effect:
      effect && now >= effect.startedAt && progress < 1 && !s.blackout
        ? LIVE_EFFECTS.indexOf(effect.kind) + 1
        : 0,
    elapsed: effect ? Math.max(0, (now - effect.startedAt) / 1000) : 0,
    amount: Math.sin(Math.PI * progress),
  };
}
