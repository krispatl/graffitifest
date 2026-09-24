'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Plus } from 'lucide-react';
import { api, useInstallation } from '@/lib/realtime/useInstallation';
export function Audience() {
  const [name, setName] = useState(''),
    [receipt, setReceipt] = useState<string | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const { state, connection, refresh } = useInstallation('audience', receipt);
  useEffect(() => {
    setReceipt(localStorage.getItem('graffiti-receipt'));
  }, []);
  const entry = state?.receipt;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    const token = receipt ?? crypto.randomUUID();
    localStorage.setItem('graffiti-receipt', token);
    setReceipt(token);
    try {
      await api('/api/submit', { method: 'POST', body: JSON.stringify({ name, receipt: token }) });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  function again() {
    localStorage.removeItem('graffiti-receipt');
    setReceipt(null);
    setName('');
    setError('');
  }
  const playing = entry?.status === 'playing',
    done = entry && ['done', 'removed', 'blocked'].includes(entry.status);
  return (
    <main className="audience">
      <header className="audience-header">
        <a href="/" className="wordmark" aria-label="Graffitifest home">
          GRAFFITI<span>FEST</span>
          <sup>®</sup>
        </a>
        <span className="edition">A LIVE PAINT EXPERIENCE</span>
      </header>
      <section className="audience-stage">
        <div className="eyebrow">
          <span className={`status-dot ${connection === 'connected' ? '' : 'muted'}`} />
          {connection === 'connected'
            ? 'THE WALL IS OPEN'
            : connection === 'offline'
              ? 'RECONNECTING TO THE WALL'
              : 'CONNECTING TO THE WALL'}
        </div>
        {!entry ? (
          <>
            <h1>
              PUT YOUR NAME
              <br />
              ON THE{' '}
              <span className="lime wall-word">
                WALL
                <svg viewBox="0 0 500 30" aria-hidden="true">
                  <path d="M5 23 Q230 0 492 12 M75 27 Q270 8 444 17" />
                </svg>
              </span>
            </h1>
            <form onSubmit={submit} className="tag-form">
              <label htmlFor="tag">YOUR NAME. YOUR MOMENT.</label>
              <div className="input-shell">
                <input
                  id="tag"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={16}
                  placeholder="YOUR TAG"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  aria-describedby="tag-help"
                />
                <span>{name.length}/16</span>
              </div>
              <button
                className="submit-tag"
                disabled={pending || !name.trim() || connection !== 'connected'}
              >
                {pending ? 'SENDING…' : 'SUBMIT'}
                <ArrowUpRight size={30} />
              </button>
              <p id="tag-help">One name. A whole wall. Wait for your moment.</p>
            </form>
          </>
        ) : (
          <div className="receipt" aria-live="polite">
            <div className="receipt-symbol">
              {playing ? <Plus size={48} /> : <Check size={40} />}
            </div>
            <h1>
              {playing ? (
                <>
                  YOU’RE ON
                  <br />
                  THE <span className="lime">WALL</span>
                </>
              ) : done ? (
                <>
                  THAT WAS
                  <br />
                  <span className="lime">YOUR MOMENT</span>
                </>
              ) : entry.position === 1 && entry.status === 'queued' ? (
                <>
                  YOU’RE
                  <br />
                  <span className="lime">NEXT</span>
                </>
              ) : (
                <>
                  YOUR TAG IS
                  <br />
                  IN THE <span className="lime">QUEUE</span>
                </>
              )}
            </h1>
            <div className="ticket">
              <span className="ticket-name">{entry.name}</span>
              <div>
                <small>{playing ? 'ON AIR' : done ? 'FINISHED' : 'POSITION'}</small>
                <strong>
                  {playing ? '●' : done ? '✓' : String(entry.position).padStart(2, '0')}
                </strong>
              </div>
            </div>
            <p>
              {playing
                ? 'Find your spot. This is your photo moment.'
                : entry.status === 'pending'
                  ? 'Your tag is waiting for the artist’s approval.'
                  : done
                    ? entry.status === 'done'
                      ? 'Thanks for being part of the wall.'
                      : 'The artist has removed this tag from the queue.'
                    : 'Keep this page open. Your position updates live.'}
            </p>
            {done && (
              <button className="outline-button" onClick={again}>
                SUBMIT ANOTHER TAG <ArrowUpRight size={20} />
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {connection === 'offline' && (
          <p className="error" role="status">
            Connection lost. Your place is saved. Reconnecting automatically.
          </p>
        )}
      </section>
      <footer className="audience-footer">
        <span>
          ESPRONCEDA
          <br />
          <b>INSTITUTE OF ART & CULTURE</b>
        </span>
        <span>
          BARCELONA
          <br />
          <b>ONE NAME AT A TIME.</b>
        </span>
        <div className="registration" aria-hidden="true">
          <Plus />
          <span>
            41°24′N
            <br />
            02°12′E
          </span>
        </div>
      </footer>
    </main>
  );
}
