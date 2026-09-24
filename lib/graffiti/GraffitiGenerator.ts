import type { Performance } from '../types';
import { paletteFor, random } from './PaletteEngine';
import { fontFor, rowsFor, styleFor } from './StyleEngine';
import { spray } from './SpraySimulator';
import { splatter } from './SplatterSystem';
import { findDrips } from './DripSimulator';

export function generateGraffiti(piece: Performance, aspect = 16 / 9) {
  const w = 2048,
    h = Math.round(w / Math.max(0.5, Math.min(3, aspect))),
    canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!,
    mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mc = mask.getContext('2d')!;
  const rng = random(piece.seed),
    colors = paletteFor(piece.settings, piece.seed),
    style = styleFor(piece.settings, piece.seed),
    rows = rowsFor(piece.name, aspect),
    intensity = piece.settings.intensity;
  const wild = ['WILDSTYLE', 'ACID', 'EXPERIMENTAL'].includes(style);
  // The geometry is composed for the projection aspect, including stacked long names.
  const rowHeight = (h * 0.73) / rows.length,
    centerY = h * 0.5;
  for (let i = 0; i < 5 + intensity * 2; i++) {
    const x = w * (0.1 + rng() * 0.8),
      y = h * (0.18 + rng() * 0.62);
    spray(ctx, rng, x, y, w * (0.025 + rng() * 0.07), piece.settings.overspray * 13, colors[i % 3]);
    if (i < Math.round(piece.settings.splatter / 9))
      splatter(ctx, rng, x, y, 8 + rng() * 25, colors[(i + 1) % 3]);
  }
  if (wild) {
    for (let i = 0; i < 5 + Math.floor(piece.settings.complexity / 12); i++) {
      const x = w * (0.08 + rng() * 0.84),
        y = h * (0.25 + rng() * 0.5),
        len = w * (0.04 + rng() * 0.13),
        direction = rng() > 0.5 ? 1 : -1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rng() - 0.5) * 1.1);
      ctx.beginPath();
      ctx.moveTo(-len * direction, 12);
      ctx.lineTo(len * 0.5 * direction, -8);
      ctx.lineTo(len * 0.45 * direction, -30);
      ctx.lineTo(len * direction, 0);
      ctx.lineTo(len * 0.45 * direction, 38);
      ctx.lineTo(len * 0.48 * direction, 16);
      ctx.lineTo(-len * direction, 24);
      ctx.closePath();
      ctx.lineWidth = 16;
      ctx.strokeStyle = '#090b0d';
      ctx.stroke();
      ctx.fillStyle = colors[i % 3];
      ctx.fill();
      ctx.restore();
    }
  }
  rows.forEach((row, rowIndex) => {
    const letters = [...row],
      fontSize = rowHeight * (style === 'TAG' ? 1.05 : 1.23);
    ctx.font = `${style === 'THROW-UP' ? '900 ' : ''}${fontSize}px ${fontFor(style)}`;
    const widths = letters.map((letter) => ctx.measureText(letter).width),
      overlap = style === 'TAG' ? 0.06 : style === 'BLOCK' ? 0.015 : 0.11;
    const nominal = widths.reduce((a, b) => a + b, 0) - fontSize * overlap * (letters.length - 1),
      sx = Math.min((w * 0.88) / (nominal + fontSize * 0.3), 2.2);
    const y = centerY + (rowIndex - (rows.length - 1) / 2) * rowHeight * 0.95;
    let cursor = -nominal / 2;
    letters.forEach((letter, i) => {
      const width = widths[i],
        cx = cursor + width / 2,
        rot =
          style === 'BLOCK'
            ? 0
            : (rng() - 0.5) *
              (0.1 + piece.settings.distortion * 0.0015) *
              (style === 'EXPERIMENTAL' ? 2.1 : 1),
        lift = (rng() - 0.5) * rowHeight * (style === 'EXPERIMENTAL' ? 0.2 : 0.08);
      const draw = (c: CanvasRenderingContext2D, maskOnly = false) => {
        c.save();
        c.translate(w / 2, y);
        c.scale(sx, 1);
        c.translate(cx, lift);
        c.rotate(rot);
        c.transform(1, 0, style === 'BLOCK' ? 0 : -0.08, 1, 0, 0);
        c.font = ctx.font;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineJoin = 'round';
        if (maskOnly) {
          c.fillStyle = '#fff';
          c.fillText(letter, 0, 0);
          c.restore();
          return;
        }
        const outline = fontSize * (style === 'THROW-UP' ? 0.055 : style === 'TAG' ? 0.018 : 0.035);
        // Dimensional offset, keyline, heavy black outline, enamel fill, hand-cut highlight.
        c.strokeStyle = colors[2];
        c.lineWidth = outline * 2.1;
        c.strokeText(letter, fontSize * 0.025, fontSize * 0.04);
        c.strokeStyle = '#07090b';
        c.lineWidth = outline * 1.65;
        c.strokeText(letter, 0, 0);
        const fill = c.createLinearGradient(0, -fontSize * 0.4, 0, fontSize * 0.42);
        if (style === 'CHROME' || piece.settings.palette === 'CHROME') {
          fill.addColorStop(0, '#fff');
          fill.addColorStop(0.34, '#b5bfd1');
          fill.addColorStop(0.48, '#fcfdff');
          fill.addColorStop(0.51, '#3b4055');
          fill.addColorStop(0.69, '#8d98ad');
          fill.addColorStop(1, '#f5f9f2');
        } else if (style === 'ACID') {
          fill.addColorStop(0, colors[2]);
          fill.addColorStop(0.3, colors[0]);
          fill.addColorStop(0.65, colors[1]);
          fill.addColorStop(1, colors[2]);
        } else {
          fill.addColorStop(0, colors[0]);
          fill.addColorStop(0.48, colors[0]);
          fill.addColorStop(0.52, colors[1]);
          fill.addColorStop(1, colors[0]);
        }
        c.fillStyle = fill;
        c.fillText(letter, 0, 0);
        c.strokeStyle = '#ffffffa0';
        c.lineWidth = fontSize * 0.003;
        c.strokeText(letter, -fontSize * 0.004, -fontSize * 0.006);
        c.restore();
      };
      draw(ctx);
      draw(mc, true);
      cursor += width - fontSize * overlap;
    });
  });
  // Speckled paint and cuts stay clipped to the actual letterforms.
  const texture = document.createElement('canvas');
  texture.width = w;
  texture.height = h;
  const tc = texture.getContext('2d')!;
  for (let i = 0; i < 5000 + intensity * 1000; i++) {
    tc.globalAlpha = 0.08 + rng() * 0.35;
    tc.fillStyle = i % 3 ? '#07100e' : '#ffffff';
    const x = rng() * w,
      y = rng() * h;
    tc.fillRect(x, y, 0.7 + rng() * 3, 0.6 + rng() * 2);
  }
  tc.globalAlpha = 1;
  tc.globalCompositeOperation = 'destination-in';
  tc.drawImage(mask, 0, 0);
  ctx.drawImage(texture, 0, 0);
  const drips = findDrips(mc, w, h, rng, piece.settings.drips);
  // Small permanent runs are part of the deterministic piece; longer runs grow in WebGL.
  ctx.strokeStyle = colors[0];
  ctx.lineCap = 'round';
  drips.forEach((d) => {
    ctx.lineWidth = d.width * w;
    ctx.beginPath();
    ctx.moveTo(d.x * w, (1 - d.y) * h - 2);
    ctx.lineTo(d.x * w, (1 - d.y + d.length * 0.2) * h);
    ctx.stroke();
  });
  if (wild) {
    ctx.strokeStyle = colors[2];
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.12, h * 0.85);
    ctx.bezierCurveTo(w * 0.35, h * 0.9, w * 0.65, h * 0.8, w * 0.87, h * 0.85);
    ctx.stroke();
  }
  const detailCanvas = document.createElement('canvas');
  detailCanvas.width = w;
  detailCanvas.height = h;
  const dc = detailCanvas.getContext('2d')!;
  for (let i = 0; i < Math.round(piece.settings.splatter / 5); i++) {
    const x = w * (0.09 + rng() * 0.82),
      y = h * (rng() > 0.5 ? 0.18 + rng() * 0.1 : 0.72 + rng() * 0.12);
    splatter(dc, rng, x, y, 3 + rng() * 10, colors[i % 3]);
  }
  return { canvas, detailCanvas, mask, drips, colors, style };
}
