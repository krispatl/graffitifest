import { randomUUID, randomInt } from 'node:crypto';
import type {
  Command,
  Installation,
  Performance,
  Phase,
  Settings,
  Snapshot,
  Submission,
} from '../types';
import { TRANSITIONS, STYLES } from '../types';
import { styleFor } from '../graffiti/StyleEngine';

export const defaults: Settings = {
  style: 'RANDOM',
  palette: 'RANDOM',
  transition: 'RANDOM',
  intensity: 3,
  drips: 60,
  splatter: 55,
  overspray: 45,
  distortion: 30,
  particles: 65,
  complexity: 60,
  speed: 1,
  customColors: ['#d5ff38', '#9b5cff', '#ff70ad'],
  introTime: 1,
  drawTime: 8,
  detailTime: 3,
  heroTime: 14,
  transitionTime: 3,
  preset: 'NORMAL',
  autoAdvance: true,
  requireApproval: true,
  calibration: { scale: 1, x: 0, y: 0, rotation: 0 },
};
export function initialState(): Installation {
  return {
    version: 0,
    phase: 'IDLE',
    phaseStartedAt: 0,
    heldAt: null,
    blackout: false,
    current: null,
    queue: [],
    history: [],
    blockedNames: [],
    settings: structuredClone(defaults),
    projectorSeenAt: 0,
    rendererEpoch: 0,
    reconnectEpoch: 0,
    commandIds: [],
    forcedNextId: null,
  };
}
export function duration(phase: Phase, settings: Settings): number {
  const key = {
    GENERATING: 'introTime',
    DRAWING: 'drawTime',
    DETAIL: 'detailTime',
    HERO: 'heroTime',
    TRANSITIONING: 'transitionTime',
    IDLE: 'heroTime',
  } as const;
  return settings[key[phase]] * 1000;
}
function setPhase(s: Installation, phase: Phase, at: number) {
  s.phase = phase;
  s.phaseStartedAt = at;
}
function finish(s: Installation, status: Submission['status'] = 'done') {
  if (s.current) {
    const index = s.history.findIndex((x) => x.id === s.current!.submissionId);
    if (index >= 0) s.history[index].status = status;
  }
  s.current = null;
  s.heldAt = null;
  s.history = s.history.slice(-200);
}
function performance(
  name: string,
  submissionId: string,
  settings: Settings,
  now: number,
  seed = randomInt(1, 2147483647),
): Performance {
  const transition =
    settings.transition === 'RANDOM'
      ? (TRANSITIONS[1 + (seed % 6)] as Performance['transition'])
      : settings.transition;
  return {
    id: randomUUID(),
    submissionId,
    name,
    seed,
    settings: structuredClone(settings),
    startedAt: now,
    transition,
  };
}
function select(s: Installation, now: number, id?: string | null) {
  const index = id
    ? s.queue.findIndex((x) => x.id === id)
    : s.queue.findIndex((x) => x.status === 'queued');
  s.forcedNextId = null;
  if (index < 0) {
    if (s.phase !== 'IDLE') setPhase(s, 'IDLE', now);
    return;
  }
  const [entry] = s.queue.splice(index, 1);
  entry.status = 'playing';
  s.history.push(entry);
  s.current = performance(entry.name, entry.id, s.settings, now);
  s.heldAt = null;
  setPhase(s, 'GENERATING', now);
}
export function advance(s: Installation, now: number): void {
  if (s.blackout || s.heldAt !== null || now - s.projectorSeenAt > 10000) return;
  if (s.phase === 'IDLE') {
    if (s.settings.autoAdvance) select(s, now);
    return;
  }
  if (!s.current) return;
  // Catch up this piece after a disconnect; never consume unseen queued pieces.
  for (let i = 0; i < 5; i++) {
    if (s.phase === 'HERO' && (!s.settings.autoAdvance || s.settings.preset === 'MANUAL')) return;
    const end = s.phaseStartedAt + duration(s.phase, s.current.settings);
    if (now < end) return;
    if (s.phase === 'TRANSITIONING') {
      finish(s);
      select(s, now, s.forcedNextId);
      return;
    }
    const next: Record<string, Phase> = {
      GENERATING: 'DRAWING',
      DRAWING: 'DETAIL',
      DETAIL: 'HERO',
      HERO: 'TRANSITIONING',
    };
    setPhase(s, next[s.phase], end);
  }
}
export function applyCommand(s: Installation, c: Command, now: number): void {
  if (s.commandIds.includes(c.id)) return;
  const performanceActions = [
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
  ];
  if (
    performanceActions.includes(c.action) &&
    c.performanceId !== undefined &&
    c.performanceId !== (s.current?.id ?? null)
  )
    throw new Error('The wall has moved on. Try again.');
  s.commandIds = [...s.commandIds.slice(-199), c.id];
  const entry = s.queue.find((x) => x.id === c.submissionId);
  switch (c.action) {
    case 'settings':
      s.settings = { ...s.settings, ...c.settings };
      break;
    case 'blackout':
      s.blackout = !s.blackout;
      // Separate blackout pause from HOLD: resume only time spent blacked out.
      if (s.blackout) {
        s.blackoutAt = now;
      } else {
        const at = s.blackoutAt ?? now;
        if (s.heldAt === null) s.phaseStartedAt += now - at;
        delete s.blackoutAt;
      }
      break;
    case 'hold':
      if (s.current && s.heldAt === null && !s.blackout) s.heldAt = now;
      break;
    case 'resume':
      if (s.heldAt !== null && !s.blackout) {
        s.phaseStartedAt += now - s.heldAt;
        s.heldAt = null;
      }
      break;
    case 'next':
      if (s.blackout) throw new Error('Restore the projection before advancing.');
      if (s.phase === 'TRANSITIONING') break;
      s.heldAt = null;
      if (s.current) setPhase(s, 'TRANSITIONING', now);
      else select(s, now);
      break;
    case 'skip':
      if (s.blackout) throw new Error('Restore the projection before advancing.');
      finish(s, 'removed');
      select(s, now);
      break;
    case 'clear':
      finish(s, 'removed');
      s.settings.autoAdvance = false;
      s.forcedNextId = null;
      setPhase(s, 'IDLE', now);
      break;
    case 'replay':
    case 'regenerate':
    case 'randomize':
      if (s.current) {
        if (s.blackout) throw new Error('Restore the projection first.');
        const old = s.current;
        const settings = c.action === 'replay' ? old.settings : structuredClone(s.settings);
        if (c.action === 'randomize') {
          settings.style = 'RANDOM';
          settings.palette = 'RANDOM';
        }
        s.current = performance(
          old.name,
          old.submissionId,
          settings,
          now,
          c.action === 'replay' ? old.seed : undefined,
        );
        s.heldAt = null;
        setPhase(s, 'GENERATING', now);
      }
      break;
    case 'morph': {
      if (!s.current || s.blackout || s.phase === 'TRANSITIONING')
        throw new Error('Morph needs an active, visible piece before its exit transition.');
      const old = s.current;
      if (old.morph && now < old.morph.startedAt + old.morph.duration)
        throw new Error('Let this morph finish before starting another.');
      const currentStyle = styleFor(old.settings, old.seed);
      const choices = STYLES.filter((style) => style !== 'RANDOM' && style !== currentStyle);
      const style = !c.style || c.style === 'RANDOM' ? choices[randomInt(choices.length)] : c.style;
      if (style === currentStyle) throw new Error('Choose a different style to morph into.');
      old.morph = {
        id: c.id,
        fromSettings: structuredClone(old.settings),
        startedAt: now,
        duration: 3000,
      };
      old.settings = { ...old.settings, style };
      break;
    }
    case 'effect':
      if (!s.current || s.blackout || s.phase === 'TRANSITIONING' || !c.effect)
        throw new Error('Animation needs an active, visible piece before its exit transition.');
      s.current.effect = { id: c.id, kind: c.effect, startedAt: now, duration: 4000 };
      break;
    case 'stop_effect':
      if (s.current) delete s.current.effect;
      break;
    case 'play':
      if (!entry) throw new Error('This name is no longer in the queue.');
      if (s.blackout) throw new Error('Restore the projection first.');
      entry.status = 'queued';
      s.heldAt = null;
      if (s.current) {
        s.forcedNextId = entry.id;
        setPhase(s, 'TRANSITIONING', now);
      } else select(s, now, entry.id);
      break;
    case 'approve':
      if (entry) entry.status = 'queued';
      break;
    case 'edit':
      if (entry && c.name) entry.name = c.name;
      break;
    case 'up':
    case 'down':
      if (entry) {
        const i = s.queue.indexOf(entry),
          j = i + (c.action === 'up' ? -1 : 1);
        if (j >= 0 && j < s.queue.length) [s.queue[i], s.queue[j]] = [s.queue[j], s.queue[i]];
      }
      break;
    case 'remove':
    case 'block':
      if (entry) {
        entry.status = c.action === 'block' ? 'blocked' : 'removed';
        s.queue = s.queue.filter((x) => x.id !== entry.id);
        s.history.push(entry);
        if (c.action === 'block') {
          if (!s.blockedNames.includes(entry.name)) s.blockedNames.push(entry.name);
          const duplicates = s.queue.filter((x) => x.name === entry.name);
          duplicates.forEach((x) => (x.status = 'blocked'));
          s.history.push(...duplicates);
          s.queue = s.queue.filter((x) => x.name !== entry.name);
        }
      }
      break;
    case 'unblock':
      s.blockedNames = s.blockedNames.filter((x) => x !== c.name);
      break;
    case 'reset_renderer':
      s.rendererEpoch++;
      break;
    case 'reconnect_wall':
      s.reconnectEpoch++;
      break;
  }
  s.history = s.history.slice(-200);
}
export function snapshot(
  s: Installation,
  now: number,
  operator = false,
  receiptHash?: string,
): Snapshot {
  const entry = receiptHash
    ? [...s.queue, ...s.history].find((x) => x.receiptHash === receiptHash)
    : null;
  return {
    version: s.version,
    serverNow: now,
    phase: s.phase,
    phaseStartedAt: s.phaseStartedAt,
    heldAt: s.heldAt,
    blackout: s.blackout,
    blackoutAt: s.blackoutAt ?? null,
    current: s.current,
    queueCount: s.queue.length,
    approvedCount: s.queue.filter((x) => x.status === 'queued').length,
    projectorSeenAt: s.projectorSeenAt,
    rendererEpoch: s.rendererEpoch,
    reconnectEpoch: s.reconnectEpoch,
    settings: s.settings,
    ...(operator
      ? { queue: s.queue.map(({ receiptHash: _, ...rest }) => rest), blockedNames: s.blockedNames }
      : {}),
    ...(receiptHash
      ? {
          receipt: entry
            ? {
                id: entry.id,
                name: entry.name,
                status: entry.status,
                position: Math.max(0, s.queue.indexOf(entry) + 1),
              }
            : null,
        }
      : {}),
  };
}
