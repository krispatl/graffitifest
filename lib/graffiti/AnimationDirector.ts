import type { Snapshot } from '../types';
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
