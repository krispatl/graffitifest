export function splatter(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 28; i++) {
    const angle = (i / 28) * Math.PI * 2,
      r = size * (0.35 + rng() * 0.9);
    const px = x + Math.cos(angle) * r,
      py = y + Math.sin(angle) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2,
      r = size * (1 + rng() * 3);
    ctx.beginPath();
    ctx.ellipse(
      x + Math.cos(a) * r,
      y + Math.sin(a) * r,
      1 + rng() * size * 0.2,
      1 + rng() * size * 0.16,
      a,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}
