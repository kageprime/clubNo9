// CLUB No.9 — Unified 3D Pixel Lounge & Tabletop Physics Stage (world.js + render.js).
// Strictly read-only view layer driven by the controller and headless physics engines.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
  openNeonTex,
  drawArcadeScreen,
  orientalRugTex,
  vintagePosterTex,
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
  { id: 'ludo', x: -2.45, z: 2.35, radius: 1.55, labelZh: '俱乐部飞行棋 (LUDO)', labelEn: 'Ludo · Club No.9' },
  { id: 'pool', x: 0.0, z: 0.25, radius: 1.85, labelZh: '中式八球台球', labelEn: '8-Ball Pool Table' },
  { id: 'darts', x: 2.35, z: -2.65, radius: 1.5, labelZh: '像素飞镖台', labelEn: 'Pixel Darts' },
  { id: 'dice', x: -4.15, z: 2.85, radius: 1.35, labelZh: '大话骰盅桌', labelEn: "Liar's Dice Cup" },
  { id: 'arcade', x: -4.1, z: 0.35, radius: 1.55, labelZh: '联机大厅街机', labelEn: 'Lobby Matchmaking' },
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

  // Camera rig state
  camPos = new THREE.Vector3(-5.8, 6.8, 7.4);
  camLook = new THREE.Vector3(-0.2, 1.05, 0.1);
  camFov = 33;
  tgtPos = new THREE.Vector3(-5.8, 6.8, 7.4);
  tgtLook = new THREE.Vector3(-0.2, 1.05, 0.1);
  tgtFov = 33;
  camK = 5.5;

  loungeCamMode: 'isometric' | 'fps' = 'isometric';
  isoZoom = 1.0;
  fpsYaw = -0.35;
  fpsPitch = -0.08;

  // Player & Guest Avatar
  player = {
    x: -0.9,
    z: 1.85,
    yaw: 0.4,
    walkDist: 0,
    grp: new THREE.Group(),
    mugMesh: null as THREE.Object3D | null,
    beerToastTimer: 0,
  };
  playerTarget: { x: number; z: number } | null = null;
  moveTargetRing!: THREE.Mesh;
  guestGrp = new THREE.Group();

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
  poolRugMesh!: THREE.Mesh;
  ludoRugMesh!: THREE.Mesh;
  bartenderGrp = new THREE.Group();
  arcadeCanvases: Array<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture }> = [];
  arcadeTick = 0;
  fireLight!: THREE.PointLight;
  emberInstanced!: THREE.InstancedMesh;
  emberData: Array<{ x: number; y: number; z: number; vy: number; phase: number }> = [];
  npcs: NpcPatron[] = [];
  bartenderArm!: THREE.Object3D;

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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0a0705, 1);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0c0806, 0.038);

    // Generate studio reflection map on hardware GPU; skip in headless software WebGL to avoid ReadPixels stall
    if (!this.isHeadless) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }

    this.camera = new THREE.PerspectiveCamera(33, 16 / 9, 0.04, 45);
    this.pixelPost = new PixelPostProcessor(renderer);
    this.resize();

    this.scene.add(this.loungeDecorGroup);
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

  private _buildLights(): void {
    // Cool-warm hemisphere fill
    const hemi = new THREE.HemisphereLight(0xffdcb8, 0x281c32, 0.85);
    this.scene.add(hemi);

    // Overhead central billiard table key light (single shadow caster per performance budget)
    const spot = new THREE.SpotLight(0xfff0d0, 46, 17, 0.85, 0.65, 1.3);
    spot.position.set(0, 4.6, 0.3);
    spot.target.position.set(0, 0, 0.3);
    if (!this.isHeadless) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0004;
      spot.shadow.camera.near = 1.2;
      spot.shadow.camera.far = 9.0;
    }
    this.scene.add(spot, spot.target);

    // Neon sign magenta/cyan glow light
    const neonLight = new THREE.PointLight(0xff5ec4, 9, 8.0, 1.4);
    neonLight.position.set(-0.5, 3.3, -3.2);
    this.scene.add(neonLight);

    // Arcade row cyan/purple fill light
    const arcadeLight = new THREE.PointLight(0x54e0ee, 8.5, 7.0, 1.4);
    arcadeLight.position.set(-4.2, 2.2, 0.0);
    this.scene.add(arcadeLight);

    // Ludo & Dice table warm lamp light
    const ludoLight = new THREE.PointLight(0xffcf78, 10, 6.5, 1.4);
    ludoLight.position.set(-2.6, 2.8, 2.4);
    this.scene.add(ludoLight);

    // Fireplace warm flickering light
    this.fireLight = new THREE.PointLight(0xff7722, 16, 8.0, 1.4);
    this.fireLight.position.set(4.5, 1.1, -1.2);
    this.scene.add(this.fireLight);
  }

  private _buildLoungeArchitecture(): void {
    const floorMat = new THREE.MeshStandardMaterial({
      map: woodPlankTex(101, [7, 5]),
      roughness: 0.45,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.2, 8.8), floorMat);
    floor.position.set(0, -0.1, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Click-to-move pulsing destination ring
    this.moveTargetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.22, 28),
      new THREE.MeshBasicMaterial({ color: 0x54e0ee, side: THREE.DoubleSide, transparent: true, opacity: 0 }),
    );
    this.moveTargetRing.rotation.x = -Math.PI / 2;
    this.moveTargetRing.position.y = 0.012;
    this.scene.add(this.moveTargetRing);

    const darkWainscotMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([55, 30, 16], 33, [3, 1]),
      roughness: 0.55,
      metalness: 0.05,
    });
    const upperWallMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([98, 60, 34], 23, [5, 2]),
      roughness: 0.8,
    });
    const mouldingMat = new THREE.MeshStandardMaterial({
      color: 0x3d2010,
      roughness: 0.5,
    });

    // Back-left wall (behind arcade cabinets, x = -5.6)
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.3, 8.8), upperWallMat);
    wallLeft.position.set(-5.65, 2.15, 0);
    wallLeft.receiveShadow = true;
    const wainscotLeft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.25, 8.8), darkWainscotMat);
    wainscotLeft.position.set(-5.64, 0.625, 0);
    this.loungeDecorGroup.add(wallLeft, wainscotLeft);

    // Back-right wall (behind neon sign & dartboard, z = -4.25)
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(11.6, 4.3, 0.3), upperWallMat);
    wallBack.position.set(0, 2.15, -4.25);
    wallBack.receiveShadow = true;
    const wainscotBack = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.25, 0.32), darkWainscotMat);
    wainscotBack.position.set(0, 0.625, -4.24);
    const chairRail = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.06, 0.36), mouldingMat);
    chairRail.position.set(0, 1.25, -4.23);
    const baseboard = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.12, 0.36), mouldingMat);
    baseboard.position.set(0, 0.06, -4.23);
    this.loungeDecorGroup.add(wallBack, wainscotBack, chairRail, baseboard);

    // Right wall (fireplace & back bar, x = +5.65)
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.3, 8.8), upperWallMat);
    wallRight.position.set(5.65, 2.15, 0);
    wallRight.receiveShadow = true;
    const wainscotRight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.25, 8.8), darkWainscotMat);
    wainscotRight.position.set(5.64, 0.625, 0);
    this.loungeDecorGroup.add(wallRight, wainscotRight);

    // Vertical timber pilasters along walls for architectural depth
    const pilasterMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([76, 45, 24], 19, [2, 2]),
      roughness: 0.65,
    });
    for (const x of [-5.2, -2.5, 0.5, 3.6, 5.4]) {
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.35, 0.22), pilasterMat);
      pilaster.position.set(x, 2.15, -4.08);
      this.loungeDecorGroup.add(pilaster);
    }

    // 1. Ornate Persian Rugs on Floor (Pool Table, Hearth, and Ludo)
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

    const hearthRug = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 1.45),
      new THREE.MeshStandardMaterial({
        map: orientalRugTex('emerald'),
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    hearthRug.rotation.x = -Math.PI / 2;
    hearthRug.rotation.z = Math.PI / 2;
    hearthRug.position.set(3.8, 0.002, -1.25);
    hearthRug.receiveShadow = true;
    this.loungeDecorGroup.add(hearthRug);

    const ludoRug = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.8),
      new THREE.MeshStandardMaterial({
        map: orientalRugTex('crimson'),
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    ludoRug.rotation.x = -Math.PI / 2;
    ludoRug.position.set(LUDO_ORIGIN.x, 0.002, LUDO_ORIGIN.z);
    ludoRug.receiveShadow = true;
    this.ludoRugMesh = ludoRug;
    this.scene.add(ludoRug);

    // 2. Ceiling Dark Oak Architectural Beams
    const beamMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([60, 34, 18], 5, [3, 1]),
      roughness: 0.6,
    });
    for (const z of [-3.1, -1.1, 0.9, 2.9]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.22, 0.28), beamMat);
      beam.position.set(0, 4.25, z);
      this.loungeDecorGroup.add(beam);
    }

    // 3. Framed High-Res Vintage Posters on Walls
    const posterMat1 = new THREE.MeshStandardMaterial({ map: vintagePosterTex('billiards'), roughness: 0.35 });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.15), posterMat1);
    p1.position.set(3.4, 2.75, -4.07);
    this.loungeDecorGroup.add(p1);

    const posterMat2 = new THREE.MeshStandardMaterial({ map: vintagePosterTex('jazz'), roughness: 0.35 });
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.15), posterMat2);
    p2.position.set(-3.2, 2.75, -4.07);
    this.loungeDecorGroup.add(p2);

    const posterMat3 = new THREE.MeshStandardMaterial({ map: vintagePosterTex('cocktail'), roughness: 0.35 });
    const p3 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.05), posterMat3);
    p3.rotation.y = -Math.PI / 2;
    p3.position.set(5.48, 2.8, -3.1);
    this.loungeDecorGroup.add(p3);

    // 4. Corner Tavern Brass Planter with Lush Greenery (between jukebox and wall)
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.75, roughness: 0.25 });
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

    // Warm brass wall sconces along back wall
    for (const sx of [-3.8, 2.05]) {
      const sconceArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8), brassMat);
      sconceArm.rotation.x = Math.PI / 2;
      sconceArm.position.set(sx, 2.45, -4.05);

      const sconceShade = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.16, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xffe6a3, roughness: 0.4, side: THREE.DoubleSide }),
      );
      sconceShade.position.set(sx, 2.52, -3.96);

      const sconceLight = new THREE.PointLight(0xffb84a, 6.0, 4.2, 1.6);
      sconceLight.position.set(sx, 2.48, -3.9);
      this.loungeDecorGroup.add(sconceArm, sconceShade, sconceLight);
    }
  }

  private _buildNeonSignsAndDecor(): void {
    // 1. Giant Overhead Neon Sign: 九号俱乐部 / CLUB No.9
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
    this.loungeDecorGroup.add(signGrp);

    // 2. Framed pixel wall portraits on left wall & back wall (matching reference image)
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
      this.loungeDecorGroup.add(pic);
    }

    // Wall AC unit on upper-left wall (just like reference image!)
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
    this.loungeDecorGroup.add(acUnit);
  }

  private _buildArcadeRow(): void {
    // 5 Arcade Cabinets along the left wall:
    // Index 0 = Giant LOBBY MATCHMAKING Terminal; 1..4 = Retro Arcade Cabinets
    const cabConfigs = [
      { z: 0.25, scale: 1.25, color: 0x261f47, neon: 0xec4899, title: 'LOBBY' },
      { z: -0.9, scale: 0.92, color: 0x253852, neon: 0xffb84a, title: 'INVADERS' },
      { z: -1.75, scale: 0.92, color: 0x2b2440, neon: 0x54e0ee, title: 'TETRIS' },
      { z: -2.6, scale: 0.92, color: 0x1f3b34, neon: 0x5fe08a, title: 'CLIMBER' },
      { z: -3.45, scale: 0.92, color: 0x3d222e, neon: 0xff6a5a, title: 'OUTRUN' },
    ];

    cabConfigs.forEach((cfg, idx) => {
      const g = new THREE.Group();
      g.position.set(-4.85, 0, cfg.z);
      g.scale.setScalar(cfg.scale);

      const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.55 });
      const trimMat = new THREE.MeshBasicMaterial({ color: cfg.neon, toneMapped: false });

      // Base cabinet hull + upper marquee hood
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.15, 0.72), bodyMat);
      base.position.y = 0.575;
      base.castShadow = true;
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.85, 0.68), bodyMat);
      upper.position.set(-0.03, 1.5, 0);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.12, 0.72), bodyMat);
      deck.position.set(0.08, 1.05, 0);

      // Glowing neon side trim
      const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.92, 0.03), trimMat);
      sideL.position.set(0, 0.98, 0.36);
      const sideR = sideL.clone();
      sideR.position.z = -0.36;

      // Live CRT Screen canvas texture
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 96;
      const ctx = c.getContext('2d')!;
      drawArcadeScreen(ctx, 128, 96, idx, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.arcadeCanvases.push({ canvas: c, ctx, tex });

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.56, 0.46),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
      );
      screen.position.set(0.32, 1.42, 0);
      screen.rotation.y = Math.PI / 2;
      screen.rotation.x = -0.15;

      // Joystick & arcade buttons on control deck
      const stick = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff4a3a }),
      );
      stick.position.set(0.38, 1.14, -0.14);
      const btn1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8),
        new THREE.MeshBasicMaterial({ color: 0x54e0ee }),
      );
      btn1.position.set(0.38, 1.12, 0.08);
      const btn2 = btn1.clone();
      btn2.position.z = 0.16;

      g.add(base, upper, deck, sideL, sideR, screen, stick, btn1, btn2);

      // Extra glowing marquee topper on Cabinet 0 (LOBBY MATCHMAKING)
      if (idx === 0) {
        const topperBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.36, 0.72),
          new THREE.MeshStandardMaterial({ color: 0x161a36 }),
        );
        topperBox.position.set(-0.02, 2.08, 0);
        const topperSign = new THREE.Mesh(
          new THREE.PlaneGeometry(0.68, 0.32),
          new THREE.MeshBasicMaterial({ map: lobbyMarqueeTex(), toneMapped: false }),
        );
        topperSign.position.set(0.18, 2.08, 0);
        topperSign.rotation.y = Math.PI / 2;
        g.add(topperBox, topperSign);
      }

      this.loungeDecorGroup.add(g);
    });
  }

  private _buildFireplaceAndBar(): void {
    // 1. Right-wall Brick Fireplace (x = 5.05, z = -1.25)
    const fpGroup = new THREE.Group();
    fpGroup.position.set(5.05, 0, -1.25);
    const brickMat = new THREE.MeshStandardMaterial({
      map: brickWallTex(202, [2, 2]),
      roughness: 0.9,
    });
    const mantelMat = new THREE.MeshStandardMaterial({
      map: walnutTrimTex([92, 54, 28], 41, [2, 1]),
      roughness: 0.65,
    });

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.95, 4.2, 1.9), brickMat);
    chimney.position.set(0.15, 2.1, 0);
    const mantel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 2.1), mantelMat);
    mantel.position.set(0, 1.48, 0);

    // Hearth dark backplate recessed at x = -0.31 so flames in front are 100% visible!
    const hearthBack = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 0.92),
      new THREE.MeshBasicMaterial({ color: 0x1a0703 }),
    );
    hearthBack.rotation.y = -Math.PI / 2;
    hearthBack.position.set(-0.33, 0.5, 0);

    // Glowing fire logs & multi-layer flames in front of the hearth backplate
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

    fpGroup.add(chimney, mantel, hearthBack, log1, fireOuter, fireInner);
    this.loungeDecorGroup.add(fpGroup);

    // Rising pixel fireplace embers + pool spotlight dust motes (InstancedMesh)
    const emberCount = 36;
    const emberGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    const emberMat = new THREE.MeshBasicMaterial({ color: 0xffb84a, toneMapped: false });
    this.emberInstanced = new THREE.InstancedMesh(emberGeo, emberMat, emberCount);
    this.emberInstanced.frustumCulled = false;
    for (let i = 0; i < emberCount; i++) {
      const inFire = i < 18;
      this.emberData.push({
        x: inFire ? 4.58 + (Math.random() - 0.5) * 0.25 : (Math.random() - 0.5) * 3.2,
        y: inFire ? 0.25 + Math.random() * 1.1 : 1.0 + Math.random() * 2.4,
        z: inFire ? -1.25 + (Math.random() - 0.5) * 0.75 : (Math.random() - 0.5) * 2.2,
        vy: inFire ? 0.45 + Math.random() * 0.35 : 0.06 + Math.random() * 0.06,
        phase: Math.random() * 6.28,
      });
    }
    this.loungeDecorGroup.add(this.emberInstanced);

    // 2. Oak Bar Counter, Back-Bar Liquor Shelves & Stools (front-right, x = 4.15, z = 1.95)
    const barGroup = new THREE.Group();
    barGroup.position.set(4.15, 0, 1.95);
    const barBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 1.05, 3.1),
      new THREE.MeshStandardMaterial({ map: walnutTrimTex([78, 44, 22], 51, [2, 2]), roughness: 0.7 }),
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
      new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.25, roughness: 0.2 }),
    );
    tapTower.position.set(0.18, 1.32, 0.1);
    barGroup.add(tapTower);

    // Back-bar tiered liquor bottle shelves & glowing OPEN neon sign on right wall
    for (const sy of [1.55, 2.05]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 2.4), mantelMat);
      shelf.position.set(1.22, sy, 0);
      barGroup.add(shelf);
      const bottleColors = [0x35b25a, 0xe0493a, 0x3a74e0, 0xf2c230, 0x9b51e0, 0x54e0ee];
      for (let bi = 0; bi < 6; bi++) {
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.04, 0.22, 6),
          new THREE.MeshStandardMaterial({
            color: bottleColors[(bi + Math.round(sy * 2)) % bottleColors.length],
            roughness: 0.25,
          }),
        );
        bottle.position.set(1.18, sy + 0.13, -0.9 + bi * 0.35);
        barGroup.add(bottle);
      }
    }

    const openSign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 0.38),
      new THREE.MeshBasicMaterial({ map: openNeonTex(), toneMapped: false }),
    );
    openSign.rotation.y = -Math.PI / 2;
    openSign.position.set(1.32, 2.75, 0.2);
    barGroup.add(openSign);

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
    return null;
  }

  // Raycast floor position for click-to-move
  pickFloorPoint(ndc: { x: number; y: number }): { x: number; z: number } | null {
    _ndc.set(ndc.x, ndc.y);
    _raycaster.setFromCamera(_ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (_raycaster.ray.intersectPlane(plane, hit)) {
      const cx = Math.max(-4.5, Math.min(4.1, hit.x));
      const cz = Math.max(-3.2, Math.min(3.5, hit.z));
      return { x: cx, z: cz };
    }
    return null;
  }

  setMoveTarget(x: number, z: number): void {
    this.playerTarget = { x, z };
    if (this.moveTargetRing) {
      this.moveTargetRing.position.set(x, 0.014, z);
      this.moveTargetRing.scale.setScalar(1);
      (this.moveTargetRing.material as THREE.MeshBasicMaterial).opacity = 0.9;
    }
  }

  clearMoveTarget(): void {
    this.playerTarget = null;
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
    this.fpsDartHand.scale.setScalar(1.35);
    g.add(this.fpsDartHand);

    this.npcFlyDart = this._makeDartMesh(0x54e0ee);
    g.add(this.npcFlyDart);
  }

  private _makeDartMesh(flightColor = 0xff5a4a): THREE.Group {
    const d = new THREE.Group();
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.005, 0.05, 6),
      new THREE.MeshStandardMaterial({ color: 0xdadce0, metalness: 0.8, roughness: 0.2 }),
    );
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.025;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.006, 0.07, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4a838, metalness: 0.7, roughness: 0.3 }),
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.035;
    const flight = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.045, 0.05),
      new THREE.MeshBasicMaterial({ color: flightColor }),
    );
    flight.position.z = 0.085;
    d.add(tip, barrel, flight);
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
      const swayX = Math.sin(this.time * 2.7) * 0.014;
      const swayY = Math.cos(this.time * 3.4) * 0.014;
      this.fpsDartHand.position.set(
        aim[0] + swayX + 0.06,
        aim[1] + swayY - 0.08,
        0.58,
      );
      this.fpsDartHand.lookAt(
        DART_ORIGIN.x + aim[0],
        DART_ORIGIN.y + aim[1],
        DART_ORIGIN.z,
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

  private _buildCharacters(): void {
    // 1. Walkable Player Avatar (Gold/Cyan Varsity Jacket)
    const pChar = this._makeCharacter(0xffb84a, 0x2b1d12, 0x1d2942, 'mug');
    this.player.grp = pChar.grp;
    this.player.mugMesh = pChar.armR;
    this.player.grp.position.set(this.player.x, 0, this.player.z);
    this.scene.add(this.player.grp);

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

    // 4. Lounge Patrons matching the reference image (around Pool, Darts, Ludo, Arcade, and Bar)
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
      // Pool players
      { x: -1.62, z: 0.15, yaw: 1.5, shirt: 0x8f2d28, hair: 0x3a2312, role: 'pool', prop: 'cue', chatterIdx: 0 },
      { x: 0.95, z: -0.92, yaw: -0.2, shirt: 0xede6d6, hair: 0xc99238, role: 'pool', prop: 'cue', chatterIdx: 5 },
      { x: 1.48, z: 0.72, yaw: -1.8, shirt: 0x334766, hair: 0x2c1b0e, role: 'pool', prop: 'none', chatterIdx: 0 },
      { x: -0.25, z: -0.88, yaw: 0.1, shirt: 0xd95f98, hair: 0x5c341a, role: 'pool', prop: 'none', chatterIdx: 2 },
      // Dart players
      { x: 1.75, z: -2.05, yaw: 2.9, shirt: 0xb8322a, hair: 0x422814, role: 'darts', prop: 'dart', chatterIdx: 1 },
      { x: 2.55, z: -1.85, yaw: 3.1, shirt: 0x246b78, hair: 0x3b2312, role: 'darts', prop: 'dart', chatterIdx: 1 },
      // Ludo & Dice table regulars
      { x: -2.45, z: 1.35, yaw: 0.0, shirt: 0xd9c7a3, hair: 0x593a1e, role: 'ludo', prop: 'none', chatterIdx: 2 },
      { x: -1.35, z: 2.35, yaw: -1.5, shirt: 0xc23e5c, hair: 0x452612, role: 'ludo', prop: 'none', chatterIdx: 4 },
      { x: -4.15, z: 1.95, yaw: 0.1, shirt: 0x2b3340, hair: 0x24160c, role: 'chat', prop: 'mug', chatterIdx: 7 },
      // Arcade & Bar regulars
      { x: -3.95, z: -2.1, yaw: -1.5, shirt: 0x994c26, hair: 0x301c0e, role: 'chat', prop: 'none', chatterIdx: 6 },
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
    const immersedGame =
      isImmersedPlay &&
      (station === 'pool' || station === 'ludo' || station === 'darts' || station === 'dice');

    // Full Immersion Isolation: When sitting down to play a game, hide all other stations & club distractions
    this.loungeDecorGroup.visible = !immersedGame;
    this.poolGroup.visible = !immersedGame || station === 'pool';
    if (this.poolRugMesh) this.poolRugMesh.visible = !immersedGame || station === 'pool';
    this.ludoGroup.visible = !immersedGame || station === 'ludo';
    if (this.ludoRugMesh) this.ludoRugMesh.visible = !immersedGame || station === 'ludo';
    this.dartsGroup.visible = !immersedGame || station === 'darts';
    this.diceTableGroup.visible = !immersedGame || station === 'dice';

    this.player.grp.visible =
      !immersedGame &&
      (appMode === 'lounge' || appMode === 'title') &&
      station === 'none' &&
      this.loungeCamMode !== 'fps';

    this.npcs.forEach((npc) => {
      if (immersedGame) {
        npc.grp.visible = false;
      } else if (station === 'ludo' && npc.role === 'ludo') {
        npc.grp.visible = false;
      } else if (station === 'darts' && npc.role === 'darts') {
        npc.grp.visible = false;
      } else if (station === 'pool' && poolCue.lowSight && npc.role === 'pool') {
        npc.grp.visible = false;
      } else {
        npc.grp.visible = true;
      }
    });

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
      this.camK = 3.6;

      if (mode === 'top') {
        const center = new THREE.Vector3(O.x + (L.boardX + L.trayX) / 2, O.y + 0.05, O.z);
        this.tgtLook.copy(center);
        this.tgtPos.set(center.x, center.y + 1.95, center.z + 0.01);
        this.tgtFov = 42;
      } else if (mode === 'dice') {
        const trayCenter = new THREE.Vector3(O.x + L.trayX, O.y + 0.06, O.z);
        this.tgtLook.copy(trayCenter);
        this.tgtPos.set(trayCenter.x, trayCenter.y + 0.92, trayCenter.z + 0.76);
        this.tgtFov = 38;
      } else if (mode === 'orbit') {
        const o = this.ludoOrbit;
        const look = new THREE.Vector3(O.x + (L.boardX + L.trayX) / 2, O.y + 0.05, O.z);
        this.tgtLook.copy(look);
        this.tgtPos.set(
          look.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
          look.y + Math.sin(o.pitch) * o.dist,
          look.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
        );
        this.tgtFov = 42;
        this.camK = 8;
      } else {
        // Default board + dice tray framing centered cleanly across both non-overlapping zones
        const boardCenter = new THREE.Vector3(O.x + (L.boardX + L.trayX) / 2 - 0.03, O.y + 0.04, O.z);
        this.tgtLook.copy(boardCenter);
        this.tgtPos.set(boardCenter.x + 0.04, boardCenter.y + 1.48, boardCenter.z + 1.18);
        this.tgtFov = 38;
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
      // Overhead angled billiard framing
      this.tgtLook.set(O.x, O.y, O.z);
      this.tgtPos.set(O.x, O.y + 1.92, O.z + 1.12);
      this.tgtFov = 44;
      this.camK = 4.5;
      return;
    }

    if (station === 'darts') {
      const D = DART_ORIGIN;
      this.tgtLook.set(D.x, D.y, D.z);
      this.tgtPos.set(D.x, D.y - 0.04, D.z + 1.12);
      this.tgtFov = 38;
      this.camK = 5.0;
      return;
    }

    if (station === 'dice') {
      const C = DICE_ORIGIN;
      this.tgtLook.set(C.x, C.y + 0.05, C.z);
      this.tgtPos.set(C.x, C.y + 0.72, C.z + 0.68);
      this.tgtFov = 40;
      this.camK = 4.8;
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
      // Cozy Isometric Diorama view matching the Club No.9 reference artwork
      const zScale = this.isoZoom;
      this.tgtLook.set(this.player.x * 0.35 - 0.15, 1.05, this.player.z * 0.35 + 0.15);
      this.tgtPos.set(
        this.tgtLook.x - 5.2 * zScale,
        6.9 * zScale,
        this.tgtLook.z + 7.5 * zScale,
      );
      this.tgtFov = 32;
      this.camK = 4.5;
    }
  }

  snapCamera(
    appMode: 'title' | 'lounge' | 'station' | 'paused' | 'gameover',
    station: StationId,
    poolCue: { yaw: number; lowSight: boolean } = { yaw: 0, lowSight: false },
    isImmersedPlay = false,
  ): void {
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

    // Player avatar positioning & gait bobbing
    this.player.grp.position.set(
      this.player.x,
      Math.abs(Math.sin(this.player.walkDist * 4.5)) * 0.04,
      this.player.z,
    );
    this.player.grp.rotation.y = this.player.yaw;
    if (this.player.beerToastTimer > 0) {
      this.player.beerToastTimer = Math.max(0, this.player.beerToastTimer - dt);
      if (this.player.mugMesh) {
        this.player.mugMesh.rotation.x = -0.9 * Math.sin(this.player.beerToastTimer * Math.PI * 0.5);
      }
      this.bartenderArm.rotation.x = -0.8;
    } else {
      if (this.player.mugMesh) this.player.mugMesh.rotation.x = 0;
      this.bartenderArm.rotation.x = Math.sin(this.time * 2) * 0.12;
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
      const dummy = new THREE.Object3D();
      this.emberData.forEach((em, idx) => {
        em.y += em.vy * dt;
        const inFire = idx < 18;
        if (inFire && em.y > 1.35) em.y = 0.25;
        if (!inFire && em.y > 3.2) em.y = 1.0;
        dummy.position.set(
          em.x + Math.sin(this.time * 2 + em.phase) * 0.04,
          em.y,
          em.z + Math.cos(this.time * 2 + em.phase) * 0.04,
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
        this.arcadeCanvases.forEach((ac, idx) => {
          drawArcadeScreen(ac.ctx, ac.canvas.width, ac.canvas.height, idx, this.time);
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
    this.pixelPost.dispose();
    this.renderer.dispose();
  }
}
