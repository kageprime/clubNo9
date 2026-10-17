// Secondary Rapier3D physics world & Liar's Dice / High-Low engine for the Club No.9 Dice Cup table.

import { mulberry32, type PRNG } from './rng.ts';
import { topFace, quatFaceUp, type Quat } from './ludoDieTray.ts';

export interface CupDiePose {
  x: number;
  y: number;
  z: number;
  q: Quat;
  face: number;
}

export interface DiceBid {
  by: 0 | 1; // 0 = Player, 1 = Club Regular
  quantity: number;
  face: number; // 2..6 (1s are wild in Liar's Dice)
}

export class DiceCupSim {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  R: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  world: any;
  rng: PRNG;
  playerDice: CupDiePose[] = [];
  cpuDice: number[] = [2, 3, 4, 5, 6];
  cupLifted = false;
  currentBid: DiceBid | null = null;
  turn: 0 | 1 = 0;
  phase: 'shake' | 'bidding' | 'revealed' = 'shake';
  scores: [number, number] = [0, 0];
  roundMessage = 'Shake the cup to roll your 5 dice!';
  lastChallengeWon: boolean | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(RAPIER: any, seed = 99) {
    this.R = RAPIER;
    this.rng = mulberry32(seed);
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 120;
    this._buildSurface();
    this.shakeAndRoll();
  }

  dispose(): void {
    try {
      this.world.free();
    } catch {
      // ignore
    }
  }

  _buildSurface(): void {
    const R = this.R;
    this.world.createCollider(
      R.ColliderDesc.cuboid(0.4, 0.04, 0.4)
        .setTranslation(0, -0.04, 0)
        .setFriction(0.6)
        .setRestitution(0.3),
    );
  }

  shakeAndRoll(): number[] {
    const R = this.R;
    const r = this.rng;
    const bodies = [];
    const half = 0.016;
    const ringR = 0.055;

    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r.range(-0.15, 0.15);
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(Math.cos(a) * ringR, 0.06 + i * 0.012, Math.sin(a) * ringR)
          .setLinvel(r.range(-0.25, 0.25), r.range(-0.4, 0.2), r.range(-0.25, 0.25))
          .setAngvel({
            x: r.range(-18, 18),
            y: r.range(-18, 18),
            z: r.range(-18, 18),
          }),
      );
      this.world.createCollider(
        R.ColliderDesc.cuboid(half, half, half).setDensity(1400).setFriction(0.55).setRestitution(0.32),
        body,
      );
      bodies.push(body);
    }

    for (let step = 0; step < 140; step++) {
      this.world.step();
    }

    this.playerDice = bodies.map((b, i) => {
      const t = b.translation();
      const q = b.rotation();
      const info = topFace(q);
      const a = (i / 5) * Math.PI * 2;
      const fx = Math.max(-0.11, Math.min(0.11, t.x || Math.cos(a) * ringR));
      const fz = Math.max(-0.11, Math.min(0.11, t.z || Math.sin(a) * ringR));
      this.world.removeRigidBody(b);
      return {
        x: fx,
        y: half,
        z: fz,
        q: quatFaceUp(info.face, a),
        face: info.face,
      };
    });

    this.cpuDice = [0, 1, 2, 3, 4].map(() => r.int(1, 6));
    this.cupLifted = false;
    this.currentBid = null;
    this.turn = 0;
    this.phase = 'bidding';
    this.lastChallengeWon = null;
    this.roundMessage = 'Make an opening bid (1s are wild) or play High-Low!';
    return this.playerDice.map((d) => d.face);
  }

  countMatching(face: number): number {
    const all = [...this.playerDice.map((d) => d.face), ...this.cpuDice];
    return all.filter((f) => f === face || f === 1).length;
  }

  placeBid(quantity: number, face: number): boolean {
    if (this.phase !== 'bidding') return false;
    if (face < 2 || face > 6 || quantity < 1 || quantity > 10) return false;
    if (this.currentBid) {
      const validHigher =
        quantity > this.currentBid.quantity ||
        (quantity === this.currentBid.quantity && face > this.currentBid.face);
      if (!validHigher) return false;
    }
    this.currentBid = { by: 0, quantity, face };
    this.turn = 1;
    this._cpuRespond();
    return true;
  }

  _cpuRespond(): void {
    if (!this.currentBid) return;
    const b = this.currentBid;
    const cpuSupport = this.cpuDice.filter((f) => f === b.face || f === 1).length;
    const expectedTotal = cpuSupport + 5 * (2 / 6);

    if (b.quantity > expectedTotal + 1.1 || b.quantity >= 8) {
      // CPU calls Liar!
      this.callLiar(1);
    } else {
      // CPU raises bid
      const nextFace = b.face < 6 ? b.face + 1 : 2;
      const nextQty = b.face < 6 ? b.quantity : b.quantity + 1;
      this.currentBid = { by: 1, quantity: nextQty, face: nextFace };
      this.turn = 0;
      this.roundMessage = `Regular bids ${nextQty} × [${nextFace}s] — Raise or Call Liar!`;
    }
  }

  callLiar(caller: 0 | 1 = 0): { actual: number; callerWon: boolean } {
    const bid = this.currentBid ?? { by: 1, quantity: 3, face: 4 };
    const actual = this.countMatching(bid.face);
    // Bid holds if actual >= bid.quantity
    const bidHeld = actual >= bid.quantity;
    const callerWon = caller === 0 ? !bidHeld : !bidHeld;
    const playerWon = (caller === 0 && !bidHeld) || (caller === 1 && bidHeld);

    this.cupLifted = true;
    this.phase = 'revealed';
    this.lastChallengeWon = playerWon;
    if (playerWon) {
      this.scores[0]++;
      this.roundMessage = `Total [${bid.face}s + wild 1s]: ${actual} (Bid: ${bid.quantity}×${bid.face}) — You win the round!`;
    } else {
      this.scores[1]++;
      this.roundMessage = `Total [${bid.face}s + wild 1s]: ${actual} (Bid: ${bid.quantity}×${bid.face}) — Regular wins the round!`;
    }
    return { actual, callerWon };
  }
}
