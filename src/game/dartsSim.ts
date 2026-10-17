// Decoupled Pixel Darts Physics & 20-Zone Scoring Engine.
// Standard clock-order 20-zone board, bullseye (50/25), wind trajectory drift, 3-dart rounds, and 180 badge.

export const DART_SECTORS = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const;

export const DARTBOARD = {
  radius: 0.225, // meters
  doubleBullR: 0.012,
  singleBullR: 0.028,
  tripleInnerR: 0.105,
  tripleOuterR: 0.122,
  doubleInnerR: 0.185,
  doubleOuterR: 0.205,
};

export interface DartScoreResult {
  points: number;
  multiplier: 0 | 1 | 2 | 3;
  sector: number;
  label: string;
}

export interface ThrownDart {
  x: number;
  y: number;
  result: DartScoreResult;
  player: 0 | 1;
}

// Compute 20-zone dartboard score from board-local (x, y) in meters (0,0 = bullseye, +y = 20 sector)
export function scoreDartAt(x: number, y: number): DartScoreResult {
  const r = Math.hypot(x, y);
  if (r <= DARTBOARD.doubleBullR) {
    return { points: 50, multiplier: 2, sector: 25, label: 'BULLSEYE 50' };
  }
  if (r <= DARTBOARD.singleBullR) {
    return { points: 25, multiplier: 1, sector: 25, label: 'OUTER BULL 25' };
  }
  if (r > DARTBOARD.doubleOuterR) {
    return { points: 0, multiplier: 0, sector: 0, label: 'MISS' };
  }
  // Angle from +Y clockwise: atan2(x, y)
  let angleDeg = (Math.atan2(x, y) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;
  const idx = Math.floor(((angleDeg + 9) % 360) / 18);
  const sector = DART_SECTORS[idx];

  if (r >= DARTBOARD.tripleInnerR && r <= DARTBOARD.tripleOuterR) {
    return { points: sector * 3, multiplier: 3, sector, label: `T${sector} (${sector * 3})` };
  }
  if (r >= DARTBOARD.doubleInnerR && r <= DARTBOARD.doubleOuterR) {
    return { points: sector * 2, multiplier: 2, sector, label: `D${sector} (${sector * 2})` };
  }
  return { points: sector, multiplier: 1, sector, label: `S${sector} (${sector})` };
}

export class DartsGame {
  round = 1;
  maxRounds = 3;
  turn: 0 | 1 = 0;
  dartsLeft = 3;
  scores: [number, number] = [0, 0];
  roundTurnTotal = 0;
  wind: [number, number] = [0.012, -0.008];
  aim: [number, number] = [0, 0.113]; // Default aiming near Triple 20
  thrownDarts: ThrownDart[] = [];
  unlocked180 = false;
  lastResult: DartScoreResult | null = null;
  phase: 'aiming' | 'over' = 'aiming';
  winner: 0 | 1 | null = null;
  vsCpu = true;

  reset(vsCpu = true): void {
    this.round = 1;
    this.turn = 0;
    this.dartsLeft = 3;
    this.scores = [0, 0];
    this.roundTurnTotal = 0;
    this.thrownDarts = [];
    this.lastResult = null;
    this.phase = 'aiming';
    this.winner = null;
    this.vsCpu = vsCpu;
    this._rollWind();
  }

  _rollWind(): void {
    const a = (this.round * 137.5 + this.turn * 60) * (Math.PI / 180);
    const mag = 0.008 + (this.round - 1) * 0.005;
    this.wind = [Math.cos(a) * mag, Math.sin(a) * mag];
  }

  throwDart(aimX: number, aimY: number, power = 0.78): ThrownDart | null {
    if (this.phase === 'over' || this.dartsLeft <= 0) return null;
    // Optimal power is ~0.78; lower power drops Y, higher power rises slightly
    const dropY = (power - 0.78) * 0.11;
    const hitX = aimX + this.wind[0];
    const hitY = aimY + this.wind[1] + dropY;
    const result = scoreDartAt(hitX, hitY);
    const dart: ThrownDart = { x: hitX, y: hitY, result, player: this.turn };

    this.thrownDarts.push(dart);
    this.scores[this.turn] += result.points;
    this.roundTurnTotal += result.points;
    this.lastResult = result;
    this.dartsLeft--;

    if (this.roundTurnTotal === 180) {
      this.unlocked180 = true;
    }

    if (this.dartsLeft === 0) {
      this._advanceTurn();
    }
    return dart;
  }

  _advanceTurn(): void {
    this.roundTurnTotal = 0;
    if (this.turn === 0) {
      this.turn = 1;
      this.dartsLeft = 3;
      this._rollWind();
    } else {
      if (this.round >= this.maxRounds) {
        this.phase = 'over';
        this.winner = this.scores[0] >= this.scores[1] ? 0 : 1;
      } else {
        this.round++;
        this.turn = 0;
        this.dartsLeft = 3;
        this.thrownDarts = [];
        this._rollWind();
      }
    }
  }
}
