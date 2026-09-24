'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api, ApiError, useInstallation } from '@/lib/realtime/useInstallation';
import type { Snapshot } from '@/lib/types';
import { GraffitiCanvas } from './GraffitiCanvas';
export function Wall() {
  const live = useInstallation('wall'),
    [qr, setQr] = useState(''),
    [paired, setPaired] = useState<boolean | null>(null),
    [pairError, setPairError] = useState(''),
    [debug, setDebug] = useState(false),
    [calibrate, setCalibrate] = useState(false),
    [showFps, setShowFps] = useState(false),
    [stats, setStats] = useState({ fps: 0, gpu: '' }),
    [fullscreen, setFullscreen] = useState(false);
  const reconnect = useRef<number | null>(null),
    s = live.state;
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setDebug(params.get('debug') === 'true');
    setCalibrate(params.get('calibrate') === 'true');
    setShowFps(params.get('fps') === 'true');
    const audience = process.env.NEXT_PUBLIC_APP_URL || location.origin;
    void QRCode.toDataURL(audience, {
      width: 300,
      margin: 2,
      color: { dark: '#101110', light: '#d5ff38' },
    }).then(setQr);
    let active = true,
      busy = false;
    const pairToken = new URLSearchParams(location.hash.slice(1)).get('pair');
    async function heartbeat() {
      if (busy || !active) return;
      busy = true;
      try {
        const data = await api<Snapshot>('/api/wall/heartbeat', { method: 'POST' });
        if (active) {
          setPaired(true);
          setPairError('');
          live.accept(data);
        }
      } catch (e) {
        if (active && e instanceof ApiError && e.status === 401) setPaired(false);
      } finally {
        busy = false;
      }
    }
    async function init() {
      if (pairToken) {
        history.replaceState(null, '', location.pathname + location.search);
        try {
          await api('/api/wall/pair', {
            method: 'POST',
            body: JSON.stringify({ token: pairToken }),
          });
        } catch (e) {
          if (active) setPairError((e as Error).message);
        }
      }
      await heartbeat();
    }
    void init();
    const interval = setInterval(heartbeat, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [live.accept]);
  useEffect(() => {
    if (!s) return;
    if (reconnect.current !== null && reconnect.current !== s.reconnectEpoch) location.reload();
    reconnect.current = s.reconnectEpoch;
  }, [s]);
  useEffect(() => {
    let lock: WakeLockSentinel | null = null,
      active = true;
    const wake = async () => {
      if (!active || document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock?.request('screen');
      } catch {
        /* Wake lock needs HTTPS and platform support. */
      }
    };
    void wake();
    document.addEventListener('visibilitychange', wake);
    const onFull = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      active = false;
      void lock?.release();
      document.removeEventListener('visibilitychange', wake);
      document.removeEventListener('fullscreenchange', onFull);
    };
  }, []);
  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* Browser keyboard shortcut is also available. */
    }
  }
  if (paired === false)
    return (
      <main className="wall-pair">
        <span className="wordmark">
          GRAFFITI<span>FEST</span>
        </span>
        <h1>
          CONNECT THIS
          <br />
          <span className="lime">WALL.</span>
        </h1>
        <p>
          {pairError ||
            'In Control, open Setup → Pair a projector. Open that private link on this computer.'}
        </p>
        <a className="outline-button" href="/control">
          OPEN CONTROL
        </a>
      </main>
    );
  return (
    <main
      className={`wall-output ${calibrate ? 'calibrating' : ''}`}
      onDoubleClick={() => void enterFullscreen()}
    >
      <GraffitiCanvas
        state={s}
        offset={live.offset.current}
        onStats={(fps, gpu) => setStats({ fps, gpu })}
      />
      {s && !s.current && !s.blackout && !calibrate && (
        <div className="wall-idle">
          <span className="wordmark">
            GRAFFITI<span>FEST</span>
          </span>
          <h1>
            YOUR NAME.
            <br />
            <span className="lime">THIS WALL.</span>
          </h1>
          <div className="wall-qr">
            {qr && <img src={qr} alt="Scan to submit your name" width={190} height={190} />}
            <div>
              <strong>
                SCAN. SUBMIT.
                <br />
                TAKE THE STAGE.
              </strong>
              <span>
                {s.queueCount ? `${s.queueCount} NAMES WAITING` : 'THE NEXT NAME COULD BE YOURS.'}
              </span>
            </div>
          </div>
        </div>
      )}
      {calibrate && !s?.blackout && (
        <div
          className="calibration-grid"
          style={{
            transform: `translate(${(s?.settings.calibration.x ?? 0) * 100}%, ${-(s?.settings.calibration.y ?? 0) * 100}%) scale(${s?.settings.calibration.scale ?? 1}) rotate(${-(s?.settings.calibration.rotation ?? 0)}deg)`,
          }}
        >
          <div className="safe-frame" />
          <div className="crosshair" />
          <span className="grid-label">
            PROJECTION CALIBRATION
            <br />
            {typeof window !== 'undefined' ? `${window.innerWidth} × ${window.innerHeight}` : ''}
            <br />
            Adjust with Control → Setup
          </span>
        </div>
      )}
      {(debug || showFps) && !s?.blackout && (
        <div className="wall-debug">
          {stats.fps} FPS
          {debug && (
            <>
              <br />
              {stats.gpu}
              <br />
              {typeof window !== 'undefined' ? `${window.innerWidth} × ${window.innerHeight}` : ''}
              <br />
              {live.connection} · {paired ? 'PAIRED' : 'PAIRING'}
              <br />
              {s?.phase} · QUEUE {s?.queueCount}
              <br />
              {s?.current?.id ?? 'IDLE'}
            </>
          )}
        </div>
      )}
      {!fullscreen && !s?.blackout && (
        <button className="fullscreen-affordance" onClick={() => void enterFullscreen()}>
          ENTER FULLSCREEN ↗
        </button>
      )}
    </main>
  );
}
