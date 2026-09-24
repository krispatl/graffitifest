export const STYLES = [
  'RANDOM',
  'WILDSTYLE',
  'THROW-UP',
  'TAG',
  'BLOCK',
  'CHROME',
  'ACID',
  'EXPERIMENTAL',
] as const;
export const PALETTES = [
  'RANDOM',
  'CHROME',
  'TOXIC',
  'ACID',
  'BLOOD',
  'ELECTRIC',
  'PASTEL',
  'MONOCHROME',
  'CUSTOM',
] as const;
export const TRANSITIONS = [
  'RANDOM',
  'BUFF',
  'DISSOLVE',
  'MELT',
  'OVERSPRAY',
  'WALL SHIFT',
  'GLITCH',
] as const;
export type Phase = 'IDLE' | 'GENERATING' | 'DRAWING' | 'DETAIL' | 'HERO' | 'TRANSITIONING';
export type Settings = {
  style: (typeof STYLES)[number];
  palette: (typeof PALETTES)[number];
  transition: (typeof TRANSITIONS)[number];
  intensity: number;
  drips: number;
  splatter: number;
  overspray: number;
  distortion: number;
  particles: number;
  complexity: number;
  speed: number;
  customColors: [string, string, string];
  introTime: number;
  drawTime: number;
  detailTime: number;
  heroTime: number;
  transitionTime: number;
  preset: 'FAST' | 'NORMAL' | 'LONG' | 'MANUAL';
  autoAdvance: boolean;
  requireApproval: boolean;
  calibration: { scale: number; x: number; y: number; rotation: number };
};
export type Submission = {
  id: string;
  name: string;
  receiptHash: string;
  createdAt: number;
  status: 'pending' | 'queued' | 'playing' | 'done' | 'removed' | 'blocked';
};
export type Performance = {
  id: string;
  submissionId: string;
  name: string;
  seed: number;
  settings: Settings;
  startedAt: number;
  transition: Exclude<Settings['transition'], 'RANDOM'>;
};
export type Installation = {
  version: number;
  phase: Phase;
  phaseStartedAt: number;
  heldAt: number | null;
  blackout: boolean;
  blackoutAt?: number;
  current: Performance | null;
  queue: Submission[];
  history: Submission[];
  blockedNames: string[];
  settings: Settings;
  projectorSeenAt: number;
  rendererEpoch: number;
  reconnectEpoch: number;
  commandIds: string[];
  forcedNextId: string | null;
};
export type Snapshot = {
  version: number;
  serverNow: number;
  phase: Phase;
  phaseStartedAt: number;
  heldAt: number | null;
  blackout: boolean;
  blackoutAt: number | null;
  current: Performance | null;
  queueCount: number;
  approvedCount: number;
  projectorSeenAt: number;
  rendererEpoch: number;
  reconnectEpoch: number;
  settings: Settings;
  queue?: Omit<Submission, 'receiptHash'>[];
  blockedNames?: string[];
  receipt?: { id: string; name: string; status: Submission['status']; position: number } | null;
};
export type Command = {
  id: string;
  action:
    | 'next'
    | 'skip'
    | 'hold'
    | 'resume'
    | 'replay'
    | 'randomize'
    | 'regenerate'
    | 'clear'
    | 'blackout'
    | 'reset_renderer'
    | 'reconnect_wall'
    | 'play'
    | 'approve'
    | 'up'
    | 'down'
    | 'remove'
    | 'block'
    | 'edit'
    | 'unblock'
    | 'settings';
  submissionId?: string;
  name?: string;
  settings?: Partial<Settings>;
  performanceId?: string | null;
};
