// Decoupled 8-Ball / Chinese 8-Ball Pool Physics & Rules Engine (sim.js equivalent).
// Runs headlessly in Node.js or in browser with Rapier3D (@dimforge/rapier3d-compat).

export const POOL_TABLE = {
  width: 2.24, // X axis (long side, scaled meters)
  depth: 1.12, // Z axis (short side)
  ballRadius: 0.0286, // 57.2mm diameter -> 0.0286m radius
  pocketRadius: 0.068,
  cushionHeight: 0.045,
};

export const POCKETS: ReadonlyArray<readonly [number, number]> = [
  [-POOL_TABLE.width / 2 + 0.02, -POOL_TABLE.depth / 2 + 0.02],
  [0, -POOL_TABLE.depth / 2 - 0.01],
  [POOL_TABLE.width / 2 - 0.02, -POOL_TABLE.depth / 2 + 0.02],
  [-POOL_TABLE.width / 2 + 0.02, POOL_TABLE.depth / 2 - 0.02],
  [0, POOL_TABLE.depth / 2 + 0.01],
  [POOL_TABLE.width / 2 - 0.02, POOL_TABLE.depth / 2 - 0.02],
];

export const BALL_COLORS: ReadonlyArray<string> = [
  '#f7f5eb', // 0 Cue
  '#f2c230', // 1 Yellow
  '#2f65d9', // 2 Blue
  '#e04038', // 3 Red
  '#6e38c9', // 4 Purple
  '#ed7826', // 5 Orange
  '#269e54', // 6 Green
  '#8c2424', // 7 Maroon
  '#17171c', // 8 Black
  '#f2c230', // 9 Yellow stripe
  '#2f65d9', // 10 Blue stripe
  '#e04038', // 11 Red stripe
  '#6e38c9', // 12 Purple stripe
  '#ed7826', // 13 Orange stripe
  '#269e54', // 14 Green stripe
  '#8c2424', // 15 Maroon stripe
];

export type PoolSuit = 'solids' | 'stripes' | null;

export interface BallPose {
  id: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vz: number;
  pocketed: boolean;
}

export interface AimGuideline {
  cueStart: [number, number];
  cueEnd: [number, number];
  ghostPos: [number, number] | null;
  targetDir: [number, number] | null;
  deflectDir: [number, number] | null;
  hitBallId: number | null;
}

export interface PoolReplayFrame {
  t: number;
  balls: Array<{
    id: number;
    x: number;
    z: number;
    qx: number;
    qy: number;
    qz: number;
    qw: number;
    pocketed: boolean;
  }>;
}

export class PoolSim {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  R: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  world: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bodies: Map<number, any> = new Map();
  balls: BallPose[] = [];
  phase: 'aiming' | 'rolling' | 'replay' | 'over' = 'aiming';
  practiceMode = false;
  turn: 0 | 1 = 0;
  suits: [PoolSuit, PoolSuit] = [null, null];
  scores: [number, number] = [0, 0];
  comboStreak = 0;
  ballInHand = true;
  winner: 0 | 1 | null = null;
  lastMessage = 'Break shot — Ball in Hand behind head string';
  cue = {
    yaw: 0,
    power: 0.55,
    spinX: 0, // -1..1 side English
    spinY: 0, // -1..1 back/top spin
    lowSight: false,
  };
  shotFirstHit: number | null = null;
  shotPocketed: number[] = [];
  replayFrames: PoolReplayFrame[] = [];
  lastShotReplay: PoolReplayFrame[] = [];
  closeUpTarget: { pocketIdx: number; ballId: number } | null = null;
  collisionCount = 0;
  private acc = 0;
  private shotTime = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(RAPIER: any) {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 120;
    this._buildTable();
    this.rackBalls();
  }

  dispose(): void {
    try {
      this.world.free();
    } catch {
      // ignore
    }
  }

  _buildTable(): void {
    const R = this.R;
    const w = this.world;
    const W = POOL_TABLE.width;
    const D = POOL_TABLE.depth;
    // Slate bed
    w.createCollider(
      R.ColliderDesc.cuboid(W / 2 + 0.1, 0.05, D / 2 + 0.1)
        .setTranslation(0, -0.05, 0)
        .setFriction(0.22)
        .setRestitution(0.2),
    );
    // 6 Cushion segments (leaving gaps at pockets)
    const gap = POOL_TABLE.pocketRadius * 1.15;
    const halfSegX = (W / 2 - gap * 1.6) / 2;
    const segCx = gap * 0.8 + halfSegX;
    const railY = POOL_TABLE.ballRadius;
    const addRail = (hx: number, hz: number, x: number, z: number) => {
      w.createCollider(
        R.ColliderDesc.cuboid(hx, POOL_TABLE.cushionHeight, hz)
          .setTranslation(x, railY, z)
          .setFriction(0.1)
          .setRestitution(0.86),
      );
    };
    // Top and bottom long rails (4 segments)
    addRail(halfSegX, 0.025, -segCx, -D / 2 - 0.02);
    addRail(halfSegX, 0.025, segCx, -D / 2 - 0.02);
    addRail(halfSegX, 0.025, -segCx, D / 2 + 0.02);
    addRail(halfSegX, 0.025, segCx, D / 2 + 0.02);
    // Left and right short rails (2 segments)
    const halfSegZ = D / 2 - gap * 1.1;
    addRail(0.025, halfSegZ, -W / 2 - 0.02, 0);
    addRail(0.025, halfSegZ, W / 2 + 0.02, 0);
  }

  rackBalls(): void {
    const R = this.R;
    for (const b of this.bodies.values()) {
      this.world.removeRigidBody(b);
    }
    this.bodies.clear();
    this.balls = [];
    const r = POOL_TABLE.ballRadius;

    const createBall = (id: number, x: number, z: number) => {
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(x, r, z)
          .setLinearDamping(0.68)
          .setAngularDamping(0.55)
          .setCcdEnabled(true),
      );
      this.world.createCollider(
        R.ColliderDesc.ball(r).setDensity(1700).setFriction(0.14).setRestitution(0.92),
        body,
      );
      this.bodies.set(id, body);
      this.balls.push({
        id,
        x,
        y: r,
        z,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
        vx: 0,
        vz: 0,
        pocketed: false,
      });
    };

    // Cue ball at head spot (-W/4)
    createBall(0, -POOL_TABLE.width * 0.27, 0);

    // 15-ball triangle at foot spot (+W/4), 8-ball in center of row 3
    const apexX = POOL_TABLE.width * 0.22;
    const rowDx = r * Math.sqrt(3) * 1.02;
    const colDz = r * 2.04;
    const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    let idx = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const id = rackOrder[idx++];
        const x = apexX + row * rowDx;
        const z = (col - row / 2) * colDz;
        createBall(id, x, z);
      }
    }

    this.phase = 'aiming';
    this.turn = 0;
    this.suits = [null, null];
    this.scores = [0, 0];
    this.comboStreak = 0;
    this.ballInHand = true;
    this.winner = null;
    this.cue.yaw = 0;
    this.cue.spinX = 0;
    this.cue.spinY = 0;
    this.closeUpTarget = null;
    this.lastMessage = 'Break Shot · Ready at Table';
  }

  moveCueBall(dx: number, dz: number): void {
    if (this.phase !== 'aiming' || !this.ballInHand) return;
    const cueBall = this.balls[0];
    const body = this.bodies.get(0);
    if (!cueBall || !body) return;
    const r = POOL_TABLE.ballRadius * 1.2;
    const nx = Math.max(-POOL_TABLE.width / 2 + r, Math.min(POOL_TABLE.width / 2 - r, cueBall.x + dx));
    const nz = Math.max(-POOL_TABLE.depth / 2 + r, Math.min(POOL_TABLE.depth / 2 - r, cueBall.z + dz));
    // Ensure no overlap with other balls
    for (const b of this.balls) {
      if (b.id !== 0 && !b.pocketed && Math.hypot(b.x - nx, b.z - nz) < POOL_TABLE.ballRadius * 2.15) {
        return;
      }
    }
    cueBall.x = nx;
    cueBall.z = nz;
    cueBall.pocketed = false;
    body.setTranslation({ x: nx, y: POOL_TABLE.ballRadius, z: nz }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  strike(powerOverride?: number): boolean {
    if (this.phase !== 'aiming') return false;
    const cueBall = this.balls[0];
    const body = this.bodies.get(0);
    if (!cueBall || !body || cueBall.pocketed) return false;

    const p = Math.max(0.08, Math.min(1, powerOverride ?? this.cue.power));
    const speed = 0.65 + p * 3.85;
    const dirX = Math.cos(this.cue.yaw);
    const dirZ = Math.sin(this.cue.yaw);

    body.setLinvel({ x: dirX * speed, y: 0, z: dirZ * speed }, true);
    // Apply English / top-back spin as angular velocity
    const topSpin = this.cue.spinY * speed * 42;
    const sideSpin = this.cue.spinX * speed * 38;
    body.setAngvel(
      {
        x: -dirZ * topSpin,
        y: sideSpin,
        z: dirX * topSpin,
      },
      true,
    );

    this.phase = 'rolling';
    this.ballInHand = false;
    this.shotFirstHit = null;
    this.shotPocketed = [];
    this.replayFrames = [];
    this.shotTime = 0;
    this.closeUpTarget = null;
    this._recordReplayFrame();
    return true;
  }

  _recordReplayFrame(): void {
    if (this.replayFrames.length > 360) return;
    this.replayFrames.push({
      t: this.shotTime,
      balls: this.balls.map((b) => ({
        id: b.id,
        x: b.x,
        z: b.z,
        qx: b.qx,
        qy: b.qy,
        qz: b.qz,
        qw: b.qw,
        pocketed: b.pocketed,
      })),
    });
  }

  step(dt: number): void {
    if (this.phase !== 'rolling') return;
    this.acc += Math.min(dt, 0.05);
    while (this.acc >= 1 / 120) {
      this.world.step();
      this.acc -= 1 / 120;
      this.shotTime += 1 / 120;
      this._syncAndCheckPockets();
    }
    this._recordReplayFrame();
    if (this._allStopped() || this.shotTime > 9) {
      this._onShotComplete();
    }
  }

  _syncAndCheckPockets(): void {
    const cueBall = this.balls[0];
    for (const b of this.balls) {
      if (b.pocketed) continue;
      const body = this.bodies.get(b.id);
      if (!body) continue;
      const t = body.translation();
      const q = body.rotation();
      const v = body.linvel();
      // Clamp Y so balls never hop off table
      if (t.y > POOL_TABLE.ballRadius * 1.15 || t.y < POOL_TABLE.ballRadius * 0.85) {
        body.setTranslation({ x: t.x, y: POOL_TABLE.ballRadius, z: t.z }, true);
        body.setLinvel({ x: v.x, y: 0, z: v.z }, true);
      }
      b.x = t.x;
      b.y = POOL_TABLE.ballRadius;
      b.z = t.z;
      b.qx = q.x;
      b.qy = q.y;
      b.qz = q.z;
      b.qw = q.w;
      b.vx = v.x;
      b.vz = v.z;

      // Detect first ball hit by cue ball
      if (
        b.id !== 0 &&
        this.shotFirstHit == null &&
        !cueBall.pocketed &&
        Math.hypot(b.x - cueBall.x, b.z - cueBall.z) <= POOL_TABLE.ballRadius * 2.18
      ) {
        this.shotFirstHit = b.id;
        this.collisionCount++;
      }

      // Check pocket drop
      for (let pi = 0; pi < POCKETS.length; pi++) {
        const [px, pz] = POCKETS[pi];
        const dist = Math.hypot(b.x - px, b.z - pz);
        if (dist < POOL_TABLE.pocketRadius) {
          b.pocketed = true;
          this.shotPocketed.push(b.id);
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          body.setTranslation({ x: px, y: -0.5, z: pz }, false);
          break;
        } else if (
          b.id !== 0 &&
          dist < POOL_TABLE.pocketRadius * 2.5 &&
          Math.hypot(b.vx, b.vz) > 0.25
        ) {
          this.closeUpTarget = { pocketIdx: pi, ballId: b.id };
        }
      }
    }
  }

  _allStopped(): boolean {
    for (const b of this.balls) {
      if (b.pocketed) continue;
      const body = this.bodies.get(b.id);
      if (!body) continue;
      const v = body.linvel();
      if (Math.hypot(v.x, v.z) > 0.018) return false;
    }
    return true;
  }

  _onShotComplete(): void {
    // Zero out tiny velocities
    for (const b of this.balls) {
      if (b.pocketed) continue;
      const body = this.bodies.get(b.id);
      if (body) {
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      }
      b.vx = 0;
      b.vz = 0;
    }

    this.lastShotReplay = [...this.replayFrames];
    this.closeUpTarget = null;

    const cuePocketed = this.shotPocketed.includes(0);
    const eightPocketed = this.shotPocketed.includes(8);
    const objectBallsPocketed = this.shotPocketed.filter((id) => id !== 0 && id !== 8);

    // Respot cue ball if scratched
    if (cuePocketed) {
      const cb = this.balls[0];
      cb.pocketed = false;
      cb.x = -POOL_TABLE.width * 0.27;
      cb.z = 0;
      const body = this.bodies.get(0);
      if (body) {
        body.setTranslation({ x: cb.x, y: POOL_TABLE.ballRadius, z: cb.z }, true);
      }
    }

    if (this.practiceMode) {
      if (eightPocketed) {
        // Respot 8-ball in practice mode if other balls remain
        const remaining = this.balls.filter((b) => b.id !== 0 && !b.pocketed);
        if (remaining.length === 0) {
          this.rackBalls();
          this.practiceMode = true;
          return;
        }
      }
      this.scores[0] += objectBallsPocketed.length;
      this.comboStreak = objectBallsPocketed.length > 0 && !cuePocketed ? this.comboStreak + 1 : 0;
      this.ballInHand = cuePocketed;
      this.phase = 'aiming';
      return;
    }

    // Standard 8-Ball rules evaluation
    const currentSuit = this.suits[this.turn];
    const isSolid = (id: number) => id >= 1 && id <= 7;
    const isStripe = (id: number) => id >= 9 && id <= 15;
    const remainingOfSuit = (suit: PoolSuit) =>
      this.balls.filter(
        (b) => !b.pocketed && (suit === 'solids' ? isSolid(b.id) : isStripe(b.id)),
      ).length;

    if (eightPocketed) {
      const clearedOwnSuit = currentSuit != null && remainingOfSuit(currentSuit) === 0;
      if (!cuePocketed && clearedOwnSuit) {
        this.winner = this.turn;
        this.lastMessage = `Player ${this.turn + 1} pockets the 8-Ball and wins!`;
      } else {
        this.winner = this.turn === 0 ? 1 : 0;
        this.lastMessage = `Foul on 8-Ball! Player ${this.winner + 1} wins!`;
      }
      this.phase = 'over';
      return;
    }

    // Assign suit on open table if a ball was legally pocketed without scratch
    if (this.suits[0] == null && objectBallsPocketed.length > 0 && !cuePocketed) {
      const firstId = objectBallsPocketed[0];
      const chosen: PoolSuit = isSolid(firstId) ? 'solids' : 'stripes';
      const other: PoolSuit = chosen === 'solids' ? 'stripes' : 'solids';
      this.suits[this.turn] = chosen;
      this.suits[this.turn === 0 ? 1 : 0] = other;
    }

    // Check fouls (scratch, no ball hit, or wrong suit hit first)
    let foul = cuePocketed || this.shotFirstHit == null;
    if (!foul && currentSuit != null && this.shotFirstHit != null) {
      const need8 = remainingOfSuit(currentSuit) === 0;
      if (need8 && this.shotFirstHit !== 8) foul = true;
      else if (!need8) {
        if (currentSuit === 'solids' && !isSolid(this.shotFirstHit)) foul = true;
        if (currentSuit === 'stripes' && !isStripe(this.shotFirstHit)) foul = true;
      }
    }

    // Update scores
    const solidsLeft = remainingOfSuit('solids');
    const stripesLeft = remainingOfSuit('stripes');
    if (this.suits[0] === 'solids') {
      this.scores = [7 - solidsLeft, 7 - stripesLeft];
    } else if (this.suits[0] === 'stripes') {
      this.scores = [7 - stripesLeft, 7 - solidsLeft];
    } else {
      this.scores = [7 - solidsLeft, 7 - stripesLeft];
    }

    if (foul) {
      this.turn = this.turn === 0 ? 1 : 0;
      this.ballInHand = true;
      this.comboStreak = 0;
      this.lastMessage = `Foul! Player ${this.turn + 1} has Ball in Hand`;
    } else if (objectBallsPocketed.length > 0) {
      this.comboStreak++;
      this.lastMessage = `Player ${this.turn + 1} pockets ${objectBallsPocketed.join(', ')} — Shoot again!`;
    } else {
      this.turn = this.turn === 0 ? 1 : 0;
      this.comboStreak = 0;
      this.lastMessage = `Player ${this.turn + 1}'s turn`;
    }

    this.phase = 'aiming';
  }

  computeAimGuidelines(): AimGuideline {
    const cueBall = this.balls[0];
    const dirX = Math.cos(this.cue.yaw);
    const dirZ = Math.sin(this.cue.yaw);
    const r = POOL_TABLE.ballRadius;
    const hitDist = r * 2;

    let bestT = 2.8;
    let hitBall: BallPose | null = null;

    for (const b of this.balls) {
      if (b.id === 0 || b.pocketed) continue;
      const ox = b.x - cueBall.x;
      const oz = b.z - cueBall.z;
      const proj = ox * dirX + oz * dirZ;
      if (proj <= 0) continue;
      const perpSq = ox * ox + oz * oz - proj * proj;
      if (perpSq >= hitDist * hitDist) continue;
      const t = proj - Math.sqrt(hitDist * hitDist - perpSq);
      if (t > 0 && t < bestT) {
        bestT = t;
        hitBall = b;
      }
    }

    // Clamp to cushion rails if no ball hit
    if (!hitBall) {
      const halfW = POOL_TABLE.width / 2 - r;
      const halfD = POOL_TABLE.depth / 2 - r;
      const tx =
        dirX > 1e-4 ? (halfW - cueBall.x) / dirX : dirX < -1e-4 ? (-halfW - cueBall.x) / dirX : 99;
      const tz =
        dirZ > 1e-4 ? (halfD - cueBall.z) / dirZ : dirZ < -1e-4 ? (-halfD - cueBall.z) / dirZ : 99;
      bestT = Math.max(0.05, Math.min(bestT, tx, tz));
      return {
        cueStart: [cueBall.x, cueBall.z],
        cueEnd: [cueBall.x + dirX * bestT, cueBall.z + dirZ * bestT],
        ghostPos: null,
        targetDir: null,
        deflectDir: null,
        hitBallId: null,
      };
    }

    const gx = cueBall.x + dirX * bestT;
    const gz = cueBall.z + dirZ * bestT;
    const nx = (hitBall.x - gx) / hitDist;
    const nz = (hitBall.z - gz) / hitDist;
    // Tangent deflection for cue ball
    const dot = dirX * nx + dirZ * nz;
    let dx = dirX - dot * nx;
    let dz = dirZ - dot * nz;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;

    return {
      cueStart: [cueBall.x, cueBall.z],
      cueEnd: [gx, gz],
      ghostPos: [gx, gz],
      targetDir: [nx, nz],
      deflectDir: [dx, dz],
      hitBallId: hitBall.id,
    };
  }
}
