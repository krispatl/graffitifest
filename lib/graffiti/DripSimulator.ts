export type Drip = { x: number; y: number; length: number; width: number; delay: number };
export function findDrips(
  mask: CanvasRenderingContext2D,
  width: number,
  height: number,
  rng: () => number,
  amount: number,
): Drip[] {
  const data = mask.getImageData(0, 0, width, height).data,
    out: Drip[] = [];
  for (let i = 0; i < Math.round(amount * 0.5); i++) {
    const x = Math.floor(width * (0.1 + rng() * 0.8));
    for (let y = Math.floor(height * 0.88); y > height * 0.2; y -= 3) {
      if (data[(y * width + x) * 4 + 3] > 180) {
        out.push({
          x: x / width,
          y: 1 - y / height,
          length: 0.025 + rng() * 0.12,
          width: (1 + rng() * 4) / width,
          delay: rng() * 8,
        });
        break;
      }
    }
  }
  return out;
}
