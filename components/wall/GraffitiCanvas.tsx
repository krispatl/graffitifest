'use client';
import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '@/lib/types';
import { GraffitiRenderer } from '@/lib/graffiti/GraffitiRenderer';
import { generateGraffiti } from '@/lib/graffiti/GraffitiGenerator';

export function GraffitiCanvas({
  state,
  offset = 0,
  onStats,
}: {
  state: Snapshot | null;
  offset?: number;
  onStats?: (fps: number, gpu: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    value = useRef({ state, offset, onStats }),
    [failed, setFailed] = useState(false);
  value.current = { state, offset, onStats };
  useEffect(() => {
    let renderer: GraffitiRenderer | null = null,
      frame = 0,
      disposed = false,
      last = performance.now(),
      frames = 0,
      contextLost = false;
    const node = canvas.current!;
    const lost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      setFailed(true);
    };
    const restored = () => {
      contextLost = false;
      setFailed(false);
      renderer?.dispose();
      renderer = null;
      start();
    };
    node.addEventListener('webglcontextlost', lost);
    node.addEventListener('webglcontextrestored', restored);
    const start = () => {
      if (disposed) return;
      try {
        renderer = new GraffitiRenderer(node);
        setFailed(false);
      } catch {
        setFailed(true);
        return;
      }
      const draw = () => {
        if (disposed || contextLost) return;
        const rect = node.getBoundingClientRect(),
          { state: s, offset: o, onStats: stats } = value.current;
        renderer!.resize(Math.max(1, rect.width), Math.max(1, rect.height));
        if (s) renderer!.render(s, Date.now() + o);
        frames++;
        const at = performance.now();
        if (at - last > 1000) {
          stats?.(Math.round((frames * 1000) / (at - last)), renderer!.gpu());
          frames = 0;
          last = at;
        }
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    };
    void Promise.all([
      document.fonts.load('100px Bangers'),
      document.fonts.load('100px Anton'),
      document.fonts.load('100px "Permanent Marker"'),
    ]).then(start);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      renderer?.dispose();
      node.removeEventListener('webglcontextlost', lost);
      node.removeEventListener('webglcontextrestored', restored);
    };
  }, [state?.rendererEpoch]);
  return (
    <>
      <canvas
        ref={canvas}
        className="graffiti-canvas"
        aria-label={
          state?.current ? `Graffiti artwork: ${state.current.name}` : 'Graffiti projection'
        }
      />
      {failed && <CanvasFallback state={state} />}
    </>
  );
}
function CanvasFallback({ state }: { state: Snapshot | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !state?.current) return;
    const artwork = generateGraffiti(state.current, c.clientWidth / c.clientHeight);
    c.width = artwork.canvas.width;
    c.height = artwork.canvas.height;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(artwork.canvas, 0, 0);
  }, [state?.current?.id, state?.current]);
  return (
    <canvas
      ref={ref}
      className="graffiti-canvas fallback"
      style={{ opacity: state?.blackout || !state?.current ? 0 : 1 }}
      aria-label="Static artwork fallback; WebGL unavailable"
    />
  );
}
