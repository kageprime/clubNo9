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
import {
  checkLoungeCollision,
  resolveLoungeSlide,
  findLoungePath,
  LOUNGE_OBSTACLES,
} from '../scene/clubWorld.ts';

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

test('Isometric 90-degree rotation angles and camera offset coordinates', () => {
  // Test 4 cardinal 90-degree rotations (SW 0°, SE 90°, NE 180°, NW 270°)
  let angleIdx = 0;
  const rotate = (dir: 1 | -1) => {
    angleIdx = (angleIdx + dir + 4) % 4;
    return angleIdx;
  };

  assert.equal(rotate(1), 1); // 90° clockwise
  assert.equal(rotate(1), 2); // 180°
  assert.equal(rotate(1), 3); // 270°
  assert.equal(rotate(1), 0); // 360° wraps back to 0°
  assert.equal(rotate(-1), 3); // counter-clockwise wraps to 270°

  // Trigonometric offset verification
  const baseOx = -5.2;
  const baseOz = 7.5;
  const computeOffset = (idx: number) => {
    const a = idx * (Math.PI / 2);
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    return {
      x: baseOx * cosA - baseOz * sinA,
      z: baseOx * sinA + baseOz * cosA,
    };
  };

  const o0 = computeOffset(0);
  assert.ok(Math.abs(o0.x - -5.2) < 1e-4);
  assert.ok(Math.abs(o0.z - 7.5) < 1e-4);

  const o1 = computeOffset(1); // 90°
  assert.ok(Math.abs(o1.x - -7.5) < 1e-4);
  assert.ok(Math.abs(o1.z - -5.2) < 1e-4);

  const o2 = computeOffset(2); // 180°
  assert.ok(Math.abs(o2.x - 5.2) < 1e-4);
  assert.ok(Math.abs(o2.z - -7.5) < 1e-4);

  const o3 = computeOffset(3); // 270°
  assert.ok(Math.abs(o3.x - 7.5) < 1e-4);
  assert.ok(Math.abs(o3.z - 5.2) < 1e-4);
});

test('Lounge AABB collision: detects obstacle bounding boxes and room boundary perimeter', () => {
  // 1. Inside central pool table (minX: -1.48, maxX: 1.48, minZ: -0.65, maxZ: 1.15)
  assert.equal(checkLoungeCollision(0.0, 0.25, 0.26), true);
  // Just outside pool table bounds
  assert.equal(checkLoungeCollision(0.0, -1.2, 0.26), false);

  // 2. Former table area is now open, walkable lounge floor
  assert.equal(checkLoungeCollision(-2.45, 2.35, 0.26), false);

  // 3. Inside arcade row
  assert.equal(checkLoungeCollision(-4.5, -1.0, 0.26), true);

  // 4. Inside bar counter
  assert.equal(checkLoungeCollision(4.0, 2.0, 0.26), true);

  // 5. Open walkways
  assert.equal(checkLoungeCollision(-0.9, 1.85, 0.26), false);
  assert.equal(checkLoungeCollision(0.0, -2.5, 0.26), false);

  // 6. Perimeter wall bounds
  assert.equal(checkLoungeCollision(5.5, 0.0, 0.26), true); // beyond east wall
  assert.equal(checkLoungeCollision(-5.5, 0.0, 0.26), true); // beyond west wall
  assert.equal(checkLoungeCollision(0.0, 4.2, 0.26), true); // beyond south wall
  assert.equal(checkLoungeCollision(0.0, -4.2, 0.26), true); // beyond north wall
});

test('Lounge slide resolution: decouples axes to allow smooth sliding along obstacle edges', () => {
  // Walking towards pool table from west (-1.8, 0.0) trying to move (+0.5, +0.2)
  // X motion is blocked by pool table (minX -1.48), but Z motion is clear
  const startX = -1.8;
  const startZ = 0.0;
  const result = resolveLoungeSlide(startX, startZ, 0.5, 0.2, 0.26);
  // X should not enter obstacle, but Z should have advanced
  assert.ok(result.x < -1.48 - 0.2);
  assert.equal(result.z, startZ + 0.2);

  // Free motion in open space advances both axes
  const freeResult = resolveLoungeSlide(0.0, -2.5, 0.1, 0.15, 0.26);
  assert.ok(Math.abs(freeResult.x - 0.1) < 1e-4);
  assert.ok(Math.abs(freeResult.z - (-2.35)) < 1e-4);
});

test('2D Grid A* pathfinding: routes around obstacles and finds valid walkable paths', () => {
  // Route from front walkway to back walkway around pool table
  const startX = 0.0;
  const startZ = -2.5;
  const targetX = 0.0;
  const targetZ = 2.5;

  const path = findLoungePath(startX, startZ, targetX, targetZ);
  assert.ok(path.length > 2, 'Path should contain multiple waypoints navigating around table');

  // Verify that all generated waypoints are walkable and do not intersect obstacles
  for (const wp of path) {
    assert.equal(
      checkLoungeCollision(wp.x, wp.z, 0.2),
      false,
      `Waypoint (${wp.x}, ${wp.z}) should not collide with obstacles`,
    );
  }

  // End of path should reach or be within close proximity to target
  const lastPoint = path[path.length - 1];
  const distToTarget = Math.hypot(lastPoint.x - targetX, lastPoint.z - targetZ);
  assert.ok(distToTarget < 0.6, 'Last waypoint should be close to destination');
});

test('VRM user avatar: model file exists and contains valid VRM humanoid extensions', () => {
  const fs = require('fs');
  assert.ok(fs.existsSync('public/avatar.vrm'), 'public/avatar.vrm should exist');
  assert.ok(fs.existsSync('public/8329890252317737768.vrm'), 'public/8329890252317737768.vrm should exist');

  const buf = fs.readFileSync('public/avatar.vrm');
  assert.ok(buf.length > 1000000, 'VRM file should have non-trivial size');
  // Check GLB magic: 0x46546C67 ("glTF")
  const magic = buf.readUInt32LE(0);
  assert.equal(magic, 0x46546c67, 'VRM file must be valid binary glTF (GLB)');

  const jsonLen = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + jsonLen);
  const gltf = JSON.parse(jsonStr);

  assert.ok(gltf.extensions?.VRM || gltf.extensions?.VRMC_vrm, 'glTF must have VRM extension');
  if (gltf.extensions?.VRM) {
    assert.ok(gltf.extensions.VRM.humanoid, 'VRM must contain humanoid bone mapping');
  }
});

