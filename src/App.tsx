/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  Volume2,
  VolumeX,
  Pause,
  Settings,
  Disc3,
  Users,
  ChevronDown,
  ChevronUp,
  Eye,
  RotateCcw,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { I18N, NPC_CHATTER, type Lang } from './game/i18n.ts';
import { mulberry32 } from './game/rng.ts';
import { COLOR_NAMES, COLOR_NAMES_ZH, COLOR_CSS, P_HOME } from './game/ludoBoard.ts';
import {
  newGame,
  rollDie,
  applyMove,
  passTurn,
  homeCount,
  type LudoState,
  type LudoMove,
  type SeatType,
} from './game/ludoRules.ts';
import { chooseMove, type CpuDiff } from './game/ludoAi.ts';
import { DieTray } from './game/ludoDieTray.ts';
import { PoolSim, type PoolReplayFrame } from './game/poolSim.ts';
import { DartsGame } from './game/dartsSim.ts';
import { DiceCupSim } from './game/diceCupSim.ts';
import {
  ClubWorld,
  STATION_HOTSPOTS,
  type StationId,
  type LudoCamMode,
} from './scene/clubWorld.ts';
import { ClubAudio } from './scene/audio.ts';
import { P2PLobbyManager } from './net/p2pLobby.ts';
import {
  GAME_TRANSITION_META,
  isGameStation,
  createIdleTransition,
  beginViewTransition,
  stepViewTransition,
  type ViewTransitionState,
} from './game/viewTransition.ts';

const LUDO_PRESETS: Record<string, SeatType[]> = {
  cpu: ['human', 'cpu', 'cpu', 'cpu'],
  duel: ['human', 'off', 'cpu', 'off'],
  local: ['human', 'off', 'human', 'off'],
  four: ['human', 'human', 'human', 'human'],
  watch: ['cpu', 'cpu', 'cpu', 'cpu'],
};

const LUDO_CAM_MODES: LudoCamMode[] = ['auto', 'board', 'dice', 'top', 'orbit'];
const POWER_SEGS = 14;

export default function App() {
  const qs = new URLSearchParams(window.location.search);
  const autoStart = qs.get('autostart') === '1' || qs.has('demo') || qs.has('station');
  const initialStation = (qs.get('station') as StationId) || 'none';

  const [lang, setLang] = useState<Lang>((qs.get('lang') as Lang) || 'en');
  const [appMode, setAppMode] = useState<'title' | 'lounge' | 'station' | 'paused' | 'gameover'>(
    autoStart ? (initialStation !== 'none' ? 'station' : 'lounge') : 'title',
  );
  const [station, setStation] = useState<StationId>(autoStart ? initialStation : 'none');
  const [stationViewMode, setStationViewMode] = useState<'view' | 'play'>(
    autoStart && isGameStation(initialStation) ? 'play' : 'view',
  );
  const [pausedGames, setPausedGames] = useState<Partial<Record<StationId, boolean>>>({});
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [transitionUi, setTransitionUi] = useState<ViewTransitionState>(() =>
    createIdleTransition(autoStart ? initialStation : 'none'),
  );
  const [loungeCam, setLoungeCam] = useState<'isometric' | 'fps'>('isometric');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [showLudoConfig, setShowLudoConfig] = useState(false);

  // Settings
  const [pixelScale, setPixelScale] = useState<number>(1.0);
  const [showAimLines, setShowAimLines] = useState<boolean>(true);
  const [closeUpCam, setCloseUpCam] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(false);
  const [jukeboxTrack, setJukeboxTrack] = useState<number>(0);

  // Proximity & Flash banners
  const [nearbyHotspot, setNearbyHotspot] = useState<StationId>('none');
  const [npcBubble, setNpcBubble] = useState<{
    text: string;
    x: number;
    y: number;
    visible: boolean;
  }>({ text: '', x: 0, y: 0, visible: false });
  const [flashBanner, setFlashBanner] = useState<{
    title: string;
    sub: string;
    color: string;
  } | null>(null);

  // Ludo UI state
  const [ludoSeats, setLudoSeats] = useState<SeatType[]>(['human', 'cpu', 'cpu', 'cpu']);
  const [ludoDiff, setLudoDiff] = useState<CpuDiff>('normal');
  const [ludoCam, setLudoCam] = useState<LudoCamMode>('auto');
  const [ludoFast, setLudoFast] = useState<boolean>(false);
  const [ludoSnapshot, setLudoSnapshot] = useState<{
    turn: number;
    phase: string;
    die: number | null;
    tokens: number[][];
    seats: SeatType[];
    canRoll: boolean;
    pickMoves: LudoMove[];
    winner: number | null;
    stats: Array<{ captures: number; captured: number; sixes: number }>;
  }>({
    turn: 0,
    phase: 'roll',
    die: null,
    tokens: [
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
      [-1, -1, -1, -1],
    ],
    seats: ['human', 'cpu', 'cpu', 'cpu'],
    canRoll: true,
    pickMoves: [],
    winner: null,
    stats: [
      { captures: 0, captured: 0, sixes: 0 },
      { captures: 0, captured: 0, sixes: 0 },
      { captures: 0, captured: 0, sixes: 0 },
      { captures: 0, captured: 0, sixes: 0 },
    ],
  });

  // Pool UI state
  const [poolUi, setPoolUi] = useState({
    turn: 0 as 0 | 1,
    scores: [0, 0] as [number, number],
    suits: [null, null] as [string | null, string | null],
    practiceMode: false,
    ballInHand: true,
    comboStreak: 0,
    message: 'Break Shot Ready',
    spinX: 0,
    spinY: 0,
    lowSight: false,
    replayMode: false,
    replayIdx: 0,
    replaySpeed: 0.5,
    replayLen: 0,
  });

  // Darts UI state
  const [dartsUi, setDartsUi] = useState({
    round: 1,
    turn: 0 as 0 | 1,
    dartsLeft: 3,
    scores: [0, 0] as [number, number],
    wind: [0.01, -0.008] as [number, number],
    lastLabel: '',
    unlocked180: false,
  });

  // Dice Cup UI state
  const [diceUi, setDiceUi] = useState({
    playerFaces: [1, 2, 3, 4, 5],
    cpuFaces: [2, 3, 4, 5, 6],
    cupLifted: false,
    bidQty: 2,
    bidFace: 4,
    currentBid: null as { by: 0 | 1; quantity: number; face: number } | null,
    scores: [0, 0] as [number, number],
    message: 'Shake the cup to roll your 5 dice!',
  });

  // P2P Arcade Lobby UI state
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [peerStatus, setPeerStatus] = useState<'offline' | 'ready' | 'connected' | 'bot_partner'>('offline');
  const [partnerName, setPartnerName] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Refs for 60Hz loop & mutable engines
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const powerBarRef = useRef<HTMLDivElement | null>(null);
  const dieTagRef = useRef<HTMLDivElement | null>(null);
  const pawnTagsContainerRef = useRef<HTMLDivElement | null>(null);
  const screenFlashRef = useRef<HTMLDivElement | null>(null);
  const transitionOverlayRef = useRef<HTMLDivElement | null>(null);
  const transitionRef = useRef<ViewTransitionState>(
    createIdleTransition(autoStart ? initialStation : 'none'),
  );

  const worldRef = useRef<ClubWorld | null>(null);
  const audioRef = useRef<ClubAudio>(new ClubAudio());
  const lobbyRef = useRef<P2PLobbyManager | null>(null);

  // Simulation engine refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rapierRef = useRef<any>(null);
  const ludoStateRef = useRef<LudoState>(newGame(['human', 'cpu', 'cpu', 'cpu'], 0));
  const ludoTrayRef = useRef<DieTray | null>(null);
  const poolSimRef = useRef<PoolSim | null>(null);
  const dartsSimRef = useRef<DartsGame>(new DartsGame());
  const diceSimRef = useRef<DiceCupSim | null>(null);

  // Mutable loop synchronization refs
  const modeRef = useRef(appMode);
  modeRef.current = appMode;
  const stationRef = useRef(station);
  stationRef.current = station;
  const viewModeRef = useRef<'view' | 'play'>('view');
  viewModeRef.current = stationViewMode;
  const pausedGamesRef = useRef<Partial<Record<StationId, boolean>>>({});
  pausedGamesRef.current = pausedGames;
  const userPlayedRef = useRef<Partial<Record<StationId, boolean>>>({});
  const langRef = useRef(lang);
  langRef.current = lang;
  const showAimRef = useRef(showAimLines);
  showAimRef.current = showAimLines;
  const closeUpRef = useRef(closeUpCam);
  closeUpRef.current = closeUpCam;

  const keysHeldRef = useRef<Set<string>>(new Set());
  const chargeRef = useRef<{ active: boolean; t: number; lastRattle: number }>({
    active: false,
    t: 0,
    lastRattle: 0,
  });
  const ludoCtrlRef = useRef<{
    runId: number;
    canRoll: boolean;
    rollReq: { power: number; elapsed: number } | null;
    pickMoves: LudoMove[] | null;
    pickResolve: ((m: LudoMove) => void) | null;
    timers: Array<{ t: number; res: () => void; rej: (e: unknown) => void }>;
    waits: Array<{ fn: () => boolean; res: () => void; rej: (e: unknown) => void }>;
    lastRollColor: number;
    seats: SeatType[];
    diff: CpuDiff;
  }>({
    runId: 0,
    canRoll: false,
    rollReq: null,
    pickMoves: null,
    pickResolve: null,
    timers: [],
    waits: [],
    lastRollColor: 0,
    seats: ['human', 'cpu', 'cpu', 'cpu'],
    diff: 'normal',
  });

  const t = I18N[lang];

  // Sync body[data-state] for verification & accessibility
  useEffect(() => {
    const stateAttr =
      appMode === 'title'
        ? 'title'
        : appMode === 'paused'
          ? 'paused'
          : appMode === 'gameover'
            ? 'gameover'
            : 'playing';
    document.body.dataset.state = stateAttr;
    document.body.dataset.station = station;
    document.body.dataset.viewmode = stationViewMode;
    document.body.dataset.immersed = String(isGameStation(station) && stationViewMode === 'play');
    document.body.dataset.transitioning = String(transitionUi.active);
  }, [appMode, station, stationViewMode, transitionUi.active]);

  const showFlash = useCallback((title: string, sub = '', color = '#ffb84a') => {
    setFlashBanner({ title, sub, color });
    window.setTimeout(() => {
      setFlashBanner((prev) => (prev?.title === title ? null : prev));
    }, 1750);
  }, []);

  const syncLudoReactState = useCallback(() => {
    const s = ludoStateRef.current;
    const ctrl = ludoCtrlRef.current;
    setLudoSnapshot({
      turn: s.turn,
      phase: s.phase,
      die: s.die,
      tokens: s.tokens.map((r) => [...r]),
      seats: [...s.seats],
      canRoll: ctrl.canRoll,
      pickMoves: ctrl.pickMoves ? [...ctrl.pickMoves] : [],
      winner: s.winner,
      stats: s.stats.map((st) => ({ ...st })),
    });
  }, []);

  const syncPoolReactState = useCallback(() => {
    const p = poolSimRef.current;
    if (!p) return;
    setPoolUi((prev) => ({
      ...prev,
      turn: p.turn,
      scores: [...p.scores] as [number, number],
      suits: [...p.suits] as [string | null, string | null],
      practiceMode: p.practiceMode,
      ballInHand: p.ballInHand,
      comboStreak: p.comboStreak,
      message: p.lastMessage,
      spinX: p.cue.spinX,
      spinY: p.cue.spinY,
      lowSight: p.cue.lowSight,
      replayLen: p.lastShotReplay.length,
    }));
  }, []);

  const syncDartsReactState = useCallback(() => {
    const d = dartsSimRef.current;
    setDartsUi({
      round: d.round,
      turn: d.turn,
      dartsLeft: d.dartsLeft,
      scores: [...d.scores] as [number, number],
      wind: [...d.wind] as [number, number],
      lastLabel: d.lastResult?.label || '',
      unlocked180: d.unlocked180,
    });
  }, []);

  const syncDiceReactState = useCallback(() => {
    const c = diceSimRef.current;
    if (!c) return;
    setDiceUi((prev) => ({
      ...prev,
      playerFaces: c.playerDice.map((d) => d.face),
      cpuFaces: [...c.cpuDice],
      cupLifted: c.cupLifted,
      currentBid: c.currentBid ? { ...c.currentBid } : null,
      scores: [...c.scores] as [number, number],
      message: c.roundMessage,
    }));
  }, []);

  // ------------------------------------------------------------------ LUDO ASYNC TURN RUNNER
  const startLudoMatch = useCallback(
    (customSeats?: SeatType[], customDiff?: CpuDiff) => {
      const world = worldRef.current;
      const R = rapierRef.current;
      if (!world || !R) return;

      const ctrl = ludoCtrlRef.current;
      ctrl.runId++;
      for (const x of [...ctrl.timers, ...ctrl.waits]) x.rej(new Error('cancel'));
      ctrl.timers = [];
      ctrl.waits = [];

      const seats = customSeats || ctrl.seats;
      const diff = customDiff || ctrl.diff;
      ctrl.seats = [...seats];
      ctrl.diff = diff;

      ludoTrayRef.current?.dispose();
      ludoTrayRef.current = new DieTray(R, { seed: (Date.now() & 0xffff) + ctrl.runId * 97 });

      const active = seats.map((s, i) => (s !== 'off' ? i : -1)).filter((i) => i >= 0);
      const st = newGame(seats, active[0]);
      ludoStateRef.current = st;
      ctrl.canRoll = false;
      ctrl.rollReq = null;
      ctrl.pickMoves = null;
      ctrl.pickResolve = null;

      world.setAllLudoP(st.tokens);
      world.setLudoSelectable([]);
      world.setLudoActiveColors(active);
      world.setLudoDie(null);
      world.ludoPhase = 'roll';
      setShowLudoConfig(false);
      if (modeRef.current === 'gameover') setAppMode('station');
      syncLudoReactState();

      const myRun = ctrl.runId;
      const sleep = (sec: number) =>
        new Promise<void>((res, rej) => ctrl.timers.push({ t: sec, res, rej }));
      const until = (fn: () => boolean) =>
        new Promise<void>((res, rej) => ctrl.waits.push({ fn, res, rej }));
      const rng = mulberry32(1009 + myRun * 7919);

      const dedupeMoves = (moves: LudoMove[]) => {
        const seen = new Set<string | number>();
        return moves.filter((m) => {
          const k = m.enters ? 'in' : m.token;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      };

      (async () => {
        while (st.phase !== 'over' && ctrl.runId === myRun) {
          const seat = st.seats[st.turn];
          world.setLudoTurnColor(st.turn);
          world.ludoPhase = 'roll';
          syncLudoReactState();

          if (st.phase === 'roll') {
            let power = 0.6;
            let preShaken = 0;
            if (seat === 'human') {
              ctrl.canRoll = true;
              ctrl.rollReq = null;
              syncLudoReactState();
              await until(() => ctrl.rollReq != null);
              power = ctrl.rollReq!.power;
              preShaken = ctrl.rollReq!.elapsed;
              ctrl.canRoll = false;
              syncLudoReactState();
            } else {
              await sleep(0.55);
              power = 0.45 + rng() * 0.52;
            }

            const tray = ludoTrayRef.current!;
            tray.throwDie(power, preShaken);
            audioRef.current.play('cupShake');
            world.ludoPhase = 'roll';
            await until(() => tray.phase === 'rolling' || tray.phase === 'ready');
            audioRef.current.play('throw');
            await until(() => tray.phase === 'ready');
            const face = tray.face;
            await sleep(0.28);

            const ph = rollDie(st, face);
            ctrl.lastRollColor = st.turn;
            syncLudoReactState();

            if (face === 6 && ph !== 'forfeit') audioRef.current.play('six');
            if (ph === 'forfeit') {
              showFlash(
                I18N[langRef.current].threeSixes,
                I18N[langRef.current].turnLost,
                '#ff6a5a',
              );
              audioRef.current.play('nomove');
              world.doFlash(0xff3020, 0.25);
              await sleep(1.4);
              passTurn(st);
              continue;
            }
            if (ph === 'nomove') {
              showFlash(
                I18N[langRef.current].noMove,
                face === 6 ? '' : I18N[langRef.current].needSix,
                '#8d92a8',
              );
              audioRef.current.play('nomove');
              await sleep(1.15);
              passTurn(st);
              continue;
            }
          }

          if (st.phase === 'pick') {
            await sleep(0.45);
            world.ludoPhase = 'play';
            const moves = dedupeMoves(st.moves);
            let m: LudoMove;
            if (moves.length === 1) {
              world.setLudoSelectable(moves);
              ctrl.pickMoves = null;
              syncLudoReactState();
              await sleep(0.55);
              m = moves[0];
            } else if (seat === 'human') {
              ctrl.pickMoves = moves;
              world.setLudoSelectable(moves);
              syncLudoReactState();
              m = await new Promise<LudoMove>((res, rej) => {
                ctrl.pickResolve = res;
                ctrl.timers.push({ t: 1e9, res: () => {}, rej });
              });
            } else {
              world.setLudoSelectable(moves);
              syncLudoReactState();
              await sleep(0.75);
              m = chooseMove(st, st.moves, ctrl.diff, rng);
            }

            ctrl.pickMoves = null;
            ctrl.pickResolve = null;
            world.setLudoSelectable([]);
            world.setLudoHover(-1, -1);
            syncLudoReactState();

            await world.moveLudoPawn(m.color, m.token, m.from, m.to);
            const r = applyMove(st, m);
            audioRef.current.play('place');
            if (m.captures.length) {
              audioRef.current.play('capture');
              world.doFlash(0xff3020, 0.3);
              showFlash(
                I18N[langRef.current].captured,
                `${COLOR_NAMES[m.color]} -> ${m.captures.map((v) => COLOR_NAMES[v.color]).join(' & ')}`,
                '#ff6a5a',
              );
              await Promise.all(m.captures.map((v) => world.sendLudoHome(v.color, v.token)));
            }
            if (m.finishes) {
              audioRef.current.play('home');
              if (!r.won) showFlash(I18N[langRef.current].pawnHome, '', '#5fe08a');
            }
            syncLudoReactState();

            if (r.won) {
              audioRef.current.play('win');
              showFlash(`${COLOR_NAMES[m.color].toUpperCase()} WINS!`, '', COLOR_CSS[m.color]);
              await sleep(0.8);
              setAppMode('gameover');
              return;
            }
            if (r.bonus) {
              if (!m.captures.length && !m.finishes) {
                showFlash(I18N[langRef.current].rollAgain, '', '#ffb84a');
              }
              await sleep(0.45);
            } else {
              await sleep(0.25);
            }
          }
        }
      })().catch(() => {
        // cancelled on restart
      });
    },
    [showFlash, syncLudoReactState],
  );

  const chooseLudoMoveForToken = useCallback((tok: number) => {
    const ctrl = ludoCtrlRef.current;
    const st = ludoStateRef.current;
    if (!ctrl.pickMoves || !ctrl.pickResolve) return;
    const exact = ctrl.pickMoves.find((m) => m.token === tok);
    const chosen =
      exact || (st.tokens[st.turn][tok] === -1 ? ctrl.pickMoves.find((m) => m.enters) : null);
    if (!chosen) return;
    const resolve = ctrl.pickResolve;
    ctrl.pickResolve = null;
    audioRef.current.play('pick');
    resolve(chosen);
  }, []);

  // ------------------------------------------------------------------ ENTER / PAUSE / RESUME STATIONS
  const enterPlayMode = useCallback(
    (target?: StationId) => {
      const st = target && target !== 'none' ? target : stationRef.current;
      if (!isGameStation(st)) return;
      audioRef.current.unlock();
      audioRef.current.play('turn');
      setShowNavMenu(false);
      setHudCollapsed(false);
      setNpcBubble((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      setFlashBanner(null);

      // Start custom Spotlight Shutter & Iris Transition Effect
      const nextTrans = beginViewTransition(st, 'enter', 0.68);
      transitionRef.current = nextTrans;
      setTransitionUi(nextTrans);

      userPlayedRef.current[st] = true;
      pausedGamesRef.current = { ...pausedGamesRef.current, [st]: false };
      setPausedGames({ ...pausedGamesRef.current });

      stationRef.current = st;
      viewModeRef.current = 'play';
      modeRef.current = 'station';
      setStation(st);
      setStationViewMode('play');
      setAppMode('station');

      if (st === 'ludo' && !ludoCtrlRef.current.runId) {
        startLudoMatch(ludoSeats, ludoDiff);
      }
      if (worldRef.current) {
        worldRef.current.transitionSwoop = 1.0;
        worldRef.current.snapCamera(
          'station',
          st,
          poolSimRef.current?.cue || { yaw: 0, lowSight: false },
          true,
        );
      }
    },
    [ludoDiff, ludoSeats, startLudoMatch],
  );

  const leaveAndPauseStation = useCallback(() => {
    const currentSt = stationRef.current;
    const wasPlaying = viewModeRef.current === 'play';
    if (worldRef.current) {
      worldRef.current.ludoManualShake = { active: false, power: 0 };
      worldRef.current.transitionSwoop = 0;
    }
    chargeRef.current.active = false;
    setShowNavMenu(false);
    setHudCollapsed(false);

    // Trigger custom exit transition back to Lounge
    const exitTrans = beginViewTransition('none', 'exit', 0.48);
    transitionRef.current = exitTrans;
    setTransitionUi(exitTrans);

    if (wasPlaying && isGameStation(currentSt)) {
      userPlayedRef.current[currentSt] = true;
      pausedGamesRef.current = { ...pausedGamesRef.current, [currentSt]: true };
      setPausedGames({ ...pausedGamesRef.current });
      const stLabel =
        langRef.current === 'zh'
          ? STATION_HOTSPOTS.find((h) => h.id === currentSt)?.labelZh
          : STATION_HOTSPOTS.find((h) => h.id === currentSt)?.labelEn;
      showFlash(
        langRef.current === 'zh' ? `${stLabel} 已暂停保留` : `${stLabel} Paused`,
        langRef.current === 'zh'
          ? '可在俱乐部自由漫步，随时点击顶部恢复对局'
          : 'Walk around freely — click Resume in the top bar anytime',
        '#ffb84a',
      );
    }

    stationRef.current = 'none';
    viewModeRef.current = 'view';
    modeRef.current = 'lounge';
    setStation('none');
    setStationViewMode('view');
    setAppMode('lounge');
    worldRef.current?.snapCamera('lounge', 'none', { yaw: 0, lowSight: false }, false);
  }, [showFlash]);

  const activateStation = useCallback(
    (target: StationId, _autoPlay = true) => {
      audioRef.current.unlock();
      audioRef.current.play('tick');
      setShowNavMenu(false);
      if (target === 'bartender') {
        audioRef.current.play('pourBeer');
        worldRef.current?.triggerBartenderToast();
        showFlash(
          langRef.current === 'zh' ? '干杯！冰镇九号精酿已满上！' : 'Cheers! Frosted Club No.9 Pint Served!',
          langRef.current === 'zh' ? '橡木吧台调酒师向你致意' : 'Compliments of the Bartender',
          '#ffb84a',
        );
        return;
      }
      if (target === 'jukebox') {
        setJukeboxTrack((prev) => {
          const next = (prev + 1) % 4;
          audioRef.current.setTrack(next);
          showFlash(
            `♪ ${I18N[langRef.current].tracks[next]}`,
            I18N[langRef.current].stationJukebox,
            '#54e0ee',
          );
          return next;
        });
        return;
      }
      if (target === 'none') {
        leaveAndPauseStation();
        return;
      }
      // Entering any of the 4 games (Ludo, Pool, Darts, Dice) immediately runs the custom transition into full-screen focused state
      if (isGameStation(target)) {
        enterPlayMode(target);
        return;
      }
      stationRef.current = target;
      viewModeRef.current = 'view';
      modeRef.current = 'station';
      setStation(target);
      setStationViewMode('view');
      setAppMode('station');
    },
    [enterPlayMode, leaveAndPauseStation, showFlash],
  );

  const handleStartFromTitle = useCallback(
    (initialTarget: StationId = 'none') => {
      audioRef.current.unlock();
      audioRef.current.play('turn');
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      keysHeldRef.current.clear();
      if (initialTarget !== 'none') {
        activateStation(initialTarget, true);
      } else {
        setStation('none');
        setAppMode('lounge');
      }
    },
    [activateStation],
  );

  // ------------------------------------------------------------------ CHARGE & STRIKE / THROW HANDLERS
  const beginCharge = useCallback(() => {
    if (modeRef.current === 'paused' || modeRef.current === 'title') return;
    if (viewModeRef.current !== 'play') return;
    const st = stationRef.current;
    if (st === 'ludo' && !ludoCtrlRef.current.canRoll) return;
    if (st === 'pool' && poolSimRef.current?.phase !== 'aiming') return;
    audioRef.current.unlock();
    chargeRef.current = { active: true, t: 0, lastRattle: 0 };
    if (st === 'ludo' && worldRef.current) {
      worldRef.current.ludoManualShake = { active: true, power: 0.25 };
      worldRef.current.setLudoDie(ludoTrayRef.current?.snapshot() || null);
      audioRef.current.play('cupShake');
    }
  }, []);

  const releaseCharge = useCallback(() => {
    if (!chargeRef.current.active) return;
    const elapsed = chargeRef.current.t;
    chargeRef.current.active = false;
    if (worldRef.current) {
      worldRef.current.ludoManualShake = { active: false, power: 0 };
    }
    const power = 0.22 + 0.78 * Math.min(1, elapsed / 0.9);
    const st = stationRef.current;

    if (st === 'ludo') {
      const ctrl = ludoCtrlRef.current;
      if (ctrl.canRoll) {
        ctrl.rollReq = { power, elapsed };
        ctrl.canRoll = false;
      }
    } else if (st === 'pool') {
      const p = poolSimRef.current;
      if (p && p.phase === 'aiming') {
        p.strike(power);
        audioRef.current.play('cueStrike', { gain: power });
        syncPoolReactState();
        lobbyRef.current?.broadcast({ type: 'pool_strike', payload: { yaw: p.cue.yaw, power } });
      }
    } else if (st === 'darts') {
      const d = dartsSimRef.current;
      const dart = d.throwDart(d.aim[0], d.aim[1], power);
      if (dart) {
        audioRef.current.play('dartThud');
        if (dart.result.points === 50) {
          audioRef.current.play('six');
          showFlash(I18N[langRef.current].dartsBullseye, dart.result.label, '#5fe08a');
        } else if (d.unlocked180) {
          audioRef.current.play('win');
          showFlash(I18N[langRef.current].darts180, 'TRIPLE 20 × 3!', '#ffb84a');
        } else {
          showFlash(dart.result.label, `+${dart.result.points} PTS`, '#54e0ee');
        }
        syncDartsReactState();
        if (d.vsCpu && d.turn === 1 && d.phase !== 'over') {
          window.setTimeout(() => {
            while (d.turn === 1 && d.phase !== 'over') {
              d.throwDart((Math.random() - 0.5) * 0.08, 0.09 + (Math.random() - 0.5) * 0.06, 0.78);
            }
            audioRef.current.play('dartThud');
            syncDartsReactState();
          }, 550);
        }
      }
    } else if (st === 'dice') {
      const c = diceSimRef.current;
      if (c) {
        c.shakeAndRoll();
        audioRef.current.play('throw');
        syncDiceReactState();
      }
    }
  }, [showFlash, syncDartsReactState, syncDiceReactState, syncPoolReactState]);

  // ------------------------------------------------------------------ INITIALIZE THREE.JS + RAPIER3D ONCE
  useEffect(() => {
    let rafId = 0;
    let disposed = false;

    const lobby = new P2PLobbyManager();
    lobbyRef.current = lobby;
    setRoomCode(lobby.initHost());
    lobby.onStatusChange = () => {
      setPeerStatus(lobby.status);
      setPartnerName(lobby.partnerName);
      setRoomCode(lobby.roomCode);
    };

    (async () => {
      await RAPIER.init();
      if (disposed || !canvasRef.current) return;
      rapierRef.current = RAPIER;

      const world = new ClubWorld(canvasRef.current).init();
      world.onHop = (step) => audioRef.current.play('hop', { step });
      worldRef.current = world;

      const pool = new PoolSim(RAPIER);
      poolSimRef.current = pool;
      syncPoolReactState();

      const dice = new DiceCupSim(RAPIER, 2026);
      diceSimRef.current = dice;
      syncDiceReactState();

      // Start initial Ludo game so the board is live right away
      startLudoMatch(['human', 'cpu', 'cpu', 'cpu'], 'normal');

      let lastTime = performance.now();
      let lastTrayHits = 0;
      let lastTrayPhase = 'idle';
      let lastPoolCollisions = 0;
      let lastPoolPockets = 0;
      let npcPoolShotTimer = 3.5;

      const tick = (now: number) => {
        if (disposed) return;
        rafId = requestAnimationFrame(tick);

        const rawDt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        const paused = modeRef.current === 'paused';
        const dt = paused ? 0 : rawDt * world.speed;

        // 1. Lounge Walking & Proximity Detection
        if (modeRef.current === 'lounge' && !paused) {
          const keys = keysHeldRef.current;
          const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1.65 : 1.0;
          const moveSpeed = 2.45 * sprint;
          let dx = 0;
          let dz = 0;
          if (keys.has('KeyW') || keys.has('ArrowUp')) dz -= 1;
          if (keys.has('KeyS') || keys.has('ArrowDown')) dz += 1;
          if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
          if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;

          // Click-to-move navigation support
          if (dx === 0 && dz === 0 && world.playerTarget) {
            const tx = world.playerTarget.x - world.player.x;
            const tz = world.playerTarget.z - world.player.z;
            const dist = Math.hypot(tx, tz);
            if (dist > 0.1) {
              dx = tx / dist;
              dz = tz / dist;
              const targetYaw = Math.atan2(dx, dz);
              let diff = (targetYaw - world.player.yaw) % (Math.PI * 2);
              if (diff < -Math.PI) diff += Math.PI * 2;
              if (diff > Math.PI) diff -= Math.PI * 2;
              world.player.yaw += diff * 0.22;
            } else {
              world.clearMoveTarget();
            }
          } else if (dx !== 0 || dz !== 0) {
            world.clearMoveTarget();
          }

          if (dx !== 0 || dz !== 0) {
            const len = Math.hypot(dx, dz);
            dx /= len;
            dz /= len;
            if (world.loungeCamMode === 'fps') {
              const fwdX = Math.sin(world.fpsYaw);
              const fwdZ = -Math.cos(world.fpsYaw);
              const rightX = Math.cos(world.fpsYaw);
              const rightZ = Math.sin(world.fpsYaw);
              const wx = fwdX * -dz + rightX * dx;
              const wz = fwdZ * -dz + rightZ * dx;
              world.player.x += wx * moveSpeed * rawDt;
              world.player.z += wz * moveSpeed * rawDt;
              world.player.yaw = world.fpsYaw;
            } else {
              world.player.x += dx * moveSpeed * rawDt;
              world.player.z += dz * moveSpeed * rawDt;
              world.player.yaw = Math.atan2(dx, dz);
            }
            // Clamp to walkable lounge floor & avoid central pool table overlap
            world.player.x = Math.max(-4.6, Math.min(4.2, world.player.x));
            world.player.z = Math.max(-3.3, Math.min(3.6, world.player.z));
            if (Math.abs(world.player.x) < 1.35 && Math.abs(world.player.z - 0.25) < 0.82) {
              if (Math.abs(world.player.x) > Math.abs(world.player.z - 0.25)) {
                world.player.x = Math.sign(world.player.x || 1) * 1.35;
              } else {
                world.player.z = 0.25 + Math.sign(world.player.z - 0.25 || 1) * 0.82;
              }
            }
            world.player.walkDist += moveSpeed * rawDt;
            lobby.broadcast({
              type: 'avatar',
              x: world.player.x,
              z: world.player.z,
              yaw: world.player.yaw,
            });
          }

          // Check nearest interactive station hotspot
          let closest: StationId = 'none';
          let bestDist = Infinity;
          for (const hs of STATION_HOTSPOTS) {
            const d = Math.hypot(world.player.x - hs.x, world.player.z - hs.z);
            if (d < hs.radius && d < bestDist) {
              bestDist = d;
              closest = hs.id;
            }
          }
          setNearbyHotspot((prev) => (prev !== closest ? closest : prev));

          // Check nearest NPC patron for speech bubble
          let nearNpc = null;
          let npcDist = 1.65;
          for (const npc of world.npcs) {
            const d = Math.hypot(world.player.x - npc.x, world.player.z - npc.z);
            if (d < npcDist) {
              npcDist = d;
              nearNpc = npc;
            }
          }
          if (nearNpc) {
            const proj = world.projectCoords(nearNpc.x, 1.42, nearNpc.z);
            const msg = NPC_CHATTER[nearNpc.chatterIdx % NPC_CHATTER.length][langRef.current];
            const clampedY = Math.max(90, Math.min(window.innerHeight - 190, proj.y));
            const clampedX = Math.max(130, Math.min(window.innerWidth - 130, proj.x));
            setNpcBubble({ text: msg, x: clampedX, y: clampedY, visible: proj.ok });
          } else {
            setNpcBubble((prev) => (prev.visible ? { ...prev, visible: false } : prev));
          }
        } else {
          setNpcBubble((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        }

        // 2. Advance Ludo timers, waits, and physical DieTray ONLY when Ludo is actively played
        const ctrl = ludoCtrlRef.current;
        const ludoActive =
          !paused && stationRef.current === 'ludo' && viewModeRef.current === 'play';
        const ludoDt = ludoActive ? dt : 0;

        if (ludoActive) {
          for (const tmr of ctrl.timers) tmr.t -= ludoDt;
          const due = ctrl.timers.filter((x) => x.t <= 0);
          ctrl.timers = ctrl.timers.filter((x) => x.t > 0);
          due.forEach((x) => x.res());

          const ready = ctrl.waits.filter((x) => x.fn());
          ctrl.waits = ctrl.waits.filter((x) => !x.fn());
          ready.forEach((x) => x.res());
        }

        const tray = ludoTrayRef.current;
        if (tray) {
          if (ludoActive) {
            tray.step(ludoDt);
          }
          world.setLudoDie(tray.snapshot());
          if (ludoActive) {
            if (tray.hits > lastTrayHits) {
              audioRef.current.play('hit', { gain: 0.75 });
            }
            lastTrayHits = tray.hits;
            if (lastTrayPhase === 'rolling' && tray.phase === 'tidy') {
              audioRef.current.play('land');
            }
            lastTrayPhase = tray.phase;
          }
        }

        // 3. Advance 8-Ball Pool physics (never disturb a user's active or paused Pool match!)
        if (pool.phase === 'rolling') {
          if (stationRef.current === 'pool' || !pausedGamesRef.current.pool) {
            pool.step(rawDt);
            if (stationRef.current === 'pool') {
              if (pool.collisionCount > lastPoolCollisions) {
                audioRef.current.play('ballClack');
                lastPoolCollisions = pool.collisionCount;
              }
              if (pool.shotPocketed.length > lastPoolPockets) {
                audioRef.current.play('pocketDrop');
                lastPoolPockets = pool.shotPocketed.length;
              }
            }
            if (pool.phase !== 'rolling') {
              lastPoolPockets = 0;
              syncPoolReactState();
              if (pool.phase === 'over' && stationRef.current === 'pool') {
                setAppMode('gameover');
              }
            }
          }
        } else if (
          stationRef.current === 'none' &&
          !paused &&
          !pausedGamesRef.current.pool &&
          !userPlayedRef.current.pool
        ) {
          npcPoolShotTimer -= rawDt;
          if (npcPoolShotTimer <= 0) {
            npcPoolShotTimer = 6.5 + Math.random() * 4.5;
            pool.cue.yaw = Math.random() * Math.PI * 2;
            pool.strike(0.35 + Math.random() * 0.35);
          }
        }

        const guide =
          stationRef.current === 'pool' && pool.phase === 'aiming'
            ? pool.computeAimGuidelines()
            : null;
        world.syncPoolState(
          pool.balls,
          pool.cue,
          guide,
          stationRef.current === 'pool' && pool.phase === 'aiming' && showAimRef.current,
        );

        // 4. Sync Darts & Dice Cup 3D meshes
        world.syncDartsState(
          dartsSimRef.current.thrownDarts,
          dartsSimRef.current.aim,
          stationRef.current === 'darts',
        );
        world.syncDiceCupState(dice.playerDice, dice.cupLifted);

        // 5. Update Power Charge Bar DOM directly + Ludo 3D Shaker Cup rattle
        if (chargeRef.current.active && !paused) {
          chargeRef.current.t += rawDt;
          const u = Math.min(1, chargeRef.current.t / 0.9);
          const n = Math.round(u * POWER_SEGS);
          if (stationRef.current === 'ludo') {
            world.ludoManualShake = { active: true, power: u };
            if (chargeRef.current.t - chargeRef.current.lastRattle > 0.085) {
              chargeRef.current.lastRattle = chargeRef.current.t;
              audioRef.current.play('cupShake', { gain: 0.7 + u * 0.4 });
            }
          }
          if (powerBarRef.current) {
            const children = powerBarRef.current.children;
            const col = u > 0.8 ? '#ff6a5a' : u > 0.45 ? '#ffb84a' : '#5fe08a';
            for (let i = 0; i < children.length; i++) {
              const el = children[i] as HTMLElement;
              el.style.background = i < n ? col : 'rgba(255,255,255,0.12)';
            }
          }
          if (chargeRef.current.t > 1.55) releaseCharge();
        }

        // 6. Step Custom View Transition & Update Scene Camera (Full Immersion Isolation in games)
        if (transitionRef.current.active) {
          transitionRef.current = stepViewTransition(transitionRef.current, rawDt);
          world.transitionSwoop = transitionRef.current.cameraSwoop;
          const el = transitionOverlayRef.current;
          if (el) {
            const sp = transitionRef.current.shutterProgress;
            el.style.opacity = sp > 0.01 ? '1' : '0';
            const topBlade = el.querySelector('[data-blade="top"]') as HTMLElement | null;
            const botBlade = el.querySelector('[data-blade="bottom"]') as HTMLElement | null;
            const plaque = el.querySelector('[data-plaque="center"]') as HTMLElement | null;
            if (topBlade) {
              topBlade.style.transform = `translate3d(0, ${(sp - 1) * 100}%, 0)`;
            }
            if (botBlade) {
              botBlade.style.transform = `translate3d(0, ${(1 - sp) * 100}%, 0)`;
            }
            if (plaque) {
              const pOpacity = Math.min(1, Math.max(0, (sp - 0.15) * 1.55));
              plaque.style.opacity = String(pOpacity);
              plaque.style.transform = `scale(${0.92 + sp * 0.08})`;
            }
          }
          if (!transitionRef.current.active) {
            world.transitionSwoop = 0;
            setTransitionUi({ ...transitionRef.current });
          }
        } else {
          world.transitionSwoop = 0;
        }

        const isImmersedPlay =
          isGameStation(stationRef.current) ||
          (viewModeRef.current === 'play' &&
            stationRef.current !== 'none' &&
            stationRef.current !== 'arcade');
        world.update(
          paused ? 0 : rawDt,
          modeRef.current,
          stationRef.current,
          pool.cue,
          pool.closeUpTarget,
          closeUpRef.current,
          lobby.remoteAvatar,
          isImmersedPlay,
        );

        // 7. Project 3D Ludo Pawn Tags & Die Number Tag onto screen
        if (pawnTagsContainerRef.current) {
          const moves =
            stationRef.current === 'ludo' &&
            ctrl.pickMoves &&
            ludoStateRef.current.seats[ludoStateRef.current.turn] === 'human' &&
            !paused
              ? ctrl.pickMoves
              : [];
          const children = pawnTagsContainerRef.current.children;
          for (let i = 0; i < 4; i++) {
            const el = children[i] as HTMLElement | undefined;
            if (!el) continue;
            const m = moves[i];
            if (!m) {
              el.hidden = true;
              continue;
            }
            const wp = world.ludoPawnWorldPos(m.color, m.token);
            const pr = world.projectWorld(wp);
            el.hidden = !pr.ok;
            el.style.left = `${pr.x}px`;
            el.style.top = `${pr.y}px`;
            el.textContent = String(m.token + 1);
          }
        }

        if (dieTagRef.current && tray) {
          const shown =
            tray.phase === 'ready' || tray.phase === 'tidy'
              ? tray.face || tray._tween?.face || 0
              : 0;
          if (shown && stationRef.current === 'ludo' && !paused) {
            const snap = tray.snapshot();
            const pr = world.projectWorld(world.ludoTrayWorld(snap.x, 0.1, snap.z));
            dieTagRef.current.hidden = !pr.ok;
            dieTagRef.current.style.left = `${pr.x}px`;
            dieTagRef.current.style.top = `${pr.y}px`;
            dieTagRef.current.style.background = COLOR_CSS[ctrl.lastRollColor];
            dieTagRef.current.textContent = String(shown);
          } else {
            dieTagRef.current.hidden = true;
          }
        }

        if (screenFlashRef.current) {
          screenFlashRef.current.style.opacity = String(world.flash);
          screenFlashRef.current.style.background = `#${world.flashColor.getHexString()}`;
        }

        world.render();
      };

      rafId = requestAnimationFrame(tick);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ludoTrayRef.current?.dispose();
      poolSimRef.current?.dispose();
      diceSimRef.current?.dispose();
      worldRef.current?.dispose();
    };
  }, [releaseCharge, startLudoMatch, syncDiceReactState, syncPoolReactState]);

  // ------------------------------------------------------------------ GLOBAL KEYBOARD & POINTER LISTENERS
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      audioRef.current.unlock();
      const code = e.code;
      keysHeldRef.current.add(code);

      if (modeRef.current === 'title') {
        if (code === 'Enter' || code === 'Space') {
          e.preventDefault();
          handleStartFromTitle('none');
        }
        return;
      }

      if (code === 'Escape') {
        e.preventDefault();
        if (stationRef.current !== 'none') {
          // Leaving a table pauses the active game and returns to the Lounge to walk around!
          leaveAndPauseStation();
          return;
        }
        setAppMode((prev) => (prev === 'paused' ? 'lounge' : 'paused'));
        return;
      }

      if (code === 'KeyP') {
        e.preventDefault();
        setAppMode((prev) =>
          prev === 'paused' ? (stationRef.current !== 'none' ? 'station' : 'lounge') : 'paused',
        );
        return;
      }

      if (modeRef.current === 'paused') return;

      if (code === 'Tab') {
        e.preventDefault();
        setShowNavMenu((prev) => !prev);
        return;
      }
      if (code === 'KeyM') {
        setMuted((prev) => {
          const next = !prev;
          audioRef.current.setMuted(next);
          return next;
        });
        return;
      }

      const st = stationRef.current;

      // Lounge exploration shortcuts
      if (st === 'none') {
        if (code === 'KeyV') {
          setLoungeCam((prev) => {
            const next = prev === 'isometric' ? 'fps' : 'isometric';
            if (worldRef.current) worldRef.current.loungeCamMode = next;
            return next;
          });
        } else if (code === 'KeyE' || code === 'Enter') {
          if (nearbyHotspot !== 'none') {
            activateStation(nearbyHotspot, Boolean(pausedGamesRef.current[nearbyHotspot]));
          }
        }
        return;
      }

      if (code === 'KeyH') {
        e.preventDefault();
        setHudCollapsed((prev) => !prev);
        return;
      }

      // Station-specific shortcuts in active play mode
      if (code === 'Space' && !e.repeat) {
        e.preventDefault();
        beginCharge();
        return;
      }

      if (st === 'ludo') {
        const digitMatch = /^(?:Digit|Numpad)([1-4])$/.exec(code);
        if (digitMatch) {
          chooseLudoMoveForToken(+digitMatch[1] - 1);
        } else if (code === 'KeyC') {
          setLudoCam((prev) => {
            const next = LUDO_CAM_MODES[(LUDO_CAM_MODES.indexOf(prev) + 1) % LUDO_CAM_MODES.length];
            if (worldRef.current) worldRef.current.ludoCamMode = next;
            return next;
          });
        } else if (code === 'KeyF') {
          setLudoFast((prev) => {
            const next = !prev;
            if (worldRef.current) worldRef.current.speed = next ? 2.2 : 1.0;
            return next;
          });
        }
      } else if (st === 'pool') {
        const p = poolSimRef.current;
        if (!p) return;
        if (code === 'ArrowLeft') p.cue.yaw -= 0.055;
        else if (code === 'ArrowRight') p.cue.yaw += 0.055;
        else if (code === 'KeyW') p.cue.spinY = Math.min(1, p.cue.spinY + 0.2);
        else if (code === 'KeyS') p.cue.spinY = Math.max(-1, p.cue.spinY - 0.2);
        else if (code === 'KeyA') p.cue.spinX = Math.max(-1, p.cue.spinX - 0.2);
        else if (code === 'KeyD') p.cue.spinX = Math.min(1, p.cue.spinX + 0.2);
        else if (code === 'KeyR') {
          p.cue.spinX = 0;
          p.cue.spinY = 0;
        } else if (code === 'KeyE') {
          p.cue.lowSight = !p.cue.lowSight;
        } else if (code === 'KeyT') {
          p.rackBalls();
        } else if (code === 'KeyG') {
          p.practiceMode = !p.practiceMode;
        } else if (code === 'KeyF' && p.ballInHand) {
          p.moveCueBall(0, (Math.random() - 0.5) * 0.16);
        } else if (code === 'KeyV' && p.lastShotReplay.length > 0) {
          setPoolUi((prev) => ({ ...prev, replayMode: !prev.replayMode, replayIdx: 0 }));
        }
        syncPoolReactState();
      } else if (st === 'darts') {
        const d = dartsSimRef.current;
        if (code === 'ArrowLeft' || code === 'KeyA') d.aim[0] = Math.max(-0.2, d.aim[0] - 0.015);
        if (code === 'ArrowRight' || code === 'KeyD') d.aim[0] = Math.min(0.2, d.aim[0] + 0.015);
        if (code === 'ArrowUp' || code === 'KeyW') d.aim[1] = Math.min(0.2, d.aim[1] + 0.015);
        if (code === 'ArrowDown' || code === 'KeyS') d.aim[1] = Math.max(-0.2, d.aim[1] - 0.015);
      } else if (st === 'dice') {
        if (code === 'KeyO') {
          diceSimRef.current?.callLiar(0);
          audioRef.current.play('six');
          syncDiceReactState();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
      if (e.code === 'Space') {
        releaseCharge();
      }
    };

    const onBlur = () => {
      keysHeldRef.current.clear();
      chargeRef.current.active = false;
    };

    const onResize = () => worldRef.current?.resize();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
    };
  }, [
    activateStation,
    beginCharge,
    chooseLudoMoveForToken,
    enterPlayMode,
    handleStartFromTitle,
    leaveAndPauseStation,
    nearbyHotspot,
    releaseCharge,
    syncDiceReactState,
    syncPoolReactState,
  ]);

  // Canvas pointer interactions (Ludo pawn click, Pool cue aim, Darts aim, FPS/Iso drag)
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    audioRef.current.unlock();
    const world = worldRef.current;
    if (!world) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ndc = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };

    if (station === 'none') {
      const clickedStation = world.pickStationAt(ndc);
      if (clickedStation) {
        // Clicking any game station in the lounge triggers the custom transition directly into Full-Screen Focused Play
        const hs = STATION_HOTSPOTS.find((h) => h.id === clickedStation);
        if (hs) {
          world.setMoveTarget(hs.x, hs.z);
        }
        activateStation(clickedStation, true);
        return;
      }
      // Click-to-move on floor
      const floorHit = world.pickFloorPoint(ndc);
      if (floorHit) {
        world.setMoveTarget(floorHit.x, floorHit.z);
        dragRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
    } else {
      dragRef.current = { x: e.clientX, y: e.clientY };
      if (station === 'ludo' && stationViewMode === 'play') {
        const pw = world.pickLudoPawn(ndc);
        if (pw && pw.c === ludoStateRef.current.turn) {
          chooseLudoMoveForToken(pw.t);
        }
      }
    }

    if (station === 'ludo') {
      const pw = world.pickLudoPawn(ndc);
      if (pw && pw.c === ludoStateRef.current.turn) {
        chooseLudoMoveForToken(pw.t);
      }
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const world = worldRef.current;
    if (!world) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ndc = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };

    if (station === 'ludo') {
      const pw = world.pickLudoPawn(ndc);
      const ok = Boolean(pw && pw.c === ludoStateRef.current.turn && ludoCtrlRef.current.pickMoves);
      world.setLudoHover(ok && pw ? pw.c : -1, ok && pw ? pw.t : -1);
    }

    if (station === 'darts') {
      dartsSimRef.current.aim[0] = Math.max(-0.21, Math.min(0.21, ndc.x * 0.22));
      dartsSimRef.current.aim[1] = Math.max(-0.21, Math.min(0.21, ndc.y * 0.22));
    }

    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current = { x: e.clientX, y: e.clientY };

      if (station === 'pool' && poolSimRef.current) {
        poolSimRef.current.cue.yaw += dx * 0.0055;
      } else if (station === 'ludo' && world.ludoCamMode === 'orbit') {
        world.ludoOrbit.yaw -= dx * 0.006;
        world.ludoOrbit.pitch = Math.max(0.25, Math.min(1.45, world.ludoOrbit.pitch + dy * 0.004));
      } else if (station === 'none' && world.loungeCamMode === 'fps') {
        world.fpsYaw += dx * 0.0045;
        world.fpsPitch = Math.max(-0.6, Math.min(0.6, world.fpsPitch - dy * 0.0035));
      }
    }
  };

  const handleCanvasPointerUp = () => {
    dragRef.current = null;
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const world = worldRef.current;
    if (!world) return;
    if (station === 'none' && world.loungeCamMode === 'isometric') {
      world.isoZoom = Math.max(0.65, Math.min(1.35, world.isoZoom + Math.sign(e.deltaY) * 0.06));
    } else if (station === 'pool' && poolSimRef.current) {
      poolSimRef.current.cue.power = Math.max(
        0.1,
        Math.min(1, poolSimRef.current.cue.power - Math.sign(e.deltaY) * 0.06),
      );
      syncPoolReactState();
    }
  };

  // Apply Pool Replay frame when scrubbing
  const applyReplayFrame = (idx: number) => {
    const p = poolSimRef.current;
    if (!p || !p.lastShotReplay[idx]) return;
    const frame: PoolReplayFrame = p.lastShotReplay[idx];
    frame.balls.forEach((fb, i) => {
      if (p.balls[i]) {
        p.balls[i].x = fb.x;
        p.balls[i].z = fb.z;
        p.balls[i].qx = fb.qx;
        p.balls[i].qy = fb.qy;
        p.balls[i].qz = fb.qz;
        p.balls[i].qw = fb.qw;
        p.balls[i].pocketed = fb.pocketed;
      }
    });
    setPoolUi((prev) => ({ ...prev, replayIdx: idx }));
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden select-none">
      {/* Isolated WebGL Canvas Container */}
      <canvas
        ref={canvasRef}
        data-testid="club9-canvas"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onWheel={handleCanvasWheel}
        className="fixed inset-0 w-full h-full block touch-none"
      />

      {/* Screen Impact Flash Overlay */}
      <div
        ref={screenFlashRef}
        className="fixed inset-0 pointer-events-none opacity-0 z-10 mix-blend-screen"
      />

      {/* 3D Projected Ludo Pawn Number Tags & Die Readout Tag */}
      <div ref={pawnTagsContainerRef} className="fixed inset-0 pointer-events-none z-20">
        {[0, 1, 2, 3].map((idx) => (
          <button
            key={idx}
            type="button"
            hidden
            onClick={() => chooseLudoMoveForToken(idx)}
            className="pawn-tag"
          >
            {idx + 1}
          </button>
        ))}
      </div>
      <div
        ref={dieTagRef}
        hidden
        className="fixed -translate-x-1/2 -translate-y-full z-20 px-3 py-1 rounded-xl font-mono-tabular text-2xl font-extrabold text-zinc-950 border-2 border-black shadow-xl pointer-events-none"
      />

      {/* Floating 3D NPC Speech Bubble */}
      {npcBubble.visible && appMode === 'lounge' && (
        <div
          style={{ left: `${npcBubble.x}px`, top: `${npcBubble.y}px` }}
          className="fixed -translate-x-1/2 -translate-y-full z-20 max-w-xs px-3.5 py-2 rounded-xl bg-amber-50 text-stone-950 border-2 border-stone-900 shadow-xl text-xs font-bold pointer-events-none"
        >
          {npcBubble.text}
        </div>
      )}

      {/* ==================================================================
          1. TITLE SCREEN OVERLAY (document.body.dataset.state === 'title')
         ================================================================== */}
      {appMode === 'title' && (
        <section
          aria-label="Title Screen"
          className="fixed inset-0 z-40 flex flex-col justify-between p-6 md:p-10 bg-gradient-to-r from-black/85 via-black/45 to-transparent"
        >
          {/* Top-Right Language Switcher */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setLang((l) => (l === 'zh' ? 'en' : 'zh'))}
              className="club-btn text-xs"
            >
              {lang === 'zh' ? 'EN · English' : '中文 · Chinese'}
            </button>
          </div>

          {/* Left-Third Negative Space Emblem & Primary Start Lockup */}
          <div className="max-w-lg my-auto space-y-5">
            {/* Custom Inline SVG Neon Emblem */}
            <svg
              viewBox="0 0 420 130"
              className="w-full max-w-md drop-shadow-[0_6px_24px_rgba(255,94,196,0.45)]"
              role="img"
              aria-label="CLUB No.9 Emblem"
            >
              <rect
                x="6"
                y="6"
                width="408"
                height="118"
                rx="14"
                fill="#111528"
                stroke="#54e0ee"
                strokeWidth="4"
              />
              <rect
                x="14"
                y="14"
                width="392"
                height="102"
                rx="9"
                fill="none"
                stroke="#ff5ec4"
                strokeWidth="2"
                strokeDasharray="8 4"
              />
              {/* Vector Neon Chinese Glyphs: 九 号 俱 乐 部 */}
              <g
                fill="none"
                stroke="#ff5ec4"
                strokeWidth="3.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* 九 */}
                <path d="M98 26 L94 52 C92 60 86 64 82 65 M84 36 L112 36 L110 58 C110 63 113 64 119 64 L121 57" />
                {/* 号 */}
                <rect x="142" y="25" width="24" height="13" rx="2" />
                <path d="M136 44 L172 44 M147 44 L144 52 L165 52 L161 64 L152 62" />
                {/* 俱 */}
                <path d="M196 25 L187 44 M192 36 L192 65 M203 26 L224 26 L224 52 L203 52 Z M203 35 L224 35 M203 43 L224 43 M200 57 L228 57 M208 59 L202 65 M219 59 L226 65" />
                {/* 乐 */}
                <path d="M273 26 L250 31 L248 44 L277 44 M262 29 L262 64 L255 60 M251 51 L244 62 M273 51 L280 62" />
                {/* 部 */}
                <path d="M306 24 L306 31 M297 31 L316 31 M300 31 L303 41 M313 31 L310 41 M296 41 L317 41 M300 48 L314 48 L314 61 L300 61 Z M322 26 L333 26 L327 40 L335 51 L329 60 L322 56 M322 26 L322 65" />
              </g>
              <text
                x="210"
                y="102"
                textAnchor="middle"
                fill="#54e0ee"
                fontSize="26"
                fontWeight="700"
                fontFamily="Chakra Petch, monospace"
                letterSpacing="8"
              >
                CLUB No.9 · 1995
              </text>
            </svg>

            <p className="text-sm md:text-base text-amber-100/90 font-medium leading-relaxed">
              {t.clubSub}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                data-start="true"
                onClick={() => handleStartFromTitle('none')}
                className="club-btn club-btn-gold text-base px-6 py-3.5"
              >
                {t.enterClub} <kbd className="club-kbd">ENTER</kbd>
              </button>
              <button
                type="button"
                onClick={() => handleStartFromTitle('ludo')}
                className="club-btn text-sm px-4 py-3.5"
              >
                {t.stationLudo}
              </button>
              <button
                type="button"
                onClick={() => handleStartFromTitle('pool')}
                className="club-btn text-sm px-4 py-3.5"
              >
                {t.stationPool}
              </button>
            </div>
          </div>

          {/* Flat Single-Line Control Hint in Bottom Safe Margin */}
          <div className="text-xs text-stone-300/85 tracking-wide">
            {t.walkHint}
          </div>
        </section>
      )}

      {/* ==================================================================
          1.5 CUSTOM GAME VIEW TRANSITION SHUTTER & FULL-SCREEN VIGNETTE
         ================================================================== */}
      {isGameStation(station) && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none z-10 immersed-studio-vignette"
        />
      )}

      <div
        ref={transitionOverlayRef}
        data-testid="game-transition-overlay"
        data-active={transitionUi.active ? 'true' : 'false'}
        aria-hidden={!transitionUi.active}
        style={{ opacity: transitionUi.active ? 1 : 0 }}
        className="fixed inset-0 pointer-events-none z-50 overflow-hidden transition-opacity duration-150"
      >
        {/* Top Velvet & Brass Shutter Blade */}
        <div
          data-blade="top"
          style={{ transform: 'translate3d(0, -100%, 0)' }}
          className="absolute inset-x-0 top-0 h-[52%] transition-shutter-top"
        />
        {/* Bottom Velvet & Cyan Shutter Blade */}
        <div
          data-blade="bottom"
          style={{ transform: 'translate3d(0, 100%, 0)' }}
          className="absolute inset-x-0 bottom-0 h-[52%] transition-shutter-bottom"
        />
        {/* Center Game Focus Emblem Plaque */}
        <div
          data-plaque="center"
          style={{ opacity: 0, transform: 'scale(0.92)' }}
          className="absolute inset-0 flex items-center justify-center p-6"
        >
          {isGameStation(transitionUi.targetStation) ? (
            <div className="club-panel px-8 py-6 max-w-md w-full text-center border-2 border-amber-400/70 shadow-[0_0_80px_rgba(255,184,74,0.35)]">
              <div className="text-[11px] font-mono-tabular font-bold tracking-[0.25em] text-cyan-300 uppercase mb-2">
                {GAME_TRANSITION_META[transitionUi.targetStation].tableNumber} · FULL-SCREEN FOCUS
              </div>
              <div className="font-display text-2xl sm:text-3xl font-extrabold text-amber-400 tracking-wide">
                {lang === 'zh'
                  ? GAME_TRANSITION_META[transitionUi.targetStation].titleZh
                  : GAME_TRANSITION_META[transitionUi.targetStation].titleEn}
              </div>
              <div className="text-xs text-stone-300 mt-2 font-medium">
                {lang === 'zh'
                  ? GAME_TRANSITION_META[transitionUi.targetStation].subtitleZh
                  : GAME_TRANSITION_META[transitionUi.targetStation].subtitleEn}
              </div>
            </div>
          ) : (
            <div className="club-panel px-7 py-4 text-center border border-white/20">
              <div className="font-display text-xl font-extrabold text-amber-400 tracking-wider">
                {lang === 'zh' ? '返回九号俱乐部大厅' : 'RETURNING TO CLUB LOUNGE'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================
          2. FOCUSED GAME SESSION HUD vs. LOUNGE EXPLORATION HUD
         ================================================================== */}
      {appMode !== 'title' && (
        <div className="fixed inset-0 pointer-events-none z-30">
          {/* Top-Left Navigation / Leave-and-Pause Control */}
          <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2 pointer-events-auto max-w-[68vw]">
            {isGameStation(station) ? (
              /* Full-Screen Focused Game Mode: Lounge overlays hidden, only clean Leave & Pause + Camera/HUD controls */
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={leaveAndPauseStation}
                  className="club-btn club-btn-gold text-xs py-2 px-3.5 flex items-center gap-1.5 font-extrabold shadow-lg"
                >
                  <span>⏸ {lang === 'zh' ? '暂停并离开球桌' : 'Leave & Pause'}</span>
                  <kbd className="club-kbd text-[10px]">ESC</kbd>
                </button>
              </div>
            ) : (
              /* Lounge Exploration Mode: Compact Brand Pill + Expandable Club Map Popover */
              <div className="relative flex items-center gap-1.5">
                <div className="club-panel px-3 py-1.5 flex items-center gap-2">
                  <span className="font-display font-bold text-amber-400 tracking-wider text-xs sm:text-sm">
                    {t.clubTitle}
                  </span>
                  <span className="text-stone-500">·</span>
                  <button
                    type="button"
                    onClick={() => setShowNavMenu((v) => !v)}
                    aria-expanded={showNavMenu}
                    className="text-xs font-bold text-cyan-300 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <span>
                      {station === 'none'
                        ? lang === 'zh'
                          ? '快速导航'
                          : 'Club Map'
                        : lang === 'zh'
                          ? STATION_HOTSPOTS.find((h) => h.id === station)?.labelZh
                          : STATION_HOTSPOTS.find((h) => h.id === station)?.labelEn}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {station !== 'none' && (
                  <button
                    type="button"
                    onClick={leaveAndPauseStation}
                    className="club-btn text-xs py-1.5 px-2.5"
                  >
                    ← {t.leaveStation}
                  </button>
                )}

                {/* Paused Game One-Click Resume Chips while Walking Around Lounge */}
                {station === 'none' &&
                  (['pool', 'ludo', 'darts', 'dice'] as StationId[])
                    .filter((id) => pausedGames[id])
                    .map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => enterPlayMode(id)}
                        className="club-btn club-btn-gold text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-md"
                      >
                        <span>
                          ▶ {lang === 'zh' ? '继续' : 'Resume'}{' '}
                          {id === 'pool'
                            ? lang === 'zh'
                              ? '台球'
                              : 'Pool'
                            : id === 'ludo'
                              ? 'Ludo'
                              : id === 'darts'
                                ? lang === 'zh'
                                  ? '飞镖'
                                  : 'Darts'
                                : lang === 'zh'
                                  ? '骰盅'
                                  : 'Dice'}
                        </span>
                      </button>
                    ))}

                {/* Compact Floating Club Map Popover (Lounge Only) */}
                {showNavMenu && (
                  <div className="absolute left-0 top-11 club-panel p-2 w-56 flex flex-col gap-1 z-50 shadow-2xl">
                    <div className="px-2.5 py-1 text-[10px] font-bold text-stone-400 uppercase tracking-wider flex justify-between">
                      <span>{lang === 'zh' ? '进入全屏专注游戏' : 'Enter Focused Game'}</span>
                      <span>[TAB]</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => activateStation('none')}
                      className={`club-btn text-xs py-1.5 px-2.5 text-left flex items-center justify-between ${
                        station === 'none' ? 'club-btn-active' : ''
                      }`}
                    >
                      <span>🚶 {t.loungeMode}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => enterPlayMode('pool')}
                      className="club-btn text-xs py-1.5 px-2.5 text-left flex items-center justify-between"
                    >
                      <span>🎱 {t.stationPool}</span>
                      {pausedGames.pool && (
                        <span className="text-[10px] text-amber-300 font-bold">PAUSED</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => enterPlayMode('ludo')}
                      className="club-btn text-xs py-1.5 px-2.5 text-left flex items-center justify-between"
                    >
                      <span>🎲 {t.stationLudo}</span>
                      {pausedGames.ludo && (
                        <span className="text-[10px] text-amber-300 font-bold">PAUSED</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => enterPlayMode('darts')}
                      className="club-btn text-xs py-1.5 px-2.5 text-left flex items-center justify-between"
                    >
                      <span>🎯 {t.stationDarts}</span>
                      {pausedGames.darts && (
                        <span className="text-[10px] text-amber-300 font-bold">PAUSED</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => enterPlayMode('dice')}
                      className="club-btn text-xs py-1.5 px-2.5 text-left flex items-center justify-between"
                    >
                      <span>🥤 {t.stationDice}</span>
                      {pausedGames.dice && (
                        <span className="text-[10px] text-amber-300 font-bold">PAUSED</span>
                      )}
                    </button>
                    <div className="border-t border-white/10 my-0.5" />
                    <button
                      type="button"
                      onClick={() => activateStation('arcade')}
                      className="club-btn text-xs py-1.5 px-2.5 text-left flex items-center gap-1.5"
                    >
                      <Users className="w-3.5 h-3.5 text-cyan-300" />
                      <span>{t.stationArcade}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => activateStation('bartender')}
                      className="club-btn text-xs py-1.5 px-2.5 text-left"
                    >
                      🍺 {t.stationBartender}
                    </button>
                    {station === 'none' && (
                      <button
                        type="button"
                        onClick={() => {
                          setLoungeCam((prev) => {
                            const next = prev === 'isometric' ? 'fps' : 'isometric';
                            if (worldRef.current) worldRef.current.loungeCamMode = next;
                            return next;
                          });
                          setShowNavMenu(false);
                        }}
                        className="club-btn text-xs py-1.5 px-2.5 text-left flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-400" />
                        <span>{loungeCam === 'isometric' ? t.isoView : t.fpsView} [V]</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Top-Right Compact Utility Icons (Lounge Jukebox hidden during focused game sessions) */}
          <div className="absolute right-3 top-3 flex items-center gap-1.5 pointer-events-auto">
            {isGameStation(station) && (
              <button
                type="button"
                onClick={() => setHudCollapsed((v) => !v)}
                className="club-btn text-xs py-1.5 px-2.5 flex items-center gap-1"
                aria-label={hudCollapsed ? 'Show Controls' : 'Hide Controls'}
                title="Toggle Bottom Controls [H]"
              >
                {hudCollapsed ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">{lang === 'zh' ? '显示控制' : 'Controls'}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 text-cyan-300" />
                    <span className="hidden sm:inline">{lang === 'zh' ? '隐藏面板' : 'Zen HUD'}</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setLang((l) => (l === 'zh' ? 'en' : 'zh'))}
              className="club-btn text-xs py-1.5 px-2"
              aria-label="Toggle Language"
            >
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            {!isGameStation(station) && (
              <button
                type="button"
                onClick={() => activateStation('jukebox')}
                className="club-btn text-xs py-1.5 px-2 flex items-center gap-1"
                aria-label="Switch Jukebox Track"
                title={t.tracks[jukeboxTrack]}
              >
                <Disc3 className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">CH.{jukeboxTrack + 1}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMuted((m) => {
                  const next = !m;
                  audioRef.current.setMuted(next);
                  return next;
                });
              }}
              className="club-btn py-1.5 px-2"
              aria-label={t.soundMute}
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="club-btn py-1.5 px-2"
              aria-label={t.settings}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Center-Top Sleek Single-Line Game Status Pill */}
          {station === 'ludo' && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 club-panel px-3.5 py-1.5 flex flex-wrap items-center justify-center gap-2.5 pointer-events-auto max-w-[92vw]">
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full border border-white/60 shrink-0"
                  style={{ background: COLOR_CSS[ludoSnapshot.turn] }}
                />
                <span className="font-display font-bold text-sm tracking-wide">
                  {lang === 'zh'
                    ? COLOR_NAMES_ZH[ludoSnapshot.turn]
                    : COLOR_NAMES[ludoSnapshot.turn].toUpperCase()}
                </span>
                <span className="text-xs font-bold text-stone-300">
                  {ludoSnapshot.pickMoves.length > 0
                    ? ludoSnapshot.seats[ludoSnapshot.turn] === 'human'
                      ? t.pickPawn
                      : t.cpuThinking
                    : ludoSnapshot.canRoll
                      ? lang === 'zh'
                        ? '摇晃骰盅掷骰'
                        : 'SHAKE CUP & ROLL'
                      : t.cpuRolling}
                </span>
                {ludoSnapshot.die != null && (
                  <span className="font-mono-tabular text-xs font-extrabold px-2 py-0.5 rounded bg-amber-400 text-stone-950">
                    🎲 {ludoSnapshot.die}
                  </span>
                )}
              </div>

              {/* Inline 4-Color Score Pips */}
              <div className="hidden md:flex items-center gap-1.5 border-x border-white/10 px-2.5">
                {ludoSnapshot.seats.map((seat, c) => {
                  if (seat === 'off') return null;
                  return (
                    <div
                      key={c}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                        ludoSnapshot.turn === c ? 'bg-white/10 ring-1 ring-amber-400' : 'opacity-60'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: COLOR_CSS[c] }}
                      />
                      <span className="font-mono-tabular text-[11px] font-bold">
                        {homeCount(ludoStateRef.current, c)}/4
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setLudoCam((prev) => {
                      const next =
                        LUDO_CAM_MODES[(LUDO_CAM_MODES.indexOf(prev) + 1) % LUDO_CAM_MODES.length];
                      if (worldRef.current) worldRef.current.ludoCamMode = next;
                      return next;
                    });
                  }}
                  className="club-btn text-[11px] py-1 px-2"
                >
                  {ludoCam.toUpperCase()} [C]
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLudoFast((prev) => {
                      const next = !prev;
                      if (worldRef.current) worldRef.current.speed = next ? 2.2 : 1.0;
                      return next;
                    });
                  }}
                  className={`club-btn text-[11px] py-1 px-2 ${ludoFast ? 'club-btn-gold' : ''}`}
                >
                  {ludoFast ? '2x' : '1x'} [F]
                </button>
                <button
                  type="button"
                  onClick={() => setShowLudoConfig((v) => !v)}
                  className="club-btn text-[11px] py-1 px-2"
                >
                  {t.players}
                </button>
              </div>
            </div>
          )}

          {/* Pool Sleek Top Scoreboard Pill */}
          {station === 'pool' && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 club-panel px-4 py-1.5 flex flex-wrap items-center justify-center gap-3 pointer-events-auto max-w-[92vw]">
              <div className={`flex items-center gap-1.5 text-xs sm:text-sm ${poolUi.turn === 0 ? 'text-amber-400 font-bold' : 'text-stone-400'}`}>
                <span>P1 ({poolUi.suits[0] || t.poolOpen})</span>
                <span className="font-mono-tabular text-base">{poolUi.scores[0]}</span>
              </div>
              <span className="text-stone-500 text-xs">VS</span>
              <div className={`flex items-center gap-1.5 text-xs sm:text-sm ${poolUi.turn === 1 ? 'text-cyan-300 font-bold' : 'text-stone-400'}`}>
                <span className="font-mono-tabular text-base">{poolUi.scores[1]}</span>
                <span>P2 ({poolUi.suits[1] || t.poolOpen})</span>
              </div>
              <span className="text-xs text-stone-300 hidden lg:inline">· {poolUi.message}</span>
              <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                <button
                  type="button"
                  onClick={() => {
                    if (poolSimRef.current) {
                      poolSimRef.current.cue.lowSight = !poolSimRef.current.cue.lowSight;
                      syncPoolReactState();
                    }
                  }}
                  className={`club-btn text-[11px] py-1 px-2 ${poolUi.lowSight ? 'club-btn-gold' : ''}`}
                >
                  {t.poolLowSight}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    poolSimRef.current?.rackBalls();
                    syncPoolReactState();
                  }}
                  className="club-btn text-[11px] py-1 px-2 flex items-center gap-1"
                  title={t.poolRerack}
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">{t.poolRerack}</span>
                </button>
              </div>
            </div>
          )}

          {/* Darts Top Scoreboard Pill */}
          {station === 'darts' && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 club-panel px-4 py-1.5 flex items-center gap-4 pointer-events-auto">
              <div className="text-xs">
                <span className="text-stone-400 mr-1">{t.dartsRound}</span>
                <span className="font-mono-tabular font-bold text-amber-400">
                  {dartsUi.round}/3
                </span>
              </div>
              <div className={`text-xs sm:text-sm ${dartsUi.turn === 0 ? 'text-amber-400 font-bold' : 'text-stone-400'}`}>
                YOU: <span className="font-mono-tabular text-base">{dartsUi.scores[0]}</span>
              </div>
              <div className={`text-xs sm:text-sm ${dartsUi.turn === 1 ? 'text-cyan-300 font-bold' : 'text-stone-400'}`}>
                CPU: <span className="font-mono-tabular text-base">{dartsUi.scores[1]}</span>
              </div>
              <div className="text-xs text-stone-300 hidden sm:block">
                🎯 ×{dartsUi.dartsLeft} · {t.dartsWind}:{' '}
                <span className="font-mono-tabular text-cyan-300">
                  {(dartsUi.wind[0] * 100).toFixed(1)}, {(dartsUi.wind[1] * 100).toFixed(1)}
                </span>
              </div>
              {dartsUi.unlocked180 && (
                <span className="text-xs font-extrabold text-amber-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> 180
                </span>
              )}
            </div>
          )}

          {/* Dice Cup Top Scoreboard Pill */}
          {station === 'dice' && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 club-panel px-4 py-1.5 flex items-center gap-4 pointer-events-auto">
              <div className="text-amber-400 font-bold text-xs sm:text-sm">
                YOU: <span className="font-mono-tabular text-base">{diceUi.scores[0]}</span>
              </div>
              <div className="text-cyan-300 font-bold text-xs sm:text-sm">
                REGULAR: <span className="font-mono-tabular text-base">{diceUi.scores[1]}</span>
              </div>
              <span className="text-xs text-stone-200">{diceUi.message}</span>
            </div>
          )}

          {/* Center Event Flash Toast */}
          {flashBanner && !transitionUi.active && (
            <div
              style={{ color: flashBanner.color }}
              className="absolute left-1/2 top-1/4 -translate-x-1/2 text-center drop-shadow-[0_4px_18px_rgba(0,0,0,0.85)] pointer-events-none"
            >
              <div className="font-display text-2xl md:text-4xl font-extrabold tracking-wide">
                {flashBanner.title}
              </div>
              {flashBanner.sub && (
                <div className="text-sm font-bold text-stone-100 mt-1">{flashBanner.sub}</div>
              )}
            </div>
          )}

          {/* Lounge Proximity Interaction Pill (Hidden when in any game) */}
          {station === 'none' && nearbyHotspot !== 'none' && !transitionUi.hideLoungeOverlays && (
            <div className="absolute left-1/2 bottom-12 -translate-x-1/2 pointer-events-auto z-20">
              <button
                type="button"
                onClick={() => activateStation(nearbyHotspot, true)}
                className="club-btn club-btn-gold px-5 py-2.5 text-xs sm:text-sm flex items-center gap-2 shadow-xl whitespace-nowrap cursor-pointer"
              >
                <span>
                  {pausedGames[nearbyHotspot]
                    ? lang === 'zh'
                      ? `▶ 继续 ${STATION_HOTSPOTS.find((h) => h.id === nearbyHotspot)?.labelZh}`
                      : `▶ Resume ${STATION_HOTSPOTS.find((h) => h.id === nearbyHotspot)?.labelEn}`
                    : lang === 'zh'
                      ? `🎮 进入 ${STATION_HOTSPOTS.find((h) => h.id === nearbyHotspot)?.labelZh}`
                      : `🎮 Play ${STATION_HOTSPOTS.find((h) => h.id === nearbyHotspot)?.labelEn}`}
                </span>
                <kbd className="club-kbd text-[10px]">E</kbd>
              </button>
            </div>
          )}

          {/* Subtle Non-Invasive Lounge Footer Hint (Lounge Only) */}
          {station === 'none' && !transitionUi.hideLoungeOverlays && (
            <div className="absolute left-1/2 bottom-3 -translate-x-1/2 text-[11px] text-stone-300/80 bg-black/55 px-3.5 py-1 rounded-full border border-white/10 pointer-events-none whitespace-nowrap">
              {lang === 'zh'
                ? '点击地面移动 · 点击任意球桌进入全屏沉浸对局 · WASD 行走 · V 切换视角'
                : 'Click floor to walk · Click any table for full-screen game focus · WASD Move · V Camera'}
            </div>
          )}

          {/* Compact Action Pill at Bottom Center (Active Immersed Play Mode Only, Collapsible via [H]) */}
          {(station === 'ludo' || station === 'pool' || station === 'darts') &&
            !hudCollapsed && (
              <div className="absolute left-1/2 bottom-4 -translate-x-1/2 club-panel px-4 py-2 flex items-center gap-3 pointer-events-auto shadow-2xl">
                <div className="w-40 sm:w-52">
                  <div className="flex justify-between text-[10px] font-bold text-amber-400 mb-1">
                    <span>
                      {station === 'ludo'
                        ? lang === 'zh'
                          ? '摇晃骰盅力度'
                          : 'CUP SHAKE POWER'
                        : t.throwPower}
                    </span>
                    <span>SPACE / HOLD</span>
                  </div>
                  <div
                    ref={powerBarRef}
                    className="grid grid-cols-14 gap-1 p-1 bg-black/60 rounded-md"
                  >
                    {Array.from({ length: POWER_SEGS }).map((_, i) => (
                      <i
                        key={i}
                        className="h-2.5 rounded-sm bg-white/10 block transition-colors"
                      />
                    ))}
                  </div>
                </div>

                {(station !== 'ludo' || ludoSnapshot.canRoll) && (
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      beginCharge();
                    }}
                    onPointerUp={releaseCharge}
                    onPointerCancel={releaseCharge}
                    className="club-btn club-btn-gold px-4 sm:px-5 py-2 text-xs sm:text-sm font-extrabold"
                  >
                    {station === 'ludo'
                      ? lang === 'zh'
                        ? '🥤 按住摇晃骰盅掷出'
                        : '🥤 Shake Cup & Throw'
                      : station === 'pool'
                        ? t.poolStrike
                        : t.dartsThrow}
                  </button>
                )}

                {station === 'ludo' && !ludoSnapshot.canRoll && (
                  <span className="text-xs font-bold text-cyan-300 px-2">
                    {ludoSnapshot.pickMoves.length > 0
                      ? lang === 'zh'
                        ? '点击棋盘上发光的棋子 (1-4)'
                        : 'Click a glowing pawn (1-4)'
                      : lang === 'zh'
                        ? '骰盅摇晃投掷中...'
                        : 'Cup shaking & rolling...'}
                  </span>
                )}
              </div>
            )}

          {/* Dice Cup Action Strip (Active Immersed Play Mode Only, Collapsible via [H]) */}
          {station === 'dice' && !hudCollapsed && (
            <div className="absolute left-1/2 bottom-4 -translate-x-1/2 club-panel px-4 py-2 flex flex-wrap items-center justify-center gap-3 pointer-events-auto shadow-2xl">
              <div className="flex items-center gap-1.5 mr-1">
                <span className="text-xs text-stone-400">Your Cup:</span>
                {diceUi.playerFaces.map((f, idx) => (
                  <span
                    key={idx}
                    className="w-6 h-6 rounded bg-amber-100 text-stone-950 font-mono-tabular font-extrabold text-xs grid place-items-center"
                  >
                    {f}
                  </span>
                ))}
              </div>

              {diceUi.cupLifted && (
                <div className="flex items-center gap-1.5 mr-1">
                  <span className="text-xs text-cyan-300">Regular:</span>
                  {diceUi.cpuFaces.map((f, idx) => (
                    <span
                      key={idx}
                      className="w-6 h-6 rounded bg-cyan-200 text-stone-950 font-mono-tabular font-extrabold text-xs grid place-items-center"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  diceSimRef.current?.shakeAndRoll();
                  audioRef.current.play('cupShake');
                  audioRef.current.play('throw');
                  syncDiceReactState();
                }}
                className="club-btn club-btn-gold text-xs"
              >
                {t.diceShake}
              </button>

              <div className="flex items-center gap-1">
                <select
                  aria-label="Bid Quantity"
                  value={diceUi.bidQty}
                  onChange={(e) => setDiceUi((p) => ({ ...p, bidQty: +e.target.value }))}
                  className="bg-stone-900 border border-white/20 rounded px-2 py-1 text-xs font-mono-tabular"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}×
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Bid Face"
                  value={diceUi.bidFace}
                  onChange={(e) => setDiceUi((p) => ({ ...p, bidFace: +e.target.value }))}
                  className="bg-stone-900 border border-white/20 rounded px-2 py-1 text-xs font-mono-tabular"
                >
                  {[2, 3, 4, 5, 6].map((f) => (
                    <option key={f} value={f}>
                      [{f}s]
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (diceSimRef.current?.placeBid(diceUi.bidQty, diceUi.bidFace)) {
                      audioRef.current.play('pick');
                      syncDiceReactState();
                    }
                  }}
                  className="club-btn text-xs"
                >
                  {t.diceBid}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  diceSimRef.current?.callLiar(0);
                  audioRef.current.play('six');
                  syncDiceReactState();
                }}
                className="club-btn text-xs text-rose-300"
              >
                {t.diceLiar}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================
          3. LUDO SEAT & CPU CONFIGURATION MODAL (Inside Ludo Station)
         ================================================================== */}
      {showLudoConfig && station === 'ludo' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
          <div className="club-panel w-[min(520px,94vw)] p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-display text-2xl font-extrabold text-amber-400">
                  LUDO · {t.clubTitle}
                </h2>
                <p className="text-xs text-cyan-300">{t.ludoSub}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLudoConfig(false)}
                className="club-btn text-xs"
              >
                ✕
              </button>
            </div>

            <div className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {t.players}
            </div>
            <div className="grid gap-2">
              {ludoSeats.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    const order: SeatType[] = ['human', 'cpu', 'off'];
                    const next = [...ludoSeats];
                    next[i] = order[(order.indexOf(s) + 1) % 3];
                    if (next.filter((x) => x !== 'off').length < 2) next[i] = 'human';
                    setLudoSeats(next);
                  }}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer ${
                    s === 'off' ? 'opacity-45' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-5 h-5 rounded-full"
                      style={{ background: COLOR_CSS[i] }}
                    />
                    <span className="font-bold">
                      {lang === 'zh' ? COLOR_NAMES_ZH[i] : COLOR_NAMES[i].toUpperCase()}
                    </span>
                  </div>
                  <span
                    className={`font-bold text-xs ${
                      s === 'human'
                        ? 'text-emerald-400'
                        : s === 'cpu'
                          ? 'text-cyan-300'
                          : 'text-stone-400'
                    }`}
                  >
                    {s === 'human' ? t.human : s === 'cpu' ? t.cpu : t.empty}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['cpu', t.presetCpu],
                  ['duel', t.presetDuel],
                  ['local', t.presetLocal],
                  ['four', t.presetFour],
                  ['watch', t.presetWatch],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLudoSeats([...LUDO_PRESETS[k]])}
                  className="club-btn text-xs py-1.5 px-2.5"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold text-stone-400">{t.cpuSkill}</span>
              <div className="flex gap-2">
                {(['easy', 'normal', 'hard'] as CpuDiff[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setLudoDiff(d)}
                    className={`club-btn text-xs py-1.5 px-3 ${
                      ludoDiff === d ? 'club-btn-gold' : ''
                    }`}
                  >
                    {t[d]}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => startLudoMatch(ludoSeats, ludoDiff)}
              className="club-btn club-btn-gold w-full py-3 text-base"
            >
              {t.startMatch}
            </button>

            <p className="text-xs text-stone-400 text-center leading-relaxed">{t.ludoRules}</p>
          </div>
        </div>
      )}

      {/* Pool Replay Scrubber Drawer */}
      {station === 'pool' && poolUi.replayMode && (
        <div className="fixed left-1/2 top-20 -translate-x-1/2 z-40 club-panel px-5 py-3 flex items-center gap-4">
          <span className="text-xs font-bold text-amber-400">{t.poolReplay}</span>
          <input
            type="range"
            aria-label="Replay Scrubber"
            min={0}
            max={Math.max(0, poolUi.replayLen - 1)}
            value={poolUi.replayIdx}
            onChange={(e) => applyReplayFrame(+e.target.value)}
            className="w-44 accent-amber-400"
          />
          <button
            type="button"
            onClick={() => setPoolUi((p) => ({ ...p, replayMode: false }))}
            className="club-btn text-xs py-1 px-2.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================================================================
          4. ARCADE P2P MATCHMAKING TERMINAL MODAL (station === 'arcade')
         ================================================================== */}
      {station === 'arcade' && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4">
          <div className="club-panel w-[min(540px,94vw)] p-6 space-y-5 border-2 border-cyan-400/60">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div>
                <h2 className="font-display text-xl font-extrabold text-cyan-300">
                  {t.lobbyTitle}
                </h2>
                <p className="text-xs text-stone-400">
                  WebRTC PeerJS · Real-Time Lounge & Tabletop Sync
                </p>
              </div>
              <button
                type="button"
                onClick={() => activateStation('none')}
                className="club-btn text-xs"
              >
                {t.leaveStation}
              </button>
            </div>

            {/* Room Code Display & Copy Invite URL */}
            <div className="p-4 rounded-xl bg-black/50 border border-cyan-500/30 flex items-center justify-between">
              <div>
                <div className="text-xs text-stone-400">{t.roomCode}</div>
                <div className="font-mono-tabular text-3xl font-extrabold text-amber-400 tracking-widest">
                  {roomCode}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const url = lobbyRef.current?.inviteUrl() || window.location.href;
                  navigator.clipboard?.writeText(url);
                  setCopiedLink(true);
                  window.setTimeout(() => setCopiedLink(false), 1800);
                }}
                className="club-btn club-btn-gold text-xs flex items-center gap-1.5"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'COPIED!' : t.copyLink}</span>
              </button>
            </div>

            {/* Join Friend Room Code */}
            <div className="space-y-2">
              <label htmlFor="join-room-input" className="text-xs font-bold text-stone-300 block">
                {t.joinRoom}
              </label>
              <div className="flex gap-2">
                <input
                  id="join-room-input"
                  type="text"
                  maxLength={6}
                  placeholder="6-Digit Code (e.g. C9LUDO)"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                  className="flex-1 bg-black/60 border border-white/20 rounded-lg px-3 py-2 font-mono-tabular text-sm uppercase text-white"
                />
                <button
                  type="button"
                  onClick={() => lobbyRef.current?.joinRoom(joinInput)}
                  className="club-btn text-xs px-4"
                >
                  JOIN
                </button>
              </div>
            </div>

            {/* Quick Match / Spawn Club Regular Partner */}
            <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-stone-300">
                {t.connectedPeers}:{' '}
                <span className="font-bold text-emerald-400">
                  {peerStatus === 'connected' || peerStatus === 'bot_partner'
                    ? `1 (${partnerName})`
                    : 'Waiting for peer...'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  lobbyRef.current?.spawnRegularPartner();
                  showFlash('Ah-Jie Joined the Lounge!', 'Ready for Ludo or 8-Ball', '#54e0ee');
                }}
                className="club-btn text-xs"
              >
                {t.spawnBotPartner}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================
          5. PAUSE / SETTINGS / CREDITS MODAL
         ================================================================== */}
      {(appMode === 'paused' || showSettingsModal || showCreditsModal) && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <div className="club-panel w-[min(460px,92vw)] p-6 space-y-4">
            <h2 className="font-display text-2xl font-extrabold text-center text-amber-400">
              {showCreditsModal ? t.credits : showSettingsModal ? t.settings : t.pauseTitle}
            </h2>

            {!showCreditsModal && (
              <div className="space-y-3 py-2 border-y border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{t.pixelScale}</span>
                  <div className="flex gap-1.5">
                    {[
                      [1.0, 'HD 1x'],
                      [2.2, 'Retro 2x'],
                      [3.5, 'Chunky 3.5x'],
                    ].map(([val, label]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          const num = Number(val);
                          setPixelScale(num);
                          worldRef.current?.setPixelScale(num);
                        }}
                        className={`club-btn text-xs py-1 px-2.5 ${
                          pixelScale === val ? 'club-btn-gold' : ''
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{t.aimLines}</span>
                  <button
                    type="button"
                    onClick={() => setShowAimLines((v) => !v)}
                    className={`club-btn text-xs py-1 px-3 ${showAimLines ? 'club-btn-gold' : ''}`}
                  >
                    {showAimLines ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{t.closeUpCam}</span>
                  <button
                    type="button"
                    onClick={() => setCloseUpCam((v) => !v)}
                    className={`club-btn text-xs py-1 px-3 ${closeUpCam ? 'club-btn-gold' : ''}`}
                  >
                    {closeUpCam ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            )}

            {showCreditsModal && (
              <div className="text-xs text-stone-300 space-y-2 leading-relaxed py-2 border-y border-white/10">
                <p>
                  <strong>CLUB No.9 (九号俱乐部)</strong> — 3D Pixel-Art Retro Lounge & Tabletop
                  Physics Game Hub.
                </p>
                <p>
                  Built with <strong>Three.js</strong> (MIT License),{' '}
                  <strong>@dimforge/rapier3d-compat</strong> (Apache-2.0 License), and{' '}
                  <strong>PeerJS</strong> (MIT License).
                </p>
                <p>100% Procedural Canvas2D Textures & Web Audio API Synthesis.</p>
              </div>
            )}

            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowCreditsModal(false);
                  if (appMode === 'paused') {
                    setAppMode(station !== 'none' ? 'station' : 'lounge');
                  }
                }}
                className="club-btn club-btn-gold w-full py-2.5"
              >
                {t.resume} <kbd className="club-kbd">ESC</kbd>
              </button>

              {station === 'ludo' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setAppMode('station');
                    startLudoMatch(ludoSeats, ludoDiff);
                  }}
                  className="club-btn w-full py-2.5"
                >
                  {t.restartStation}
                </button>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setShowCreditsModal((c) => !c);
                  }}
                  className="club-btn flex-1 py-2 text-xs"
                >
                  {t.credits}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setShowCreditsModal(false);
                    setStation('none');
                    setAppMode('title');
                  }}
                  className="club-btn flex-1 py-2 text-xs"
                >
                  Title Screen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================
          6. VICTORY / GAME OVER MODAL (document.body.dataset.state === 'gameover')
         ================================================================== */}
      {appMode === 'gameover' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4">
          <div className="club-panel w-[min(520px,94vw)] p-6 space-y-4">
            <h2 className="font-display text-3xl font-extrabold text-center text-amber-400">
              {station === 'ludo' && ludoSnapshot.winner != null
                ? `${COLOR_NAMES[ludoSnapshot.winner].toUpperCase()} WINS!`
                : poolUi.message}
            </h2>

            {station === 'ludo' && (
              <div className="space-y-1.5 text-xs font-mono-tabular">
                <div className="grid grid-cols-6 text-stone-400 px-3 py-1">
                  <span className="col-span-2">PLAYER</span>
                  <span>HOME</span>
                  <span>HITS</span>
                  <span>HIT</span>
                  <span>SIXES</span>
                </div>
                {ludoSnapshot.seats.map((seat, c) => {
                  if (seat === 'off') return null;
                  const st = ludoSnapshot.stats[c];
                  const won = ludoSnapshot.winner === c;
                  return (
                    <div
                      key={c}
                      className={`grid grid-cols-6 items-center px-3 py-2 rounded-lg bg-white/5 ${
                        won ? 'ring-2 ring-amber-400' : ''
                      }`}
                    >
                      <div className="col-span-2 flex items-center gap-2 font-bold">
                        <span
                          className="w-3.5 h-3.5 rounded-full"
                          style={{ background: COLOR_CSS[c] }}
                        />
                        <span>{COLOR_NAMES[c].toUpperCase()}</span>
                      </div>
                      <span>{homeCount(ludoStateRef.current, c)}/4</span>
                      <span>{st.captures}</span>
                      <span>{st.captured}</span>
                      <span>{st.sixes}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3 justify-center pt-2">
              <button
                type="button"
                data-start="true"
                onClick={() => {
                  if (station === 'ludo') startLudoMatch(ludoSeats, ludoDiff);
                  else if (station === 'pool') {
                    poolSimRef.current?.rackBalls();
                    syncPoolReactState();
                    setAppMode('station');
                  } else {
                    setAppMode('lounge');
                  }
                }}
                className="club-btn club-btn-gold px-6 py-3"
              >
                REMATCH <kbd className="club-kbd">ENTER</kbd>
              </button>
              <button
                type="button"
                onClick={() => activateStation('none')}
                className="club-btn px-5 py-3"
              >
                {t.returnToLounge}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
