// Physical Rapier3D die tray for Club No.9 Ludo.
// A single big die is thrown into a felt-lined tray, read from its quaternion once settled.

import { mulberry32, type PRNG } from './rng.ts';

export const TRAY = {
  half: 0.028,
  hx: 0.17,
  z0: -0.2,
  z1: 0.2,
  rest: { x: 0, z: 0.15 },
};

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface DieSnapshot {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  phase: 'idle' | 'shaking' | 'rolling' | 'tidy' | 'ready';
  face: number;
  shakeProgress?: number;
  throwElapsed?: number;
}

const FACE_AXES: Array<{ n: number; v: [number, number, number] }> = [
  { n: 1, v: [0, 1, 0] },
  { n: 6, v: [0, -1, 0] },
  { n: 2, v: [1, 0, 0] },
  { n: 5, v: [-1, 0, 0] },
  { n: 3, v: [0, 0, 1] },
  { n: 4, v: [0, 0, -1] },
];

function rot(q: Quat, [x, y, z]: [number, number, number]): [number, number, number] {
  const ix = q.w * x + q.y * z - q.z * y;
  const iy = q.w * y + q.z * x - q.x * z;
  const iz = q.w * z + q.x * y - q.y * x;
  const iw = -q.x * x - q.y * y - q.z * z;
  return [
    ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  ];
}

export function topFace(q: Quat): { face: number; flat: number } {
  let best = 1;
  let bd = -2;
  for (const f of FACE_AXES) {
    const d = rot(q, f.v)[1];
    if (d > bd) {
      bd = d;
      best = f.n;
    }
  }
  return { face: best, flat: bd };
}

const qMul = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

const qNorm = (q: Quat): Quat => {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
};

const qFromTo = (u: [number, number, number], v: [number, number, number]): Quat => {
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  if (d < -0.99999) return { x: 1, y: 0, z: 0, w: 0 };
  return qNorm({
    x: u[1] * v[2] - u[2] * v[1],
    y: u[2] * v[0] - u[0] * v[2],
    z: u[0] * v[1] - u[1] * v[0],
    w: 1 + d,
  });
};

const qYaw = (a: number): Quat => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });

function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  }
  if (d > 0.9995) {
    return qNorm({
      x: a.x + (bb.x - a.x) * t,
      y: a.y + (bb.y - a.y) * t,
      z: a.z + (bb.z - a.z) * t,
      w: a.w + (bb.w - a.w) * t,
    });
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const w1 = Math.sin((1 - t) * th) / s;
  const w2 = Math.sin(t * th) / s;
  return {
    x: a.x * w1 + bb.x * w2,
    y: a.y * w1 + bb.y * w2,
    z: a.z * w1 + bb.z * w2,
    w: a.w * w1 + bb.w * w2,
  };
}

const AXIS: Record<number, [number, number, number]> = Object.fromEntries(
  FACE_AXES.map((f) => [f.n, f.v]),
);

export function quatFaceUp(face: number, yaw = 0): Quat {
  return qNorm(qMul(qYaw(yaw), qFromTo(AXIS[face] || [0, 1, 0], [0, 1, 0])));
}

export class DieTray {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  R: any;
  rng: PRNG;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  world: any;
  acc = 0;
  phase: 'idle' | 'shaking' | 'rolling' | 'tidy' | 'ready' = 'idle';
  face = 0;
  rollNo = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any = null;
  pose = { x: TRAY.rest.x, y: TRAY.half, z: TRAY.rest.z, q: quatFaceUp(6, 0.3) };
  hits = 0;
  _t = 0;
  _still = 0;
  _fix = 0;
  _shakeT = 0;
  _shakeDur = 0.48;
  _throwPower = 0.6;
  _tween: {
    t: number;
    dur: number;
    from: { x: number; y: number; z: number; q: Quat };
    to: { x: number; y: number; z: number; q: Quat };
    face: number;
  } | null = null;
  _lastVy = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(RAPIER: any, { seed = 11 }: { seed?: number } = {}) {
    this.R = RAPIER;
    this.rng = mulberry32(seed);
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 240;
    this._build();
  }

  dispose(): void {
    try {
      this.world.free();
    } catch {
      // already freed
    }
  }

  _build(): void {
    const R = this.R;
    const w = this.world;
    const T = TRAY;
    const add = (
      hx: number,
      hy: number,
      hz: number,
      x: number,
      y: number,
      z: number,
      fr = 0.5,
      re = 0.4,
    ) =>
      w.createCollider(
        R.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(x, y, z)
          .setFriction(fr)
          .setRestitution(re),
      );
    const cz = (T.z0 + T.z1) / 2;
    const hz = (T.z1 - T.z0) / 2;
    add(0.8, 0.05, 0.8, 0, -0.05, 0, 0.55, 0.32);
    add(0.02, 0.25, hz + 0.04, -T.hx - 0.02, 0.25, cz, 0.3, 0.5);
    add(0.02, 0.25, hz + 0.04, T.hx + 0.02, 0.25, cz, 0.3, 0.5);
    add(T.hx + 0.04, 0.25, 0.02, 0, 0.25, T.z0 - 0.02, 0.3, 0.5);
    add(T.hx + 0.04, 0.25, 0.02, 0, 0.25, T.z1 + 0.02, 0.3, 0.5);
    add(T.hx + 0.04, 0.02, hz + 0.04, 0, 0.5, cz, 0.3, 0.2);
  }

  _randQuat(): Quat {
    const r = this.rng;
    const u1 = r();
    const u2 = r();
    const u3 = r();
    const s1 = Math.sqrt(1 - u1);
    const s2 = Math.sqrt(u1);
    return {
      x: s1 * Math.sin(2 * Math.PI * u2),
      y: s1 * Math.cos(2 * Math.PI * u2),
      z: s2 * Math.sin(2 * Math.PI * u3),
      w: s2 * Math.cos(2 * Math.PI * u3),
    };
  }

  throwDie(power = 0.6, preShakenSeconds = 0): boolean {
    if (this.phase === 'shaking' || this.phase === 'rolling' || this.phase === 'tidy') return false;
    this._throwPower = Math.max(0, Math.min(1, power));
    this._shakeT = 0;
    // Vigorous cup shake phase before the die is thrown out of the cup mouth
    this._shakeDur = Math.max(0.24, 0.52 - Math.min(0.28, preShakenSeconds * 0.4));
    this.rollNo++;
    this.face = 0;
    this.phase = 'shaking';
    this._t = 0;
    this._still = 0;
    this._fix = 0;
    this._lastVy = 0;
    this.hits = 0;
    return true;
  }

  _launchFromCup(p: number): void {
    const R = this.R;
    const T = TRAY;
    const r = this.rng;
    if (this.body) this.world.removeRigidBody(this.body);
    this.body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(r.range(-0.045, 0.045), 0.14 + r.range(0, 0.04), T.z1 - 0.035)
        .setRotation(this._randQuat())
        .setLinvel(
          r.range(-0.5, 0.5) * (0.5 + p),
          r.range(0.55, 1.15),
          -(1.35 + 1.7 * p) - r.range(0, 0.3),
        )
        .setAngvel({
          x: r.range(-1, 1) * (22 + 24 * p),
          y: r.range(-1, 1) * (22 + 24 * p),
          z: r.range(-1, 1) * (22 + 24 * p),
        })
        .setCcdEnabled(true)
        .setLinearDamping(0.08)
        .setAngularDamping(0.25),
    );
    this.world.createCollider(
      R.ColliderDesc.cuboid(T.half, T.half, T.half)
        .setDensity(1400)
        .setFriction(0.5)
        .setRestitution(0.38),
      this.body,
    );
    this.phase = 'rolling';
    this._t = 0;
  }

  _settled(): boolean {
    const v = this.body.linvel();
    const w = this.body.angvel();
    return Math.hypot(v.x, v.y, v.z) < 0.03 && Math.hypot(w.x, w.y, w.z) < 0.3;
  }

  step(dt: number): void {
    if (this.phase === 'shaking') {
      this._shakeT += Math.min(dt, 0.05);
      if (this._shakeT >= this._shakeDur) {
        this._launchFromCup(this._throwPower);
      }
      return;
    }
    if (this.phase === 'rolling') {
      this.acc += Math.min(dt, 0.05);
      while (this.acc >= 1 / 240) {
        this.world.step();
        this.acc -= 1 / 240;
        this._t += 1 / 240;
        const vy = this.body.linvel().y;
        if (this._lastVy < -0.5 && vy > this._lastVy + 0.45) this.hits++;
        this._lastVy = vy;
        this._still = this._settled() ? this._still + 1 : 0;
        if (this._still > 50 || this._t > 6) {
          this._onSettle();
          break;
        }
      }
    } else if (this.phase === 'tidy' && this._tween) {
      const tw = this._tween;
      tw.t += dt;
      const u = Math.max(0, Math.min(1, tw.t / tw.dur));
      const e = u * u * (3 - 2 * u);
      const p = this.pose;
      p.x = tw.from.x + (tw.to.x - tw.from.x) * e;
      p.z = tw.from.z + (tw.to.z - tw.from.z) * e;
      p.y = tw.from.y + (tw.to.y - tw.from.y) * e;
      p.q = qSlerp(tw.from.q, tw.to.q, e);
      if (u >= 1) {
        this.pose = { ...tw.to };
        this.face = tw.face;
        this._tween = null;
        this.phase = 'ready';
      }
    }
  }

  _onSettle(): void {
    const b = this.body;
    const q = b.rotation();
    const info = topFace(q);
    if (info.flat < 0.985 && this._fix < 3) {
      this._fix++;
      b.setLinvel({ x: this.rng.range(-0.3, 0.3), y: 0.9, z: this.rng.range(-0.3, 0.3) }, true);
      b.setAngvel(
        { x: this.rng.range(-12, 12), y: this.rng.range(-12, 12), z: this.rng.range(-12, 12) },
        true,
      );
      this._still = 0;
      this._t = Math.min(this._t, 4.5);
      return;
    }
    const t = b.translation();
    const yaw = Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y * q.y + q.z * q.z),
    );
    const from = { x: t.x, y: t.y, z: t.z, q: { x: q.x, y: q.y, z: q.z, w: q.w } };
    const lim = (v: number, a: number, hi: number) =>
      Math.max(a + TRAY.half * 1.2, Math.min(hi - TRAY.half * 1.2, v));
    const to = {
      x: lim(t.x, -TRAY.hx, TRAY.hx),
      y: TRAY.half,
      z: lim(t.z, TRAY.z0, TRAY.z1),
      q: quatFaceUp(info.face, yaw),
    };
    this.world.removeRigidBody(b);
    this.body = null;
    this.pose = { ...from };
    this._tween = { t: -0.25, dur: 0.22, from, to, face: info.face };
    this.phase = 'tidy';
  }

  snapshot(): DieSnapshot {
    if (this.phase === 'shaking') {
      const prog = Math.min(1, this._shakeT / Math.max(0.01, this._shakeDur));
      return {
        x: 0,
        y: 0.16,
        z: TRAY.z1 + 0.02,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
        phase: 'shaking',
        face: 0,
        shakeProgress: prog,
        throwElapsed: 0,
      };
    }
    if (this.phase === 'rolling' && this.body) {
      const t = this.body.translation();
      const q = this.body.rotation();
      return {
        x: t.x,
        y: t.y,
        z: t.z,
        qx: q.x,
        qy: q.y,
        qz: q.z,
        qw: q.w,
        phase: this.phase,
        face: 0,
        shakeProgress: 1,
        throwElapsed: this._t,
      };
    }
    const p = this.pose;
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      qx: p.q.x,
      qy: p.q.y,
      qz: p.q.z,
      qw: p.q.w,
      phase: this.phase,
      face: this.face,
      shakeProgress: 0,
      throwElapsed: 1,
    };
  }

  run(maxSeconds = 20): number {
    let n = 0;
    const max = Math.floor(maxSeconds * 60);
    while ((this.phase === 'shaking' || this.phase === 'rolling' || this.phase === 'tidy') && n++ < max) {
      this.step(1 / 60);
    }
    return this.face;
  }
}
