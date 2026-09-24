import type { Settings } from '../types';
export function styleFor(settings: Settings, seed: number) {
  const styles = ['WILDSTYLE', 'THROW-UP', 'TAG', 'BLOCK', 'CHROME', 'ACID', 'EXPERIMENTAL'];
  return settings.style === 'RANDOM' ? styles[seed % styles.length] : settings.style;
}
export function fontFor(style: string) {
  return style === 'TAG'
    ? '"Permanent Marker", cursive'
    : style === 'BLOCK'
      ? 'Anton, sans-serif'
      : style === 'THROW-UP'
        ? '"Arial Black", sans-serif'
        : 'Bangers, sans-serif';
}
export function rowsFor(name: string, aspect: number): string[] {
  const limit = aspect < 1.1 ? 6 : 10;
  if (name.length <= limit) return [name];
  const center = Math.ceil(name.length / 2),
    space = name.indexOf(' ', Math.max(0, center - 3));
  const cut = space >= 0 && space <= center + 3 ? space : center;
  return [name.slice(0, cut).trim(), name.slice(cut).trim()].filter(Boolean);
}
