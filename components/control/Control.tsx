'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  ExternalLink,
  FastForward,
  Layers3,
  LogOut,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Settings2,
  Shield,
  Shuffle,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { api, useClock, useInstallation } from '@/lib/realtime/useInstallation';
import {
  PALETTES,
  STYLES,
  TRANSITIONS,
  type Command,
  type Settings,
  type Snapshot,
} from '@/lib/types';
import { palettes } from '@/lib/graffiti/PaletteEngine';
import { GraffitiCanvas } from '../wall/GraffitiCanvas';

type Tab = 'LIVE' | 'QUEUE' | 'ART' | 'SETUP';
type Confirmation = { title: string; detail: string; action: () => void };
export function Control() {
  const live = useInstallation('control'),
    { state: s, connection, unauthorized, refresh, send } = live;
  const [tab, setTab] = useState<Tab>('LIVE'),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [confirm, setConfirm] = useState<Confirmation | null>(null),
    [pairUrl, setPairUrl] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const now = useClock() + live.offset.current;
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await api('/api/control/login', { method: 'POST', body: JSON.stringify({ password }) });
      setPassword('');
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function command(action: Command['action'], extra: Partial<Command> = {}) {
    setBusy(true);
    setMessage('');
    try {
      await send({
        action,
        ...extra,
        ...([
          'next',
          'skip',
          'hold',
          'resume',
          'replay',
          'randomize',
          'regenerate',
          'clear',
        ].includes(action)
          ? { performanceId: s?.current?.id ?? null }
          : {}),
      });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const configure = (patch: Partial<Settings>) => command('settings', { settings: patch });
  const ask = (title: string, detail: string, action: () => void) =>
    setConfirm({ title, detail, action });
  if (unauthorized)
    return (
      <main className="login-screen">
        <a className="wordmark" href="/">
          GRAFFITI<span>FEST</span>
        </a>
        <div className="login-panel">
          <Shield size={32} className="lime" />
          <p className="eyebrow">AUTHORIZED OPERATORS ONLY</p>
          <h1>
            BACKSTAGE
            <br />
            <span className="lime">ACCESS.</span>
          </h1>
          <form onSubmit={login}>
            <label htmlFor="password">OPERATOR PASSWORD</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button className="primary" disabled={busy}>
              {busy ? 'SIGNING IN…' : 'UNLOCK CONTROL'}
              <ArrowUpRight />
            </button>
          </form>
          {message && (
            <p className="error" role="alert">
              {message}
            </p>
          )}
          <a className="text-link" href="/">
            Back to the audience wall
          </a>
        </div>
      </main>
    );
  if (!s)
    return (
      <main className="login-screen">
        <span className="wordmark">
          GRAFFITI<span>FEST</span>
        </span>
        <p role="status">{live.error || 'Connecting to the installation…'}</p>
        {live.error && <button onClick={() => void refresh()}>RETRY CONNECTION</button>}
      </main>
    );
  const cfg = s.settings,
    projector = now - s.projectorSeenAt < 10000,
    held = s.heldAt !== null,
    phase = s.blackout ? 'BLACKOUT' : held ? 'HELD' : s.phase;
  const phaseKey = {
    GENERATING: 'introTime',
    DRAWING: 'drawTime',
    DETAIL: 'detailTime',
    HERO: 'heroTime',
    TRANSITIONING: 'transitionTime',
    IDLE: 'heroTime',
  } as const;
  const remaining = Math.max(
    0,
    Math.ceil(
      ((s.current?.settings[phaseKey[s.phase]] ?? 0) * 1000 -
        ((s.heldAt ?? s.blackoutAt ?? now) - s.phaseStartedAt)) /
        1000,
    ),
  );
  const manual = s.phase === 'HERO' && (!cfg.autoAdvance || cfg.preset === 'MANUAL');
  const queue = s.queue ?? [],
    next = queue.find((x) => x.status === 'queued');
  return (
    <main className="control">
      <header className="control-header">
        <div>
          <a href="/control" className="wordmark">
            GRAFFITI<span>FEST</span>
          </a>
          <span className="backstage-label">BACKSTAGE</span>
        </div>
        <button
          className={`blackout ${s.blackout ? 'engaged' : ''}`}
          onClick={() =>
            s.blackout
              ? void command('blackout')
              : ask(
                  'Black out the projection?',
                  'The screen will go black immediately. Your queue and performance are preserved.',
                  () => void command('blackout'),
                )
          }
        >
          <CircleStop size={17} />
          {s.blackout ? 'RESTORE' : 'BLACKOUT'}
        </button>
      </header>
      <div className="connection-strip">
        <span>
          <i className={`status-dot ${connection === 'connected' ? '' : 'muted'}`} />
          SERVER {connection === 'connected' ? 'CONNECTED' : 'RECONNECTING'}
        </span>
        <span>
          <i className={`status-dot ${projector ? '' : 'muted'}`} />
          PROJECTOR {projector ? 'CONNECTED' : 'OFFLINE'}
        </span>
      </div>
      {(message || connection === 'offline') && (
        <div className="notice error" role="alert">
          {message || 'Connection lost. Controls will return when the server reconnects.'}
          <button aria-label="Dismiss message" onClick={() => setMessage('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <nav className="control-tabs" aria-label="Control sections">
        {(
          [
            ['LIVE', Radio],
            ['QUEUE', Layers3],
            ['ART', SlidersHorizontal],
            ['SETUP', Settings2],
          ] as const
        ).map(([name, Icon]) => (
          <button
            key={name}
            aria-current={tab === name ? 'page' : undefined}
            onClick={() => setTab(name)}
          >
            <Icon size={19} />
            {name}
            {name === 'QUEUE' && <b>{s.queueCount}</b>}
          </button>
        ))}
      </nav>
      {tab === 'LIVE' && (
        <div className="live-layout">
          <section>
            <div className="live-card">
              <div className="section-label">
                <span>
                  <i className="status-dot" />
                  {phase}
                </span>
                <span>MAIN PROJECTION / 01</span>
              </div>
              <div className="current-name">{s.current?.name ?? 'STANDBY'}</div>
              <div className="live-meta">
                <div>
                  <small>TIME REMAINING</small>
                  <strong>
                    {s.current
                      ? manual || held
                        ? '∞'
                        : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`
                      : '—:—'}
                  </strong>
                </div>
                <div>
                  <small>UP NEXT</small>
                  <b>{next?.name ?? 'WAITING'}</b>
                </div>
                <div>
                  <small>QUEUE</small>
                  <strong>{String(s.queueCount).padStart(2, '0')}</strong>
                </div>
              </div>
              <div className="phase-track">
                {['GENERATING', 'DRAWING', 'DETAIL', 'HERO', 'TRANSITIONING'].map((p) => (
                  <span key={p} className={s.phase === p ? 'active' : ''}>
                    {p === 'GENERATING' ? 'INTRO' : p === 'TRANSITIONING' ? 'OUT' : p}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="next-button"
              disabled={
                busy || connection !== 'connected' || s.blackout || s.phase === 'TRANSITIONING'
              }
              onClick={() => void command('next')}
            >
              <span>
                NEXT
                <small>
                  {s.current ? 'TRANSITION TO THE NEXT NAME' : 'BRING THE NEXT NAME TO LIFE'}
                </small>
              </span>
              <FastForward size={44} />
            </button>
            <div className="performance-buttons">
              <button
                className={held ? 'active' : ''}
                disabled={busy || !s.current || s.blackout}
                onClick={() => void command(held ? 'resume' : 'hold')}
              >
                {held ? <Play /> : <Pause />}
                {held ? 'RESUME' : 'HOLD'}
              </button>
              <button
                disabled={busy || !s.current || s.blackout}
                onClick={() => void command('skip')}
              >
                <ChevronRight />
                SKIP
              </button>
              <button
                disabled={busy || !s.current || s.blackout}
                onClick={() => void command('replay')}
              >
                <RotateCcw />
                REPLAY
              </button>
            </div>
            <div className="secondary-actions">
              <button
                disabled={busy || !s.current || s.blackout}
                onClick={() => void command('randomize')}
              >
                <Shuffle size={18} /> RANDOMIZE
              </button>
              <button
                disabled={busy || !s.current || s.blackout}
                onClick={() => void command('regenerate')}
              >
                <Zap size={18} /> REGENERATE
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  ask(
                    'Clear the current artwork?',
                    'The screen returns to idle and automatic playback turns off. The queue stays saved.',
                    () => void command('clear'),
                  )
                }
              >
                <Square size={17} /> KILL / CLEAR
              </button>
            </div>
            <div className="quick-timing">
              <div className="section-label">
                <span>MASTER DURATION</span>
                <span>
                  {cfg.preset === 'MANUAL'
                    ? 'UNTIL YOU SAY NEXT'
                    : `${cfg.introTime + cfg.drawTime + cfg.detailTime + cfg.heroTime + cfg.transitionTime}s / PIECE`}
                </span>
              </div>
              <Presets settings={cfg} onChange={configure} />
            </div>
          </section>
          <aside className="upcoming-panel">
            <div className="section-label">
              <span>COMING UP</span>
              <button className="text-button" onClick={() => setTab('QUEUE')}>
                MANAGE <ArrowUpRight size={16} />
              </button>
            </div>
            {queue.length ? (
              queue.slice(0, 5).map((q, i) => (
                <button
                  className="upcoming-row"
                  key={q.id}
                  onClick={() => {
                    setSelected(q.id);
                    setTab('QUEUE');
                  }}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <strong>{q.name}</strong>
                  <small>{q.status === 'pending' ? 'REVIEW' : 'READY'}</small>
                  <ChevronRight size={18} />
                </button>
              ))
            ) : (
              <div className="empty-state">
                <Layers3 size={28} />
                <p>The next name starts here.</p>
                <span>Audience submissions appear in this queue.</span>
              </div>
            )}
            <div className="operator-note">
              <Shield size={18} />
              <span>
                {cfg.requireApproval
                  ? 'You approve every name before it hits the wall.'
                  : 'New tags are approved automatically.'}
              </span>
            </div>
            <a className="text-link" href="/" target="_blank" rel="noreferrer">
              OPEN AUDIENCE PAGE <ExternalLink size={15} />
            </a>
          </aside>
        </div>
      )}
      {tab === 'QUEUE' && (
        <section className="control-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">THE RUNNING ORDER</p>
              <h1>
                UP NEXT<span className="lime"> / {queue.length}</span>
              </h1>
            </div>
          </div>
          <Toggle
            label="Review every submission"
            description="New names wait for your approval."
            checked={cfg.requireApproval}
            onChange={(v) => void configure({ requireApproval: v })}
          />
          {!queue.length && (
            <div className="empty-state large">
              <Layers3 size={40} />
              <p>The queue is clear.</p>
              <span>Share the audience QR code to invite the next tag.</span>
            </div>
          )}
          <div className="queue-list">
            {queue.map((q, i) => (
              <div className={`queue-item ${selected === q.id ? 'selected' : ''}`} key={q.id}>
                <button
                  className="queue-title"
                  onClick={() => setSelected(selected === q.id ? null : q.id)}
                  aria-expanded={selected === q.id}
                >
                  <span className="queue-number">{String(i + 1).padStart(2, '0')}</span>
                  <strong>{q.name}</strong>
                  <span className={`badge ${q.status === 'queued' ? 'ready' : ''}`}>
                    {q.status === 'pending' ? 'REVIEW' : 'READY'}
                  </span>
                  <ChevronDown size={20} />
                </button>
                {selected === q.id && (
                  <div className="queue-detail">
                    <QueuePreview state={s} name={q.name} id={q.id} />
                    <p className="preview-caption">COMPOSITION PREVIEW · FINAL PAINT VARIES</p>
                    <QueueEdit
                      name={q.name}
                      onSave={(name) => void command('edit', { submissionId: q.id, name })}
                    />
                    <div className="queue-actions">
                      <button
                        className="primary"
                        disabled={busy || s.blackout}
                        onClick={() => void command('play', { submissionId: q.id })}
                      >
                        <Play size={18} />
                        PLAY NOW
                      </button>
                      {q.status === 'pending' && (
                        <button
                          disabled={busy}
                          onClick={() => void command('approve', { submissionId: q.id })}
                        >
                          <Check size={18} />
                          APPROVE
                        </button>
                      )}
                      <button
                        aria-label={`Move ${q.name} up`}
                        disabled={busy || i === 0}
                        onClick={() => void command('up', { submissionId: q.id })}
                      >
                        <ArrowUp />
                      </button>
                      <button
                        aria-label={`Move ${q.name} down`}
                        disabled={busy || i === queue.length - 1}
                        onClick={() => void command('down', { submissionId: q.id })}
                      >
                        <ArrowDown />
                      </button>
                      <button
                        aria-label={`Remove ${q.name}`}
                        disabled={busy}
                        onClick={() => void command('remove', { submissionId: q.id })}
                      >
                        <Trash2 size={18} />
                      </button>
                      <button
                        className="danger-text"
                        disabled={busy}
                        onClick={() =>
                          ask(
                            `Block ${q.name}?`,
                            'This removes all queued copies of this spelling and prevents it from being submitted again.',
                            () => void command('block', { submissionId: q.id }),
                          )
                        }
                      >
                        BLOCK
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!!s.blockedNames?.length && (
            <details className="blocked-list">
              <summary>BLOCKED NAMES ({s.blockedNames.length})</summary>
              {s.blockedNames.map((name) => (
                <div key={name}>
                  <span>{name}</span>
                  <button onClick={() => void command('unblock', { name })}>UNBLOCK</button>
                </div>
              ))}
            </details>
          )}
        </section>
      )}
      {tab === 'ART' && (
        <section className="control-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LIVE ART DIRECTION</p>
              <h1>
                MAKE IT <span className="lime">LOUD.</span>
              </h1>
            </div>
          </div>
          <p className="section-description">
            Style, color, and construction shape the next piece. Drips, particles, and living paint
            speed update live.
          </p>
          <div className="art-grid">
            <div className="settings-panel">
              <h2>STYLE</h2>
              <div className="choice-grid">
                {STYLES.map((style) => (
                  <button
                    key={style}
                    className={cfg.style === style ? 'selected' : ''}
                    onClick={() => void configure({ style })}
                  >
                    {style}
                  </button>
                ))}
              </div>
              <Range
                label="INTENSITY"
                value={cfg.intensity}
                min={1}
                max={5}
                suffix={cfg.intensity === 1 ? 'CLEAN' : cfg.intensity === 5 ? 'FUCKING INSANE' : ''}
                onChange={(intensity) => void configure({ intensity })}
              />
              <div className="sliders">
                {(
                  [
                    'drips',
                    'splatter',
                    'overspray',
                    'distortion',
                    'particles',
                    'complexity',
                  ] as const
                ).map((key) => (
                  <Range
                    key={key}
                    label={key === 'complexity' ? 'LETTER COMPLEXITY' : key.toUpperCase()}
                    value={cfg[key]}
                    onChange={(v) => void configure({ [key]: v })}
                  />
                ))}
                <Range
                  label="ANIMATION SPEED"
                  value={cfg.speed}
                  min={0.25}
                  max={3}
                  step={0.05}
                  suffix="×"
                  onChange={(speed) => void configure({ speed })}
                />
              </div>
            </div>
            <div className="settings-panel">
              <h2>COLOR</h2>
              <div className="palette-grid">
                {PALETTES.map((palette) => (
                  <button
                    className={cfg.palette === palette ? 'selected' : ''}
                    key={palette}
                    onClick={() => void configure({ palette })}
                  >
                    <span className="swatches">
                      {(palette === 'RANDOM'
                        ? ['#ff67c8', '#caff38', '#57dcff']
                        : palette === 'CUSTOM'
                          ? cfg.customColors
                          : palettes[palette]
                      ).map((color, i) => (
                        <i key={i} style={{ background: color }} />
                      ))}
                    </span>
                    {palette === 'RANDOM' ? 'RANDOM PALETTE' : palette}
                  </button>
                ))}
              </div>
              {cfg.palette === 'CUSTOM' && (
                <div className="custom-colors">
                  {cfg.customColors.map((color, i) => (
                    <label key={i}>
                      COLOR {i + 1}
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => {
                          const customColors = [...cfg.customColors] as Settings['customColors'];
                          customColors[i] = e.target.value;
                          void configure({ customColors });
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
              <h2 className="spaced">TRANSITION</h2>
              <div className="choice-grid">
                {TRANSITIONS.map((transition) => (
                  <button
                    key={transition}
                    className={cfg.transition === transition ? 'selected' : ''}
                    onClick={() => void configure({ transition })}
                  >
                    {transition}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
      {tab === 'SETUP' && (
        <section className="control-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SET THE PACE</p>
              <h1>
                SHOW <span className="lime">SETTINGS.</span>
              </h1>
            </div>
          </div>
          <div className="art-grid">
            <div className="settings-panel">
              <h2>PERFORMANCE TIMING</h2>
              <Presets settings={cfg} onChange={configure} />
              <Toggle
                label="Auto advance"
                description="When off, the finished piece stays until NEXT."
                checked={cfg.autoAdvance}
                onChange={(autoAdvance) => void configure({ autoAdvance })}
              />
              {(['introTime', 'drawTime', 'detailTime', 'heroTime', 'transitionTime'] as const).map(
                (key, i) => (
                  <Range
                    key={key}
                    label={
                      [
                        'GENERATIVE INTRO',
                        'SPRAY CONSTRUCTION',
                        'DETAIL / SPLATTER',
                        'HERO DISPLAY',
                        'TRANSITION OUT',
                      ][i]
                    }
                    value={cfg[key]}
                    min={[0.2, 1, 0.2, 1, 0.5][i]}
                    max={[10, 60, 20, 120, 20][i]}
                    step={0.1}
                    suffix="s"
                    onChange={(v) => void configure({ [key]: v })}
                  />
                ),
              )}
              <p className="muted-copy">
                Timing changes apply to the next generated piece. Auto advance and manual hold apply
                immediately.
              </p>
            </div>
            <div className="settings-panel">
              <h2>PROJECTOR</h2>
              <p className="section-description">
                Create a private, single-use pairing link. Open it on the projector computer within
                five minutes.
              </p>
              <button
                className="outline-button full"
                onClick={async () => {
                  try {
                    const r = await api<{ url: string }>('/api/control/pair', { method: 'POST' });
                    setPairUrl(r.url);
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                PAIR A PROJECTOR <ArrowUpRight size={18} />
              </button>
              {pairUrl && (
                <div className="pair-result">
                  <label htmlFor="pair-url">PRIVATE PAIRING LINK</label>
                  <input
                    id="pair-url"
                    value={pairUrl}
                    readOnly
                    onFocus={(e) => e.target.select()}
                  />
                  <div>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(pairUrl);
                          setMessage('Pairing link copied.');
                        } catch {
                          setMessage('Select and copy the pairing link above.');
                        }
                      }}
                    >
                      COPY LINK
                    </button>
                    <a href={pairUrl} target="_blank" rel="noreferrer">
                      OPEN HERE <ExternalLink size={15} />
                    </a>
                  </div>
                </div>
              )}
              <h2 className="spaced">PROJECTION CALIBRATION</h2>
              <p className="section-description">
                Open{' '}
                <a href="/wall?calibrate=true" target="_blank" rel="noreferrer">
                  the calibration grid
                </a>{' '}
                on the paired projector. These controls adjust the output live.
              </p>
              {(['scale', 'x', 'y', 'rotation'] as const).map((key, i) => (
                <Range
                  key={key}
                  label={['SCALE', 'HORIZONTAL OFFSET', 'VERTICAL OFFSET', 'ROTATION'][i]}
                  value={cfg.calibration[key]}
                  min={[0.5, -0.3, -0.3, -15][i]}
                  max={[1.4, 0.3, 0.3, 15][i]}
                  step={i === 3 ? 0.1 : 0.01}
                  onChange={(v) =>
                    void configure({ calibration: { ...cfg.calibration, [key]: v } })
                  }
                />
              ))}
              <button
                className="outline-button full"
                onClick={() =>
                  void configure({ calibration: { scale: 1, x: 0, y: 0, rotation: 0 } })
                }
              >
                RESET CALIBRATION
              </button>
              <h2 className="spaced">RECOVERY</h2>
              <div className="recovery-buttons">
                <button onClick={() => void command('reset_renderer')}>
                  <RotateCcw size={18} />
                  RESET RENDERER
                </button>
                <button onClick={() => void command('reconnect_wall')}>
                  <Radio size={18} />
                  RECONNECT WALL
                </button>
              </div>
              <button
                className="text-link signout"
                onClick={async () => {
                  await api('/api/control/login', { method: 'DELETE' });
                  await refresh();
                }}
              >
                <LogOut size={17} />
                SIGN OUT
              </button>
            </div>
          </div>
        </section>
      )}
      <footer className="control-footer">
        <span>ESPRONCEDA / GRAFFITIFEST</span>
        <span>
          {s.current
            ? `PERFORMANCE ${s.current.id.slice(0, 8).toUpperCase()}`
            : 'READY FOR THE NEXT NAME'}
        </span>
      </footer>
      {confirm && <Confirm value={confirm} close={() => setConfirm(null)} />}
    </main>
  );
}
function Range({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix = '',
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(value),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <label className="range">
      <span>
        {label}
        <b>
          {Number(draft.toFixed(2))} {suffix}
        </b>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        style={
          { '--range-progress': `${((draft - min) / (max - min)) * 100}%` } as React.CSSProperties
        }
        onChange={(e) => {
          const n = Number(e.target.value);
          setDraft(n);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(n), 250);
        }}
      />
    </label>
  );
}
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" />
    </label>
  );
}
function Presets({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Partial<Settings>) => void;
}) {
  return (
    <div className="presets">
      {(['FAST', 'NORMAL', 'LONG', 'MANUAL'] as const).map((preset) => (
        <button
          key={preset}
          className={settings.preset === preset ? 'active' : ''}
          onClick={() =>
            onChange(
              preset === 'MANUAL'
                ? { preset }
                : {
                    preset,
                    introTime: preset === 'FAST' ? 0.5 : 1,
                    drawTime: preset === 'FAST' ? 6 : preset === 'LONG' ? 10 : 8,
                    detailTime: preset === 'FAST' ? 2 : preset === 'LONG' ? 4 : 3,
                    heroTime: preset === 'FAST' ? 10 : preset === 'LONG' ? 20 : 14,
                    transitionTime: preset === 'FAST' ? 2 : preset === 'LONG' ? 5 : 3,
                  },
            )
          }
        >
          {preset}
        </button>
      ))}
    </div>
  );
}
function QueueEdit({ name, onSave }: { name: string; onSave: (s: string) => void }) {
  const [draft, setDraft] = useState(name);
  return (
    <form
      className="queue-edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <input
        aria-label="Edit spelling"
        value={draft}
        maxLength={16}
        onChange={(e) => setDraft(e.target.value)}
        required
      />
      <button type="submit">SAVE SPELLING</button>
    </form>
  );
}
function QueuePreview({ state, name, id }: { state: Snapshot; name: string; id: string }) {
  const s: Snapshot = {
    ...state,
    blackout: false,
    heldAt: null,
    phase: 'HERO',
    phaseStartedAt: Date.now() - 1000,
    current: {
      id: `preview-${id}-${JSON.stringify(state.settings)}`,
      submissionId: id,
      name,
      seed: [...id].reduce((a, c) => a + c.charCodeAt(0), 0),
      settings: state.settings,
      startedAt: Date.now(),
      transition: 'BUFF',
    },
  };
  return (
    <div className="queue-preview">
      <GraffitiCanvas state={s} />
    </div>
  );
}
function Confirm({ value, close }: { value: Confirmation; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className="confirm-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <button className="dialog-close" onClick={close} aria-label="Close">
        <X />
      </button>
      <CircleStop className="danger-text" />
      <h2>{value.title}</h2>
      <p>{value.detail}</p>
      <div>
        <button onClick={close}>CANCEL</button>
        <button
          className="danger-button"
          onClick={() => {
            value.action();
            close();
          }}
        >
          CONFIRM
        </button>
      </div>
    </dialog>
  );
}
