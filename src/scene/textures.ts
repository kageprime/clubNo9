// 100% Procedural Canvas2D Textures for CLUB No.9 (deterministic via mulberry32).
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
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  }
  if (opts.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  if (opts.srgb !== false) {
    t.colorSpace = THREE.SRGBColorSpace;
  }
  t.anisotropy = 4;
  return t;
}

export function woodPlankTex(seed = 101, repeat: [number, number] = [6, 6]): THREE.CanvasTexture {
  return makeCanvasTex(
    256,
    256,
    (g, w, h) => {
      const r = mulberry32(seed);
      g.fillStyle = '#5c381e';
      g.fillRect(0, 0, w, h);
      const planks = 8;
      const ph = h / planks;
      for (let row = 0; row < planks; row++) {
        const y0 = row * ph;
        const tone = 0.86 + r() * 0.28;
        const R = Math.round(108 * tone);
        const G = Math.round(66 * tone);
        const B = Math.round(35 * tone);
        g.fillStyle = `rgb(${R},${G},${B})`;
        g.fillRect(0, y0, w, ph - 2);
        // Wood grain streaks
        for (let i = 0; i < 18; i++) {
          g.fillStyle = `rgba(32,16,6,${0.12 + r() * 0.16})`;
          g.fillRect(r() * w, y0 + r() * (ph - 4), 18 + r() * 60, 2);
        }
        // Plank joint
        const jx = ((row * 97 + Math.floor(r() * 40)) % (w - 32)) + 16;
        g.fillStyle = '#2a160a';
        g.fillRect(0, y0 + ph - 2, w, 2);
        g.fillRect(jx, y0, 2, ph);
      }
    },
    { nearest: true, repeat },
  );
}

export function walnutTrimTex(
  base: [number, number, number] = [88, 52, 28],
  seed = 7,
  repeat: [number, number] = [2, 2],
): THREE.CanvasTexture {
  return makeCanvasTex(
    128,
    128,
    (g, w, h) => {
      const r = mulberry32(seed);
      g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        const k = 0.78 + r() * 0.4;
        const a = r() < 0.14 ? 0.38 : 0.15;
        g.fillStyle = `rgba(${base.map((v) => Math.round(v * k * 0.55)).join(',')},${a})`;
        g.fillRect(0, y, w, 2);
      }
    },
    { nearest: true, repeat },
  );
}

export function brickWallTex(seed = 202, repeat: [number, number] = [3, 3]): THREE.CanvasTexture {
  return makeCanvasTex(
    128,
    128,
    (g, w, h) => {
      const r = mulberry32(seed);
      g.fillStyle = '#362319'; // mortar
      g.fillRect(0, 0, w, h);
      const rows = 8;
      const cols = 4;
      const bh = h / rows;
      const bw = w / cols;
      for (let ry = 0; ry < rows; ry++) {
        const off = (ry % 2) * (bw / 2);
        for (let cx = -1; cx <= cols; cx++) {
          const k = 0.8 + r() * 0.38;
          g.fillStyle = `rgb(${Math.round(135 * k)},${Math.round(58 * k)},${Math.round(36 * k)})`;
          g.fillRect(cx * bw + off + 2, ry * bh + 2, bw - 4, bh - 4);
        }
      }
    },
    { nearest: true, repeat },
  );
}

export function feltClothTex(colorHex = '#117c46', seed = 303): THREE.CanvasTexture {
  return makeCanvasTex(
    128,
    128,
    (g, w, h) => {
      const r = mulberry32(seed);
      g.fillStyle = colorHex;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 450; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
        g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 2, 2);
      }
    },
    { nearest: true, repeat: [4, 4] },
  );
}

// Exact Ludo 15x15 board texture from Club No.9 Ludo edition
export function ludoBoardTex(): THREE.CanvasTexture {
  const U = 48;
  return makeCanvasTex(
    U * 15,
    U * 15,
    (g) => {
      const paper = '#f3e7c9';
      const line = '#6b5436';
      g.fillStyle = '#e8d9b5';
      g.fillRect(0, 0, U * 15, U * 15);
      const dark = (c: string, a: number) => {
        const x = parseInt(c.slice(1), 16);
        const m = (v: number) => Math.round(v * a);
        return `rgb(${m(x >> 16)},${m((x >> 8) & 255)},${m(x & 255)})`;
      };
      for (let c = 0; c < 4; c++) {
        const corner = [
          [0, 0],
          [9, 0],
          [9, 9],
          [0, 9],
        ][c];
        g.fillStyle = COLOR_CSS[c];
        g.fillRect(corner[0] * U, corner[1] * U, 6 * U, 6 * U);
        g.fillStyle = dark(COLOR_CSS[c], 0.55);
        g.fillRect((corner[0] + 0.5) * U, (corner[1] + 0.5) * U, 5 * U, 5 * U);
        g.fillStyle = '#f6ecd3';
        g.fillRect((corner[0] + 1) * U, (corner[1] + 1) * U, 4 * U, 4 * U);
        g.strokeStyle = line;
        g.lineWidth = 3;
        g.strokeRect((corner[0] + 1) * U, (corner[1] + 1) * U, 4 * U, 4 * U);
        for (let t = 0; t < 4; t++) {
          const [px, py] = yardSlot(c, t);
          g.beginPath();
          g.arc(px * U, py * U, 0.62 * U, 0, 7);
          g.fillStyle = COLOR_CSS[c];
          g.fill();
          g.beginPath();
          g.arc(px * U, py * U, 0.44 * U, 0, 7);
          g.fillStyle = dark(COLOR_CSS[c], 0.5);
          g.fill();
        }
      }
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
          g.fillStyle = homeCol.has(key)
            ? COLOR_CSS[homeCol.get(key)!]
            : startCell.has(key)
              ? COLOR_CSS[startCell.get(key)!]
              : paper;
          g.fillRect(x * U, y * U, U, U);
          g.strokeStyle = line;
          g.lineWidth = 2.5;
          g.strokeRect(x * U + 1.5, y * U + 1.5, U - 3, U - 3);
        }
      }
      for (const idx of STAR_IDX) {
        const [x, y] = LOOP[idx];
        const cx = (x + 0.5) * U;
        const cy = (y + 0.5) * U;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rad = (i % 2 ? 0.14 : 0.36) * U;
          g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
        g.closePath();
        g.fillStyle = '#c99a2e';
        g.fill();
        g.strokeStyle = line;
        g.lineWidth = 2;
        g.stroke();
      }
      for (let c = 0; c < 4; c++) {
        const [x, y] = LOOP[START_IDX[c]];
        g.beginPath();
        g.arc((x + 0.5) * U, (y + 0.5) * U, 0.17 * U, 0, 7);
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fill();
      }
      const C: [number, number] = [7.5 * U, 7.5 * U];
      const corners: Array<[number, number]> = [
        [6 * U, 6 * U],
        [9 * U, 6 * U],
        [9 * U, 9 * U],
        [6 * U, 9 * U],
      ];
      const tri = [
        [3, 0],
        [0, 1],
        [1, 2],
        [2, 3],
      ];
      for (let c = 0; c < 4; c++) {
        const [a, b] = tri[c];
        g.beginPath();
        g.moveTo(...corners[a]);
        g.lineTo(...corners[b]);
        g.lineTo(...C);
        g.closePath();
        g.fillStyle = COLOR_CSS[c];
        g.fill();
        g.strokeStyle = line;
        g.lineWidth = 2.5;
        g.stroke();
      }
    },
    { nearest: true },
  );
}

export function diePipTex(n: number): THREE.CanvasTexture {
  return makeCanvasTex(
    64,
    64,
    (x) => {
      const g = x.createLinearGradient(0, 0, 64, 64);
      g.addColorStop(0, '#fbf6e6');
      g.addColorStop(1, '#e9e0c6');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      x.strokeStyle = '#c9bc9c';
      x.lineWidth = 3;
      x.strokeRect(2, 2, 60, 60);
      x.fillStyle = n === 1 ? '#c93a2a' : '#17130f';
      const a = 16;
      const m = 32;
      const b = 48;
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
        x.arc(px, py, n === 1 ? 9 : 5.6, 0, 7);
        x.fill();
      }
    },
    { nearest: true },
  );
}

export function poolBallTex(id: number): THREE.CanvasTexture {
  return makeCanvasTex(
    128,
    64,
    (g, w, h) => {
      const col = BALL_COLORS[id] || '#ffffff';
      const isStripe = id >= 9 && id <= 15;
      g.fillStyle = isStripe ? '#f7f4e8' : col;
      g.fillRect(0, 0, w, h);
      if (isStripe) {
        g.fillStyle = col;
        g.fillRect(0, h * 0.22, w, h * 0.56);
      }
      if (id === 0) {
        // Red training measles dot on cue ball
        g.fillStyle = '#d93829';
        g.beginPath();
        g.arc(w / 2, h / 2, 6, 0, Math.PI * 2);
        g.fill();
        return;
      }
      // Number badge on front and back
      for (const cx of [w * 0.25, w * 0.75]) {
        g.fillStyle = '#f7f4e8';
        g.beginPath();
        g.arc(cx, h / 2, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#121216';
        g.font = 'bold 12px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(id), cx, h / 2 + 1);
      }
    },
    { nearest: true },
  );
}

export function dartboardTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    256,
    256,
    (g, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const R = 116;
      g.fillStyle = '#181412';
      g.beginPath();
      g.arc(cx, cy, R + 8, 0, Math.PI * 2);
      g.fill();

      for (let i = 0; i < 20; i++) {
        const a0 = -Math.PI / 2 - Math.PI / 20 + (i * Math.PI) / 10;
        const a1 = a0 + Math.PI / 10;
        const even = i % 2 === 0;
        const mainCol = even ? '#1b1918' : '#f2e6cb';
        const ringCol = even ? '#d93829' : '#269e54';

        // Outer Double ring
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

        // Number label
        const mid = (a0 + a1) / 2;
        const nx = cx + Math.cos(mid) * (R * 0.98);
        const ny = cy + Math.sin(mid) * (R * 0.98);
        g.fillStyle = '#f5ebd6';
        g.font = 'bold 10px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(DART_SECTORS[i]), nx, ny);
      }

      // Outer bull (25)
      g.beginPath();
      g.arc(cx, cy, R * 0.13, 0, Math.PI * 2);
      g.fillStyle = '#269e54';
      g.fill();

      // Double bull (50)
      g.beginPath();
      g.arc(cx, cy, R * 0.06, 0, Math.PI * 2);
      g.fillStyle = '#d93829';
      g.fill();
    },
    { nearest: true },
  );
}

// Vector-stroked neon tube glyphs for 九号俱乐部 (guaranteed zero-tofu rendering on any OS)
export function drawClub9NeonGlyphs(
  g: CanvasRenderingContext2D,
  startX: number,
  centerY: number,
  scale = 1.0,
): void {
  g.save();
  g.strokeStyle = '#ff5ec4';
  g.shadowColor = '#ff2ea6';
  g.shadowBlur = 16 * scale;
  g.lineWidth = 5.5 * scale;
  g.lineCap = 'round';
  g.lineJoin = 'round';

  const glyphs: ReadonlyArray<ReadonlyArray<ReadonlyArray<[number, number]>>> = [
    // 九
    [
      [
        [22, 6],
        [20, 34],
        [8, 52],
      ],
      [
        [8, 20],
        [38, 20],
        [36, 48],
        [48, 48],
        [48, 38],
      ],
    ],
    // 号
    [
      [
        [12, 8],
        [40, 8],
        [40, 22],
        [12, 22],
        [12, 8],
      ],
      [
        [6, 30],
        [46, 30],
      ],
      [
        [20, 30],
        [16, 40],
        [38, 40],
        [34, 52],
        [22, 50],
      ],
    ],
    // 俱
    [
      [
        [16, 6],
        [6, 26],
      ],
      [
        [12, 18],
        [12, 52],
      ],
      [
        [22, 8],
        [44, 8],
        [44, 38],
        [22, 38],
        [22, 8],
      ],
      [
        [22, 18],
        [44, 18],
      ],
      [
        [22, 28],
        [44, 28],
      ],
      [
        [18, 44],
        [48, 44],
      ],
      [
        [26, 46],
        [20, 53],
      ],
      [
        [38, 46],
        [46, 53],
      ],
    ],
    // 乐
    [
      [
        [40, 8],
        [14, 14],
        [12, 28],
        [44, 28],
      ],
      [
        [28, 12],
        [28, 52],
        [20, 48],
      ],
      [
        [16, 36],
        [8, 48],
      ],
      [
        [40, 36],
        [48, 48],
      ],
    ],
    // 部
    [
      [
        [16, 6],
        [16, 14],
      ],
      [
        [6, 14],
        [28, 14],
      ],
      [
        [10, 14],
        [13, 26],
      ],
      [
        [24, 14],
        [21, 26],
      ],
      [
        [6, 26],
        [28, 26],
      ],
      [
        [10, 34],
        [25, 34],
        [25, 48],
        [10, 48],
        [10, 34],
      ],
      [
        [34, 8],
        [46, 8],
        [40, 24],
        [48, 36],
        [42, 46],
        [34, 42],
      ],
      [
        [34, 8],
        [34, 52],
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

export function neonClubSignTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    512,
    200,
    (g, w, h) => {
      g.fillStyle = '#121528';
      g.fillRect(0, 0, w, h);
      // Outer cyan neon tube border
      g.strokeStyle = '#54e0ee';
      g.lineWidth = 8;
      g.shadowColor = '#54e0ee';
      g.shadowBlur = 18;
      g.strokeRect(12, 12, w - 24, h - 24);

      // Crisp vector-stroked pink neon tubes for 九号俱乐部
      drawClub9NeonGlyphs(g, 72, h * 0.39, 1.18);

      // Cyan neon English text: CLUB No.9
      g.fillStyle = '#54e0ee';
      g.shadowColor = '#54e0ee';
      g.shadowBlur = 18;
      g.font = 'bold 44px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('CLUB No.9', w / 2, h * 0.78);
    },
    { nearest: true },
  );
}

export function lobbyMarqueeTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    256,
    96,
    (g, w, h) => {
      g.fillStyle = '#141a38';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#54e0ee';
      g.lineWidth = 6;
      g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#54e0ee';
      g.font = 'bold 28px monospace';
      g.textAlign = 'center';
      g.fillText('LOBBY', w / 2, 38);
      g.fillStyle = '#ff5ec4';
      g.font = 'bold 22px monospace';
      g.fillText('MATCHMAKING', w / 2, 72);
    },
    { nearest: true },
  );
}

export function openNeonTex(): THREE.CanvasTexture {
  return makeCanvasTex(
    128,
    64,
    (g, w, h) => {
      g.fillStyle = '#14121d';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#54e0ee';
      g.lineWidth = 4;
      g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#ff6a5a';
      g.font = 'bold 28px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('OPEN', w / 2, h / 2);
    },
    { nearest: true },
  );
}

export function drawArcadeScreen(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cabinetIdx: number,
  tick: number,
): void {
  ctx.fillStyle = '#0c162d';
  ctx.fillRect(0, 0, w, h);
  if (cabinetIdx === 0) {
    // LOBBY MATCHMAKING Cabinet
    ctx.fillStyle = '#182b52';
    ctx.fillRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = '#54e0ee';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    ctx.fillStyle = '#54e0ee';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('LOBBY LIST', 12, 22);
    const rows = ['1. Rlaker', '2. Platers', '3. Player9', '4. Relneade'];
    ctx.fillStyle = '#f1efe6';
    ctx.font = '10px monospace';
    rows.forEach((r, idx) => {
      ctx.fillText(r, 12, 38 + idx * 14);
      // Avatar squares on right
      ctx.fillStyle = ['#ffb84a', '#5fe08a', '#ff6a5a', '#54e0ee'][idx];
      ctx.fillRect(w - 34 + (idx % 2) * 12, 30 + Math.floor(idx / 2) * 14, 9, 9);
      ctx.fillStyle = '#f1efe6';
    });
    if (Math.floor(tick * 2) % 2 === 0) {
      ctx.fillStyle = '#ffb84a';
      ctx.fillText('SEARCHING...', 12, h - 12);
    }
  } else if (cabinetIdx === 1) {
    // Space Invaders attract loop
    ctx.fillStyle = '#081b1a';
    ctx.fillRect(0, 0, w, h);
    const ox = Math.sin(tick * 2) * 12;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        ctx.fillStyle = r === 0 ? '#ff6a5a' : r === 1 ? '#ffb84a' : '#5fe08a';
        ctx.fillRect(18 + c * 18 + ox, 18 + r * 14, 10, 8);
      }
    }
    const sx = w / 2 + Math.cos(tick * 3) * 24;
    ctx.fillStyle = '#54e0ee';
    ctx.fillRect(sx - 6, h - 18, 12, 6);
    ctx.fillRect(sx - 1, h - 24 - ((tick * 60) % 55), 2, 6);
  } else if (cabinetIdx === 2) {
    // Retro Puzzle / Tetris attract loop
    ctx.fillStyle = '#141129';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ['#54e0ee', '#ffb84a', '#ff5ec4', '#5fe08a'][i % 4];
      const by = ((tick * 22 + i * 19) % (h - 24)) + 8;
      ctx.fillRect(16 + (i * 15) % (w - 32), by, 12, 12);
    }
  } else {
    // Platformer / Outrun attract loop
    ctx.fillStyle = '#162c4a';
    ctx.fillRect(0, 0, w, h * 0.55);
    ctx.fillStyle = '#255c36';
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
    const px = ((tick * 30) % (w - 20)) + 10;
    const py = h * 0.55 - 10 - Math.abs(Math.sin(tick * 5)) * 14;
    ctx.fillStyle = '#ffb84a';
    ctx.fillRect(px, py, 10, 10);
  }
}
