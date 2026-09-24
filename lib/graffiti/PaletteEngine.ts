import type { Settings } from '../types';
export const palettes: Record<string, [string, string, string]> = {
  CHROME: ['#f6f8ff', '#707b90', '#b9fd42'],
  TOXIC: ['#d7ff38', '#759b17', '#d49bff'],
  ACID: ['#ff64d5', '#c2ff3d', '#7a3aff'],
  BLOOD: ['#ff334d', '#720d31', '#ffd4c1'],
  ELECTRIC: ['#44ddff', '#5453ff', '#fcff55'],
  PASTEL: ['#ffb9de', '#a3beff', '#e2ffd0'],
  MONOCHROME: ['#faf8e9', '#737673', '#dedfd3'],
};
export function paletteFor(settings: Settings, seed: number): [string, string, string] {
  if (settings.palette === 'CUSTOM') return settings.customColors;
  const keys = Object.keys(palettes);
  return palettes[settings.palette === 'RANDOM' ? keys[seed % keys.length] : settings.palette];
}
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
