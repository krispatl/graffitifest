export function spray(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  x: number,
  y: number,
  radius: number,
  count: number,
  color: string,
) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2,
      r = Math.sqrt(rng()) * radius;
    ctx.globalAlpha = (1 - r / radius) * (0.15 + rng() * 0.6);
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * r, y + Math.sin(angle) * r, 0.4 + rng() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
