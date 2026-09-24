'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Command, Snapshot } from '../types';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error ?? 'Request failed.', response.status);
  return data;
}
export function useInstallation(
  role: 'audience' | 'control' | 'wall',
  receipt: string | null = null,
) {
  const [state, setState] = useState<Snapshot | null>(null),
    [connection, setConnection] = useState<'connecting' | 'connected' | 'offline'>('connecting'),
    [error, setError] = useState(''),
    [unauthorized, setUnauthorized] = useState(false);
  const offset = useRef(0),
    busy = useRef(false),
    active = useRef(true),
    lastSuccess = useRef(0),
    stateRef = useRef<Snapshot | null>(null);
  const accept = useCallback((data: Snapshot, started = Date.now()) => {
    if (!active.current) return;
    if (!stateRef.current || data.version >= stateRef.current.version) {
      offset.current = data.serverNow - (started + Date.now()) / 2;
      stateRef.current = data;
      setState(data);
    }
    lastSuccess.current = Date.now();
    setConnection('connected');
    setError('');
    setUnauthorized(false);
  }, []);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const started = Date.now();
    try {
      const data = await api<Snapshot>(role === 'control' ? '/api/control/state' : '/api/state', {
        headers: receipt ? { 'x-receipt': receipt } : {},
      });
      accept(data, started);
    } catch (e) {
      if (active.current) {
        if (e instanceof ApiError && e.status === 401) setUnauthorized(true);
        else {
          setConnection('offline');
          setError((e as Error).message);
        }
      }
    } finally {
      busy.current = false;
    }
  }, [role, receipt, accept]);
  useEffect(() => {
    active.current = true;
    void refresh();
    const interval = setInterval(refresh, role === 'wall' ? 1500 : 2500);
    const online = () => void refresh();
    window.addEventListener('online', online);
    const visibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', visibility);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const client =
      url && key
        ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
        : null;
    const channel = client
      ?.channel(`installation-${role}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'installation_signal' },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh();
      });
    return () => {
      active.current = false;
      clearInterval(interval);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visibility);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [refresh, role]);
  const send = useCallback(
    async (command: Omit<Command, 'id'>) => {
      const data = await api<Snapshot>('/api/control/command', {
        method: 'POST',
        body: JSON.stringify({ ...command, id: crypto.randomUUID() }),
      });
      accept(data);
      return data;
    },
    [accept],
  );
  return { state, connection, error, unauthorized, refresh, send, accept, offset, lastSuccess };
}
export function useClock() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  return now;
}
