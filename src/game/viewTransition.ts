// Pure state machine and metadata for custom game view transitions and full-screen immersion.

export type GameStationId = 'ludo' | 'pool' | 'darts' | 'dice';

export type AnyStationId =
  | 'none'
  | GameStationId
  | 'arcade'
  | 'bartender'
  | 'jukebox';

export interface GameTransitionMeta {
  id: GameStationId;
  titleEn: string;
  titleZh: string;
  subtitleEn: string;
  subtitleZh: string;
  accentHex: string;
  tableNumber: string;
}

export const GAME_TRANSITION_META: Record<GameStationId, GameTransitionMeta> = {
  ludo: {
    id: 'ludo',
    titleEn: 'LUDO · CLUB No.9',
    titleZh: '九号飞行棋 · 专属牌桌',
    subtitleEn: 'Full-Screen Tabletop Immersion · 3D Shaker Cup & Felt Tray',
    subtitleZh: '全屏沉浸棋桌 · 3D皮革骰盅摇晃投掷',
    accentHex: '#ffb84a',
    tableNumber: 'TABLE 01',
  },
  pool: {
    id: 'pool',
    titleEn: 'CHINESE 8-BALL POOL',
    titleZh: '中式八球 · 冠军球台',
    subtitleEn: 'Full-Screen Championship Baize · Precision Cue & Spin Physics',
    subtitleZh: '全屏沉浸球台 · 精准瞄准与高低杆旋转物理',
    accentHex: '#5fe08a',
    tableNumber: 'TABLE 02',
  },
  darts: {
    id: 'darts',
    titleEn: '301 PIXEL DARTS',
    titleZh: '301 像素飞镖台',
    subtitleEn: 'Full-Screen Oche Focus · 20-Zone Sisal Board & Wind Drift',
    subtitleZh: '全屏专注投镖线 · 20分区标准靶盘与风偏模拟',
    accentHex: '#ff6a5a',
    tableNumber: 'LANE 03',
  },
  dice: {
    id: 'dice',
    titleEn: "LIAR'S DICE CUP",
    titleZh: '大话骰盅 · 决胜高脚桌',
    subtitleEn: 'Full-Screen High-Top Focus · 5-Die Shaker Bluff & Challenge',
    subtitleZh: '全屏专注博弈 · 5粒物理骰子摇晃与叫点挑战',
    accentHex: '#54e0ee',
    tableNumber: 'TABLE 04',
  },
};

export function isGameStation(station: string): station is GameStationId {
  return (
    station === 'ludo' ||
    station === 'pool' ||
    station === 'darts' ||
    station === 'dice'
  );
}

export interface ViewTransitionState {
  active: boolean;
  direction: 'enter' | 'exit';
  targetStation: AnyStationId;
  elapsed: number;
  duration: number;
  progress: number;
  /** 0 = open viewport, 1 = peak shutter/iris veil */
  shutterProgress: number;
  /** Camera swoop factor (1 at start of entry, 0 when settled into focused table frame) */
  cameraSwoop: number;
  /** True when the 3D lounge environment (walls, floor, NPCs, other tables) must be hidden */
  hideLoungeEnv: boolean;
  /** True when lounge UI overlays (Club Map, Jukebox, NPC bubbles, floor hints) must be hidden */
  hideLoungeOverlays: boolean;
}

export function createIdleTransition(
  currentStation: AnyStationId = 'none',
): ViewTransitionState {
  const inGame = isGameStation(currentStation);
  return {
    active: false,
    direction: inGame ? 'enter' : 'exit',
    targetStation: currentStation,
    elapsed: 0,
    duration: 0.68,
    progress: 1,
    shutterProgress: 0,
    cameraSwoop: 0,
    hideLoungeEnv: inGame,
    hideLoungeOverlays: inGame,
  };
}

export function beginViewTransition(
  targetStation: AnyStationId,
  direction: 'enter' | 'exit',
  duration = 0.68,
): ViewTransitionState {
  const enteringGame = direction === 'enter' && isGameStation(targetStation);
  return {
    active: true,
    direction,
    targetStation,
    elapsed: 0,
    duration: Math.max(0.15, duration),
    progress: 0,
    shutterProgress: 0.08,
    cameraSwoop: enteringGame ? 1 : 0.4,
    // Hide lounge environment and overlays immediately when entering a focused game session
    hideLoungeEnv: enteringGame,
    hideLoungeOverlays: enteringGame || direction === 'enter',
  };
}

export function stepViewTransition(
  state: ViewTransitionState,
  dt: number,
): ViewTransitionState {
  if (!state.active) return state;

  const elapsed = Math.min(state.duration, state.elapsed + Math.max(0, dt));
  const u = Math.min(1, elapsed / state.duration);

  // Smooth symmetric shutter curve: peaks at u = 0.42, then opens smoothly to reveal the focused game
  let shutter = 0;
  if (u < 0.42) {
    const t = u / 0.42;
    shutter = t * t * (3 - 2 * t);
  } else {
    const t = (u - 0.42) / 0.58;
    const easeOut = 1 - (1 - t) * (1 - t);
    shutter = Math.max(0, 1 - easeOut);
  }

  // Smooth cubic decay for 3D camera swoop into the table
  const inv = 1 - u;
  const cameraSwoop = inv * inv * inv;

  const enteringGame =
    state.direction === 'enter' && isGameStation(state.targetStation);

  const done = elapsed >= state.duration - 1e-5;
  return {
    ...state,
    active: !done,
    elapsed,
    progress: done ? 1 : u,
    shutterProgress: done ? 0 : shutter,
    cameraSwoop: done ? 0 : cameraSwoop,
    hideLoungeEnv: enteringGame ? true : !done && u < 0.35,
    hideLoungeOverlays: enteringGame ? true : !done,
  };
}
