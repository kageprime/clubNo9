// High-Fidelity Canvas2D Textures for CLUB No.9 (deterministic via mulberry32).
import * as THREE from 'three';
import { mulberry32 } from '../game/rng.ts';
import {
  COLOR_CSS,
  LOOP,
  START_IDX,
  STAR_IDX,
  HOME_RED,
  rotCell,
  yardSlot,
} from '../game/ludoBoard.ts';
import { BALL_COLORS } from '../game/poolSim.ts';
import { DART_SECTORS } from '../game/dartsSim.ts';

export function makeCanvasTex(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { nearest?: boolean; repeat?: [number, number] | null; srgb?: boolean } = {},
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = !opts.nearest;
  if (!opts.nearest) {
    ctx.imageSmoothingQuality = 'high';
  }
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  } else {
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
  }
  if (opts.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  if (opts.srgb !== false) {
    t.colorSpace = THREE.SRGBColorSpace;
  }
  return t;
}

// 1. High-Resolution Clean Warm Oak Floor Planks (1024x1024) - Silky smooth, no noise/Moiré
export function woodPlankTex(seed = 101, repeat: [number, number] = [6, 6]): THREE.CanvasTexture {
  return makeCanvasTex(
    1024,
    1024,
    (g, w, h) => {
      const r = mulberry32(seed);
      // Warm dark walnut underbed
      g.fillStyle = '#2a170d';
      g.fillRect(0, 0, w, h);
      const planks = 8;
      const ph = h / planks;
      for (let row = 0; row < planks; row++) {
        const y0 = row * ph;
        const tone = 0.94 + r() * 0.12;
        const R = Math.round(136 * tone);
        const G = Math.round(88 * tone);
        const B = Math.round(52 * tone);

        // Plank base wood gradient (soft satin finish)
        const pGrad = g.createLinearGradient(0, y0, 0, y0 + ph);
        pGrad.addColorStop(0, `rgb(${Math.round(R * 1.05)},${Math.round(G * 1.05)},${Math.round(B * 1.05)})`);
        pGrad.addColorStop(0.5, `rgb(${R},${G},${B})`);
        pGrad.addColorStop(1, `rgb(${Math.round(R * 0.92)},${Math.round(G * 0.92)},${Math.round(B * 0.92)})`);
        g.fillStyle = pGrad;
        g.fillRect(0, y0 + 1.5, w, ph - 3);

        // Soft, organic flowing grain ribbons (bezier curves with low opacity, no noisy scanlines)
        for (let i = 0; i < 14; i++) {
          const gy = y0 + 4 + r() * (ph - 8);
          g.strokeStyle = r() > 0.5 ? 'rgba(45, 24, 12, 0.08)' : 'rgba(235, 195, 145, 0.06)';
          g.lineWidth = 1.5 + r() * 2.5;
          g.beginPath();
          g.moveTo(0, gy);
          const cp1x = w * 0.33;
          const cp1y = gy + (r() - 0.5) * 8;
          const cp2x = w * 0.66;
          const cp2y = gy + (r() - 0.5) * 8;
          g.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, w, gy);
          g.stroke();
        }

        // Clean micro-bevel and shadow between planks
        g.fillStyle = 'rgba(18, 9, 4, 0.75)';
        g.fillRect(0, y0 + ph - 2, w, 2);
        g.fillStyle = 'rgba(255, 235, 205, 0.12)';
        g.fillRect(0, y0 + 1, w, 1);

        // Staggered vertical plank joints with clean bevels
        const joints = [w * 0.35 + (r() - 0.5) * 60, w * 0.8 + (r() - 0.5) * 60];
        joints.forEach((jx) => {
          g.fillStyle = 'rgba(18, 9, 4, 0.8)';
          g.fillRect(jx, y0 + 1.5, 2, ph - 3);
          g.fillStyle = 'rgba(255, 235, 205, 0.1)';
          g.fillRect(jx + 2, y0 + 1.5, 1, ph - 3);
        });
      }
    },
    { repeat },
  );
}

// 2. High-Resolution Polished Walnut & Cherry Architectural Wood (512x512) - Smooth satin grain
export function walnutTrimTex(
  base: [number, number, number] = [88, 52, 28],
  seed = 7,
  repeat: [number, number] = [2, 2],
): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    512,
    (g, w, h) => {
      const r = mulberry32(seed);
      // Soft vertical wood tone gradient
      const bgGrad = g.createLinearGradient(0, 0, w, 0);
      bgGrad.addColorStop(0, `rgb(${base[0]},${base[1]},${base[2]})`);
      bgGrad.addColorStop(0.5, `rgb(${Math.round(base[0] * 1.1)},${Math.round(base[1] * 1.1)},${Math.round(base[2] * 1.1)})`);
      bgGrad.addColorStop(1, `rgb(${Math.round(base[0] * 0.92)},${Math.round(base[1] * 0.92)},${Math.round(base[2] * 0.92)})`);
      g.fillStyle = bgGrad;
      g.fillRect(0, 0, w, h);

      // Smooth, broad satin grain ribbons
      for (let i = 0; i < 22; i++) {
        const x = r() * w;
        g.strokeStyle = `rgba(28, 14, 6, ${0.05 + r() * 0.08})`;
        g.lineWidth = 2 + r() * 4;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + (r() - 0.5) * 25, h * 0.35, x + (r() - 0.5) * 25, h * 0.65, x + (r() - 0.5) * 15, h);
        g.stroke();
      }

      // Soft lustrous sheen highlight
      const sheen = g.createLinearGradient(0, 0, 0, h);
      sheen.addColorStop(0, 'rgba(255, 235, 205, 0.08)');
      sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
      sheen.addColorStop(1, 'rgba(10, 5, 2, 0.12)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, w, h);
    },
    { repeat },
  );
}

// 2b. Classic English Club Wainscot Wood Panel (512x512) - Recessed Picture-Frame Paneling
export function wainscotPanelTex(seed = 44, repeat: [number, number] = [3, 1]): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    512,
    (g, w, h) => {
      // Base dark mahogany panel
      const baseGrad = g.createLinearGradient(0, 0, 0, h);
      baseGrad.addColorStop(0, '#3a1f11');
      baseGrad.addColorStop(0.5, '#452615');
      baseGrad.addColorStop(1, '#2c170c');
      g.fillStyle = baseGrad;
      g.fillRect(0, 0, w, h);

      // Recessed molding frame
      const padX = 24;
      const padY = 28;
      const fw = w - padX * 2;
      const fh = h - padY * 2;

      // Outer raised lip
      g.fillStyle = '#221108';
      g.fillRect(padX - 4, padY - 4, fw + 8, fh + 8);
      g.fillStyle = '#5a331c';
      g.fillRect(padX - 2, padY - 2, fw + 4, 3);
      g.fillRect(padX - 2, padY - 2, 3, fh + 4);

      // Recessed interior field
      const fieldGrad = g.createLinearGradient(0, padY, 0, padY + fh);
      fieldGrad.addColorStop(0, '#341c10');
      fieldGrad.addColorStop(0.5, '#3e2213');
      fieldGrad.addColorStop(1, '#27140b');
      g.fillStyle = fieldGrad;
      g.fillRect(padX, padY, fw, fh);

      // Inner bevel highlight / shadow
      g.fillStyle = 'rgba(255, 220, 180, 0.1)';
      g.fillRect(padX, padY + fh - 2, fw, 2);
      g.fillRect(padX + fw - 2, padY, 2, fh);

      g.fillStyle = 'rgba(12, 6, 2, 0.45)';
      g.fillRect(padX, padY, fw, 3);
      g.fillRect(padX, padY, 3, fh);
    },
    { repeat },
  );
}

// 2c. Rich Heritage Tavern Plaster Wall (512x512) - Velvety, Warm & Noise-Free
export function tavernPlasterWallTex(
  color: 'emerald' | 'burgundy' | 'amber' = 'emerald',
  repeat: [number, number] = [3, 2],
): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    512,
    (g, w, h) => {
      // Colors: deep luxurious British racing green or warm vintage tavern burgundy
      const topCol = color === 'emerald' ? '#173629' : color === 'burgundy' ? '#42161b' : '#3d2b1f';
      const midCol = color === 'emerald' ? '#1c4233' : color === 'burgundy' ? '#4d1c21' : '#493425';
      const botCol = color === 'emerald' ? '#122c21' : color === 'burgundy' ? '#351115' : '#2f2017';

      const wallGrad = g.createLinearGradient(0, 0, 0, h);
      wallGrad.addColorStop(0, topCol);
      wallGrad.addColorStop(0.5, midCol);
      wallGrad.addColorStop(1, botCol);
      g.fillStyle = wallGrad;
      g.fillRect(0, 0, w, h);

      // Soft, subtle Venetian plaster micro-mottling (large soft radius circles, NO high-frequency noise)
      const r = mulberry32(77);
      for (let i = 0; i < 35; i++) {
        const rad = 40 + r() * 80;
        const px = r() * w;
        const py = r() * h;
        const radGrad = g.createRadialGradient(px, py, 4, px, py, rad);
        const alpha = 0.03 + r() * 0.04;
        radGrad.addColorStop(0, r() > 0.5 ? `rgba(255, 235, 205, ${alpha})` : `rgba(0, 0, 0, ${alpha * 1.5})`);
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = radGrad;
        g.beginPath();
        g.arc(px, py, rad, 0, Math.PI * 2);
        g.fill();
      }

      // Very subtle, elegant vintage wall stripe accent
      for (let x = 64; x < w; x += 64) {
        g.fillStyle = 'rgba(255, 235, 200, 0.025)';
        g.fillRect(x, 0, 2, h);
        g.fillStyle = 'rgba(0, 0, 0, 0.04)';
        g.fillRect(x + 2, 0, 2, h);
      }
    },
    { repeat },
  );
}

// 3. High-Resolution Artisan Brick Fireplace Hearth (512x512) - Smooth, warm, no speckles
export function brickWallTex(seed = 202, repeat: [number, number] = [3, 3]): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    512,
    (g, w, h) => {
      const r = mulberry32(seed);
      // Clean, rich dark mortar base
      g.fillStyle = '#231812';
      g.fillRect(0, 0, w, h);
      const rows = 10;
      const cols = 5;
      const bh = h / rows;
      const bw = w / cols;
      for (let ry = 0; ry < rows; ry++) {
        const off = (ry % 2) * (bw / 2);
        for (let cx = -1; cx <= cols; cx++) {
          const k = 0.88 + r() * 0.24;
          const brickR = Math.round(152 * k);
          const brickG = Math.round(68 * k);
          const brickB = Math.round(44 * k);

          const bx = cx * bw + off + 3;
          const by = ry * bh + 3;
          const bwk = bw - 6;
          const bhk = bh - 6;

          // Warm brick gradient with soft internal lighting
          const bGrad = g.createLinearGradient(bx, by, bx, by + bhk);
          bGrad.addColorStop(0, `rgb(${Math.round(brickR * 1.08)},${Math.round(brickG * 1.08)},${Math.round(brickB * 1.08)})`);
          bGrad.addColorStop(0.5, `rgb(${brickR},${brickG},${brickB})`);
          bGrad.addColorStop(1, `rgb(${Math.round(brickR * 0.86)},${Math.round(brickG * 0.86)},${Math.round(brickB * 0.86)})`);
          g.fillStyle = bGrad;

          // Smooth rounded rectangle for the brick face
          const rad = 2;
          g.beginPath();
          g.roundRect(bx, by, bwk, bhk, rad);
          g.fill();

          // Soft highlight on top edge and shadow on bottom edge
          g.fillStyle = 'rgba(255, 230, 200, 0.12)';
          g.fillRect(bx + 2, by + 1, bwk - 4, 1.5);
          g.fillStyle = 'rgba(15, 8, 4, 0.35)';
          g.fillRect(bx + 2, by + bhk - 2, bwk - 4, 1.5);
        }
      }
    },
    { repeat },
  );
}

// 3b. Leaded Diamond-Paned Pub Window (512x512)
export function leadedPubWindowTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    512,
    (g, w, h) => {
      // Exterior twilight / amber interior lantern back-glow
      const skyGrad = g.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, '#151c34');
      skyGrad.addColorStop(0.6, '#282b4a');
      skyGrad.addColorStop(1, '#4d3b2a');
      g.fillStyle = skyGrad;
      g.fillRect(0, 0, w, h);

      // Warm amber lantern glow radiating through glass
      const glow = g.createRadialGradient(w * 0.5, h * 0.75, 20, w * 0.5, h * 0.75, 240);
      glow.addColorStop(0, 'rgba(255, 185, 75, 0.55)');
      glow.addColorStop(0.5, 'rgba(240, 140, 50, 0.28)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);

      // Diamond leaded lattice canes
      g.strokeStyle = '#1a1924';
      g.lineWidth = 3.5;
      const step = 48;
      for (let d = -w; d < w * 2; d += step) {
        g.beginPath();
        g.moveTo(d, 0);
        g.lineTo(d + h, h);
        g.stroke();

        g.beginPath();
        g.moveTo(d, 0);
        g.lineTo(d - h, h);
        g.stroke();
      }

      // Timber window frame and central mullion
      g.fillStyle = '#23140a';
      g.fillRect(0, 0, w, 18);
      g.fillRect(0, h - 18, w, 18);
      g.fillRect(0, 0, 18, h);
      g.fillRect(w - 18, 0, 18, h);
      g.fillRect(w * 0.5 - 7, 0, 14, h);
      g.fillRect(0, h * 0.5 - 7, w, 14);

      // Frame inner bevel highlight
      g.fillStyle = 'rgba(255, 220, 170, 0.2)';
      g.fillRect(18, 18, w - 36, 2);
      g.fillRect(18, 18, 2, h - 36);
    },
    { repeat: [1, 1] },
  );
}

// 4. Premium Billiard Felt & Table Cloth (512x512)
export function feltClothTex(colorHex = '#117c46', seed = 303): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    512,
    (g, w, h) => {
      const r = mulberry32(seed);
      g.fillStyle = colorHex;
      g.fillRect(0, 0, w, h);

      // Microfiber cross-hatch baize weave
      for (let i = 0; i < 4000; i++) {
        const a = 0.04 + r() * 0.05;
        g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.2})`;
        const x = r() * w;
        const y = r() * h;
        g.fillRect(x, y, 1.5, 1.5);
      }
    },
    { repeat: [4, 4] },
  );
}

// 5. High-Resolution 15x15 Ludo Board Texture (1024x1024)
export function ludoBoardTex(): THREE.CanvasTexture {
  const U = 68;
  const boardPx = U * 15;
  return makeCanvasTex(
    boardPx,
    boardPx,
    (g) => {
      // Vintage parchment textured surface
      g.fillStyle = '#faeed4';
      g.fillRect(0, 0, boardPx, boardPx);

      // Fine linen texture
      for (let i = 0; i < 8000; i++) {
        g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
        g.fillRect(Math.random() * boardPx, Math.random() * boardPx, 2, 2);
      }

      const dark = (c: string, a: number) => {
        const x = parseInt(c.slice(1), 16);
        const m = (v: number) => Math.round(v * a);
        return `rgb(${m(x >> 16)},${m((x >> 8) & 255)},${m(x & 255)})`;
      };

      // 4 Player Home Yard Corners
      for (let c = 0; c < 4; c++) {
        const corner = [
          [0, 0],
          [9, 0],
          [9, 9],
          [0, 9],
        ][c];
        const x0 = corner[0] * U;
        const y0 = corner[1] * U;

        // Outer enamel colored field with subtle drop shadow
        g.fillStyle = COLOR_CSS[c];
        g.fillRect(x0, y0, 6 * U, 6 * U);
        g.fillStyle = dark(COLOR_CSS[c], 0.7);
        g.fillRect(x0 + 0.25 * U, y0 + 0.25 * U, 5.5 * U, 5.5 * U);

        // Inner white porcelain yard
        g.fillStyle = '#fffdf6';
        g.fillRect(x0 + 0.8 * U, y0 + 0.8 * U, 4.4 * U, 4.4 * U);
        g.strokeStyle = dark(COLOR_CSS[c], 0.4);
        g.lineWidth = 3.5;
        g.strokeRect(x0 + 0.8 * U, y0 + 0.8 * U, 4.4 * U, 4.4 * U);

        // 4 Yard Base Token Slots
        for (let t = 0; t < 4; t++) {
          const [px, py] = yardSlot(c, t);
          const cx = px * U;
          const cy = py * U;

          g.beginPath();
          g.arc(cx, cy, 0.72 * U, 0, Math.PI * 2);
          g.fillStyle = COLOR_CSS[c];
          g.shadowColor = 'rgba(0,0,0,0.25)';
          g.shadowBlur = 8;
          g.fill();
          g.shadowColor = 'transparent';

          g.beginPath();
          g.arc(cx, cy, 0.5 * U, 0, Math.PI * 2);
          g.fillStyle = dark(COLOR_CSS[c], 0.65);
          g.fill();

          g.beginPath();
          g.arc(cx, cy, 0.3 * U, 0, Math.PI * 2);
          g.fillStyle = '#ffffff';
          g.fill();
        }
      }

      // Track Cells
      const homeCol = new Map<string, number>();
      for (let c = 0; c < 4; c++) {
        for (let i = 0; i < 5; i++) {
          homeCol.set(rotCell(HOME_RED[i], c).join(','), c);
        }
      }
      const startCell = new Map<string, number>(
        START_IDX.map((idx, c) => [LOOP[idx].join(','), c]),
      );

      for (let y = 0; y < 15; y++) {
        for (let x = 0; x < 15; x++) {
          const inArm = (x >= 6 && x <= 8) || (y >= 6 && y <= 8);
          if (!inArm || (x >= 6 && x <= 8 && y >= 6 && y <= 8)) continue;
          const key = `${x},${y}`;
          const isHomeRun = homeCol.has(key);
          const isStart = startCell.has(key);

          g.fillStyle = isHomeRun
            ? COLOR_CSS[homeCol.get(key)!]
            : isStart
              ? COLOR_CSS[startCell.get(key)!]
              : '#fcf6e6';
          g.fillRect(x * U, y * U, U, U);

          // Beveled border
          g.strokeStyle = '#5a4228';
          g.lineWidth = 2.5;
          g.strokeRect(x * U + 1, y * U + 1, U - 2, U - 2);

          if (isStart) {
            // Start arrow symbol
            g.beginPath();
            g.arc((x + 0.5) * U, (y + 0.5) * U, 0.22 * U, 0, Math.PI * 2);
            g.fillStyle = '#ffffff';
            g.fill();
          }
        }
      }

      // Star Safe Squares
      for (const idx of STAR_IDX) {
        const [x, y] = LOOP[idx];
        const cx = (x + 0.5) * U;
        const cy = (y + 0.5) * U;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rad = (i % 2 ? 0.16 : 0.38) * U;
          g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
        g.closePath();
        g.fillStyle = '#d4af37';
        g.shadowColor = 'rgba(0,0,0,0.3)';
        g.shadowBlur = 6;
        g.fill();
        g.shadowColor = 'transparent';
        g.strokeStyle = '#5a4228';
        g.lineWidth = 2.5;
        g.stroke();
      }

      // Center Finishing Triangles
      const centerCoord: [number, number] = [7.5 * U, 7.5 * U];
      const centerCorners: Array<[number, number]> = [
        [6 * U, 6 * U],
        [9 * U, 6 * U],
        [9 * U, 9 * U],
        [6 * U, 9 * U],
      ];
      const tris = [
        [3, 0],
        [0, 1],
        [1, 2],
        [2, 3],
      ];
      for (let c = 0; c < 4; c++) {
        const [a, b] = tris[c];
        g.beginPath();
        g.moveTo(...centerCorners[a]);
        g.lineTo(...centerCorners[b]);
        g.lineTo(...centerCoord);
        g.closePath();
        g.fillStyle = COLOR_CSS[c];
        g.fill();
        g.strokeStyle = '#5a4228';
        g.lineWidth = 3;
        g.stroke();
      }
    },
  );
}

// 6. High-Resolution Ivory Die Face (256x256)
export function diePipTex(n: number): THREE.CanvasTexture {
  return makeCanvasTex(
    256,
    256,
    (x) => {
      // Rounded ivory die face gradient
      const g = x.createRadialGradient(128, 128, 30, 128, 128, 160);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.7, '#faf6ea');
      g.addColorStop(1, '#ebdcc1');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);

      // Subtle edge bevel
      x.strokeStyle = '#c4b394';
      x.lineWidth = 8;
      x.strokeRect(6, 6, 244, 244);

      x.fillStyle = n === 1 ? '#d32f2f' : '#141418';
      const a = 64;
      const m = 128;
      const b = 192;
      const P: Record<number, Array<[number, number]>> = {
        1: [[m, m]],
        2: [
          [a, a],
          [b, b],
        ],
        3: [
          [a, a],
          [m, m],
          [b, b],
        ],
        4: [
          [a, a],
          [b, a],
          [a, b],
          [b, b],
        ],
        5: [
          [a, a],
          [b, a],
          [m, m],
          [a, b],
          [b, b],
        ],
        6: [
          [a, a],
          [b, a],
          [a, m],
          [b, m],
          [a, b],
          [b, b],
        ],
      };
      for (const [px, py] of P[n] || P[1]) {
        x.beginPath();
        x.arc(px, py, n === 1 ? 32 : 22, 0, Math.PI * 2);
        x.shadowColor = 'rgba(0,0,0,0.35)';
        x.shadowBlur = 6;
        x.fill();
        x.shadowColor = 'transparent';
      }
    },
  );
}

// 7. High-Resolution Billiard Ball Texture (512x256) with Clean Anti-aliased Decals
export function poolBallTex(id: number): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    256,
    (g, w, h) => {
      const col = BALL_COLORS[id] || '#ffffff';
      const isStripe = id >= 9 && id <= 15;

      // Base coat
      g.fillStyle = isStripe ? '#ffffff' : col;
      g.fillRect(0, 0, w, h);

      if (isStripe) {
        // Broad colored equator stripe band with crisp edges
        g.fillStyle = col;
        g.fillRect(0, h * 0.22, w, h * 0.56);
      }

      if (id === 0) {
        // Red training measles dots on the cue ball
        g.fillStyle = '#e53935';
        for (const cx of [w * 0.25, w * 0.75]) {
          g.beginPath();
          g.arc(cx, h / 2, 12, 0, Math.PI * 2);
          g.fill();
        }
        return;
      }

      // High-resolution number circle decals on both sides
      for (const cx of [w * 0.25, w * 0.75]) {
        // White circular badge
        g.beginPath();
        g.arc(cx, h / 2, 42, 0, Math.PI * 2);
        g.fillStyle = '#ffffff';
        g.shadowColor = 'rgba(0,0,0,0.3)';
        g.shadowBlur = 8;
        g.fill();
        g.shadowColor = 'transparent';

        // Outer ring outline
        g.strokeStyle = 'rgba(0,0,0,0.15)';
        g.lineWidth = 3;
        g.stroke();

        // Numerals
        g.fillStyle = '#111215';
        g.font = "bold 44px 'JetBrains Mono', 'Chakra Petch', sans-serif";
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(id), cx, h / 2 + 2);

        // Underline for 6 and 9
        if (id === 6 || id === 9) {
          g.fillRect(cx - 16, h / 2 + 26, 32, 4);
        }
      }
    },
  );
}

// 8. High-Resolution Standard 20-Zone Dartboard (1024x1024)
export function dartboardTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    1024,
    1024,
    (g, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const R = 460;

      // Outer black catch ring
      g.fillStyle = '#121214';
      g.beginPath();
      g.arc(cx, cy, R + 40, 0, Math.PI * 2);
      g.fill();

      for (let i = 0; i < 20; i++) {
        const a0 = -Math.PI / 2 - Math.PI / 20 + (i * Math.PI) / 10;
        const a1 = a0 + Math.PI / 10;
        const even = i % 2 === 0;
        const mainCol = even ? '#1c1b1a' : '#f5e9d2';
        const ringCol = even ? '#e53935' : '#2e7d32';

        // Double ring
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, R * 0.9, a0, a1);
        g.closePath();
        g.fillStyle = ringCol;
        g.fill();

        // Outer Single
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, R * 0.81, a0, a1);
        g.closePath();
        g.fillStyle = mainCol;
        g.fill();

        // Triple Ring
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, R * 0.54, a0, a1);
        g.closePath();
        g.fillStyle = ringCol;
        g.fill();

        // Inner Single
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, R * 0.46, a0, a1);
        g.closePath();
        g.fillStyle = mainCol;
        g.fill();

        // Numerical Labels on black ring
        const mid = (a0 + a1) / 2;
        const nx = cx + Math.cos(mid) * (R * 0.97);
        const ny = cy + Math.sin(mid) * (R * 0.97);
        g.fillStyle = '#ffffff';
        g.font = "bold 38px 'Chakra Petch', sans-serif";
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(DART_SECTORS[i]), nx, ny);
      }

      // Outer bull (25 green)
      g.beginPath();
      g.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
      g.fillStyle = '#2e7d32';
      g.fill();

      // Double bull (50 red)
      g.beginPath();
      g.arc(cx, cy, R * 0.055, 0, Math.PI * 2);
      g.fillStyle = '#e53935';
      g.fill();

      // Metallic silver wire spider overlay
      g.strokeStyle = '#d5dadf';
      g.lineWidth = 3.5;
      for (const rMul of [0.9, 0.81, 0.54, 0.46, 0.12, 0.055]) {
        g.beginPath();
        g.arc(cx, cy, R * rMul, 0, Math.PI * 2);
        g.stroke();
      }
      for (let i = 0; i < 20; i++) {
        const a = -Math.PI / 2 - Math.PI / 20 + (i * Math.PI) / 10;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * (R * 0.055), cy + Math.sin(a) * (R * 0.055));
        g.lineTo(cx + Math.cos(a) * (R * 0.9), cy + Math.sin(a) * (R * 0.9));
        g.stroke();
      }
    },
  );
}

// 9. Vector Neon Glyphs for 九号俱乐部 (Neon marquee sign)
export function drawClub9NeonGlyphs(
  g: CanvasRenderingContext2D,
  startX: number,
  centerY: number,
  scale = 1.0,
): void {
  g.save();
  g.strokeStyle = '#ff5ec4';
  g.lineWidth = 5 * scale;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = '#ff5ec4';
  g.shadowBlur = 14 * scale;

  const glyphs: Array<Array<Array<[number, number]>>> = [
    // 九
    [
      [
        [18, 12],
        [14, 38],
        [10, 48],
      ],
      [
        [8, 22],
        [36, 22],
        [32, 42],
        [36, 48],
        [44, 46],
      ],
    ],
    // 号
    [
      [
        [12, 10],
        [36, 10],
        [36, 22],
        [12, 22],
        [12, 10],
      ],
      [
        [8, 30],
        [40, 30],
      ],
      [
        [16, 30],
        [14, 38],
        [32, 38],
        [30, 48],
        [22, 46],
      ],
    ],
    // 俱
    [
      [
        [14, 10],
        [8, 28],
      ],
      [
        [11, 20],
        [11, 48],
      ],
      [
        [18, 14],
        [38, 14],
        [38, 40],
        [18, 40],
        [18, 14],
      ],
      [
        [18, 22],
        [38, 22],
      ],
      [
        [18, 31],
        [38, 31],
      ],
      [
        [15, 44],
        [41, 44],
      ],
    ],
    // 乐
    [
      [
        [30, 8],
        [10, 14],
        [8, 28],
        [38, 28],
      ],
      [
        [22, 12],
        [22, 48],
        [16, 44],
      ],
      [
        [12, 34],
        [6, 44],
      ],
      [
        [32, 34],
        [38, 44],
      ],
    ],
    // 部
    [
      [
        [14, 6],
        [14, 14],
      ],
      [
        [6, 14],
        [24, 14],
      ],
      [
        [10, 14],
        [12, 26],
      ],
      [
        [20, 14],
        [18, 26],
      ],
      [
        [6, 26],
        [24, 26],
      ],
      [
        [8, 32],
        [22, 32],
        [22, 46],
        [8, 46],
        [8, 32],
      ],
      [
        [30, 8],
        [42, 8],
        [36, 22],
        [44, 34],
        [38, 44],
        [30, 40],
      ],
      [
        [30, 8],
        [30, 50],
      ],
    ],
  ];

  const stepX = 64 * scale;
  const topY = centerY - 28 * scale;
  glyphs.forEach((strokes, idx) => {
    const gx = startX + idx * stepX;
    for (const poly of strokes) {
      g.beginPath();
      poly.forEach(([px, py], i) => {
        const x = gx + px * scale;
        const y = topY + py * scale;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    }
  });
  g.restore();
}

// 10. Neon Club Sign Texture
export function neonClubSignTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    1024,
    400,
    (g, w, h) => {
      g.fillStyle = '#0f1322';
      g.fillRect(0, 0, w, h);

      // Cyan neon border
      g.strokeStyle = '#54e0ee';
      g.lineWidth = 10;
      g.shadowColor = '#54e0ee';
      g.shadowBlur = 24;
      g.strokeRect(18, 18, w - 36, h - 36);

      // Vector neon pink Chinese glyphs
      drawClub9NeonGlyphs(g, 130, h * 0.38, 2.3);

      // Cyan neon English text
      g.fillStyle = '#54e0ee';
      g.shadowColor = '#54e0ee';
      g.shadowBlur = 24;
      g.font = "bold 88px 'Chakra Petch', monospace";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('CLUB No.9', w / 2, h * 0.78);
    },
  );
}

// 11. Animated CRT Arcade Screen
export function drawArcadeScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stationType: 'lobby' | 'ludo' | 'dice' | 'darts' | 'retro' | number,
  time: number,
): void {
  ctx.fillStyle = '#060812';
  ctx.fillRect(0, 0, w, h);

  let type = stationType;
  if (typeof type === 'number') {
    const map: Array<'lobby' | 'ludo' | 'dice' | 'darts' | 'retro'> = ['lobby', 'ludo', 'dice', 'darts', 'retro'];
    type = map[type % map.length];
  }

  if (type === 'lobby') {
    // NET-PLAY TERMINAL
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = '#54e0ee';
    ctx.font = "bold 15px 'Chakra Petch', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('NET LOBBY', w / 2, 24);

    const cx = w / 2;
    const cy = h / 2 + 4;
    ctx.strokeStyle = 'rgba(84, 224, 238, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.stroke();

    const angle = time * 3.5;
    ctx.strokeStyle = '#54e0ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * 26, cy + Math.sin(angle) * 26);
    ctx.stroke();

    ctx.fillStyle = Math.sin(time * 6) > 0 ? '#ff5ec4' : '#5fe08a';
    ctx.font = "bold 10px 'Chakra Petch', monospace";
    ctx.fillText('ONLINE • 1-4P', w / 2, h - 12);
  } else if (type === 'ludo') {
    // LUDO ROYALE ARCADE
    ctx.fillStyle = '#1e1428';
    ctx.fillRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = '#ffb84a';
    ctx.font = "bold 15px 'Chakra Petch', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('LUDO ROYALE', w / 2, 24);

    const cx = w / 2;
    const cy = h / 2 + 4;
    const pawnColors = ['#e63946', '#2a9d8f', '#e9c46a', '#457b9d'];
    pawnColors.forEach((c, idx) => {
      const a = time * 2.5 + (idx * Math.PI) / 2;
      const px = cx + Math.cos(a) * 22;
      const py = cy + Math.sin(a) * 14;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    const dieFace = (Math.floor(time * 3) % 6) + 1;
    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(cx - 8, cy - 8, 16, 16);
    ctx.fillStyle = '#1e1428';
    ctx.font = "bold 11px monospace";
    ctx.fillText(String(dieFace), cx, cy + 4);

    ctx.fillStyle = Math.sin(time * 5) > 0 ? '#54e0ee' : '#ffffff';
    ctx.font = "bold 10px 'Chakra Petch', monospace";
    ctx.fillText('PRESS 1P/2P START', w / 2, h - 12);
  } else if (type === 'dice') {
    // CYBER DICE SHAKER
    ctx.fillStyle = '#181222';
    ctx.fillRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = '#ff5ec4';
    ctx.font = "bold 15px 'Chakra Petch', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('CYBER DICE', w / 2, 24);

    const cx = w / 2;
    const cy = h / 2 + 2;
    const wobble = Math.sin(time * 8) * 6;
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.moveTo(cx - 16 + wobble, cy + 14);
    ctx.lineTo(cx + 16 + wobble, cy + 14);
    ctx.lineTo(cx + 11 + wobble, cy - 10);
    ctx.lineTo(cx - 11 + wobble, cy - 10);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 5; i++) {
      const dx = cx - 22 + i * 11;
      const dy = cy + 18;
      ctx.fillStyle = '#ffcf78';
      ctx.fillRect(dx, dy, 7, 7);
    }

    ctx.fillStyle = Math.sin(time * 5) > 0 ? '#ffb84a' : '#fff';
    ctx.font = "bold 10px 'Chakra Petch', monospace";
    ctx.fillText('SHAKE & BLUFF', w / 2, h - 12);
  } else if (type === 'darts') {
    // PIXEL DARTS DELUXE
    ctx.fillStyle = '#0b161a';
    ctx.fillRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = '#5fe08a';
    ctx.font = "bold 15px 'Chakra Petch', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('PIXEL DARTS', w / 2, 24);

    const cx = w / 2;
    const cy = h / 2 + 4;
    for (const r of [24, 18, 12, 6]) {
      ctx.strokeStyle = r % 12 === 0 ? '#ff4a3a' : '#5fe08a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffb84a';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = Math.sin(time * 4) > 0 ? '#ff4a3a' : '#54e0ee';
    ctx.font = "bold 10px 'Chakra Petch', monospace";
    ctx.fillText('301 • 501 • CRICKET', w / 2, h - 12);
  } else {
    // RETRO SPACE CLASSIC
    ctx.fillStyle = '#060614';
    ctx.fillRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = '#54e0ee';
    ctx.font = "bold 15px 'Chakra Petch', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('SPACE 95', w / 2, 24);

    const wave = Math.sin(time * 5) * 16;
    ctx.fillStyle = '#ff5ec4';
    ctx.fillRect(w / 2 - 14 + wave, h / 2 - 8, 8, 6);
    ctx.fillRect(w / 2 + 6 + wave, h / 2 - 8, 8, 6);
    ctx.fillRect(w / 2 - 4 + wave, h / 2 + 2, 8, 6);

    ctx.fillStyle = '#5fe08a';
    ctx.fillRect(w / 2 - 5, h - 28, 10, 8);

    ctx.fillStyle = Math.sin(time * 6) > 0 ? '#ffb84a' : '#fff';
    ctx.font = "bold 10px 'Chakra Petch', monospace";
    ctx.fillText('INSERT COIN', w / 2, h - 12);
  }

  // Horizontal scanlines
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1.2);
  }
}

// 12. "BAR" Neon Sign Texture
export function openNeonTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    256,
    (g, w, h) => {
      g.fillStyle = '#111424';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffb84a';
      g.lineWidth = 8;
      g.shadowColor = '#ffb84a';
      g.shadowBlur = 20;
      g.strokeRect(14, 14, w - 28, h - 28);

      g.fillStyle = '#ff5ec4';
      g.shadowColor = '#ff5ec4';
      g.shadowBlur = 25;
      g.font = "bold 96px 'Chakra Petch', monospace";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('BAR', w / 2, h / 2);
    },
  );
}

// 13. Arcade Matchmaking & Game Marquees
export function lobbyMarqueeTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    192,
    (g, w, h) => {
      g.fillStyle = '#0f1426';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#54e0ee';
      g.lineWidth = 8;
      g.shadowColor = '#54e0ee';
      g.shadowBlur = 18;
      g.strokeRect(10, 10, w - 20, h - 20);

      g.fillStyle = '#54e0ee';
      g.font = "bold 52px 'Chakra Petch', monospace";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('ONLINE LOBBY', w / 2, h / 2);
    },
  );
}

export function ludoMarqueeTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    192,
    (g, w, h) => {
      g.fillStyle = '#180e29';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffb84a';
      g.lineWidth = 8;
      g.shadowColor = '#ffb84a';
      g.shadowBlur = 18;
      g.strokeRect(10, 10, w - 20, h - 20);

      g.fillStyle = '#ffb84a';
      g.font = "bold 50px 'Chakra Petch', monospace";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('LUDO ROYALE', w / 2, h / 2 - 8);

      g.fillStyle = '#54e0ee';
      g.font = "bold 20px 'Chakra Petch', monospace";
      g.fillText('★ 4-PLAYER ARCADE ★', w / 2, h / 2 + 36);
    },
  );
}

export function diceMarqueeTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    192,
    (g, w, h) => {
      g.fillStyle = '#1c0f20';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ff5ec4';
      g.lineWidth = 8;
      g.shadowColor = '#ff5ec4';
      g.shadowBlur = 18;
      g.strokeRect(10, 10, w - 20, h - 20);

      g.fillStyle = '#ff5ec4';
      g.font = "bold 50px 'Chakra Petch', monospace";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('CYBER DICE', w / 2, h / 2 - 8);

      g.fillStyle = '#ffb84a';
      g.font = "bold 20px 'Chakra Petch', monospace";
      g.fillText('◆ LIAR\'S DICE CUP ◆', w / 2, h / 2 + 36);
    },
  );
}

export function dartsMarqueeTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    192,
    (g, w, h) => {
      g.fillStyle = '#0a181e';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#5fe08a';
      g.lineWidth = 8;
      g.shadowColor = '#5fe08a';
      g.shadowBlur = 18;
      g.strokeRect(10, 10, w - 20, h - 20);

      g.fillStyle = '#5fe08a';
      g.font = "bold 48px 'Chakra Petch', monospace";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('PIXEL DARTS', w / 2, h / 2 - 8);

      g.fillStyle = '#ff4a3a';
      g.font = "bold 20px 'Chakra Petch', monospace";
      g.fillText('◎ 301 / 501 OCHE ◎', w / 2, h / 2 + 36);
    },
  );
}

export function retroMarqueeTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    192,
    (g, w, h) => {
      g.fillStyle = '#0d0d24';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#00f0ff';
      g.lineWidth = 8;
      g.shadowColor = '#00f0ff';
      g.shadowBlur = 18;
      g.strokeRect(10, 10, w - 20, h - 20);

      g.fillStyle = '#00f0ff';
      g.font = "bold 52px 'Chakra Petch', monospace";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SPACE 95', w / 2, h / 2);
    },
  );
}

export function coinDoorTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    256,
    256,
    (g, w, h) => {
      // Cast black steel finish
      g.fillStyle = '#141416';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2b2b32';
      g.lineWidth = 6;
      g.strokeRect(6, 6, w - 12, h - 12);

      // Dual coin reject slots with orange glow
      for (const ox of [w * 0.3, w * 0.7]) {
        g.fillStyle = '#0c0c0e';
        g.fillRect(ox - 24, 30, 48, 64);
        g.fillStyle = '#ff7a22';
        g.shadowColor = '#ff7a22';
        g.shadowBlur = 10;
        g.fillRect(ox - 16, 44, 32, 24);
        g.shadowBlur = 0;
        g.fillStyle = '#101010';
        g.font = "bold 13px monospace";
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('25¢', ox, 56);
      }

      // Return flap doors
      for (const ox of [w * 0.3, w * 0.7]) {
        g.fillStyle = '#1a1a1e';
        g.fillRect(ox - 24, 130, 48, 48);
        g.strokeStyle = '#32323a';
        g.lineWidth = 3;
        g.strokeRect(ox - 24, 130, 48, 48);
      }

      // Center lock keyhole
      g.fillStyle = '#3a3a42';
      g.beginPath();
      g.arc(w / 2, 104, 7, 0, Math.PI * 2);
      g.fill();
    },
  );
}

// 14. High-Resolution Vintage Persian Lounge Rug (1024x512)
export function orientalRugTex(variant: 'crimson' | 'emerald' = 'crimson'): THREE.CanvasTexture {
  return makeCanvasTex(
    1024,
    512,
    (g, w, h) => {
      const primary = variant === 'crimson' ? '#6e191f' : '#144d32';
      const borderNavy = '#141d33';
      const gold = '#cda142';
      const cream = '#f2ebd9';

      // Base woven wool texture with subtle rich depth (noise-free)
      const rugGrad = g.createLinearGradient(0, 0, 0, h);
      rugGrad.addColorStop(0, primary);
      rugGrad.addColorStop(0.5, variant === 'crimson' ? '#801e25' : '#195c3c');
      rugGrad.addColorStop(1, primary);
      g.fillStyle = rugGrad;
      g.fillRect(0, 0, w, h);

      // Outer gold fringe on left and right
      g.fillStyle = cream;
      for (let y = 10; y < h - 10; y += 4) {
        g.fillRect(0, y, 12, 2.5);
        g.fillRect(w - 12, y, 12, 2.5);
      }

      // Outer Navy border with gold guard lines
      g.fillStyle = borderNavy;
      g.fillRect(16, 16, w - 32, h - 32);

      g.fillStyle = primary;
      g.fillRect(44, 44, w - 88, h - 88);

      // Gold ornate guard stripes
      g.strokeStyle = gold;
      g.lineWidth = 4;
      g.strokeRect(20, 20, w - 40, h - 40);
      g.strokeRect(40, 40, w - 80, h - 80);

      // Repeating floral/star border motifs along navy band
      g.fillStyle = gold;
      for (let x = 32; x < w - 32; x += 36) {
        g.beginPath();
        g.arc(x, 30, 4, 0, Math.PI * 2);
        g.arc(x, h - 30, 4, 0, Math.PI * 2);
        g.fill();
      }
      for (let y = 32; y < h - 32; y += 36) {
        g.beginPath();
        g.arc(30, y, 4, 0, Math.PI * 2);
        g.arc(w - 30, y, 4, 0, Math.PI * 2);
        g.fill();
      }

      // Four ornate corner spandrels
      const spandrels = [
        [48, 48],
        [w - 148, 48],
        [48, h - 148],
        [w - 148, h - 148],
      ];
      spandrels.forEach(([sx, sy]) => {
        g.fillStyle = borderNavy;
        g.fillRect(sx, sy, 100, 100);
        g.strokeStyle = gold;
        g.lineWidth = 2.5;
        g.strokeRect(sx + 6, sy + 6, 88, 88);
        g.fillStyle = cream;
        g.beginPath();
        g.arc(sx + 50, sy + 50, 24, 0, Math.PI * 2);
        g.fill();
      });

      // Center Ornate Medallion
      const cx = w / 2;
      const cy = h / 2;

      // Outer diamond
      g.fillStyle = borderNavy;
      g.beginPath();
      g.moveTo(cx, cy - 140);
      g.lineTo(cx + 220, cy);
      g.lineTo(cx, cy + 140);
      g.lineTo(cx - 220, cy);
      g.closePath();
      g.fill();

      g.strokeStyle = gold;
      g.lineWidth = 5;
      g.stroke();

      // Inner medallion
      g.fillStyle = primary;
      g.beginPath();
      g.arc(cx, cy, 75, 0, Math.PI * 2);
      g.fill();
      g.stroke();

      g.fillStyle = cream;
      g.beginPath();
      g.arc(cx, cy, 40, 0, Math.PI * 2);
      g.fill();

      g.fillStyle = gold;
      g.beginPath();
      g.arc(cx, cy, 18, 0, Math.PI * 2);
      g.fill();
    },
  );
}

// 15. High-Resolution Framed Vintage Lounge Art Poster (512x640)
export function vintagePosterTex(type: 'billiards' | 'jazz' | 'cocktail'): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    640,
    (g, w, h) => {
      // Dark vintage parchment background
      g.fillStyle = type === 'billiards' ? '#142118' : type === 'jazz' ? '#1c1524' : '#261714';
      g.fillRect(0, 0, w, h);

      // Gold frame border
      g.strokeStyle = '#d4af37';
      g.lineWidth = 12;
      g.strokeRect(16, 16, w - 32, h - 32);
      g.lineWidth = 2;
      g.strokeRect(26, 26, w - 52, h - 52);

      g.textAlign = 'center';
      g.textBaseline = 'middle';

      if (type === 'billiards') {
        g.fillStyle = '#ffcf78';
        g.font = "bold 36px 'Chakra Petch', serif";
        g.fillText('CLUB No.9', w / 2, 70);

        g.fillStyle = '#ffffff';
        g.font = "bold 44px 'Chakra Petch', sans-serif";
        g.fillText('CHAMPIONSHIP', w / 2, 125);

        // Graphic: Pool 8-Ball
        g.beginPath();
        g.arc(w / 2, 280, 100, 0, Math.PI * 2);
        g.fillStyle = '#111218';
        g.fill();
        g.strokeStyle = '#d4af37';
        g.lineWidth = 4;
        g.stroke();

        g.beginPath();
        g.arc(w / 2, 280, 44, 0, Math.PI * 2);
        g.fillStyle = '#ffffff';
        g.fill();

        g.fillStyle = '#111218';
        g.font = "bold 56px 'Chakra Petch', sans-serif";
        g.fillText('8', w / 2, 282);

        // Crossed cues behind or bottom text
        g.fillStyle = '#a6b8a8';
        g.font = "24px 'Chakra Petch', sans-serif";
        g.fillText('TOURNAMENT 1995', w / 2, 440);
        g.fillText('EST. SHANGHAI & LONDON', w / 2, 480);
      } else if (type === 'jazz') {
        g.fillStyle = '#f090d8';
        g.font = "bold 36px 'Chakra Petch', serif";
        g.fillText('MIDNIGHT LOUNGE', w / 2, 75);

        g.fillStyle = '#ffffff';
        g.font = "bold 52px 'Chakra Petch', sans-serif";
        g.fillText('LIVE RHODES', w / 2, 135);

        // Saxophone / Piano keyboard graphic
        g.fillStyle = '#f4e09d';
        for (let i = 0; i < 9; i++) {
          g.fillRect(100 + i * 35, 230, 30, 120);
        }
        g.fillStyle = '#14141c';
        for (let i = 0; i < 8; i++) {
          if (i === 2 || i === 6) continue;
          g.fillRect(122 + i * 35, 230, 20, 75);
        }

        g.fillStyle = '#e8a8d8';
        g.font = "24px 'Chakra Petch', sans-serif";
        g.fillText('EVERY EVENING 9 PM', w / 2, 430);
        g.fillText('COCKTAILS & ANALOG VINYL', w / 2, 470);
      } else {
        g.fillStyle = '#ff9562';
        g.font = "bold 36px 'Chakra Petch', serif";
        g.fillText('BAR & RETRO PUB', w / 2, 75);

        g.fillStyle = '#ffffff';
        g.font = "bold 46px 'Chakra Petch', sans-serif";
        g.fillText('HOUSE COCKTAILS', w / 2, 135);

        // Martini glass silhouette
        g.strokeStyle = '#d4af37';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(w / 2 - 80, 230);
        g.lineTo(w / 2 + 80, 230);
        g.lineTo(w / 2, 330);
        g.closePath();
        g.stroke();

        g.beginPath();
        g.moveTo(w / 2, 330);
        g.lineTo(w / 2, 410);
        g.lineTo(w / 2 - 45, 410);
        g.lineTo(w / 2 + 45, 410);
        g.stroke();

        g.fillStyle = '#dfa58a';
        g.font = "24px 'Chakra Petch', sans-serif";
        g.fillText('CRAFT BEER & BOURBON', w / 2, 470);
      }
    },
  );
}

