// CLUB No.9 — Unified 3D Pixel Lounge & Tabletop Physics Stage (world.js + render.js).
// Strictly read-only view layer driven by the controller and headless physics engines.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
  COLOR_HEX,
  cellOf,
  yardSlot,
  P_HOME,
} from '../game/ludoBoard.ts';
import { TRAY, quatFaceUp, type DieSnapshot } from '../game/ludoDieTray.ts';
import { POOL_TABLE, POCKETS, type BallPose, type AimGuideline } from '../game/poolSim.ts';
import { type ThrownDart } from '../game/dartsSim.ts';
import { type CupDiePose } from '../game/diceCupSim.ts';
import {
  woodPlankTex,
  walnutTrimTex,
  brickWallTex,
  feltClothTex,
  ludoBoardTex,
  diePipTex,
  poolBallTex,
  dartboardTex,
  neonClubSignTex,
  lobbyMarqueeTex,
  ludoMarqueeTex,
  diceMarqueeTex,
  dartsMarqueeTex,
  retroMarqueeTex,
  coinDoorTex,
  openNeonTex,
  drawArcadeScreen,
  orientalRugTex,
  vintagePosterTex,
  wainscotPanelTex,
  tavernPlasterWallTex,
  leadedPubWindowTex,
} from './textures.ts';
import { PixelPostProcessor } from './pixelShader.ts';

export type StationId =
  | 'none'
  | 'ludo'
  | 'pool'
  | 'darts'
  | 'dice'
  | 'arcade'
  | 'bartender'
  | 'jukebox';

export type LudoCamMode = 'auto' | 'board' | 'dice' | 'top' | 'orbit';

export interface StationHotspot {
  id: StationId;
  x: number;
  z: number;
  radius: number;
  labelZh: string;
  labelEn: string;
}

export const STATION_HOTSPOTS: ReadonlyArray<StationHotspot> = [
  { id: 'pool', x: 0.0, z: 0.25, radius: 1.85, labelZh: '八球台球桌 (中式八球)', labelEn: '8-Ball Championship Pool' },
  { id: 'ludo', x: -4.1, z: -0.9, radius: 1.45, labelZh: '飞行棋街机 (LUDO ROYALE)', labelEn: 'Ludo Royale Arcade' },
  { id: 'dice', x: -4.1, z: -1.75, radius: 1.45, labelZh: '大话骰街机 (CYBER DICE)', labelEn: "Cyber Dice Shaker Arcade" },
  { id: 'darts', x: -4.1, z: -2.6, radius: 1.45, labelZh: '像素飞镖街机 (PIXEL DARTS)', labelEn: 'Pixel Darts Arcade' },
  { id: 'arcade', x: -4.1, z: 0.25, radius: 1.45, labelZh: '联机大厅街机 (NET TERMINAL)', labelEn: 'Net-Play Terminal' },
  { id: 'bartender', x: 3.35, z: 1.75, radius: 1.45, labelZh: '橡木吧台 · 点一杯精酿', labelEn: 'Oak Bar · Order Brew' },
  { id: 'jukebox', x: 4.35, z: -3.15, radius: 1.4, labelZh: '复古像素点唱机', labelEn: 'Pixel Jukebox' },
];

// Ludo world constants (scaled on the front-left table at LUDO_ORIGIN)
export const LUDO_ORIGIN = new THREE.Vector3(-2.45, 0.76, 2.35);
export const LUDO_CELL = 0.05;
export const LUDO_BOARD_SIZE = LUDO_CELL * 15;
export const LUDO_BOARD_Y = 0.03;
export const LUDO_LAYOUT = { boardX: -0.34, trayX: 0.50 };
export const bx = (u: number): number => (u - 7.5) * LUDO_CELL;

// Pool world origin (central table)
export const POOL_ORIGIN = new THREE.Vector3(0.0, 0.78, 0.25);

// Darts world origin (back-right wall)
export const DART_ORIGIN = new THREE.Vector3(2.35, 1.58, -3.96);

// Dice Cup world origin (front-left high-top table)
export const DICE_ORIGIN = new THREE.Vector3(-4.15, 0.76, 2.85);

export interface ObstacleAABB {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const LOUNGE_OBSTACLES: ObstacleAABB[] = [
  // 1. Central 8-Ball Pool Table & rails (origin: 0, 0, 0.25)
  { id: 'pool', minX: -1.48, maxX: 1.48, minZ: -0.65, maxZ: 1.15 },
  // 2. Arcade row along west wall
  { id: 'arcade', minX: -5.4, maxX: -4.25, minZ: -3.95, maxZ: 0.85 },
  // 3. Oak Bar counter & stools
  { id: 'bar', minX: 3.35, maxX: 5.4, minZ: 0.85, maxZ: 3.25 },
  // 4. Fireplace & hearth
  { id: 'fireplace', minX: 4.25, maxX: 5.4, minZ: -2.2, maxZ: -0.3 },
  // 5. Pixel Jukebox
  { id: 'jukebox', minX: 3.85, maxX: 5.2, minZ: -3.95, maxZ: -2.65 },
];

export function checkLoungeCollision(x: number, z: number, radius = 0.26): boolean {
  if (x - radius < -5.05 || x + radius > 5.05 || z - radius < -3.75 || z + radius > 3.75) {
    return true;
  }
  for (const obs of LOUNGE_OBSTACLES) {
    const cx = Math.max(obs.minX, Math.min(x, obs.maxX));
    const cz = Math.max(obs.minZ, Math.min(z, obs.maxZ));
    const distSq = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    if (distSq < radius * radius) {
      return true;
    }
  }
  return false;
}

export function resolveLoungeSlide(
  curX: number,
  curZ: number,
  dx: number,
  dz: number,
  radius = 0.26,
): { x: number; z: number } {
  let nextX = curX;
  let nextZ = curZ;

  if (dx !== 0 && !checkLoungeCollision(curX + dx, curZ, radius)) {
    nextX = curX + dx;
  }
  if (dz !== 0 && !checkLoungeCollision(nextX, curZ + dz, radius)) {
    nextZ = curZ + dz;
  }
  return { x: nextX, z: nextZ };
}

// 2D Grid A* Pathfinding across the 11.6m x 8.8m lounge room
const GRID_CELL = 0.25;
const GRID_MIN_X = -5.25;
const GRID_MAX_X = 5.25;
const GRID_MIN_Z = -4.0;
const GRID_MAX_Z = 4.0;
const GRID_COLS = Math.round((GRID_MAX_X - GRID_MIN_X) / GRID_CELL) + 1;
const GRID_ROWS = Math.round((GRID_MAX_Z - GRID_MIN_Z) / GRID_CELL) + 1;

export function findLoungePath(
  startX: number,
  startZ: number,
  targetX: number,
  targetZ: number,
): Array<{ x: number; z: number }> {
  const worldToCol = (x: number) => Math.max(0, Math.min(GRID_COLS - 1, Math.round((x - GRID_MIN_X) / GRID_CELL)));
  const worldToRow = (z: number) => Math.max(0, Math.min(GRID_ROWS - 1, Math.round((z - GRID_MIN_Z) / GRID_CELL)));
  const colToWorld = (c: number) => GRID_MIN_X + c * GRID_CELL;
  const rowToWorld = (r: number) => GRID_MIN_Z + r * GRID_CELL;

  const startC = worldToCol(startX);
  const startR = worldToRow(startZ);
  let targetC = worldToCol(targetX);
  let targetR = worldToRow(targetZ);

  // If target cell is inside an obstacle, find nearest walkable cell
  if (checkLoungeCollision(colToWorld(targetC), rowToWorld(targetR), 0.26)) {
    let bestDist = Infinity;
    let foundC = targetC;
    let foundR = targetR;
    for (let r = 1; r <= 8; r++) {
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          const tc = targetC + dc;
          const tr = targetR + dr;
          if (tc >= 0 && tc < GRID_COLS && tr >= 0 && tr < GRID_ROWS) {
            const wx = colToWorld(tc);
            const wz = rowToWorld(tr);
            if (!checkLoungeCollision(wx, wz, 0.26)) {
              const d = Math.hypot(wx - targetX, wz - targetZ);
              if (d < bestDist) {
                bestDist = d;
                foundC = tc;
                foundR = tr;
              }
            }
          }
        }
      }
      if (bestDist < Infinity) break;
    }
    targetC = foundC;
    targetR = foundR;
  }

  const nodeIdx = (c: number, r: number) => r * GRID_COLS + c;
  const startKey = nodeIdx(startC, startR);
  const targetKey = nodeIdx(targetC, targetR);

  if (startKey === targetKey) {
    return [{ x: colToWorld(targetC), z: rowToWorld(targetR) }];
  }

  const openSet = new Set<number>([startKey]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[startKey, 0]]);
  const fScore = new Map<number, number>([
    [startKey, Math.hypot(startC - targetC, startR - targetR)],
  ]);

  const DIRS = [
    [-1, 0, 1.0],
    [1, 0, 1.0],
    [0, -1, 1.0],
    [0, 1, 1.0],
    [-1, -1, 1.414],
    [-1, 1, 1.414],
    [1, -1, 1.414],
    [1, 1, 1.414],
  ] as const;

  let iterations = 0;
  while (openSet.size > 0 && iterations++ < 1200) {
    let currentKey = -1;
    let lowestF = Infinity;
    for (const key of openSet) {
      const f = fScore.get(key) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        currentKey = key;
      }
    }

    if (currentKey === targetKey) {
      const path: Array<{ x: number; z: number }> = [];
      let curr = currentKey;
      while (curr !== startKey) {
        const c = curr % GRID_COLS;
        const r = Math.floor(curr / GRID_COLS);
        path.unshift({ x: colToWorld(c), z: rowToWorld(r) });
        curr = cameFrom.get(curr)!;
      }
      if (!checkLoungeCollision(targetX, targetZ, 0.2)) {
        path.push({ x: targetX, z: targetZ });
      }
      return path;
    }

    openSet.delete(currentKey);
    const currC = currentKey % GRID_COLS;
    const currR = Math.floor(currentKey / GRID_COLS);
    const currG = gScore.get(currentKey) ?? Infinity;

    for (const [dc, dr, cost] of DIRS) {
      const nC = currC + dc;
      const nR = currR + dr;
      if (nC < 0 || nC >= GRID_COLS || nR < 0 || nR >= GRID_ROWS) continue;

      const nX = colToWorld(nC);
      const nZ = rowToWorld(nR);
      if (checkLoungeCollision(nX, nZ, 0.26)) continue;

      // Prevent clipping sharp obstacle corners diagonally
      if (dc !== 0 && dr !== 0) {
        if (
          checkLoungeCollision(colToWorld(currC + dc), rowToWorld(currR), 0.26) ||
          checkLoungeCollision(colToWorld(currC), rowToWorld(currR + dr), 0.26)
        ) {
          continue;
        }
      }

      const tentativeG = currG + cost;
      const nKey = nodeIdx(nC, nR);
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + Math.hypot(nC - targetC, nR - targetR));
        openSet.add(nKey);
      }
    }
  }

  return [{ x: colToWorld(targetC), z: rowToWorld(targetR) }];
}

interface PawnActor {
  c: number;
  t: number;
  grp: THREE.Group;
  m: THREE.Group;
  ring: THREE.Mesh;
  p: number;
  x: number;
  z: number;
  y: number;
  sc: number;
  anim: {
    kind: 'hop' | 'fly';
    legs?: Array<{ a: [number, number]; b: [number, number] }>;
    a?: [number, number];
    b?: [number, number];
    i: number;
    t: number;
    dur: number;
    done: () => void;
    step: number;
  } | null;
  sel: boolean;
  hover: boolean;
  phase: number;
}

interface NpcPatron {
  grp: THREE.Group;
  x: number;
  z: number;
  baseYaw: number;
  role: 'pool' | 'darts' | 'ludo' | 'bar' | 'chat';
  chatterIdx: number;
  armR: THREE.Object3D;
}

// Pre-allocated scratch vectors for zero-GC render loop
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

export class ClubWorld {
  canvas: HTMLCanvasElement;
  renderer!: THREE.WebGLRenderer;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  pixelPost!: PixelPostProcessor;
  isHeadless = false;
  aspect = 16 / 9;
  time = 0;
  speed = 1;

  // Camera rig & diorama follow state
  camPos = new THREE.Vector3(-5.8, 6.8, 7.4);
  camLook = new THREE.Vector3(-0.2, 1.05, 0.1);
  camFov = 24;
  tgtPos = new THREE.Vector3(-5.8, 6.8, 7.4);
  tgtLook = new THREE.Vector3(-0.2, 1.05, 0.1);
  tgtFov = 24;
  camK = 4.8;

  camTargetLook = new THREE.Vector3(0, 0.95, 0);
  camPanOffset = new THREE.Vector2(0, 0);
  targetZoom = 1.0;
  isoZoom = 1.0;
  offCenterTimer = 0;
  hoveredStation: StationId = 'none';
  stationHoverRing!: THREE.Mesh;
  playerWaypoints: Array<{ x: number; z: number }> = [];
  private _scratchDummy = new THREE.Object3D();

  loungeCamMode: 'isometric' | 'fps' = 'isometric';
  isoAngleIndex = 0; // 0: SW (0°), 1: SE (90°), 2: NE (180°), 3: NW (270°)
  isoTargetAngle = 0;
  isoCurrentAngle = 0;
  fpsYaw = -0.35;
  fpsPitch = -0.08;

  // Cutaway wall groups for adaptive 90-degree ISO diorama viewing
  wallNorthGroup = new THREE.Group();
  wallWestGroup = new THREE.Group();
  wallEastGroup = new THREE.Group();
  wallSouthGroup = new THREE.Group();

  rotateIso(dir: 1 | -1): void {
    this.isoAngleIndex = (this.isoAngleIndex + dir + 4) % 4;
    this.isoTargetAngle = this.isoAngleIndex * (Math.PI / 2);
  }

  setIsoAngleIndex(idx: number): void {
    this.isoAngleIndex = (idx % 4 + 4) % 4;
    this.isoTargetAngle = this.isoAngleIndex * (Math.PI / 2);
  }

  getIsoAngleIndex(): number {
    return this.isoAngleIndex;
  }

  recenterCam(): void {
    this.camPanOffset.set(0, 0);
    this.camTargetLook.set(this.player.x, 0.95, this.player.z);
    this.targetZoom = 1.0;
  }

  setZoomTarget(delta: number): void {
    this.targetZoom = Math.max(0.55, Math.min(1.8, this.targetZoom * Math.exp(-delta * 0.0015)));
  }

  panCam(screenDx: number, screenDy: number): void {
    const angle = this.isoCurrentAngle;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const factor = 0.012 * this.isoZoom;
    const rightX = -sinA;
    const rightZ = -cosA;
    const upX = -cosA;
    const upZ = sinA;
    this.camPanOffset.x = Math.max(
      -4.2,
      Math.min(4.2, this.camPanOffset.x - (rightX * screenDx + upX * screenDy) * factor),
    );
    this.camPanOffset.y = Math.max(
      -3.0,
      Math.min(3.0, this.camPanOffset.y - (rightZ * screenDx + upZ * screenDy) * factor),
    );
  }

  // Player & Guest Avatar (100% VRM Model)
  player = {
    x: -0.9,
    z: 1.85,
    yaw: 0.4,
    walkDist: 0,
    grp: new THREE.Group(),
    vrmScene: null as THREE.Group | null,
    mugMesh: null as THREE.Object3D | null,
    beerToastTimer: 0,
  };
  playerTarget: { x: number; z: number } | null = null;
  moveTargetRing!: THREE.Mesh;
  guestGrp = new THREE.Group();

  // VRM Avatar state
  vrmPlayer: VRM | null = null;
  vrmLoading = false;
  vrmLoaded = false;
  vrmMugMesh: THREE.Object3D | null = null;
  private _lastVrmWalkDist = 0;
  private _blinkTimer = 0;
  private _nextBlinkInterval = 3.2;

  // Ludo table state
  ludoGroup = new THREE.Group();
  ludoTrayGroup = new THREE.Group();
  ludoCupGroup = new THREE.Group();
  ludoPawns: PawnActor[] = [];
  ludoPawnMeshes: THREE.Object3D[] = [];
  ludoHints: THREE.Mesh[] = [];
  ludoDieMesh!: THREE.Mesh;
  ludoTurnBar!: THREE.Mesh;
  ludoFeltMat!: THREE.MeshStandardMaterial;
  ludoFeltTarget: THREE.Color | null = null;
  ludoCamMode: LudoCamMode = 'auto';
  ludoPhase: 'roll' | 'play' = 'roll';
  ludoOrbit = { yaw: 0, pitch: 0.95, dist: 1.25 };
  ludoManualShake = { active: false, power: 0 };
  lastDieSnap: DieSnapshot | null = null;
  onHop: ((step: number, pw: PawnActor) => void) | null = null;
  onLand: ((pw: PawnActor) => void) | null = null;

  // Pool table state
  poolGroup = new THREE.Group();
  poolBallMeshes: THREE.Mesh[] = [];
  poolCueGroup = new THREE.Group();
  poolGuideLine!: THREE.Line;
  poolTargetLine!: THREE.Line;
  poolGhostBall!: THREE.Mesh;

  // Darts state
  dartsGroup = new THREE.Group();
  stuckDartMeshes: THREE.Group[] = [];
  fpsDartHand = new THREE.Group();
  npcFlyDart!: THREE.Group;

  // Dice cup state
  diceTableGroup = new THREE.Group();
  cupMesh!: THREE.Group;
  cupDiceMeshes: THREE.Mesh[] = [];

  // Living bar props & Immersion groups
  loungeDecorGroup = new THREE.Group();
  loungeFloorMesh!: THREE.Mesh;
  focusStagePedestal!: THREE.Mesh;
  keySpotLight!: THREE.SpotLight;
  neonLight!: THREE.PointLight;
  arcadeLight!: THREE.PointLight;
  ludoLight!: THREE.PointLight;
  poolRugMesh!: THREE.Mesh;
  ludoRugMesh!: THREE.Mesh;
  dartsWallBackdrop!: THREE.Mesh;
  bartenderGrp = new THREE.Group();
  arcadeCanvases: Array<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    tex: THREE.CanvasTexture;
    type: 'lobby' | 'ludo' | 'dice' | 'darts' | 'retro';
  }> = [];
  arcadeTick = 0;
  fireLight!: THREE.PointLight;
  emberInstanced!: THREE.InstancedMesh;
  emberData: Array<{ x: number; y: number; z: number; vy: number; phase: number }> = [];
  npcs: NpcPatron[] = [];
  bartenderArm!: THREE.Object3D;
  transitionSwoop = 0;

  flash = 0;
  flashColor = new THREE.Color(1, 0.2, 0.1);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));
  }

  init(): this {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isHeadless,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(this.isHeadless ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !this.isHeadless;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.setClearColor(0x0e0a0a, 1);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x120f14, 0.035);

    // Generate studio reflection map on hardware GPU; skip in headless software WebGL to avoid ReadPixels stall
    if (!this.isHeadless) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }

    this.camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.04, 55);
    this.pixelPost = new PixelPostProcessor(renderer);
    this.resize();

    this.scene.add(this.loungeDecorGroup);
    this.loungeDecorGroup.add(this.wallNorthGroup);
    this.loungeDecorGroup.add(this.wallWestGroup);
    this.loungeDecorGroup.add(this.wallEastGroup);
    this.loungeDecorGroup.add(this.wallSouthGroup);
    this._buildLights();
    this._buildLoungeArchitecture();
    this._buildNeonSignsAndDecor();
    this._buildArcadeRow();
    this._buildFireplaceAndBar();
    this._buildPoolStation();
    this._buildLudoStation();
    this._buildDiceCupStation();
    this._buildDartsStation();
    this._buildCharacters();

    if (!this.isHeadless) {
      this.renderer.compile(this.scene, this.camera);
    }
    return this;
  }

  resize(): void {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    this.renderer.setPixelRatio(this.isHeadless ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.pixelPost.setSize(w, h, this.pixelPost.pixelDivisor);
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  setPixelScale(divisor: number): void {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    this.pixelPost.setSize(w, h, divisor);
  }

  setBloom(enabled: boolean): void {
    this.pixelPost.setBloom(enabled);
  }

  private _buildLights(): void {
    // Warm tavern hemisphere ambient fill
    const hemi = new THREE.HemisphereLight(0xffdfba, 0x24192a, 0.95);
    this.scene.add(hemi);

    // Overhead central key spotlight (following active table during immersion)
    const spot = new THREE.SpotLight(0xfff3d6, 44, 18, 0.85, 0.65, 1.3);
    spot.position.set(0, 4.7, 0.3);
    spot.target.position.set(0, 0, 0.3);
    if (!this.isHeadless) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(2048, 2048);
      spot.shadow.bias = -0.0003;
      spot.shadow.camera.near = 1.2;
      spot.shadow.camera.far = 9.5;
    }
    this.keySpotLight = spot;
    this.scene.add(spot, spot.target);

    // Neon sign magenta glow light
    this.neonLight = new THREE.PointLight(0xff5ec4, 8.5, 7.5, 1.4);
    this.neonLight.position.set(-0.5, 3.3, -3.2);
    this.scene.add(this.neonLight);

    // Arcade row cyan/purple fill light
    this.arcadeLight = new THREE.PointLight(0x54e0ee, 8.0, 7.0, 1.4);
    this.arcadeLight.position.set(-4.2, 2.2, 0.0);
    this.scene.add(this.arcadeLight);

    // Ludo & Dice table warm amber lamp light
    this.ludoLight = new THREE.PointLight(0xffcf78, 9.5, 6.5, 1.4);
    this.ludoLight.position.set(-2.45, 2.6, 2.35);
    this.scene.add(this.ludoLight);

    // Fireplace warm flickering light
    this.fireLight = new THREE.PointLight(0xff7722, 16, 8.0, 1.4);
    this.fireLight.position.set(4.5, 1.1, -1.2);
    this.scene.add(this.fireLight);

    // 3-Shade Brass Billiard Pendant Lamp directly over Pool Table
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.22 });
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x144524, roughness: 0.38 });
    const billiardLamp = new THREE.Group();
    billiardLamp.position.set(POOL_ORIGIN.x, 2.45, POOL_ORIGIN.z);
    const barMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.85, 8), brassMat);
    barMesh.rotation.z = Math.PI / 2;
    billiardLamp.add(barMesh);
    for (const cx of [-0.65, 0.65]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1.8, 6), brassMat);
      rod.position.set(cx, 0.9, 0);
      billiardLamp.add(rod);
    }
    for (const sx of [-0.65, 0, 0.65]) {
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.16, 16, 1, true), shadeMat);
      shade.position.set(sx, -0.06, 0);
      const innerBulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfff2ba }),
      );
      innerBulb.position.set(sx, -0.05, 0);
      billiardLamp.add(shade, innerBulb);
    }
    this.loungeDecorGroup.add(billiardLamp);

    // Warm Amber Glass Pendant Lamp over Ludo Table
    const ludoLamp = new THREE.Group();
    ludoLamp.position.set(LUDO_ORIGIN.x, 2.45, LUDO_ORIGIN.z);
    const ludoCord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.7, 6), brassMat);
    ludoCord.position.y = 0.85;
    const ludoShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.18, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xec9f34, roughness: 0.35, side: THREE.DoubleSide }),
    );
    ludoShade.position.y = -0.06;
    const ludoBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffea9e }),
    );
    ludoLamp.add(ludoCord, ludoShade, ludoBulb);
    this.loungeDecorGroup.add(ludoLamp);
  }

  private _buildLoungeArchitecture(): void {
    // 1. Architectural Diorama Pedestal Base (Grounded, Museum-Quality Model Plinth)
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x1a120d,
      roughness: 0.6,
      metalness: 0.12,
    });
    const brassTrimMat = new THREE.MeshStandardMaterial({
      color: 0xc99c3e,
      roughness: 0.28,
      metalness: 0.85,
    });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.45, 9.4), plinthMat);
    plinth.position.set(0, -0.325, 0);
    plinth.receiveShadow = true;
    const brassRim = new THREE.Mesh(new THREE.BoxGeometry(12.24, 0.03, 9.44), brassTrimMat);
    brassRim.position.set(0, -0.09, 0);
    this.loungeDecorGroup.add(plinth, brassRim);

    // 2. Silky Smooth Warm Oak Floor (Noisy raster lines eliminated)
    const floorMat = new THREE.MeshStandardMaterial({
      map: woodPlankTex(101, [6, 4]),
      roughness: 0.38,
      metalness: 0.04,
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.2, 8.8), floorMat);
    floor.position.set(0, -0.1, 0);
    floor.receiveShadow = true;
    this.loungeFloorMesh = floor;
    this.scene.add(floor);

    // Focused Studio Velvet Pedestal (visible during focused tabletop play)
    this.focusStagePedestal = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 48),
      new THREE.MeshStandardMaterial({
        color: 0x090d18,
        roughness: 0.94,
        metalness: 0.04,
      }),
    );
    this.focusStagePedestal.rotation.x = -Math.PI / 2;
    this.focusStagePedestal.position.set(0, 0.001, 0);
    this.focusStagePedestal.receiveShadow = true;
    this.focusStagePedestal.visible = false;
    this.scene.add(this.focusStagePedestal);

    // Click-to-move pulsing destination ring
    this.moveTargetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.22, 28),
      new THREE.MeshBasicMaterial({ color: 0x54e0ee, side: THREE.DoubleSide, transparent: true, opacity: 0 }),
    );
    this.moveTargetRing.rotation.x = -Math.PI / 2;
    this.moveTargetRing.position.y = 0.012;
    this.scene.add(this.moveTargetRing);

    // Station Proximity & Hover Highlight Ground Disc
    this.stationHoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.05, 36),
      new THREE.MeshBasicMaterial({ color: 0xffd152, side: THREE.DoubleSide, transparent: true, opacity: 0 }),
    );
    this.stationHoverRing.rotation.x = -Math.PI / 2;
    this.stationHoverRing.position.y = 0.015;
    this.stationHoverRing.visible = false;
    this.scene.add(this.stationHoverRing);

    // 3. Luxurious Tavern Materials (Wainscot + Heritage British Racing Green Plaster)
    const darkWainscotMat = new THREE.MeshStandardMaterial({
      map: wainscotPanelTex(44, [4, 1]),
      roughness: 0.48,
      metalness: 0.05,
    });
    const upperWallMat = new THREE.MeshStandardMaterial({
      map: tavernPlasterWallTex('emerald', [4, 2]),
      roughness: 0.85,
    });
    const mouldingMat = new THREE.MeshStandardMaterial({
      color: 0x3d2010,
      roughness: 0.45,
    });
    const pilasterMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([76, 45, 24], 19, [2, 2]),
      roughness: 0.6,
    });

    // 4. Perimeter Base Wainscoting (Always visible, defines diorama room silhouette)
    // North (Back) wainscot:
    const wainscotBack = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.25, 0.32), darkWainscotMat);
    wainscotBack.position.set(0, 0.625, -4.24);
    const chairRailBack = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.07, 0.36), mouldingMat);
    chairRailBack.position.set(0, 1.25, -4.23);
    const baseboardBack = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.12, 0.36), mouldingMat);
    baseboardBack.position.set(0, 0.06, -4.23);
    this.loungeDecorGroup.add(wainscotBack, chairRailBack, baseboardBack);

    // South (Front) wainscot:
    const wainscotFront = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.25, 0.32), darkWainscotMat);
    wainscotFront.position.set(0, 0.625, 4.24);
    const chairRailFront = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.07, 0.36), mouldingMat);
    chairRailFront.position.set(0, 1.25, 4.23);
    const baseboardFront = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.12, 0.36), mouldingMat);
    baseboardFront.position.set(0, 0.06, 4.23);
    this.loungeDecorGroup.add(wainscotFront, chairRailFront, baseboardFront);

    // West (Left) wainscot:
    const wainscotLeft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.25, 8.8), darkWainscotMat);
    wainscotLeft.position.set(-5.64, 0.625, 0);
    const chairRailLeft = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 8.8), mouldingMat);
    chairRailLeft.position.set(-5.63, 1.25, 0);
    const baseboardLeft = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 8.8), mouldingMat);
    baseboardLeft.position.set(-5.63, 0.06, 0);
    this.loungeDecorGroup.add(wainscotLeft, chairRailLeft, baseboardLeft);

    // East (Right) wainscot:
    const wainscotRight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.25, 8.8), darkWainscotMat);
    wainscotRight.position.set(5.64, 0.625, 0);
    const chairRailRight = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 8.8), mouldingMat);
    chairRailRight.position.set(5.63, 1.25, 0);
    const baseboardRight = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 8.8), mouldingMat);
    baseboardRight.position.set(5.63, 0.06, 0);
    this.loungeDecorGroup.add(wainscotRight, chairRailRight, baseboardRight);

    // 5. Adaptive Cutaway Upper Wall Groups (Smoothly hide when facing camera)
    // --- NORTH UPPER WALL GROUP ---
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(11.6, 2.9, 0.3), upperWallMat);
    wallBack.position.set(0, 2.7, -4.25);
    wallBack.receiveShadow = true;
    this.wallNorthGroup.add(wallBack);

    // Timber Pilasters on North wall
    for (const x of [-5.2, -2.6, 0.5, 3.6, 5.3]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.95, 0.22), pilasterMat);
      pilaster.position.set(x, 2.7, -4.08);
      this.wallNorthGroup.add(pilaster);
    }

    // Two Leaded Diamond-Paned Pub Windows with warm amber backlighting
    const winMat = new THREE.MeshStandardMaterial({
      map: leadedPubWindowTex(),
      roughness: 0.25,
      metalness: 0.1,
      emissive: new THREE.Color(0xd48b32),
      emissiveIntensity: 0.45,
    });
    for (const wx of [-2.05, 2.15]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45), winMat);
      win.position.set(wx, 2.7, -4.07);
      this.wallNorthGroup.add(win);
    }

    // Framed Vintage Posters on North wall
    const posterMat1 = new THREE.MeshStandardMaterial({ map: vintagePosterTex('billiards'), roughness: 0.35 });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.1), posterMat1);
    p1.position.set(3.4, 2.75, -4.07);
    this.wallNorthGroup.add(p1);

    const posterMat2 = new THREE.MeshStandardMaterial({ map: vintagePosterTex('jazz'), roughness: 0.35 });
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.1), posterMat2);
    p2.position.set(-3.45, 2.75, -4.07);
    this.wallNorthGroup.add(p2);

    // Warm brass wall sconces along back wall (Emissive glow only, zero point light cost)
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.75, roughness: 0.25 });
    const sconceShadeMat = new THREE.MeshStandardMaterial({
      color: 0xfff0c2,
      emissive: 0xffaa33,
      emissiveIntensity: 1.85,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });
    for (const sx of [-4.2, 1.25]) {
      const sconceArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8), brassMat);
      sconceArm.rotation.x = Math.PI / 2;
      sconceArm.position.set(sx, 2.45, -4.05);

      const sconceShade = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.16, 12, 1, true),
        sconceShadeMat,
      );
      sconceShade.position.set(sx, 2.52, -3.96);
      this.wallNorthGroup.add(sconceArm, sconceShade);
    }

    // --- WEST UPPER WALL GROUP ---
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.9, 8.8), upperWallMat);
    wallLeft.position.set(-5.65, 2.7, 0);
    wallLeft.receiveShadow = true;
    this.wallWestGroup.add(wallLeft);
    for (const z of [-2.8, -0.9, 1.0, 2.9]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.95, 0.22), pilasterMat);
      pilaster.position.set(-5.48, 2.7, z);
      this.wallWestGroup.add(pilaster);
    }

    // --- EAST UPPER WALL GROUP ---
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.9, 8.8), upperWallMat);
    wallRight.position.set(5.65, 2.7, 0);
    wallRight.receiveShadow = true;
    this.wallEastGroup.add(wallRight);
    for (const z of [-2.8, 0.3, 3.1]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.95, 0.22), pilasterMat);
      pilaster.position.set(5.48, 2.7, z);
      this.wallEastGroup.add(pilaster);
    }
    const posterMat3 = new THREE.MeshStandardMaterial({ map: vintagePosterTex('cocktail'), roughness: 0.35 });
    const p3 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.05), posterMat3);
    p3.rotation.y = -Math.PI / 2;
    p3.position.set(5.48, 2.8, -3.1);
    this.wallEastGroup.add(p3);

    // --- SOUTH UPPER WALL GROUP ---
    const wallFront = new THREE.Mesh(new THREE.BoxGeometry(11.6, 2.9, 0.3), upperWallMat);
    wallFront.position.set(0, 2.7, 4.25);
    wallFront.receiveShadow = true;
    this.wallSouthGroup.add(wallFront);
    for (const x of [-5.2, -2.5, 0.5, 3.6, 5.3]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.95, 0.22), pilasterMat);
      pilaster.position.set(x, 2.7, 4.08);
      this.wallSouthGroup.add(pilaster);
    }
    // Stained-glass club entrance double door
    const doorMat = new THREE.MeshStandardMaterial({
      map: leadedPubWindowTex(),
      roughness: 0.3,
      emissive: new THREE.Color(0xb06c28),
      emissiveIntensity: 0.3,
    });
    const pubDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.3), doorMat);
    pubDoor.rotation.y = Math.PI;
    pubDoor.position.set(0, 2.4, 4.08);
    // Brass door handle knobs
    const knobL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), brassMat);
    knobL.position.set(-0.12, 2.25, 4.02);
    const knobR = knobL.clone();
    knobR.position.x = 0.12;
    this.wallSouthGroup.add(pubDoor, knobL, knobR);

    // Vintage Tavern Wall Clock on South wall
    const clockBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20), pilasterMat);
    clockBody.rotation.x = Math.PI / 2;
    clockBody.position.set(2.8, 2.9, 4.08);
    const clockFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.26, 20),
      new THREE.MeshStandardMaterial({ color: 0xf5eedb, roughness: 0.3 }),
    );
    clockFace.rotation.y = Math.PI;
    clockFace.position.set(2.8, 2.9, 4.03);
    this.wallSouthGroup.add(clockBody, clockFace);

    // Oak Coat Rack on South wall
    const rackPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.9, 8), pilasterMat);
    rackPole.position.set(-3.2, 0.95, 3.9);
    rackPole.castShadow = true;
    const fedora = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.12, 10),
      new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.9 }),
    );
    fedora.position.set(-3.2, 1.95, 3.9);
    this.wallSouthGroup.add(rackPole, fedora);

    // 6. Hero Ornate Persian Rug on Floor (Anchors central billiard area without floor clutter)
    const poolRug = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 2.4),
      new THREE.MeshStandardMaterial({
        map: orientalRugTex('crimson'),
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    poolRug.rotation.x = -Math.PI / 2;
    poolRug.position.set(POOL_ORIGIN.x, 0.002, POOL_ORIGIN.z);
    poolRug.receiveShadow = true;
    this.poolRugMesh = poolRug;
    this.scene.add(poolRug);

    // 7. Perimeter Crown Timber Frame (FRAMES the room without cutting across the camera)
    const beamMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([60, 34, 18], 5, [3, 1]),
      roughness: 0.6,
    });
    // Top border beam along North wall:
    const beamNorth = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.22, 0.28), beamMat);
    beamNorth.position.set(0, 4.25, -4.12);
    this.wallNorthGroup.add(beamNorth);
    // Top border beam along South wall:
    const beamSouth = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.22, 0.28), beamMat);
    beamSouth.position.set(0, 4.25, 4.12);
    this.wallSouthGroup.add(beamSouth);

    // 8. Cozy Lounge Seating: Tufted Leather Chesterfield Armchair by the Fireplace
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x4a1818, roughness: 0.45 });
    const chairGroup = new THREE.Group();
    chairGroup.position.set(3.4, 0, -2.75);
    chairGroup.rotation.y = Math.PI * 0.25;
    // Seat cushion
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.28, 0.68), leatherMat);
    seat.position.y = 0.35;
    seat.castShadow = true;
    // Curved tufted backrest
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.22), leatherMat);
    backrest.position.set(0, 0.68, -0.25);
    // Rolled armrests
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.46, 0.68), leatherMat);
    armL.position.set(-0.44, 0.52, 0);
    const armR = armL.clone();
    armR.position.x = 0.44;
    // Dark timber turned legs
    for (const lx of [-0.36, 0.36]) {
      for (const lz of [-0.28, 0.28]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.22, 6), mouldingMat);
        leg.position.set(lx, 0.11, lz);
        chairGroup.add(leg);
      }
    }
    chairGroup.add(seat, backrest, armL, armR);
    this.loungeDecorGroup.add(chairGroup);

    // Small Walnut Side Table with Banker's Desk Lamp
    const tableGroup = new THREE.Group();
    tableGroup.position.set(2.6, 0, -3.2);
    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), mouldingMat);
    tableTop.position.y = 0.58;
    const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.56, 8), mouldingMat);
    tableLeg.position.y = 0.28;
    const tableBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.04, 12), mouldingMat);
    tableBase.position.y = 0.02;
    tableGroup.add(tableTop, tableLeg, tableBase);

    // Banker's Desk Lamp (Brass stem + Emerald green glass shade)
    const bankerLamp = new THREE.Group();
    bankerLamp.position.set(0, 0.6, 0);
    const bBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.02, 8), brassMat);
    const bStem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6), brassMat);
    bStem.position.y = 0.11;
    const bShade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x145c2a, roughness: 0.2 }),
    );
    bShade.rotation.z = Math.PI / 2;
    bShade.position.y = 0.23;
    const bGlow = new THREE.PointLight(0xffea9a, 2.5, 2.5, 1.8);
    bGlow.position.y = 0.2;
    bankerLamp.add(bBase, bStem, bShade, bGlow);
    tableGroup.add(bankerLamp);
    this.loungeDecorGroup.add(tableGroup);

    // 9. Corner Tavern Brass Planter with Lush Greenery (between jukebox and wall)
    const potGrp = new THREE.Group();
    potGrp.position.set(-4.85, 0, -3.85);
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.18, 0.44, 12),
      brassMat,
    );
    pot.position.y = 0.22;
    pot.castShadow = true;
    potGrp.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1d6634, roughness: 0.5, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.62, 5), leafMat);
      leaf.rotation.set(0.42 * Math.cos(ang), ang, 0.42 * Math.sin(ang));
      leaf.position.set(Math.cos(ang) * 0.11, 0.55, Math.sin(ang) * 0.11);
      potGrp.add(leaf);
    }
    this.loungeDecorGroup.add(potGrp);
  }

  private _buildNeonSignsAndDecor(): void {
    // 1. Giant Overhead Neon Sign: 九号俱乐部 / CLUB No.9 (on North Wall)
    const signGrp = new THREE.Group();
    signGrp.position.set(-0.55, 3.25, -3.82);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x16192b, roughness: 0.4, metalness: 0.2 });
    const casing = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.18, 0.14), frameMat);
    signGrp.add(casing);

    const neonFace = new THREE.Mesh(
      new THREE.PlaneGeometry(2.76, 1.06),
      new THREE.MeshBasicMaterial({ map: neonClubSignTex(), toneMapped: false }),
    );
    neonFace.position.z = 0.075;
    signGrp.add(neonFace);

    // Glowing cyan outer rim tube
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0x54e0ee, toneMapped: false });
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(2.86, 0.04, 0.04), tubeMat);
    topBar.position.set(0, 0.56, 0.08);
    const botBar = topBar.clone();
    botBar.position.set(0, -0.56, 0.08);
    signGrp.add(topBar, botBar);
    this.wallNorthGroup.add(signGrp);

    // 2. Framed pixel wall portraits on West wall
    const frameWood = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.7 });
    const picColors = [0xc97a3e, 0x3b6e8c, 0x7a4b8c, 0x4b8c5a, 0xd49b3b];
    for (let i = 0; i < 5; i++) {
      const pic = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.42), frameWood);
      const art = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.36, 0.3),
        new THREE.MeshStandardMaterial({ color: picColors[i], roughness: 0.8 }),
      );
      pic.add(b, art);
      pic.position.set(-5.46, 3.1 + (i % 2) * 0.35, -2.8 + i * 0.85);
      this.wallWestGroup.add(pic);
    }

    // Wall AC unit on upper West wall
    const acUnit = new THREE.Group();
    const acBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.42, 1.15),
      new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5 }),
    );
    const acVent = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.14, 1.05),
      new THREE.MeshStandardMaterial({ color: 0x2b2d38, roughness: 0.8 }),
    );
    acVent.position.y = -0.1;
    acUnit.add(acBody, acVent);
    acUnit.position.set(-5.35, 3.65, 1.35);
    this.wallWestGroup.add(acUnit);
  }

  private _buildArcadeRow(): void {
    const cabConfigs: Array<{
      id: StationId;
      z: number;
      scale: number;
      color: number;
      neon: number;
      title: string;
      marqueeTex: () => THREE.CanvasTexture;
      screenType: 'lobby' | 'ludo' | 'dice' | 'darts' | 'retro';
      twoPlayerDeck: boolean;
    }> = [
      {
        id: 'arcade',
        z: 0.25,
        scale: 1.15,
        color: 0x18152e,
        neon: 0x54e0ee,
        title: 'ONLINE LOBBY',
        marqueeTex: lobbyMarqueeTex,
        screenType: 'lobby',
        twoPlayerDeck: true,
      },
      {
        id: 'ludo',
        z: -0.9,
        scale: 1.0,
        color: 0x22132e,
        neon: 0xffb84a,
        title: 'LUDO ROYALE',
        marqueeTex: ludoMarqueeTex,
        screenType: 'ludo',
        twoPlayerDeck: true,
      },
      {
        id: 'dice',
        z: -1.75,
        scale: 1.0,
        color: 0x251224,
        neon: 0xff5ec4,
        title: 'CYBER DICE',
        marqueeTex: diceMarqueeTex,
        screenType: 'dice',
        twoPlayerDeck: false,
      },
      {
        id: 'darts',
        z: -2.6,
        scale: 1.0,
        color: 0x102024,
        neon: 0x5fe08a,
        title: 'PIXEL DARTS',
        marqueeTex: dartsMarqueeTex,
        screenType: 'darts',
        twoPlayerDeck: false,
      },
      {
        id: 'none',
        z: -3.45,
        scale: 0.95,
        color: 0x0f1226,
        neon: 0x00f0ff,
        title: 'SPACE 95',
        marqueeTex: retroMarqueeTex,
        screenType: 'retro',
        twoPlayerDeck: true,
      },
    ];

    cabConfigs.forEach((cfg) => {
      const g = new THREE.Group();
      g.position.set(-4.85, 0, cfg.z);
      g.scale.setScalar(cfg.scale);

      const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.58 });
      const trimMat = new THREE.MeshBasicMaterial({ color: cfg.neon, toneMapped: false });
      const deckMat = new THREE.MeshStandardMaterial({ color: 0x14161c, metalness: 0.5, roughness: 0.35 });

      // 1. Lower cabinet base pedestal
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.95, 0.72), bodyMat);
      base.position.y = 0.475;
      base.castShadow = true;

      // 2. Upper monitor enclosure
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.92, 0.72), bodyMat);
      upper.position.set(-0.04, 1.48, 0);

      // 3. Side hull panels with authentic arcade contours
      const sideHullL = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.95, 0.035), bodyMat);
      sideHullL.position.set(0, 0.975, 0.36);
      sideHullL.castShadow = true;
      const sideHullR = sideHullL.clone();
      sideHullR.position.z = -0.36;

      // 4. Glowing T-Molding front edge trim
      const neonEdgeL = new THREE.Mesh(new THREE.BoxGeometry(0.038, 1.95, 0.035), trimMat);
      neonEdgeL.position.set(0.40, 0.975, 0.36);
      const neonEdgeR = neonEdgeL.clone();
      neonEdgeR.position.z = -0.36;

      // 5. Upper Marquee Lightbox Canopy
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.72), bodyMat);
      canopy.position.set(0.18, 1.88, 0);
      const marqueeSign = new THREE.Mesh(
        new THREE.PlaneGeometry(0.70, 0.28),
        new THREE.MeshBasicMaterial({ map: cfg.marqueeTex(), toneMapped: false }),
      );
      marqueeSign.position.set(0.365, 1.88, 0);
      marqueeSign.rotation.y = Math.PI / 2;

      // 6. Recessed Curved CRT Screen with animated attract mode
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 96;
      const ctx = c.getContext('2d')!;
      drawArcadeScreen(ctx, 128, 96, cfg.screenType, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.arcadeCanvases.push({ canvas: c, ctx, tex, type: cfg.screenType });

      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.54, 0.66),
        new THREE.MeshStandardMaterial({ color: 0x090a10, roughness: 0.85 }),
      );
      bezel.position.set(0.22, 1.44, 0);

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 0.46),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
      );
      screen.position.set(0.285, 1.44, 0);
      screen.rotation.y = Math.PI / 2;
      screen.rotation.x = -0.16; // 14-degree ergonomic CRT recline

      // 7. Slanted Control Panel Deck
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.72), deckMat);
      deck.position.set(0.38, 1.06, 0);
      deck.rotation.z = -0.15; // slanted forward

      // Joystick 1 (P1)
      const stickStem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.08, 8),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 }),
      );
      stickStem.position.set(0.42, 1.13, -0.16);
      const stickBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.034, 12, 12),
        new THREE.MeshStandardMaterial({ color: cfg.neon, roughness: 0.25 }),
      );
      stickBall.position.set(0.42, 1.17, -0.16);

      const deckElements: THREE.Object3D[] = [stickStem, stickBall];

      // Buttons setup
      if (cfg.screenType === 'ludo') {
        const bColors = [0xe63946, 0x2a9d8f, 0xe9c46a, 0x457b9d];
        bColors.forEach((bc, bIdx) => {
          const btn = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8),
            new THREE.MeshBasicMaterial({ color: bc }),
          );
          btn.position.set(0.40, 1.11, 0.02 + bIdx * 0.07);
          deckElements.push(btn);
        });
      } else if (cfg.screenType === 'dice') {
        const shakeBtn = new THREE.Mesh(
          new THREE.CylinderGeometry(0.038, 0.042, 0.025, 12),
          new THREE.MeshBasicMaterial({ color: 0xffb84a }),
        );
        shakeBtn.position.set(0.41, 1.12, 0.08);
        const callBtn = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8),
          new THREE.MeshBasicMaterial({ color: 0xff5ec4 }),
        );
        callBtn.position.set(0.41, 1.12, 0.20);
        deckElements.push(shakeBtn, callBtn);
      } else {
        const bColors = [0xff4a3a, 0x54e0ee, 0xffb84a];
        bColors.forEach((bc, bIdx) => {
          const btn = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8),
            new THREE.MeshBasicMaterial({ color: bc }),
          );
          btn.position.set(0.41, 1.12, 0.06 + bIdx * 0.08);
          deckElements.push(btn);
        });
        if (cfg.twoPlayerDeck) {
          const stem2 = stickStem.clone();
          stem2.position.z = 0.22;
          const ball2 = stickBall.clone();
          ball2.position.z = 0.22;
          deckElements.push(stem2, ball2);
        }
      }

      // 8. Dual 25¢ Coin Door on Lower Hull
      const coinDoor = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.48),
        new THREE.MeshStandardMaterial({ map: coinDoorTex(), roughness: 0.7 }),
      );
      coinDoor.position.set(0.395, 0.48, 0);
      coinDoor.rotation.y = Math.PI / 2;

      // 9. Floor Neon Underglow Disc
      const floorGlow = new THREE.Mesh(
        new THREE.CircleGeometry(0.48, 16),
        new THREE.MeshBasicMaterial({
          color: cfg.neon,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      );
      floorGlow.rotation.x = -Math.PI / 2;
      floorGlow.position.set(0.12, 0.012, 0);

      g.add(
        base,
        upper,
        canopy,
        marqueeSign,
        sideHullL,
        sideHullR,
        neonEdgeL,
        neonEdgeR,
        bezel,
        screen,
        deck,
        coinDoor,
        floorGlow,
        ...deckElements,
      );

      this.loungeDecorGroup.add(g);
    });
  }

  private _buildFireplaceAndBar(): void {
    // 1. Right-wall Brick Fireplace (x = 5.05, z = -1.25)
    const fpGroup = new THREE.Group();
    fpGroup.position.set(5.05, 0, -1.25);
    const brickMat = new THREE.MeshStandardMaterial({
      map: brickWallTex(202, [2, 2]),
      roughness: 0.85,
    });
    const mantelMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([92, 54, 28], 41, [2, 1]),
      roughness: 0.6,
    });

    // Lower hearth brick base up to mantel (y = 0..1.48)
    const lowerChimney = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.48, 1.9), brickMat);
    lowerChimney.position.set(0.15, 0.74, 0);
    const mantel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 2.1), mantelMat);
    mantel.position.set(0, 1.48, 0);

    // Upper chimney hood (added to wallEastGroup so it cuts away when East wall is foreground)
    const upperChimney = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.7, 1.7), brickMat);
    upperChimney.position.set(5.2, 2.85, -1.25);
    this.wallEastGroup.add(upperChimney);

    // Hearth dark backplate recessed at x = -0.31 so flames in front are 100% visible
    const hearthBack = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 0.92),
      new THREE.MeshBasicMaterial({ color: 0x140602 }),
    );
    hearthBack.rotation.y = -Math.PI / 2;
    hearthBack.position.set(-0.33, 0.5, 0);

    // Glowing fire logs & warm flames
    const log1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.75, 6),
      new THREE.MeshStandardMaterial({ color: 0x3b1b0c, emissive: 0x551800 }),
    );
    log1.position.set(-0.42, 0.12, 0);
    const fireOuter = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.68, 7),
      new THREE.MeshBasicMaterial({ color: 0xff6210, toneMapped: false }),
    );
    fireOuter.position.set(-0.42, 0.42, 0);
    const fireInner = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.5, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd238, toneMapped: false }),
    );
    fireInner.position.set(-0.45, 0.36, 0);

    fpGroup.add(lowerChimney, mantel, hearthBack, log1, fireOuter, fireInner);
    this.loungeDecorGroup.add(fpGroup);

    // Rising pixel fireplace embers (Strictly confined to inside the hearth and chimney flue)
    const emberCount = 36;
    const emberGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xffba4a, toneMapped: false });
    this.emberInstanced = new THREE.InstancedMesh(emberGeo, emberMat, emberCount);
    this.emberInstanced.frustumCulled = false;
    for (let i = 0; i < emberCount; i++) {
      this.emberData.push({
        x: 4.8 + (Math.random() - 0.5) * 0.22,
        y: 0.25 + Math.random() * 1.5,
        z: -1.25 + (Math.random() - 0.5) * 0.55,
        vy: 0.35 + Math.random() * 0.35,
        phase: Math.random() * 6.28,
      });
    }
    this.loungeDecorGroup.add(this.emberInstanced);

    // 2. Oak Bar Counter, Back-Bar Liquor Shelves & Stools (front-right, x = 4.15, z = 1.95)
    const barGroup = new THREE.Group();
    barGroup.position.set(4.15, 0, 1.95);
    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 1.05, 3.1),
      new THREE.MeshStandardMaterial({ map: walnutTrimTex([78, 44, 22], 51, [2, 2]), roughness: 0.65 }),
    );
    barBase.position.y = 0.525;
    barBase.castShadow = true;
    const barTop = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 3.25), mantelMat);
    barTop.position.y = 1.08;
    barGroup.add(barBase, barTop);

    // Frothy beer mugs on the counter
    for (const mz of [-0.9, -0.2, 0.65]) {
      barGroup.add(this._makeBeerMug(-0.18, 1.13, mz));
    }

    // Draft beer tap tower
    const tapTower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 0.38, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.75, roughness: 0.2 }),
    );
    tapTower.position.set(0.18, 1.32, 0.1);
    barGroup.add(tapTower);

    // Back-bar tiered liquor bottle shelves & glowing OPEN neon sign (added to wallEastGroup)
    for (const sy of [1.55, 2.05]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 2.4), mantelMat);
      shelf.position.set(5.37, sy, 1.95);
      this.wallEastGroup.add(shelf);
      const bottleColors = [0x35b25a, 0xe0493a, 0x3a74e0, 0xf2c230, 0x9b51e0, 0x54e0ee];
      for (let bi = 0; bi < 6; bi++) {
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.04, 0.22, 6),
          new THREE.MeshStandardMaterial({
            color: bottleColors[(bi + Math.round(sy * 2)) % bottleColors.length],
            roughness: 0.25,
          }),
        );
        bottle.position.set(5.33, sy + 0.13, 1.05 + bi * 0.35);
        this.wallEastGroup.add(bottle);
      }
    }

    const openSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 0.38),
      new THREE.MeshBasicMaterial({ map: openNeonTex(), toneMapped: false }),
    );
    openSign.rotation.y = -Math.PI / 2;
    openSign.position.set(5.47, 2.75, 2.15);
    this.wallEastGroup.add(openSign);

    // Barstools in front of the oak counter
    for (const sz of [-1.05, -0.35, 0.35, 1.05]) {
      const stool = this._makeBarstool();
      stool.position.set(-0.78, 0, sz);
      barGroup.add(stool);
    }
    this.loungeDecorGroup.add(barGroup);

    // 3. Corner Pixel Jukebox (x = 4.55, z = -3.35)
    const juke = new THREE.Group();
    juke.position.set(4.55, 0, -3.35);
    juke.rotation.y = -0.5;
    const jBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 1.35, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x4a2518, roughness: 0.5 }),
    );
    jBody.position.y = 0.675;
    const jArch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.375, 0.375, 0.56, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb84a, toneMapped: false }),
    );
    jArch.rotation.x = Math.PI / 2;
    jArch.position.y = 1.35;
    const jGrill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.72),
      new THREE.MeshBasicMaterial({ color: 0xff5ec4, toneMapped: false }),
    );
    jGrill.position.set(0, 0.75, 0.28);
    juke.add(jBody, jArch, jGrill);
    this.loungeDecorGroup.add(juke);
  }

  private _makeBeerMug(x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.05, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2a922, roughness: 0.25 }),
    );
    glass.position.y = 0.07;
    const foam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.058, 0.04, 8),
      new THREE.MeshStandardMaterial({ color: 0xfffdf5, roughness: 0.9 }),
    );
    foam.position.y = 0.15;
    g.add(glass, foam);
    return g;
  }

  private _makeBarstool(): THREE.Group {
    const g = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3b2312, roughness: 0.7 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x8a3b1b, roughness: 0.5 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.66, 8), legMat);
    post.position.y = 0.33;
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), seatMat);
    seat.position.y = 0.68;
    g.add(post, seat);
    return g;
  }

  // ------------------------------------------------------------------ 8-BALL POOL STATION
  private _buildPoolStation(): void {
    const g = this.poolGroup;
    g.position.copy(POOL_ORIGIN);
    this.scene.add(g);

    const W = POOL_TABLE.width;
    const D = POOL_TABLE.depth;
    const railMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([86, 48, 24], 12, [3, 1]),
      roughness: 0.45,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4a838,
      metalness: 0.75,
      roughness: 0.25,
    });
    const clothMat = new THREE.MeshStandardMaterial({
      map: feltClothTex('#128048', 303),
      roughness: 0.9,
    });

    // Cabinet & 4 turned legs
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(W + 0.16, 0.22, D + 0.16), railMat);
    cabinet.position.y = -0.12;
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    g.add(cabinet);

    for (const [lx, lz] of [
      [-W * 0.44, -D * 0.42],
      [W * 0.44, -D * 0.42],
      [-W * 0.44, D * 0.42],
      [W * 0.44, D * 0.42],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.68, 10), railMat);
      leg.position.set(lx, -0.44, lz);
      leg.castShadow = true;
      g.add(leg);
    }

    // Green baize bed
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(W, D), clothMat);
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = 0.001;
    bed.receiveShadow = true;
    g.add(bed);

    // Outer wooden rails
    const rThick = 0.11;
    const rHeight = 0.065;
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(W + rThick * 2, rHeight, rThick), railMat);
    topRail.position.set(0, rHeight / 2 - 0.01, -D / 2 - rThick / 2);
    const botRail = topRail.clone();
    botRail.position.z = D / 2 + rThick / 2;
    const leftRail = new THREE.Mesh(new THREE.BoxGeometry(rThick, rHeight, D), railMat);
    leftRail.position.set(-W / 2 - rThick / 2, rHeight / 2 - 0.01, 0);
    const rightRail = leftRail.clone();
    rightRail.position.x = W / 2 + rThick / 2;
    g.add(topRail, botRail, leftRail, rightRail);

    // Diamond mother-of-pearl sights along rails
    const pearlMat = new THREE.MeshStandardMaterial({
      color: 0xfaf8f5,
      roughness: 0.2,
      metalness: 0.1,
    });
    for (let i = 1; i <= 3; i++) {
      const u = (i / 4) * (W / 2 - 0.1);
      [-1, 1].forEach((side) => {
        const topSight = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8), pearlMat);
        topSight.position.set(side * u, rHeight / 2 + 0.012, -D / 2 - rThick / 2);
        const botSight = topSight.clone();
        botSight.position.z = D / 2 + rThick / 2;
        g.add(topSight, botSight);
      });
    }

    // 6 Pockets & brass corner plates
    POCKETS.forEach(([px, pz]) => {
      const hole = new THREE.Mesh(
        new THREE.CircleGeometry(POOL_TABLE.pocketRadius, 24),
        new THREE.MeshBasicMaterial({ color: 0x050507 }),
      );
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(px, 0.003, pz);
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(POOL_TABLE.pocketRadius * 0.95, POOL_TABLE.pocketRadius * 1.32, 24),
        brassMat,
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(px, 0.035, pz);
      g.add(hole, rim);
    });

    // Overhead green-shaded brass billiard lamp
    const lampGrp = new THREE.Group();
    lampGrp.position.set(0, 1.85, 0);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.35, 12), brassMat);
    bar.rotation.z = Math.PI / 2;
    lampGrp.add(bar);
    for (const sx of [-0.5, 0, 0.5]) {
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.18, 18, 1, true),
        new THREE.MeshStandardMaterial({
          color: 0x117a43,
          roughness: 0.35,
          side: THREE.DoubleSide,
        }),
      );
      shade.position.set(sx, -0.08, 0);
      lampGrp.add(shade);
    }
    g.add(lampGrp);

    // 16 High-Gloss Lacquered Billiard Ball Meshes (MeshPhysicalMaterial with clearcoat!)
    const ballGeo = new THREE.SphereGeometry(POOL_TABLE.ballRadius, 32, 24);
    for (let id = 0; id < 16; id++) {
      const mat = new THREE.MeshPhysicalMaterial({
        map: poolBallTex(id),
        roughness: 0.08,
        metalness: 0.04,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
      });
      const mesh = new THREE.Mesh(ballGeo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      this.poolBallMeshes.push(mesh);
    }

    // High-Detail Interactive Cue Stick with Irish linen grip & chalked tip
    const cueShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.01, 1.1, 12),
      new THREE.MeshStandardMaterial({ color: 0xedd6b4, roughness: 0.3 }),
    );
    cueShaft.rotation.z = Math.PI / 2;
    cueShaft.position.x = -0.62;

    const cueGrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.0125, 0.38, 12),
      new THREE.MeshStandardMaterial({ color: 0x1a1b22, roughness: 0.7 }),
    );
    cueGrip.rotation.z = Math.PI / 2;
    cueGrip.position.x = -1.22;

    const cueButt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0125, 0.014, 0.22, 12),
      new THREE.MeshStandardMaterial({ color: 0x4a2c16, roughness: 0.4 }),
    );
    cueButt.rotation.z = Math.PI / 2;
    cueButt.position.x = -1.52;

    const cueTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0048, 0.005, 0.02, 12),
      new THREE.MeshStandardMaterial({ color: 0x2979ff, roughness: 0.9 }),
    );
    cueTip.rotation.z = Math.PI / 2;
    cueTip.position.x = -0.06;

    this.poolCueGroup.add(cueShaft, cueGrip, cueButt, cueTip);
    g.add(this.poolCueGroup);

    // Aiming Trajectory Guidelines & Ghost Ball
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x54e0ee,
      transparent: true,
      opacity: 0.85,
    });
    const targetMat = new THREE.LineBasicMaterial({
      color: 0xffb84a,
      transparent: true,
      opacity: 0.9,
    });
    this.poolGuideLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      lineMat,
    );
    this.poolTargetLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      targetMat,
    );
    this.poolGhostBall = new THREE.Mesh(
      new THREE.RingGeometry(POOL_TABLE.ballRadius * 0.85, POOL_TABLE.ballRadius * 1.05, 28),
      new THREE.MeshBasicMaterial({ color: 0x54e0ee, side: THREE.DoubleSide }),
    );
    this.poolGhostBall.rotation.x = -Math.PI / 2;
    g.add(this.poolGuideLine, this.poolTargetLine, this.poolGhostBall);
  }

  // Raycast station detection for click-to-play seamless navigation
  pickStationAt(ndc: { x: number; y: number }): StationId | null {
    _ndc.set(ndc.x, ndc.y);
    _raycaster.setFromCamera(_ndc, this.camera);
    const stationTargets: Array<{ id: StationId; obj: THREE.Object3D }> = [
      { id: 'pool', obj: this.poolGroup },
      { id: 'ludo', obj: this.ludoGroup },
      { id: 'darts', obj: this.dartsGroup },
      { id: 'dice', obj: this.diceTableGroup },
    ];
    for (const st of stationTargets) {
      const hits = _raycaster.intersectObject(st.obj, true);
      if (hits.length > 0) return st.id;
    }
    // Also check floor distance to station hotspots
    const floorPoint = this.pickFloorPoint(ndc);
    if (floorPoint) {
      for (const hs of STATION_HOTSPOTS) {
        if (Math.hypot(floorPoint.x - hs.x, floorPoint.z - hs.z) < hs.radius * 0.9) {
          return hs.id;
        }
      }
    }
    return null;
  }

  // Update pointer hover affordance (pulsing floor ring + billboard cursor)
  updatePointerHover(ndc: { x: number; y: number }): StationId {
    const st = this.pickStationAt(ndc);
    this.hoveredStation = st || 'none';
    if (this.stationHoverRing) {
      if (st && st !== 'none') {
        const hs = STATION_HOTSPOTS.find((h) => h.id === st);
        if (hs) {
          this.stationHoverRing.position.set(hs.x, 0.015, hs.z);
          this.stationHoverRing.visible = true;
          (this.stationHoverRing.material as THREE.MeshBasicMaterial).opacity =
            0.55 + Math.sin(this.time * 5.5) * 0.3;
        }
      } else {
        this.stationHoverRing.visible = false;
      }
    }
    return this.hoveredStation;
  }

  // Raycast floor position for click-to-move
  pickFloorPoint(ndc: { x: number; y: number }): { x: number; z: number } | null {
    _ndc.set(ndc.x, ndc.y);
    _raycaster.setFromCamera(_ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (_raycaster.ray.intersectPlane(plane, hit)) {
      const cx = Math.max(-4.9, Math.min(4.9, hit.x));
      const cz = Math.max(-3.6, Math.min(3.6, hit.z));
      return { x: cx, z: cz };
    }
    return null;
  }

  setMoveTarget(x: number, z: number): void {
    const path = findLoungePath(this.player.x, this.player.z, x, z);
    this.playerWaypoints = path;
    const finalTarget = path.length > 0 ? path[path.length - 1] : { x, z };
    this.playerTarget = finalTarget;
    if (this.moveTargetRing) {
      this.moveTargetRing.position.set(finalTarget.x, 0.014, finalTarget.z);
      this.moveTargetRing.scale.setScalar(1);
      (this.moveTargetRing.material as THREE.MeshBasicMaterial).opacity = 0.9;
    }
  }

  clearMoveTarget(): void {
    this.playerTarget = null;
    this.playerWaypoints = [];
    if (this.moveTargetRing) {
      (this.moveTargetRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }

  syncPoolState(
    balls: BallPose[],
    cue: { yaw: number; power: number; spinX: number; spinY: number },
    guideline: AimGuideline | null,
    showAim: boolean,
  ): void {
    balls.forEach((b, idx) => {
      const m = this.poolBallMeshes[idx];
      if (!m) return;
      m.visible = !b.pocketed;
      if (!b.pocketed) {
        m.position.set(b.x, b.y, b.z);
        m.quaternion.set(b.qx, b.qy, b.qz, b.qw);
      }
    });

    const cb = balls[0];
    if (cb && !cb.pocketed && showAim && guideline) {
      this.poolCueGroup.visible = true;
      const pullBack = 0.04 + cue.power * 0.14;
      this.poolCueGroup.position.set(
        cb.x - Math.cos(cue.yaw) * pullBack,
        POOL_TABLE.ballRadius + cue.spinY * 0.012,
        cb.z - Math.sin(cue.yaw) * pullBack,
      );
      this.poolCueGroup.rotation.y = -cue.yaw;
      this.poolCueGroup.rotation.z = -0.07;

      const y = POOL_TABLE.ballRadius;
      this.poolGuideLine.visible = true;
      this.poolGuideLine.geometry.setFromPoints([
        new THREE.Vector3(guideline.cueStart[0], y, guideline.cueStart[1]),
        new THREE.Vector3(guideline.cueEnd[0], y, guideline.cueEnd[1]),
      ]);

      if (guideline.ghostPos && guideline.targetDir) {
        this.poolGhostBall.visible = true;
        this.poolGhostBall.position.set(guideline.ghostPos[0], 0.005, guideline.ghostPos[1]);
        this.poolTargetLine.visible = true;
        this.poolTargetLine.geometry.setFromPoints([
          new THREE.Vector3(guideline.ghostPos[0], y, guideline.ghostPos[1]),
          new THREE.Vector3(
            guideline.ghostPos[0] + guideline.targetDir[0] * 0.45,
            y,
            guideline.ghostPos[1] + guideline.targetDir[1] * 0.45,
          ),
        ]);
      } else {
        this.poolGhostBall.visible = false;
        this.poolTargetLine.visible = false;
      }
    } else {
      this.poolCueGroup.visible = false;
      this.poolGuideLine.visible = false;
      this.poolTargetLine.visible = false;
      this.poolGhostBall.visible = false;
    }
  }

  // ------------------------------------------------------------------ LUDO · CLUB No.9 STATION
  private _buildLudoStation(): void {
    const root = this.ludoGroup;
    root.position.copy(LUDO_ORIGIN);
    this.scene.add(root);

    // Green-felt tabletop supporting the Ludo board + Dice Tray (matching front-left table in reference image!)
    const tableWood = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([82, 48, 24], 15, [3, 2]),
      roughness: 0.65,
    });
    const tableFelt = new THREE.MeshStandardMaterial({
      map: feltClothTex('#117a43', 404),
      roughness: 0.92,
    });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.09, 1.24), tableWood);
    tableTop.position.set(0.06, -0.045, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    root.add(tableTop);

    const tableFeltPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.08), tableFelt);
    tableFeltPlane.rotation.x = -Math.PI / 2;
    tableFeltPlane.position.set(0.06, 0.002, 0);
    tableFeltPlane.receiveShadow = true;
    root.add(tableFeltPlane);

    for (const [lx, lz] of [
      [-0.84, -0.48],
      [0.94, -0.48],
      [-0.84, 0.48],
      [0.94, 0.48],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), tableWood);
      leg.position.set(lx, -0.39, lz);
      root.add(leg);
    }

    // 1. 15x15 Ludo Board (at local LUDO_LAYOUT.boardX)
    const bGrp = new THREE.Group();
    bGrp.position.set(LUDO_LAYOUT.boardX, 0, 0);
    root.add(bGrp);

    const rimMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([62, 36, 18], 21, [3, 1]),
      roughness: 0.58,
    });
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(LUDO_BOARD_SIZE + 0.07, LUDO_BOARD_Y, LUDO_BOARD_SIZE + 0.07),
      rimMat,
    );
    slab.position.y = LUDO_BOARD_Y / 2;
    slab.castShadow = true;
    slab.receiveShadow = true;
    bGrp.add(slab);

    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(LUDO_BOARD_SIZE, LUDO_BOARD_SIZE),
      new THREE.MeshStandardMaterial({ map: ludoBoardTex(), roughness: 0.85 }),
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = LUDO_BOARD_Y + 0.001;
    face.receiveShadow = true;
    bGrp.add(face);

    const e = LUDO_BOARD_SIZE / 2 + 0.017;
    const lip = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), rimMat);
      m.position.set(x, LUDO_BOARD_Y + 0.004, z);
      bGrp.add(m);
    };
    lip(LUDO_BOARD_SIZE + 0.07, 0.02, 0, -e);
    lip(LUDO_BOARD_SIZE + 0.07, 0.02, 0, e);
    lip(0.02, LUDO_BOARD_SIZE, -e, 0);
    lip(0.02, LUDO_BOARD_SIZE, e, 0);

    // 2. 16 LatheGeometry + SphereGeometry Ludo Pawns (exact silhouette from render.js)
    const pts = [
      [0, 0],
      [0.0165, 0],
      [0.0165, 0.004],
      [0.0125, 0.0085],
      [0.0085, 0.02],
      [0.0072, 0.03],
      [0.0115, 0.033],
      [0.0085, 0.0365],
      [0, 0.0365],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const bodyGeo = new THREE.LatheGeometry(pts, 12);
    const headGeo = new THREE.SphereGeometry(0.0105, 10, 8);

    for (let c = 0; c < 4; c++) {
      const mat = new THREE.MeshStandardMaterial({
        color: COLOR_HEX[c],
        roughness: 0.35,
        metalness: 0.08,
      });
      const rim = new THREE.MeshBasicMaterial({
        color: 0xffd25a,
        toneMapped: false,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      });
      for (let t = 0; t < 4; t++) {
        const grp = new THREE.Group();
        const m = new THREE.Group();
        const b = new THREE.Mesh(bodyGeo, mat);
        const h = new THREE.Mesh(headGeo, mat);
        h.position.y = 0.0435;
        b.castShadow = true;
        h.castShadow = true;
        m.add(b, h);
        grp.add(m);

        const ring = new THREE.Mesh(new THREE.RingGeometry(0.0195, 0.0255, 24), rim);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.0015;
        ring.visible = false;
        grp.add(ring);

        bGrp.add(grp);
        const [ux, uz] = yardSlot(c, t);
        const pw: PawnActor = {
          c,
          t,
          grp,
          m,
          ring,
          p: -1,
          x: bx(ux),
          z: bx(uz),
          y: 0,
          sc: 1,
          anim: null,
          sel: false,
          hover: false,
          phase: Math.random() * 6,
        };
        b.userData.pawn = pw;
        h.userData.pawn = pw;
        this.ludoPawns.push(pw);
      }
    }
    this.ludoPawnMeshes = this.ludoPawns.flatMap((p) => p.m.children);

    // Destination square markers
    const hintMat = new THREE.MeshBasicMaterial({
      color: 0xffd25a,
      toneMapped: false,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const hm = new THREE.Mesh(
        new THREE.RingGeometry(0.014, 0.021, 4, 1, Math.PI / 4),
        hintMat,
      );
      hm.rotation.x = -Math.PI / 2;
      hm.visible = false;
      bGrp.add(hm);
      this.ludoHints.push(hm);
    }

    // 3. Felt Dice Tray (at local LUDO_LAYOUT.trayX)
    const T = TRAY;
    const tGrp = this.ludoTrayGroup;
    tGrp.position.set(LUDO_LAYOUT.trayX, 0, 0);
    root.add(tGrp);

    const cz = (T.z0 + T.z1) / 2;
    const dz = T.z1 - T.z0;
    this.ludoFeltMat = new THREE.MeshStandardMaterial({ color: 0x0f7a45, roughness: 0.96 });
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(T.hx * 2 + 0.06, dz + 0.06), this.ludoFeltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.set(0, 0.004, cz);
    felt.receiveShadow = true;
    tGrp.add(felt);

    const trayRailMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([70, 40, 20], 33, [2, 1]),
      roughness: 0.55,
    });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const bm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), trayRailMat);
      bm.position.set(x, y, z);
      bm.castShadow = true;
      bm.receiveShadow = true;
      tGrp.add(bm);
    };
    box(T.hx * 2 + 0.14, 0.05, 0.035, 0, 0.025, T.z0 - 0.0275);
    box(T.hx * 2 + 0.14, 0.05, 0.035, 0, 0.025, T.z1 + 0.0275);
    box(0.035, 0.05, dz + 0.09, -T.hx - 0.0475, 0.025, cz);
    box(0.035, 0.05, dz + 0.09, T.hx + 0.0475, 0.025, cz);

    this.ludoTurnBar = new THREE.Mesh(
      new THREE.BoxGeometry(T.hx * 2 + 0.1, 0.006, 0.008),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    );
    this.ludoTurnBar.position.set(0, 0.052, T.z1 + 0.04);
    tGrp.add(this.ludoTurnBar);

    const nums = [2, 5, 1, 6, 3, 4];
    const dieMats = nums.map(
      (n) => new THREE.MeshStandardMaterial({ map: diePipTex(n), roughness: 0.28 }),
    );
    this.ludoDieMesh = new THREE.Mesh(
      new RoundedBoxGeometry(T.half * 2, T.half * 2, T.half * 2, 3, 0.007),
      dieMats,
    );
    this.ludoDieMesh.castShadow = true;
    tGrp.add(this.ludoDieMesh);

    // 4. Composite 5-Part 3D Leather & Brass Shaker Cup for Ludo Dice Rolling
    const cupGrp = this.ludoCupGroup;
    const cupLeatherMat = new THREE.MeshStandardMaterial({
      color: 0x3a1c0e,
      roughness: 0.52,
      metalness: 0.08,
    });
    const cupBrassMat = new THREE.MeshStandardMaterial({
      color: 0xd4a838,
      metalness: 0.78,
      roughness: 0.24,
    });
    const cupInnerMat = new THREE.MeshStandardMaterial({
      color: 0x0d1a12,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });

    const cupShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.064, 0.052, 0.14, 16, 1, true),
      cupLeatherMat,
    );
    const cupInterior = new THREE.Mesh(
      new THREE.CylinderGeometry(0.059, 0.047, 0.134, 16, 1, true),
      cupInnerMat,
    );
    const cupBottom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.054, 0.016, 16),
      cupBrassMat,
    );
    cupBottom.position.y = -0.066;

    const cupLip = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.0055, 10, 20), cupBrassMat);
    cupLip.rotation.x = Math.PI / 2;
    cupLip.position.y = 0.07;

    const cupBand1 = new THREE.Mesh(new THREE.TorusGeometry(0.059, 0.0038, 8, 20), cupBrassMat);
    cupBand1.rotation.x = Math.PI / 2;
    cupBand1.position.y = 0.015;

    const cupBand2 = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.0038, 8, 20), cupBrassMat);
    cupBand2.rotation.x = Math.PI / 2;
    cupBand2.position.y = -0.028;

    cupShell.castShadow = true;
    cupGrp.add(cupShell, cupInterior, cupBottom, cupLip, cupBand1, cupBand2);
    cupGrp.position.set(0.145, 0.074, T.z1 + 0.048);
    tGrp.add(cupGrp);

    this.setLudoDie(null);
    this._applyLudoPawns(0, true);
  }

  ludoPawn(c: number, t: number): PawnActor {
    return this.ludoPawns[c * 4 + t];
  }

  ludoHomeSpot(c: number, t: number): [number, number] {
    const dir = [
      [-1, 0],
      [0, -1],
      [1, 0],
      [0, 1],
    ][c];
    const perp = [-dir[1], dir[0]];
    return [
      7.5 + dir[0] * 0.95 + perp[0] * (t - 1.5) * 0.3,
      7.5 + dir[1] * 0.95 + perp[1] * (t - 1.5) * 0.3,
    ];
  }

  ludoUnitPos(c: number, t: number, p: number): [number, number] {
    if (p < 0) return yardSlot(c, t);
    if (p >= P_HOME) return this.ludoHomeSpot(c, t);
    const [x, y] = cellOf(c, p);
    return [x + 0.5, y + 0.5];
  }

  private _ludoUnitPosKey(pw: PawnActor): number {
    const [x, y] = this.ludoUnitPos(pw.c, pw.t, pw.p);
    return x * 100 + y;
  }

  private _ludoTargetFor(pw: PawnActor): { x: number; z: number; s: number } {
    const [ux, uz] = this.ludoUnitPos(pw.c, pw.t, pw.p);
    if (pw.p < 0 || pw.p >= P_HOME) return { x: bx(ux), z: bx(uz), s: 1 };
    const mates = this.ludoPawns.filter((o) => !o.anim && o.p === pw.p && o.c === pw.c);
    const others = this.ludoPawns.filter(
      (o) =>
        !o.anim &&
        o.p >= 0 &&
        o.p < P_HOME &&
        (o.c !== pw.c || o.p !== pw.p) &&
        Math.abs(this._ludoUnitPosKey(o) - this._ludoUnitPosKey(pw)) < 1e-9,
    );
    const group = [...mates, ...others].sort((a, b) => a.c * 4 + a.t - (b.c * 4 + b.t));
    const n = group.length;
    const i = Math.max(0, group.indexOf(pw));
    const o =
      n <= 1
        ? [0, 0]
        : n === 2
          ? [(i ? 1 : -1) * 0.2, 0]
          : [
              [-0.2, -0.17],
              [0.2, -0.17],
              [-0.2, 0.2],
              [0.2, 0.2],
            ][i % 4];
    return { x: bx(ux + o[0]), z: bx(uz + o[1]), s: n > 1 ? 0.82 : 1 };
  }

  setAllLudoP(tokens: number[][], snap = true): void {
    tokens.forEach((row, c) =>
      row.forEach((p, t) => {
        const pw = this.ludoPawn(c, t);
        pw.p = p;
        pw.anim = null;
      }),
    );
    this._applyLudoPawns(0, snap);
  }

  setLudoActiveColors(colors: number[]): void {
    this.ludoPawns.forEach((pw) => {
      pw.grp.visible = colors.includes(pw.c);
    });
  }

  moveLudoPawn(c: number, t: number, from: number, to: number): Promise<void> {
    const pw = this.ludoPawn(c, t);
    const pts: Array<[number, number]> = [];
    if (from < 0) pts.push(this.ludoUnitPos(c, t, 0));
    else for (let p = from + 1; p <= to; p++) pts.push(this.ludoUnitPos(c, t, p));
    const legs: Array<{ a: [number, number]; b: [number, number] }> = [];
    let cur: [number, number] = [pw.x, pw.z];
    for (const [ux, uz] of pts) {
      const nx = bx(ux);
      const nz = bx(uz);
      legs.push({ a: cur, b: [nx, nz] });
      cur = [nx, nz];
    }
    return new Promise((res) => {
      pw.anim = {
        kind: 'hop',
        legs,
        i: 0,
        t: 0,
        dur: from < 0 ? 0.42 : 0.17,
        done: () => {
          pw.p = to;
          res();
        },
        step: 0,
      };
      pw.p = from;
    });
  }

  sendLudoHome(c: number, t: number): Promise<void> {
    const pw = this.ludoPawn(c, t);
    const [ux, uz] = yardSlot(c, t);
    return new Promise((res) => {
      pw.anim = {
        kind: 'fly',
        a: [pw.x, pw.z],
        b: [bx(ux), bx(uz)],
        i: 0,
        t: 0,
        dur: 0.6,
        done: () => {
          pw.p = -1;
          res();
        },
        step: 0,
      };
    });
  }

  setLudoSelectable(list: Array<{ color: number; token: number; to: number }>): void {
    this.ludoPawns.forEach((pw) => {
      pw.sel = false;
    });
    this.ludoHints.forEach((h) => {
      h.visible = false;
    });
    list.forEach((m, i) => {
      this.ludoPawn(m.color, m.token).sel = true;
      const h = this.ludoHints[i];
      if (!h) return;
      const [ux, uz] = this.ludoUnitPos(m.color, m.token, m.to);
      h.position.set(bx(ux), LUDO_BOARD_Y + 0.003, bx(uz));
      h.visible = true;
    });
  }

  setLudoHover(c: number, t: number): void {
    this.ludoPawns.forEach((pw) => {
      pw.hover = pw.c === c && pw.t === t;
    });
  }

  setLudoDie(s: DieSnapshot | null): void {
    this.lastDieSnap = s;
    const d = this.ludoDieMesh;
    if (!d) return;
    if (this.ludoManualShake.active || s?.phase === 'shaking') {
      // Die is tucked inside the vigorously shaking cup before being thrown out
      d.visible = false;
      return;
    }
    d.visible = true;
    if (!s) {
      const q = quatFaceUp(6, 0.3);
      d.position.set(TRAY.rest.x, TRAY.half, TRAY.rest.z);
      d.quaternion.set(q.x, q.y, q.z, q.w);
      return;
    }
    d.position.set(s.x, s.y, s.z);
    d.quaternion.set(s.qx, s.qy, s.qz, s.qw);
  }

  setLudoTurnColor(c: number): void {
    const col = new THREE.Color(COLOR_HEX[c]);
    (this.ludoTurnBar.material as THREE.MeshBasicMaterial).color.copy(col);
    this.ludoFeltTarget = new THREE.Color(0x0f7a45).lerp(col, 0.08);
  }

  ludoTrayWorld(x: number, y: number, z: number): THREE.Vector3 {
    this.ludoTrayGroup.updateWorldMatrix(true, false);
    return this.ludoTrayGroup.localToWorld(new THREE.Vector3(x, y, z));
  }

  pickLudoPawn(ndc: { x: number; y: number }): PawnActor | null {
    _ndc.set(ndc.x, ndc.y);
    _raycaster.setFromCamera(_ndc, this.camera);
    const hit = _raycaster.intersectObjects(
      this.ludoPawnMeshes.filter((m) => m.parent?.parent?.visible),
      false,
    )[0];
    return hit ? (hit.object.userData.pawn as PawnActor) : null;
  }

  private _applyLudoPawns(dt: number, snap = false): void {
    const k = 1 - Math.exp(-dt * 16 * this.speed);
    for (const pw of this.ludoPawns) {
      const bobbing = pw.sel ? Math.abs(Math.sin(this.time * 7 + pw.phase)) * 0.012 : 0;
      const ty = LUDO_BOARD_Y;
      const a = pw.anim;
      if (a) {
        a.t += dt * this.speed;
        if (a.kind === 'hop' && a.legs) {
          const leg = a.legs[a.i];
          const u = Math.min(1, a.t / a.dur);
          const e = u * u * (3 - 2 * u);
          pw.x = leg.a[0] + (leg.b[0] - leg.a[0]) * e;
          pw.z = leg.a[1] + (leg.b[1] - leg.a[1]) * e;
          pw.y = Math.sin(u * Math.PI) * (a.dur > 0.3 ? 0.07 : 0.028);
          if (u >= 1) {
            this.onHop?.(a.step++, pw);
            a.i++;
            a.t = 0;
            if (a.i >= a.legs.length) {
              pw.anim = null;
              pw.y = 0;
              a.done();
            }
          }
        } else if (a.kind === 'fly' && a.a && a.b) {
          const u = Math.min(1, a.t / a.dur);
          const e = u * u * (3 - 2 * u);
          pw.x = a.a[0] + (a.b[0] - a.a[0]) * e;
          pw.z = a.a[1] + (a.b[1] - a.a[1]) * e;
          pw.y = Math.sin(u * Math.PI) * 0.16;
          pw.m.rotation.z = Math.sin(u * Math.PI * 4) * 0.6 * (1 - u);
          if (u >= 1) {
            pw.anim = null;
            pw.y = 0;
            pw.m.rotation.z = 0;
            a.done();
            this.onLand?.(pw);
          }
        }
      } else {
        const tg = this._ludoTargetFor(pw);
        if (snap) {
          pw.x = tg.x;
          pw.z = tg.z;
        } else {
          pw.x += (tg.x - pw.x) * k;
          pw.z += (tg.z - pw.z) * k;
        }
        pw.y *= snap ? 0 : 1 - k;
        pw.sc = tg.s;
      }
      const s = (pw.sc || 1) * (pw.hover ? 1.14 : 1);
      pw.grp.position.set(pw.x, ty + pw.y, pw.z);
      pw.m.position.y = bobbing;
      pw.m.scale.setScalar(s);
      pw.ring.visible = pw.sel;
      if (pw.sel) {
        const q = 1 + Math.sin(this.time * 7 + pw.phase) * 0.12;
        pw.ring.scale.setScalar(q);
        pw.ring.position.y = 0.0015 - pw.y;
      }
    }
  }

  // ------------------------------------------------------------------ DICE CUP STATION
  private _buildDiceCupStation(): void {
    const g = this.diceTableGroup;
    g.position.copy(DICE_ORIGIN);
    this.scene.add(g);

    const woodMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([78, 44, 22], 29, [2, 2]),
      roughness: 0.6,
    });
    const feltMat = new THREE.MeshStandardMaterial({
      map: feltClothTex('#138249', 505),
      roughness: 0.9,
    });

    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 16), woodMat);
    top.position.y = -0.04;
    const felt = new THREE.Mesh(new THREE.CircleGeometry(0.39, 16), feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.002;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 0.72, 10), woodMat);
    ped.position.y = -0.4;
    g.add(top, felt, ped);

    // Leather Dice Shaker Cup
    this.cupMesh = new THREE.Group();
    const cupBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.105, 0.19, 14),
      new THREE.MeshStandardMaterial({ color: 0x3b1f10, roughness: 0.55 }),
    );
    cupBody.position.y = 0.095;
    const cupRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.095, 0.008, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xd4a838, metalness: 0.7, roughness: 0.3 }),
    );
    cupRim.rotation.x = Math.PI / 2;
    cupRim.position.y = 0.14;
    this.cupMesh.add(cupBody, cupRim);
    g.add(this.cupMesh);

    const nums = [2, 5, 1, 6, 3, 4];
    const dieMats = nums.map(
      (n) => new THREE.MeshStandardMaterial({ map: diePipTex(n), roughness: 0.3 }),
    );
    const dieGeo = new RoundedBoxGeometry(0.032, 0.032, 0.032, 2, 0.004);
    for (let i = 0; i < 5; i++) {
      const dm = new THREE.Mesh(dieGeo, dieMats);
      dm.castShadow = true;
      g.add(dm);
      this.cupDiceMeshes.push(dm);
    }
  }

  syncDiceCupState(dice: CupDiePose[], cupLifted: boolean): void {
    dice.forEach((d, idx) => {
      const m = this.cupDiceMeshes[idx];
      if (!m) return;
      m.position.set(d.x, d.y, d.z);
      m.quaternion.set(d.q.x, d.q.y, d.q.z, d.q.w);
    });
    const targetY = cupLifted ? 0.24 : 0.0;
    const targetZ = cupLifted ? -0.18 : 0.0;
    this.cupMesh.position.y += (targetY - this.cupMesh.position.y) * 0.16;
    this.cupMesh.position.z += (targetZ - this.cupMesh.position.z) * 0.16;
  }

  // ------------------------------------------------------------------ PIXEL DARTS STATION
  private _buildDartsStation(): void {
    const g = this.dartsGroup;
    g.position.copy(DART_ORIGIN);
    this.scene.add(g);

    const woodMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([82, 46, 22], 61, [2, 2]),
      roughness: 0.65,
    });
    const wallBackdrop = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.2, 0.08),
      new THREE.MeshStandardMaterial({
        map: walnutTrimTex([55, 30, 16], 33, [3, 1]),
        roughness: 0.65,
      }),
    );
    wallBackdrop.position.set(0, -0.1, -0.08);
    this.dartsWallBackdrop = wallBackdrop;
    g.add(wallBackdrop);

    // Cabinet back + open scoreboard wings (matching reference image!)
    const cabBack = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.72, 0.06), woodMat);
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.68, 0.04), woodMat);
    wingL.position.set(-0.52, 0, 0.04);
    wingL.rotation.y = 0.22;
    const wingR = wingL.clone();
    wingR.position.x = 0.52;
    wingR.rotation.y = -0.22;

    const boardMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.04, 24),
      new THREE.MeshStandardMaterial({ map: dartboardTex(), roughness: 0.8 }),
    );
    boardMesh.rotation.x = Math.PI / 2;
    boardMesh.rotation.y = Math.PI / 2;
    boardMesh.position.z = 0.04;
    g.add(cabBack, wingL, wingR, boardMesh);

    // First-person pixel hand + dart rig (visible in 'darts' station mode)
    this.fpsDartHand = this._makeDartMesh(0xff5a4a);
    this.fpsDartHand.scale.setScalar(0.72);
    g.add(this.fpsDartHand);

    this.npcFlyDart = this._makeDartMesh(0x54e0ee);
    g.add(this.npcFlyDart);
  }

  private _makeDartMesh(flightColor = 0xff5a4a): THREE.Group {
    const d = new THREE.Group();
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.004, 0.045, 8),
      new THREE.MeshStandardMaterial({ color: 0xdadce0, metalness: 0.85, roughness: 0.2 }),
    );
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.022;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0065, 0.005, 0.065, 10),
      new THREE.MeshStandardMaterial({ color: 0xd4a838, metalness: 0.75, roughness: 0.28 }),
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.032;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.004, 0.035, 8),
      new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 0.5 }),
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.072;
    const finMat = new THREE.MeshStandardMaterial({
      color: flightColor,
      roughness: 0.45,
      side: THREE.DoubleSide,
    });
    const finH = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.002, 0.038), finMat);
    finH.position.z = 0.095;
    const finV = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.034, 0.038), finMat);
    finV.position.z = 0.095;
    d.add(tip, barrel, shaft, finH, finV);
    return d;
  }

  syncDartsState(
    thrown: ThrownDart[],
    aim: [number, number],
    activeInDarts: boolean,
  ): void {
    while (this.stuckDartMeshes.length < thrown.length) {
      const dm = this._makeDartMesh(
        this.stuckDartMeshes.length % 2 === 0 ? 0xff5a4a : 0x54e0ee,
      );
      this.dartsGroup.add(dm);
      this.stuckDartMeshes.push(dm);
    }
    this.stuckDartMeshes.forEach((dm, i) => {
      const td = thrown[i];
      if (!td) {
        dm.visible = false;
        return;
      }
      dm.visible = true;
      dm.position.set(td.x, td.y, 0.065);
      dm.rotation.set(0.08, 0, 0);
    });

    this.fpsDartHand.visible = activeInDarts;
    if (activeInDarts) {
      const swayX = Math.sin(this.time * 2.7) * 0.008;
      const swayY = Math.cos(this.time * 3.4) * 0.008;
      this.fpsDartHand.position.set(
        aim[0] * 0.55 + swayX + 0.14,
        aim[1] * 0.55 + swayY - 0.15,
        0.44,
      );
      // Point tip (-Z) toward aimed target on the dartboard
      this.fpsDartHand.rotation.set(
        0.26 + aim[1] * 0.45,
        0.28 - aim[0] * 0.45,
        Math.sin(this.time * 2.1) * 0.04,
      );
    }
  }

  // ------------------------------------------------------------------ COMPOSITE 3D CHARACTERS & NPCs
  private _makeCharacter(
    shirtHex: number,
    hairHex: number,
    pantsHex = 0x26354d,
    prop: 'none' | 'cue' | 'mug' | 'dart' = 'none',
  ): { grp: THREE.Group; armR: THREE.Object3D } {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0be95, roughness: 0.75 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsHex, roughness: 0.85 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairHex, roughness: 0.9 });

    // Legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), pantsMat);
    legL.position.set(-0.09, 0.21, 0);
    const legR = legL.clone();
    legR.position.x = 0.09;

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.2), shirtMat);
    torso.position.y = 0.64;
    torso.castShadow = true;

    // Head + Hair
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skinMat);
    head.position.y = 1.02;
    head.castShadow = true;
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.28), hairMat);
    hair.position.set(0, 1.14, -0.01);

    // Arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.38, 0.11), shirtMat);
    armL.position.set(-0.23, 0.64, 0);
    const armR = new THREE.Group();
    armR.position.set(0.23, 0.8, 0);
    const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.38, 0.11), shirtMat);
    armRMesh.position.y = -0.16;
    armR.add(armRMesh);

    if (prop === 'cue') {
      const cue = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.016, 1.15, 6),
        new THREE.MeshStandardMaterial({ color: 0xd9b382 }),
      );
      cue.position.set(0.06, -0.04, 0.05);
      cue.rotation.x = 0.1;
      armR.add(cue);
    } else if (prop === 'mug') {
      const mug = this._makeBeerMug(0, -0.26, 0.14);
      mug.scale.setScalar(0.85);
      armR.add(mug);
    } else if (prop === 'dart') {
      const dm = this._makeDartMesh(0xff5a4a);
      dm.position.set(0, -0.24, 0.14);
      armR.add(dm);
    }

    // Soft ground contact shadow disc
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.26, 12),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;

    g.add(shadow, legL, legR, torso, head, hair, armL, armR);
    return { grp: g, armR };
  }

  loadVrmAvatar(url: string): Promise<VRM | null> {
    if (this.isHeadless) return Promise.resolve(null);
    this.vrmLoading = true;

    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      loader.load(
        url,
        (gltf) => {
          const vrm = gltf.userData.vrm as VRM;
          if (!vrm) {
            console.warn('VRM plugin did not return VRM instance');
            this.vrmLoading = false;
            resolve(null);
            return;
          }

          // If previous VRM exists, clean up
          if (this.vrmPlayer?.scene) {
            this.player.grp.remove(this.vrmPlayer.scene);
            VRMUtils.deepDispose(this.vrmPlayer.scene);
          }

          this.vrmPlayer = vrm;
          this.vrmLoaded = true;
          this.vrmLoading = false;

          // Rotate VRM 0.x models to standard forward orientation (+Z)
          VRMUtils.rotateVRM0(vrm);

          // Configure shadows on all meshes
          vrm.scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });

          // Proportional scale to fit lounge tables and bar stools (~1.44m tall)
          const vrmScale = 0.82;
          vrm.scene.scale.setScalar(vrmScale);

          // Contact shadow disc on floor
          const vrmShadow = new THREE.Mesh(
            new THREE.CircleGeometry(0.3, 16),
            new THREE.MeshBasicMaterial({
              color: 0x000000,
              transparent: true,
              opacity: 0.38,
              depthWrite: false,
            }),
          );
          vrmShadow.rotation.x = -Math.PI / 2;
          vrmShadow.position.y = 0.012;
          vrm.scene.add(vrmShadow);

          // Attach Frothy Beer Mug to Right Hand
          const rightHand = vrm.humanoid?.getNormalizedBoneNode('rightHand');
          if (rightHand) {
            const vrmMug = this._makeBeerMug(0.02, -0.05, 0.07);
            vrmMug.scale.setScalar(0.7);
            vrmMug.rotation.set(0.2, 0.4, 0);
            rightHand.add(vrmMug);
            this.vrmMugMesh = vrmMug;
          }

          this.player.vrmScene = vrm.scene;
          this.player.grp.add(vrm.scene);
          vrm.scene.visible = true;

          resolve(vrm);
        },
        undefined,
        (err) => {
          console.error('Error loading VRM model:', err);
          this.vrmLoading = false;
          resolve(null);
        },
      );
    });
  }

  private _updateVrmAnimation(dt: number, isMoving: boolean): void {
    if (!this.vrmPlayer) return;

    // 1. Update spring bones (physics for hair, accessories, clothes) & lookAt
    this.vrmPlayer.update(dt);

    const h = this.vrmPlayer.humanoid;
    if (!h) return;

    const leftUpperLeg = h.getNormalizedBoneNode('leftUpperLeg');
    const rightUpperLeg = h.getNormalizedBoneNode('rightUpperLeg');
    const leftLowerLeg = h.getNormalizedBoneNode('leftLowerLeg');
    const rightLowerLeg = h.getNormalizedBoneNode('rightLowerLeg');
    const leftUpperArm = h.getNormalizedBoneNode('leftUpperArm');
    const rightUpperArm = h.getNormalizedBoneNode('rightUpperArm');
    const leftLowerArm = h.getNormalizedBoneNode('leftLowerArm');
    const rightLowerArm = h.getNormalizedBoneNode('rightLowerArm');
    const spine = h.getNormalizedBoneNode('spine');
    const chest = h.getNormalizedBoneNode('chest');
    const hips = h.getNormalizedBoneNode('hips');
    const head = h.getNormalizedBoneNode('head');

    // Natural base stance: relaxed arms lowered along torso sides
    const baseLArmZ = 1.25;
    const baseRArmZ = -1.25;

    // Toast clink progression
    const isToasting = this.player.beerToastTimer > 0;
    const toastProg = isToasting
      ? Math.sin(((2.0 - this.player.beerToastTimer) / 2.0) * Math.PI)
      : 0;

    if (isMoving) {
      const walkPhase = this.player.walkDist * 5.2;

      // Legs alternate swing
      if (leftUpperLeg) leftUpperLeg.rotation.x = Math.sin(walkPhase) * 0.42;
      if (rightUpperLeg) rightUpperLeg.rotation.x = -Math.sin(walkPhase) * 0.42;

      // Knees flex on backswing
      if (leftLowerLeg) leftLowerLeg.rotation.x = Math.max(0, -Math.sin(walkPhase)) * 0.55;
      if (rightLowerLeg) rightLowerLeg.rotation.x = Math.max(0, Math.sin(walkPhase)) * 0.55;

      // Hips sway & pelvic tilt
      if (hips) {
        hips.rotation.y = Math.sin(walkPhase) * 0.08;
        hips.rotation.z = Math.sin(walkPhase) * 0.03;
      }
      if (spine) spine.rotation.y = -Math.sin(walkPhase) * 0.05;

      // Left Arm swings in opposition to left leg
      if (leftUpperArm) {
        leftUpperArm.rotation.x = -Math.sin(walkPhase) * 0.35;
        leftUpperArm.rotation.z = baseLArmZ + Math.cos(walkPhase) * 0.04;
      }
      if (leftLowerArm) {
        leftLowerArm.rotation.x = 0.2 + Math.max(0, -Math.sin(walkPhase)) * 0.15;
      }

      // Right Arm: toast or natural stride swing
      if (rightUpperArm) {
        if (isToasting) {
          rightUpperArm.rotation.x = -1.1 * toastProg;
          rightUpperArm.rotation.z = baseRArmZ + 0.65 * toastProg;
          rightUpperArm.rotation.y = 0.35 * toastProg;
        } else {
          rightUpperArm.rotation.x = Math.sin(walkPhase) * 0.35;
          rightUpperArm.rotation.z = baseRArmZ - Math.cos(walkPhase) * 0.04;
          rightUpperArm.rotation.y = 0;
        }
      }
      if (rightLowerArm) {
        if (isToasting) {
          rightLowerArm.rotation.x = -0.55 * toastProg;
        } else {
          rightLowerArm.rotation.x = 0.2 + Math.max(0, Math.sin(walkPhase)) * 0.15;
        }
      }
    } else {
      // Idle pose: relax legs and smooth breath
      const breath = Math.sin(this.time * 2.2);

      if (leftUpperLeg) leftUpperLeg.rotation.x = 0;
      if (rightUpperLeg) rightUpperLeg.rotation.x = 0;
      if (leftLowerLeg) leftLowerLeg.rotation.x = 0;
      if (rightLowerLeg) rightLowerLeg.rotation.x = 0;
      if (hips) {
        hips.rotation.y = 0;
        hips.rotation.z = 0;
      }

      // Breathing spine & chest
      if (spine) {
        spine.rotation.x = breath * 0.02;
        spine.rotation.y = 0;
      }
      if (chest) chest.rotation.x = breath * 0.025;

      // Arms idle
      if (leftUpperArm) {
        leftUpperArm.rotation.x = 0;
        leftUpperArm.rotation.z = baseLArmZ + breath * 0.015;
      }
      if (leftLowerArm) leftLowerArm.rotation.x = 0.15;

      if (rightUpperArm) {
        if (isToasting) {
          rightUpperArm.rotation.x = -1.1 * toastProg;
          rightUpperArm.rotation.z = baseRArmZ + 0.65 * toastProg;
          rightUpperArm.rotation.y = 0.35 * toastProg;
        } else {
          rightUpperArm.rotation.x = 0;
          rightUpperArm.rotation.z = baseRArmZ - breath * 0.015;
          rightUpperArm.rotation.y = 0;
        }
      }
      if (rightLowerArm) {
        if (isToasting) {
          rightLowerArm.rotation.x = -0.55 * toastProg;
        } else {
          rightLowerArm.rotation.x = 0.15;
        }
      }

      // Subtle idle head look around
      if (head) {
        head.rotation.y = Math.sin(this.time * 0.7) * 0.05;
        head.rotation.x = Math.sin(this.time * 0.5) * 0.03;
      }
    }

    // Expressions: warm smile on toast & natural periodic blinking
    if (this.vrmPlayer.expressionManager) {
      if (isToasting) {
        this.vrmPlayer.expressionManager.setValue('happy', toastProg * 0.8);
      } else {
        this.vrmPlayer.expressionManager.setValue('happy', 0);
      }

      this._blinkTimer += dt;
      if (this._blinkTimer > this._nextBlinkInterval) {
        const blinkPhase = (this._blinkTimer - this._nextBlinkInterval) / 0.15;
        if (blinkPhase <= 1.0) {
          const blinkVal = Math.sin(blinkPhase * Math.PI);
          this.vrmPlayer.expressionManager.setValue('blink', blinkVal);
        } else {
          this.vrmPlayer.expressionManager.setValue('blink', 0);
          this._blinkTimer = 0;
          this._nextBlinkInterval = 3.0 + Math.random() * 3.5;
        }
      }
    }
  }

  private _buildCharacters(): void {
    // 1. Walkable Player Avatar (Master container group)
    this.player.grp = new THREE.Group();
    this.player.grp.position.set(this.player.x, 0, this.player.z);
    this.scene.add(this.player.grp);

    // Load VRM User Model
    if (!this.isHeadless) {
      this.loadVrmAvatar('/avatar.vrm');
    }

    // 2. P2P Guest / Partner Avatar
    const gChar = this._makeCharacter(0x54e0ee, 0x3b2214, 0x1e2638, 'cue');
    this.guestGrp = gChar.grp;
    this.guestGrp.visible = false;
    this.scene.add(this.guestGrp);

    // 3. Bartender behind the Oak Counter
    const bChar = this._makeCharacter(0xf2efe9, 0x362214, 0x1a1c24, 'mug');
    bChar.grp.position.set(4.85, 0, 1.85);
    bChar.grp.rotation.y = -Math.PI / 2;
    this.bartenderArm = bChar.armR;
    this.bartenderGrp = bChar.grp;
    this.loungeDecorGroup.add(bChar.grp);

    // 4. Lounge Patrons (around Pool, Arcade Stations, and Bar)
    const patronSpecs: Array<{
      x: number;
      z: number;
      yaw: number;
      shirt: number;
      hair: number;
      role: NpcPatron['role'];
      prop: 'none' | 'cue' | 'mug' | 'dart';
      chatterIdx: number;
    }> = [
      // Pool players & spectators
      { x: -1.62, z: 0.15, yaw: 1.5, shirt: 0x8f2d28, hair: 0x3a2312, role: 'pool', prop: 'cue', chatterIdx: 0 },
      { x: 0.95, z: -0.92, yaw: -0.2, shirt: 0xede6d6, hair: 0xc99238, role: 'pool', prop: 'cue', chatterIdx: 5 },
      { x: 1.48, z: 0.72, yaw: -1.8, shirt: 0x334766, hair: 0x2c1b0e, role: 'pool', prop: 'none', chatterIdx: 0 },
      { x: -0.25, z: -0.88, yaw: 0.1, shirt: 0xd95f98, hair: 0x5c341a, role: 'pool', prop: 'none', chatterIdx: 2 },
      // Arcade players & spectators
      { x: -3.85, z: -3.45, yaw: -1.57, shirt: 0x994c26, hair: 0x301c0e, role: 'chat', prop: 'none', chatterIdx: 6 },
      { x: -3.2, z: -0.85, yaw: -2.3, shirt: 0xd9c7a3, hair: 0x593a1e, role: 'ludo', prop: 'none', chatterIdx: 2 },
      { x: -3.2, z: -1.75, yaw: -2.4, shirt: 0x2b3340, hair: 0x24160c, role: 'chat', prop: 'mug', chatterIdx: 7 },
      { x: -3.2, z: -2.6, yaw: -2.5, shirt: 0xc23e5c, hair: 0x452612, role: 'darts', prop: 'dart', chatterIdx: 1 },
      // Bar regulars
      { x: 3.1, z: 1.25, yaw: 1.5, shirt: 0x2e4a78, hair: 0x4a2c16, role: 'bar', prop: 'mug', chatterIdx: 3 },
    ];

    patronSpecs.forEach((sp) => {
      const c = this._makeCharacter(sp.shirt, sp.hair, 0x232d3f, sp.prop);
      c.grp.position.set(sp.x, 0, sp.z);
      c.grp.rotation.y = sp.yaw;
      this.scene.add(c.grp);
      this.npcs.push({
        grp: c.grp,
        x: sp.x,
        z: sp.z,
        baseYaw: sp.yaw,
        role: sp.role,
        chatterIdx: sp.chatterIdx,
        armR: c.armR,
      });
    });
  }

  // ------------------------------------------------------------------ CAMERA DIRECTOR & FRAME LOOP
  private _frameLudo(
    look: THREE.Vector3,
    w: number,
    h: number,
    elev: number,
    fov: number,
    yawOff = 0,
  ): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
    const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const dist = Math.max(w / (2 * t * this.aspect), h / (2 * t)) * 1.06;
    const pos = new THREE.Vector3(
      look.x + Math.sin(yawOff) * Math.cos(elev) * dist,
      look.y + Math.sin(elev) * dist,
      look.z + Math.cos(yawOff) * Math.cos(elev) * dist,
    );
    return { pos, look, fov };
  }

  computeCameraShot(
    appMode: 'title' | 'lounge' | 'station' | 'paused' | 'gameover',
    station: StationId,
    poolCue: { yaw: number; lowSight: boolean },
    poolCloseUp: { pocketIdx: number; ballId: number } | null,
    closeUpEnabled: boolean,
    isImmersedPlay = false,
  ): void {
    const isFocusedStation =
      station === 'pool' || station === 'ludo' || station === 'darts' || station === 'dice';
    const immersedGame = isFocusedStation && (isImmersedPlay || appMode === 'station');

    // Full Immersion Isolation: Hide the entire lounge environment (walls, oak floor, rugs, other tables, NPCs)
    this.loungeDecorGroup.visible = !immersedGame;
    if (this.loungeFloorMesh) this.loungeFloorMesh.visible = !immersedGame;
    if (this.moveTargetRing) this.moveTargetRing.visible = !immersedGame;
    if (this.poolRugMesh) this.poolRugMesh.visible = !immersedGame;
    if (this.poolRugMesh) this.poolRugMesh.visible = !immersedGame || station === 'pool';
    if (this.ludoRugMesh) this.ludoRugMesh.visible = station === 'ludo';
    if (this.dartsWallBackdrop) this.dartsWallBackdrop.visible = station === 'darts';

    this.poolGroup.visible = !immersedGame || station === 'pool';
    this.ludoGroup.visible = station === 'ludo';
    this.dartsGroup.visible = station === 'darts';
    this.diceTableGroup.visible = station === 'dice';

    // Position the focused velvet studio stage & overhead spotlight directly on the active game
    if (this.focusStagePedestal) {
      this.focusStagePedestal.visible = immersedGame && station !== 'darts';
      if (station === 'ludo') {
        this.focusStagePedestal.position.set(LUDO_ORIGIN.x + 0.06, 0.001, LUDO_ORIGIN.z);
        this.focusStagePedestal.scale.setScalar(0.85);
      } else if (station === 'pool') {
        this.focusStagePedestal.position.set(POOL_ORIGIN.x, 0.001, POOL_ORIGIN.z);
        this.focusStagePedestal.scale.setScalar(1.05);
      } else if (station === 'dice') {
        this.focusStagePedestal.position.set(DICE_ORIGIN.x, 0.001, DICE_ORIGIN.z);
        this.focusStagePedestal.scale.setScalar(0.55);
      }
    }

    if (this.keySpotLight) {
      if (immersedGame) {
        const origin =
          station === 'ludo'
            ? LUDO_ORIGIN
            : station === 'pool'
              ? POOL_ORIGIN
              : station === 'darts'
                ? DART_ORIGIN
                : DICE_ORIGIN;
        this.keySpotLight.position.set(
          origin.x,
          station === 'darts' ? origin.y + 1.4 : 4.2,
          station === 'darts' ? origin.z + 1.8 : origin.z + 0.25,
        );
        this.keySpotLight.target.position.set(origin.x, origin.y, origin.z);
        this.keySpotLight.intensity = 58;
      } else {
        this.keySpotLight.position.set(0, 4.6, 0.3);
        this.keySpotLight.target.position.set(0, 0, 0.3);
        this.keySpotLight.intensity = 46;
      }
    }
    if (this.neonLight) this.neonLight.visible = !immersedGame;
    if (this.arcadeLight) this.arcadeLight.visible = !immersedGame;
    if (this.fireLight) this.fireLight.visible = !immersedGame;

    this.player.grp.visible =
      !immersedGame &&
      (appMode === 'lounge' || appMode === 'title') &&
      station === 'none' &&
      this.loungeCamMode !== 'fps';

    this.npcs.forEach((npc) => {
      npc.grp.visible = !immersedGame;
    });

    const swoop = this.transitionSwoop;
    const aspectScale = Math.max(1, 1.6 / Math.max(0.55, this.aspect));

    if (appMode === 'title') {
      const a = Math.sin(this.time * 0.22) * 0.35;
      this.tgtPos.set(-5.8 + a * 1.6, 6.8, 7.4);
      this.tgtLook.set(-0.2, 1.15, 0.1);
      this.tgtFov = 33;
      this.camK = 2.5;
      return;
    }

    if (station === 'ludo') {
      const O = LUDO_ORIGIN;
      const L = LUDO_LAYOUT;
      const mode =
        this.ludoCamMode !== 'auto'
          ? this.ludoCamMode
          : this.ludoPhase === 'roll'
            ? 'rollcam'
            : 'board';
      this.camK = 5.2;

      if (mode === 'top') {
        const center = new THREE.Vector3(O.x + (L.boardX + L.trayX) / 2, O.y + 0.05, O.z);
        this.tgtLook.copy(center);
        this.tgtPos.set(center.x, center.y + 1.85 * aspectScale + swoop * 0.5, center.z + 0.01);
        this.tgtFov = 40;
      } else if (mode === 'dice') {
        const trayCenter = new THREE.Vector3(O.x + L.trayX, O.y + 0.06, O.z);
        this.tgtLook.copy(trayCenter);
        this.tgtPos.set(trayCenter.x, trayCenter.y + 0.85 * aspectScale, trayCenter.z + 0.72 * aspectScale);
        this.tgtFov = 36;
      } else if (mode === 'orbit') {
        const o = this.ludoOrbit;
        const look = new THREE.Vector3(O.x + (L.boardX + L.trayX) / 2, O.y + 0.05, O.z);
        this.tgtLook.copy(look);
        this.tgtPos.set(
          look.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
          look.y + Math.sin(o.pitch) * o.dist,
          look.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
        );
        this.tgtFov = 40;
        this.camK = 8;
      } else {
        // Full-Screen Focused Ludo Table Framing: centers both 15x15 Board (-0.75) and Shaker Cup (+0.71)
        const boardCenter = new THREE.Vector3(O.x - 0.02, O.y + 0.02, O.z + 0.02);
        this.tgtLook.copy(boardCenter);
        this.tgtPos.set(
          boardCenter.x,
          boardCenter.y + 1.32 * aspectScale + swoop * 0.65,
          boardCenter.z + 0.94 * aspectScale + swoop * 0.55,
        );
        this.tgtFov = 38 + swoop * 8;
      }
      return;
    }

    if (station === 'pool') {
      const O = POOL_ORIGIN;
      if (closeUpEnabled && poolCloseUp) {
        const [px, pz] = POCKETS[poolCloseUp.pocketIdx];
        this.tgtLook.set(O.x + px, O.y + 0.03, O.z + pz);
        this.tgtPos.set(O.x + px * 0.65, O.y + 0.55, O.z + pz * 0.65 + 0.45);
        this.tgtFov = 36;
        this.camK = 5.5;
        return;
      }
      if (poolCue.lowSight) {
        const cb = this.poolBallMeshes[0]?.position || new THREE.Vector3();
        const wx = O.x + cb.x;
        const wz = O.z + cb.z;
        this.tgtLook.set(
          wx + Math.cos(poolCue.yaw) * 0.6,
          O.y + 0.05,
          wz + Math.sin(poolCue.yaw) * 0.6,
        );
        this.tgtPos.set(
          wx - Math.cos(poolCue.yaw) * 0.72,
          O.y + 0.24,
          wz - Math.sin(poolCue.yaw) * 0.72,
        );
        this.tgtFov = 42;
        this.camK = 6.0;
        return;
      }
      // Full-Screen Focused 8-Ball Billiard Table Framing (fits all 6 pockets & walnut rails)
      this.tgtLook.set(O.x, O.y + 0.02, O.z + 0.03);
      this.tgtPos.set(
        O.x,
        O.y + 1.72 * aspectScale + swoop * 0.7,
        O.z + 0.98 * aspectScale + swoop * 0.55,
      );
      this.tgtFov = 42 + swoop * 8;
      this.camK = 5.2;
      return;
    }

    if (station === 'darts') {
      const D = DART_ORIGIN;
      this.tgtLook.set(D.x, D.y, D.z);
      this.tgtPos.set(
        D.x,
        D.y - 0.02 + swoop * 0.22,
        D.z + 0.96 * aspectScale + swoop * 0.55,
      );
      this.tgtFov = 36 + swoop * 8;
      this.camK = 5.5;
      return;
    }

    if (station === 'dice') {
      const C = DICE_ORIGIN;
      this.tgtLook.set(C.x, C.y + 0.05, C.z + 0.02);
      this.tgtPos.set(
        C.x,
        C.y + 0.56 * aspectScale + swoop * 0.45,
        C.z + 0.52 * aspectScale + swoop * 0.45,
      );
      this.tgtFov = 36 + swoop * 8;
      this.camK = 5.2;
      return;
    }

    // Lounge exploration: First-Person (FPS) vs Isometric Diorama (Matching Reference Image!)
    this.player.grp.visible = this.loungeCamMode !== 'fps';
    if (this.loungeCamMode === 'fps') {
      const eyeX = this.player.x;
      const eyeY = 1.48;
      const eyeZ = this.player.z;
      this.tgtPos.set(eyeX, eyeY, eyeZ);
      this.tgtLook.set(
        eyeX + Math.sin(this.fpsYaw) * Math.cos(this.fpsPitch) * 3,
        eyeY + Math.sin(this.fpsPitch) * 3,
        eyeZ - Math.cos(this.fpsYaw) * Math.cos(this.fpsPitch) * 3,
      );
      this.tgtFov = 58;
      this.camK = 14.0;
    } else {
      // Cozy Isometric Diorama view with 90° rotation, aspect framing & dead-zone follow
      // 1. Dead-zone avatar follow (1.2m dead-zone)
      const dx = this.player.x - this.camTargetLook.x;
      const dz = this.player.z - this.camTargetLook.z;
      const dist = Math.hypot(dx, dz);
      const DEAD_ZONE = 1.2;
      if (dist > DEAD_ZONE) {
        const pull = (dist - DEAD_ZONE) / dist;
        this.camTargetLook.x += dx * pull * 0.14;
        this.camTargetLook.z += dz * pull * 0.14;
      }

      // Auto-recenter if player walks far off-frame for > 1.2s
      if (dist > 3.2) {
        this.offCenterTimer += 0.016;
        if (this.offCenterTimer > 1.2) {
          this.camTargetLook.x += (this.player.x - this.camTargetLook.x) * 0.06;
          this.camTargetLook.z += (this.player.z - this.camTargetLook.z) * 0.06;
          this.camPanOffset.lerp(new THREE.Vector2(0, 0), 0.04);
        }
      } else {
        this.offCenterTimer = 0;
      }

      // 2. Aspect-aware distance scaling (Narrow FOV 24° fake-ortho)
      this.tgtLook.set(
        this.camTargetLook.x + this.camPanOffset.x,
        0.95,
        this.camTargetLook.z + this.camPanOffset.y,
      );

      const aspectCorrection = this.aspect < 1.0 ? 1.45 / this.aspect : Math.max(1.0, 1.22 / this.aspect);
      const camDist = 16.2 * this.isoZoom * aspectCorrection;
      const elev = 0.58; // ~33 degrees elevation angle for classic isometric projection
      const groundDist = Math.cos(elev) * camDist;
      const elevY = Math.sin(elev) * camDist;

      // Base offset at 0° (SW view): facing towards (+X, -Z)
      const baseOx = -groundDist * 0.58;
      const baseOz = groundDist * 0.81;

      const cosA = Math.cos(this.isoCurrentAngle);
      const sinA = Math.sin(this.isoCurrentAngle);
      const rotOx = baseOx * cosA - baseOz * sinA;
      const rotOz = baseOx * sinA + baseOz * cosA;

      this.tgtPos.set(
        this.tgtLook.x + rotOx,
        elevY,
        this.tgtLook.z + rotOz,
      );
      this.tgtFov = 24;
      this.camK = 4.8;
    }
  }

  snapCamera(
    appMode: 'title' | 'lounge' | 'station' | 'paused' | 'gameover',
    station: StationId,
    poolCue: { yaw: number; lowSight: boolean } = { yaw: 0, lowSight: false },
    isImmersedPlay = false,
  ): void {
    this.isoCurrentAngle = this.isoTargetAngle;
    this.computeCameraShot(appMode, station, poolCue, null, false, isImmersedPlay);
    this.camPos.copy(this.tgtPos);
    this.camLook.copy(this.tgtLook);
    this.camFov = this.tgtFov;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov = this.camFov;
    this.camera.updateProjectionMatrix();
  }

  projectCoords(x: number, y: number, z: number): { x: number; y: number; ok: boolean } {
    _v1.set(x, y, z).project(this.camera);
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    return {
      x: (_v1.x * 0.5 + 0.5) * w,
      y: (-_v1.y * 0.5 + 0.5) * h,
      ok: _v1.z >= -1 && _v1.z <= 1,
    };
  }

  projectWorld(v: THREE.Vector3): { x: number; y: number; ok: boolean } {
    return this.projectCoords(v.x, v.y, v.z);
  }

  ludoPawnWorldPos(c: number, t: number): THREE.Vector3 {
    const pw = this.ludoPawn(c, t);
    this.ludoGroup.updateWorldMatrix(true, false);
    pw.grp.updateWorldMatrix(true, false);
    _v2.set(0, 0.075, 0);
    return pw.grp.localToWorld(_v2.clone());
  }

  doFlash(color = 0xff4030, amt = 0.35): void {
    this.flashColor.set(color);
    this.flash = amt;
  }

  triggerBartenderToast(): void {
    this.player.beerToastTimer = 2.0;
  }

  update(
    dt: number,
    appMode: 'title' | 'lounge' | 'station' | 'paused' | 'gameover',
    station: StationId,
    poolCue: { yaw: number; lowSight: boolean },
    poolCloseUp: { pocketIdx: number; ballId: number } | null,
    closeUpEnabled: boolean,
    remoteAvatar: { active: boolean; x: number; z: number; yaw: number },
    isImmersedPlay = false,
  ): void {
    this.time += dt;

    // Smooth exponential zoom interpolation towards targetZoom
    this.isoZoom += (this.targetZoom - this.isoZoom) * (1 - Math.exp(-dt * 8.5));

    // Smooth angular rotation interpolation for ISO view
    let angDiff = (this.isoTargetAngle - this.isoCurrentAngle) % (Math.PI * 2);
    if (angDiff < -Math.PI) angDiff += Math.PI * 2;
    if (angDiff > Math.PI) angDiff -= Math.PI * 2;
    this.isoCurrentAngle += angDiff * Math.min(1.0, dt * 7.5);

    this.computeCameraShot(appMode, station, poolCue, poolCloseUp, closeUpEnabled, isImmersedPlay);

    const a = 1 - Math.exp(-dt * this.camK);
    this.camPos.lerp(this.tgtPos, a);
    this.camLook.lerp(this.tgtLook, a);
    this.camFov += (this.tgtFov - this.camFov) * a;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - this.camFov) > 0.01) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }

    // Adaptive diorama cutaway wall occlusion handling
    if (this.loungeCamMode === 'fps') {
      this.wallNorthGroup.visible = true;
      this.wallSouthGroup.visible = true;
      this.wallWestGroup.visible = true;
      this.wallEastGroup.visible = true;
    } else {
      // In isometric diorama, walls between camera and center are lowered/hidden
      this.wallNorthGroup.visible = this.camPos.z > -1.2;
      this.wallSouthGroup.visible = this.camPos.z < 1.2;
      this.wallWestGroup.visible = this.camPos.x > -1.2;
      this.wallEastGroup.visible = this.camPos.x < 1.2;
    }

    // Player avatar positioning & gait bobbing
    const isMoving = Math.abs(this.player.walkDist - this._lastVrmWalkDist) > 0.0002;
    this._lastVrmWalkDist = this.player.walkDist;

    const bobAmount = 0.015;
    this.player.grp.position.set(
      this.player.x,
      Math.abs(Math.sin(this.player.walkDist * 4.5)) * bobAmount,
      this.player.z,
    );
    this.player.grp.rotation.y = this.player.yaw;
    if (this.player.beerToastTimer > 0) {
      this.player.beerToastTimer = Math.max(0, this.player.beerToastTimer - dt);
      this.bartenderArm.rotation.x = -0.8;
    } else {
      this.bartenderArm.rotation.x = Math.sin(this.time * 2) * 0.12;
    }

    // VRM avatar humanoid bone animation & spring bone physics
    if (this.vrmPlayer && this.vrmLoaded) {
      this._updateVrmAnimation(dt, isMoving);
    }

    // Remote P2P guest avatar
    this.guestGrp.visible = !isImmersedPlay && remoteAvatar.active;
    if (remoteAvatar.active) {
      this.guestGrp.position.x += (remoteAvatar.x - this.guestGrp.position.x) * 0.2;
      this.guestGrp.position.z += (remoteAvatar.z - this.guestGrp.position.z) * 0.2;
      this.guestGrp.rotation.y = remoteAvatar.yaw;
    }

    // Ludo animations + 3D Shaker Cup Vigorous Shake & Throw-Out
    this._applyLudoPawns(dt);
    this.ludoHints.forEach((h, i) => {
      if (h.visible) {
        h.rotation.z = this.time * 1.5;
        h.scale.setScalar(1 + Math.sin(this.time * 6 + i) * 0.12);
      }
    });
    if (this.ludoFeltTarget) {
      this.ludoFeltMat.color.lerp(this.ludoFeltTarget, 1 - Math.exp(-dt * 4));
    }

    if (this.ludoCupGroup) {
      const snap = this.lastDieSnap;
      const isShaking = this.ludoManualShake.active || snap?.phase === 'shaking';
      const isThrowingOut =
        !this.ludoManualShake.active &&
        snap?.phase === 'rolling' &&
        (snap.throwElapsed ?? 1) < 0.36;

      if (isShaking) {
        const pwr = this.ludoManualShake.active
          ? 0.55 + this.ludoManualShake.power * 0.65
          : 0.75 + (snap?.shakeProgress ?? 0.5) * 0.45;
        const sx = Math.sin(this.time * 54) * 0.044 * pwr;
        const sy = Math.abs(Math.cos(this.time * 66)) * 0.052 * pwr;
        const sz = Math.sin(this.time * 46) * 0.036 * pwr;
        this.ludoCupGroup.position.set(sx, 0.195 + sy, TRAY.z1 + 0.015 + sz);
        this.ludoCupGroup.rotation.set(
          0.35 + Math.cos(this.time * 58) * 0.42 * pwr,
          Math.sin(this.time * 38) * 0.25,
          Math.sin(this.time * 50) * 0.48 * pwr,
        );
      } else if (isThrowingOut) {
        // Tilt cup sharply forward into the tray mouth as the die shoots out
        const ck = 1 - Math.exp(-dt * 24);
        this.ludoCupGroup.position.x += (0 - this.ludoCupGroup.position.x) * ck;
        this.ludoCupGroup.position.y += (0.145 - this.ludoCupGroup.position.y) * ck;
        this.ludoCupGroup.position.z += (TRAY.z1 - 0.01 - this.ludoCupGroup.position.z) * ck;
        this.ludoCupGroup.rotation.x += (-1.38 - this.ludoCupGroup.rotation.x) * ck;
        this.ludoCupGroup.rotation.y *= 1 - ck;
        this.ludoCupGroup.rotation.z *= 1 - ck;
      } else {
        // Rest cleanly on the corner rail of the dice tray
        const ck = 1 - Math.exp(-dt * 10);
        this.ludoCupGroup.position.x += (0.145 - this.ludoCupGroup.position.x) * ck;
        this.ludoCupGroup.position.y += (0.074 - this.ludoCupGroup.position.y) * ck;
        this.ludoCupGroup.position.z += (TRAY.z1 + 0.048 - this.ludoCupGroup.position.z) * ck;
        this.ludoCupGroup.rotation.x *= 1 - ck;
        this.ludoCupGroup.rotation.y *= 1 - ck;
        this.ludoCupGroup.rotation.z *= 1 - ck;
      }
    }

    if (!isImmersedPlay) {
      // Fireplace flicker + rising embers
      this.fireLight.intensity = 13 + Math.sin(this.time * 14) * 2.2 + Math.cos(this.time * 23) * 1.4;
      const dummy = this._scratchDummy;
      this.emberData.forEach((em, idx) => {
        em.y += em.vy * dt;
        if (em.y > 1.95) {
          em.y = 0.25;
          em.x = 4.8 + (Math.random() - 0.5) * 0.22;
          em.z = -1.25 + (Math.random() - 0.5) * 0.55;
        }
        dummy.position.set(
          em.x + Math.sin(this.time * 2 + em.phase) * 0.025,
          em.y,
          em.z + Math.cos(this.time * 2 + em.phase) * 0.025,
        );
        dummy.updateMatrix();
        this.emberInstanced.setMatrixAt(idx, dummy.matrix);
      });
      this.emberInstanced.instanceMatrix.needsUpdate = true;

      // NPC ambient animations (dart tosses, pool cue swings, bar cheers)
      this.npcs.forEach((npc, idx) => {
        if (npc.role === 'darts' && station !== 'darts') {
          const swing = Math.sin(this.time * 2.4 + idx);
          npc.armR.rotation.x = -0.6 + swing * 0.45;
        } else if (npc.role === 'pool' && station !== 'pool') {
          npc.armR.rotation.x = Math.sin(this.time * 1.8 + idx) * 0.25;
        } else {
          npc.armR.rotation.x = Math.sin(this.time * 1.5 + idx) * 0.12;
        }
      });

      // Background NPC flying dart loop when player is not at dartboard
      if (station !== 'darts') {
        this.npcFlyDart.visible = true;
        const cyc = (this.time * 0.75) % 1;
        this.npcFlyDart.position.set(
          0.15 * (1 - cyc),
          Math.sin(cyc * Math.PI) * 0.12,
          1.65 * (1 - cyc) + 0.06,
        );
      } else {
        this.npcFlyDart.visible = false;
      }

      // Update animated CRT arcade screens at ~8 Hz
      this.arcadeTick += dt;
      if (Math.floor(this.arcadeTick * 8) !== Math.floor((this.arcadeTick - dt) * 8)) {
        this.arcadeCanvases.forEach((ac) => {
          drawArcadeScreen(ac.ctx, ac.canvas.width, ac.canvas.height, ac.type, this.time);
          ac.tex.needsUpdate = true;
        });
      }
    } else {
      this.npcFlyDart.visible = false;
    }

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.vrmPlayer?.scene) {
      VRMUtils.deepDispose(this.vrmPlayer.scene);
    }
    this.pixelPost.dispose();
    this.renderer.dispose();
  }
}
