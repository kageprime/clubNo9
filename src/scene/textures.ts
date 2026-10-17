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

// 1. High-Resolution Oak Floor Planks (1024x1024)
export function woodPlankTex(seed = 101, repeat: [number, number] = [6, 6]): THREE.CanvasTexture {
  return makeCanvasTex(
    1024,
    1024,
    (g, w, h) => {
      const r = mulberry32(seed);
      g.fillStyle = '#4a2c16';
      g.fillRect(0, 0, w, h);
      const planks = 8;
      const ph = h / planks;
      for (let row = 0; row < planks; row++) {
        const y0 = row * ph;
        const tone = 0.9 + r() * 0.22;
        const R = Math.round(112 * tone);
        const G = Math.round(72 * tone);
        const B = Math.round(42 * tone);

        // Plank base wood gradient
        const pGrad = g.createLinearGradient(0, y0, 0, y0 + ph);
        pGrad.addColorStop(0, `rgb(${Math.round(R * 1.08)},${Math.round(G * 1.08)},${Math.round(B * 1.08)})`);
        pGrad.addColorStop(0.5, `rgb(${R},${G},${B})`);
        pGrad.addColorStop(1, `rgb(${Math.round(R * 0.88)},${Math.round(G * 0.88)},${Math.round(B * 0.88)})`);
        g.fillStyle = pGrad;
        g.fillRect(0, y0 + 1, w, ph - 3);

        // Fine grain lines
        for (let i = 0; i < 90; i++) {
          const gy = y0 + 2 + r() * (ph - 6);
          const gh = 1 + r() * 1.5;
          const ga = 0.05 + r() * 0.12;
          g.fillStyle = r() > 0.5 ? `rgba(28,14,5,${ga})` : `rgba(240,200,150,${ga * 0.6})`;
          g.fillRect(r() * w, gy, 80 + r() * 320, gh);
        }

        // Deep groove joint between planks
        g.fillStyle = '#180c05';
        g.fillRect(0, y0 + ph - 2, w, 2.5);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(0, y0, w, 1);

        // Vertical plank seams
        const joints = [w * 0.25 + (r() - 0.5) * 80, w * 0.75 + (r() - 0.5) * 80];
        joints.forEach((jx) => {
          g.fillStyle = '#180c05';
          g.fillRect(jx, y0, 2.5, ph - 2);
          g.fillStyle = 'rgba(255,255,255,0.06)';
          g.fillRect(jx + 2.5, y0, 1, ph - 2);
        });
      }
    },
    { repeat },
  );
}

// 2. High-Resolution Walnut Rail & Furniture Trim (512x512)
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
      g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      g.fillRect(0, 0, w, h);

      for (let y = 0; y < h; y += 3) {
        const k = 0.8 + r() * 0.35;
        const a = r() < 0.2 ? 0.35 : 0.12;
        g.fillStyle = `rgba(${Math.round(base[0] * k * 0.6)},${Math.round(base[1] * k * 0.6)},${Math.round(base[2] * k * 0.6)},${a})`;
        g.fillRect(0, y, w, 2.5);
      }

      // Satin grain swirls
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = `rgba(24,12,6,${0.08 + r() * 0.1})`;
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        const startX = r() * w;
        const startY = r() * h;
        g.moveTo(startX, startY);
        g.bezierCurveTo(startX + 100, startY + (r() - 0.5) * 30, startX + 240, startY + (r() - 0.5) * 40, startX + 380, startY);
        g.stroke();
      }
    },
    { repeat },
  );
}

// 3. High-Resolution Brick Fireplace Hearth (512x512)
export function brickWallTex(seed = 202, repeat: [number, number] = [3, 3]): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    512,
    (g, w, h) => {
      const r = mulberry32(seed);
      // Textured rough mortar base
      g.fillStyle = '#2d221c';
      g.fillRect(0, 0, w, h);
      const rows = 10;
      const cols = 5;
      const bh = h / rows;
      const bw = w / cols;
      for (let ry = 0; ry < rows; ry++) {
        const off = (ry % 2) * (bw / 2);
        for (let cx = -1; cx <= cols; cx++) {
          const k = 0.85 + r() * 0.3;
          const brickR = Math.round(155 * k);
          const brickG = Math.round(65 * k);
          const brickB = Math.round(40 * k);

          const bx = cx * bw + off + 3;
          const by = ry * bh + 3;
          const bwk = bw - 6;
          const bhk = bh - 6;

          // Brick gradient
          const bGrad = g.createLinearGradient(bx, by, bx, by + bhk);
          bGrad.addColorStop(0, `rgb(${Math.round(brickR * 1.1)},${Math.round(brickG * 1.1)},${Math.round(brickB * 1.1)})`);
          bGrad.addColorStop(1, `rgb(${Math.round(brickR * 0.85)},${Math.round(brickG * 0.85)},${Math.round(brickB * 0.85)})`);
          g.fillStyle = bGrad;
          g.fillRect(bx, by, bwk, bhk);

          // Subtle brick surface speckling
          for (let p = 0; p < 25; p++) {
            g.fillStyle = r() > 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.08)';
            g.fillRect(bx + r() * bwk, by + r() * bhk, 2, 2);
          }
        }
      }
    },
    { repeat },
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
  variant: number,
  time: number,
): void {
  ctx.fillStyle = '#080c18';
  ctx.fillRect(0, 0, w, h);

  const colors = ['#ff5ec4', '#54e0ee', '#ffb84a', '#5fe08a'];
  const title = ['CYBER POOL', 'PAC-PULSE', 'STREET 95', 'GALAXY-9'][variant % 4];

  ctx.fillStyle = colors[variant % 4];
  ctx.font = "bold 32px 'Chakra Petch', monospace";
  ctx.textAlign = 'center';
  ctx.fillText(title, w / 2, 60);

  // Animated arcade graphics
  ctx.strokeStyle = colors[(variant + 1) % 4];
  ctx.lineWidth = 4;
  for (let y = 100; y < h - 40; y += 28) {
    const wave = Math.sin(time * 4 + y * 0.05 + variant) * 35;
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(w / 2 + wave, y);
    ctx.lineTo(w - 30, y);
    ctx.stroke();
  }

  // Scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 2);
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

// 13. Arcade Lobby Matchmaking Marquee
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
      g.font = "bold 56px 'Chakra Petch', monospace";
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('ONLINE LOBBY', w / 2, h / 2);
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

      // Base woven wool texture
      g.fillStyle = primary;
      g.fillRect(0, 0, w, h);

      // Wool weave noise
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }

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

