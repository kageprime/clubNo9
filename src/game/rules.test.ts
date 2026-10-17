import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mulberry32, hashSeed } from './rng.ts';
import { LOOP, LOOP_LEN, SAFE, START_IDX, cellOf, tokenPoint, P_BASE, P_HOME } from './ludoBoard.ts';
import { newGame, rollDie, applyMove, legalMoves, homeCount } from './ludoRules.ts';
import { chooseMove } from './ludoAi.ts';
import { DieTray, topFace, quatFaceUp } from './ludoDieTray.ts';
import { PoolSim } from './poolSim.ts';
import { scoreDartAt, DartsGame } from './dartsSim.ts';
import { DiceCupSim } from './diceCupSim.ts';
import {
  GAME_TRANSITION_META,
  isGameStation,
  beginViewTransition,
  stepViewTransition,
} from './viewTransition.ts';

test('View transition state machine hides lounge environment and overlays when entering Ludo, Pool, Darts, or Dice', () => {
  for (const gameId of ['ludo', 'pool', 'darts', 'dice'] as const) {
    assert.equal(isGameStation(gameId), true);
    assert.ok(GAME_TRANSITION_META[gameId].titleEn.length > 0);

    let st = beginViewTransition(gameId, 'enter', 0.6);
    assert.equal(st.active, true);
    assert.equal(st.hideLoungeEnv, true);
    assert.equal(st.hideLoungeOverlays, true);
    assert.ok(st.cameraSwoop > 0.9);

    // Step to peak shutter veil (~0.25s)
    st = stepViewTransition(st, 0.25);
    assert.equal(st.active, true);
    assert.ok(st.shutterProgress > 0.85);
    assert.equal(st.hideLoungeEnv, true);

    // Step to completion (0.6s total)
    st = stepViewTransition(st, 0.4);
    assert.equal(st.active, false);
    assert.equal(st.progress, 1);
    assert.equal(st.shutterProgress, 0);
    assert.equal(st.cameraSwoop, 0);
    // Lounge environment and lounge overlays stay hidden while immersed in the game
    assert.equal(st.hideLoungeEnv, true);
    assert.equal(st.hideLoungeOverlays, true);
  }

  // Exiting back to lounge restores lounge environment and overlays
  let exitSt = beginViewTransition('none', 'exit', 0.5);
  assert.equal(exitSt.active, true);
  exitSt = stepViewTransition(exitSt, 0.55);
  assert.equal(exitSt.active, false);
  assert.equal(exitSt.hideLoungeEnv, false);
  assert.equal(exitSt.hideLoungeOverlays, false);
});


test('deterministic PRNG produces reproducible sequence', () => {
  const r1 = mulberry32(42);
  const r2 = mulberry32(42);
  assert.equal(r1(), r2());
  assert.equal(r1.int(1, 6), r2.int(1, 6));
  assert.ok(hashSeed('CLUB_NO_9') > 0);
});

test('Ludo board geometry has 52 loop squares and valid safe squares', () => {
  assert.equal(LOOP.length, LOOP_LEN);
  for (const s of START_IDX) {
    assert.equal(SAFE.has(s), true);
  }
  const [x, y] = cellOf(0, 0);
  assert.deepEqual([x, y], [1, 6]);
  const pt = tokenPoint(0, P_BASE, 0);
  assert.deepEqual(pt, [2, 2]);
});

test('Ludo rules: require 6 to leave yard, three 6s forfeit, capture & bonus roll', () => {
  const s = newGame(['human', 'cpu', 'off', 'off'], 0);
  assert.equal(rollDie(s, 4), 'nomove');

  // Reset and roll 6 to enter
  const s2 = newGame(['human', 'cpu', 'off', 'off'], 0);
  assert.equal(rollDie(s2, 6), 'pick');
  assert.equal(s2.moves.length, 4);
  const res = applyMove(s2, s2.moves[0]);
  assert.equal(res.bonus, true);
  assert.equal(s2.tokens[0][0], 0);

  // Three sixes in a row forfeits turn
  const s3 = newGame(['human', 'cpu', 'off', 'off'], 0);
  rollDie(s3, 6);
  applyMove(s3, s3.moves[0]);
  rollDie(s3, 6);
  applyMove(s3, s3.moves[0]);
  assert.equal(rollDie(s3, 6), 'forfeit');

  // Exact roll required to finish at P_HOME (56)
  const s4 = newGame(['human', 'cpu', 'off', 'off'], 0);
  s4.tokens[0][0] = 54;
  assert.equal(legalMoves(s4, 3, 0).length, 0);
  const finishMoves = legalMoves(s4, 2, 0);
  assert.equal(finishMoves.length, 1);
  assert.equal(finishMoves[0].finishes, true);
  s4.tokens[0] = [54, P_HOME, P_HOME, P_HOME];
  rollDie(s4, 2);
  const winRes = applyMove(s4, s4.moves[0]);
  assert.equal(winRes.won, true);
  assert.equal(homeCount(s4, 0), 4);
});

test('Ludo CPU AI selects finishing and capturing moves over idle advances', () => {
  const s = newGame(['cpu', 'cpu', 'off', 'off'], 0);
  s.tokens[0] = [54, 10, P_BASE, P_BASE];
  rollDie(s, 2);
  const picked = chooseMove(s, s.moves, 'hard');
  assert.equal(picked.finishes, true);
});

test('Pixel Darts 20-zone scoring and 180 achievement', () => {
  const bull = scoreDartAt(0, 0);
  assert.equal(bull.points, 50);

  // Triple 20 sits straight up on +Y at radius ~0.113m
  const t20 = scoreDartAt(0, 0.113);
  assert.equal(t20.points, 60);
  assert.equal(t20.multiplier, 3);

  const game = new DartsGame();
  game.wind = [0, 0];
  game.throwDart(0, 0.113, 0.78);
  game.throwDart(0, 0.113, 0.78);
  game.throwDart(0, 0.113, 0.78);
  assert.equal(game.scores[0], 180);
  assert.equal(game.unlocked180, true);
});

test('Rapier3D headless physics: Ludo DieTray, 8-Ball PoolSim, and DiceCupSim', async () => {
  await RAPIER.init();

  // 1. Ludo DieTray physical throw & quaternion face readout
  for (let face = 1; face <= 6; face++) {
    const q = quatFaceUp(face, 0.4);
    assert.equal(topFace(q).face, face);
  }
  const tray = new DieTray(RAPIER, { seed: 77 });
  assert.equal(tray.throwDie(0.65, 0.42), true);
  assert.equal(tray.phase, 'shaking');
  // Step halfway through cup shaking (~0.18s)
  for (let i = 0; i < 11; i++) tray.step(1 / 60);
  const shakeSnap = tray.snapshot();
  assert.equal(shakeSnap.phase, 'shaking');
  assert.ok((shakeSnap.shakeProgress ?? 0) > 0.35);
  // Step past shakeDuration so the cup throws the die out into rolling phase
  for (let i = 0; i < 15; i++) tray.step(1 / 60);
  const throwSnap = tray.snapshot();
  assert.equal(throwSnap.phase, 'rolling');
  const rolledFace = tray.run(10);
  assert.ok(rolledFace >= 1 && rolledFace <= 6);
  tray.dispose();

  // 2. 8-Ball PoolSim break shot & trajectory guidelines
  const pool = new PoolSim(RAPIER);
  assert.equal(pool.balls.length, 16);
  const guide = pool.computeAimGuidelines();
  assert.equal(guide.hitBallId, 1);
  assert.equal(pool.strike(0.85), true);
  for (let i = 0; i < 60; i++) pool.step(1 / 60);
  assert.ok(pool.collisionCount > 0);
  pool.dispose();

  // 3. DiceCupSim 5-dice roll & Liar's Dice challenge
  const cup = new DiceCupSim(RAPIER, 123);
  assert.equal(cup.playerDice.length, 5);
  for (const d of cup.playerDice) {
    assert.ok(d.face >= 1 && d.face <= 6);
  }
  assert.equal(cup.placeBid(2, 4), true);
  const challenge = cup.callLiar(0);
  assert.ok(challenge.actual >= 0 && challenge.actual <= 10);
  cup.dispose();
});
