# CLUB No.9 (九号俱乐部) — 3D Pixel Lounge & Tabletop Physics Hub

**CLUB No.9 (九号俱乐部)** is an interactive 3D pixel-art retro bar lounge and physics game hub built with Three.js and Rapier3D. Players explore a richly detailed isometric bar diorama—complete with a glowing neon sign, brick fireplace, animated arcade cabinets, and chattering NPC regulars—and seamlessly transition into four playable physics stations (**Ludo · Club No.9 Edition**, **8-Ball Pool**, **Pixel Darts**, and **Dice Cup**) with full bilingual (Chinese/English) support and Peer-to-Peer online multiplayer.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following core design and architectural decisions incorporate your confirmed choices from our planning discussion:

- **Confirmed Decision 1 — Camera & Perspective Architecture**: The lounge defaults to a **Cozy Isometric Diorama View** (matching your reference artwork) where you walk your avatar around the bar (`WASD` + `Shift` sprint). Pressing `V` in the lounge toggles **First-Person Exploration Mode (FPS)** at any time, while pressing `E` (or `Space`/`Enter`) at any station smoothly transitions the camera into a dedicated close-up gameplay rig for that table.
- **Confirmed Decision 2 — Four Core Playable Game Stations + Interactive Bar Props**: Focused, high-craft implementation of **Ludo (Club No.9 Big-Dice Edition)**, **Central 8-Ball Pool Table**, **Back-Wall Pixel Darts**, and **Green-Felt Dice Cup** (skipping Russian Roulette to keep the bar's atmosphere cohesive with your reference scene), alongside the **Lobby Matchmaking Arcade Terminal**, **Interactive Bartender**, and **4-Track Corner Jukebox**.
- **Confirmed Decision 3 — Unified 3D Pixel-Art Post-Processing**: Both the isometric lounge and all playable mini-game cameras render through a crisp **Offscreen Pixelation & Ordered Bayer Dithering Pipeline** with nearest-neighbor upscaling (plus an optional pixel-density slider in Settings and automatic fast-path rendering in headless test browsers).

---

## 1. Overview & Core Concept

- **What It Does**: Combines an atmospheric, living 90s pixel-art bar lounge with authentic rigid-body tabletop physics games. Instead of choosing games from a flat menu, you physically walk around the bar, listen to lo-fi jazz and crackling fireplace embers, chat with regulars, pour a frothy mug at the counter, or sit down at any table to play against smart CPUs or a friend via WebRTC room codes.
- **Target Audience / Persona**: Fans of tactile tabletop physics games (Pool, Ludo, Darts, Liar's Dice) and cozy retro pixel-art dioramas who enjoy both quick solo matches and low-friction P2P multiplayer with friends.
- **Key Value**: Unites the complete **Ludo · Club No.9 Edition** (with its Rapier3D felt dice tray, 4-color pawn hopping, captures, and CPU heuristics) into a living, breathing 3D world alongside 8-Ball Billiards, Pixel Darts, and Dice Cup—with zero external texture or audio file dependencies.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Title Screen & Live Diorama Attract Mode**:
   - Launches into a warm isometric camera pan across **CLUB No.9**, showcasing the glowing pink/cyan `九号俱乐部 / CLUB No.9` neon sign, flickering brick fireplace, NPCs shooting pool and throwing darts, and the custom SVG neon title emblem.
   - Pressing `Enter` / `Space` or clicking **ENTER CLUB / 进入俱乐部** (`?autostart=1` supported) drops your avatar onto the warm wood floor in front of the central pool table.
2. **Lounge Exploration & Living World Interactions**:
   - Walk with `WASD` (`Shift` to sprint, `V` to toggle Isometric / First-Person view).
   - Approaching NPC patrons triggers floating retro pixel speech bubbles with bilingual bar banter, pool tips, and reactions (`"Nice break!"`, `"180 on the dartboard!"`, `"Roll a six!"`).
   - **Bartender & Oak Counter**: Press `E` at the bar counter to have the bartender pour a frothy pixel mug with a celebratory toast animation.
   - **Corner Pixel Jukebox**: Press `E` at the jukebox to cycle between 4 procedural Web Audio tracks (*Late-Night Rhodes Jazz*, *90s Synthwave*, *8-Bit Chiptune*, *Rain & Fireplace Lo-Fi*).
3. **Seamless Station Transitions (`E` to Inspect / Play)**:
   - **Ludo · Club No.9 Table (Front-Left Green-Felt Table)**: Smoothly glides the camera to the 15×15 Ludo board and felt dice tray. Includes seat configuration (Human / CPU / Empty, presets like *You vs 3 CPU*, *Duel*, *2P Local*, *Watch CPUs*, and CPU skill *Easy/Normal/Hard*), `Space` hold-to-charge physical Rapier die throws, `1`–`4` or click-to-move glowing pawns, camera cycle (`C`: Auto, Table, Dice, Top, Orbit), fast-forward (`F`), and full Ludo rules (6 to enter, bonus rolls on 6/capture/home, three-6s forfeit, safe star/start squares).
   - **Central 8-Ball Pool Table**: Switches to precision cue aiming (`Mouse` look, `E` low-angle cue sight, `WASD` spin/English impact offset, `R` reset spin, `Left-Click`/`Scroll` power + `Space` strike, `F` ball-in-hand, `T` re-rack, `G` 8-Ball vs. Free Practice, toggleable collision trajectory guidelines, `V` variable-speed `0.1x–1.0x` shot replay scrubber, and automatic cinematic pocket close-up camera).
   - **Pixel Darts Station (Back-Right Wall)**: Transitions into a first-person pixel hand holding a dart aimed at the 20-zone sisal board, featuring mouse aiming sway, wind trajectory drift, rainbow `力量 / POWER` charge bar, 3-dart rounds, P1 vs. P2 / CPU scoreboard, and the `"180"` high-score achievement badge.
   - **Dice Cup Station (High-Top Felt Table)**: Uses a dedicated Rapier3D physics world to shake and roll 5 physical dice under a leather shaker cup on green felt for High-Low / Liar's Dice rounds against seated regulars.
4. **Arcade Matchmaking Terminal (Left Wall)**:
   - Walking up to the giant neon `LOBBY MATCHMAKING` cabinet and pressing `E` opens a retro CRT overlay powered by **PeerJS (WebRTC)**.
   - Players can **Create Room** (generating a 6-character Room Code and shareable invite link) or **Join Room / Quick Match**, spawning a friend directly into the isometric lounge as a second walkable avatar and syncing table states in real time.

### Visual Identity & Theme

- **Aesthetic Direction**: 1990s 3D Pixel-Art Diorama & Tactile Tabletop Physics—warm, amber-lit timber tavern interiors contrasted with crisp arcade neon accents and tactile baize felt.
- **Color Palette & Mood**:
  - `--background`: `#0A0705` (Deep Espresso Shadow Void)
  - `--surface`: `#151A30` / `rgba(18, 22, 40, 0.90)` (Midnight Slate HUD Panels)
  - `--primary`: `#FFB84A` (Warm Amber Gold — primary CTAs, active highlights, fireplace warmth)
  - `--accent-cyan`: `#54E0EE` (Club No.9 Neon Cyan — signage, matchmaking highlights)
  - `--accent-pink`: `#FF4FA3` (Club No.9 Neon Magenta — `九号俱乐部` tube glow)
  - `--felt-green`: `#0F7A45` (Classic Tournament Baize Felt)
  - `--text-primary`: `#F1EFE6` (Warm Ivory) & `--text-muted`: `#8D92A8` (Muted Pewter)
- **Typography & Hierarchy**:
  - *Display / Arcade Headers*: `Chakra Petch` / crisp geometric pixel-inspired display lettering with high-contrast drop shadows (`text-wrap: balance`).
  - *UI & Bilingual Body*: `Plus Jakarta Sans` paired with clean CJK fallback for crisp Chinese/English (`中文 / EN`) readability.
  - *Scores, Shot Clock & Telemetry*: `JetBrains Mono` with `font-variant-numeric: tabular-nums` for aligned scoreboards, replay scrubbers, and room codes.
- **Ergonomic Game Shell & Bottom Dock**:
  - Zero website chrome (no marketing header or footer).
  - Keeps **85%+ of the 3D viewport unobstructed**: compact top-center turn/station banner, top-right quick utility icon buttons (`Language 中/EN`, `Settings`, `Audio Mute [M]`, `Pause [ESC]`), and a sleek, collapsible bottom control dock (`[H]` to hide/show) showing context-sensitive controls for the active mode (Lounge Walking vs. Ludo vs. Pool vs. Darts vs. Dice Cup).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Decoupled Headless Physics Engines (`sim` vs. `render`)**:
  - *Chosen Approach*: Keep all game rules and Rapier3D physics simulations (Pool rigid-body balls/cushions, Ludo rules + AI heuristics + DieTray physics, Dart ballistic solver, Dice Cup physics) strictly decoupled from Three.js and the DOM.
  - *Why*: Guarantees deterministic behavior, clean PeerJS state synchronization, and allows the entire physics and rules test suite to run headlessly in Node.js (`node --test`).
- **Decision 2 — 100% Procedural Textures, 3D Composite Models & Web Audio Synth**:
  - *Chosen Approach*: Generate all wood grains, brick walls, pool balls (1–15), Ludo 15×15 board, dartboard segments, animated CRT arcade screens, and neon signs via deterministic `mulberry32` HTML5 `<canvas>` textures, and synthesize all sound effects + impulse-response room reverb + 4 background music loops via the Web Audio API.
  - *Why*: Zero external asset load times, zero 404 risk, and instant deterministic startup.
- **Decision 3 — Offscreen Pixel-Art Post-Processing with Headless Fast-Path**:
  - *Chosen Approach*: Render the 3D scene to a lower-resolution `WebGLRenderTarget` with `THREE.NearestFilter` and a custom ordered Bayer dithering & color-quantization shader pass, while automatically bypassing heavy post-processing/shadows when running in headless Chromium verification.
  - *Why*: Delivers the exact 90s 3D pixel-art charm of the reference image at 60 FPS on desktop GPUs while keeping automated browser verification fast and responsive.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLUB No.9 — APPLICATION SHELL                        │
│   Title Screen  ──►  Lounge Exploration (Iso / FPS)  ──►  Station Gameplay  │
│                      Pause / Settings / Credits      ──►  P2P Arcade Lobby  │
└───────────────────┬─────────────────────────────────────┬───────────────────┘
                    │                                     │
                    ▼                                     ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────────┐
│     PURE LOGIC & PHYSICS (HEADLESS)   │ │   THREE.JS PIXEL STAGE & AUDIO    │
│      (Zero DOM / Node.js Testable)    │ │   (Read-Only View & Web Audio)    │
├───────────────────────────────────────┤ ├───────────────────────────────────┤
│ • PoolSim (Rapier3D 57.2mm balls,     │ │ • PixelPostProcessor (Offscreen   │
│   spin/English, cushions, pockets,    │ │   RenderTarget + Bayer Dithering) │
│   8-ball rules & shot history)        │ │ • LoungeDiorama (Bar, Fireplace   │
│ • LudoEngine (15x15 board, rules,     │ │   embers, 5 CRT Arcades, Neon     │
│   CPU heuristics, Rapier DieTray)     │ │   signs, NPCs & speech bubbles)   │
│ • DartsSim (Wind ballistics, 20-zone  │ │ • CameraDirector (Damped Iso,     │
│   polar scoring, 180 achievement)     │ │   FPS look, & Station rigs)       │
│ • DiceCupSim (Secondary Rapier3D      │ │ • ProceduralTextures (mulberry32  │
│   5-dice cup roll & Liar's Dice AI)   │ │   Canvas textures for all props)  │
│ • P2PNetState (PeerJS room codes,     │ │ • ClubAudioSynth (Web Audio SFX,  │
│   avatar sync & turn state packets)   │ │   IR reverb, 4 Jukebox tracks)    │
└───────────────────────────────────────┘ └───────────────────────────────────┘
```

### Data Model & State

- **Global App State (`ClubState`)**:
  - `appMode`: `'title' | 'lounge' | 'station' | 'paused' | 'gameover'` (mirrored to `document.body.dataset.state`).
  - `activeStation`: `'none' | 'ludo' | 'pool' | 'darts' | 'dice' | 'arcade' | 'jukebox' | 'bartender'`.
  - `cameraView`: `'isometric' | 'fps' | 'station_auto' | 'station_top' | 'station_orbit' | 'replay'`.
  - `lang`: `'zh' | 'en'` (drives full bilingual dictionary across HUD, menus, rules, and NPC speech bubbles).
  - `settings`: `{ pixelScale: number, showAimLines: boolean, closeUpCam: boolean, muted: boolean, jukeboxTrack: number }`.
- **Station Simulation States**:
  - **Ludo State**: Preserves the complete state machine from your reference (`seats`, `tokens[4][4]`, `turn`, `die`, `sixes`, `phase: 'roll' | 'pick' | 'nomove' | 'forfeit' | 'over'`, `stats`, and `DieTray` Rapier quaternion snapshot).
  - **Pool State**: `balls[16]` (`id`, `x, y, z`, `quaternion`, `pocketed`), `cue` (`yaw`, `pitch`, `power`, `spinX`, `spinY`), `turn`, `assignedSuits` (`solids` vs `stripes`), `ballInHand`, `replayFrames[]`, and `comboStreak`.
  - **Darts State**: `round`, `dartsLeft`, `scores[2]`, `aimPos`, `windVec`, `powerCharge`, `thrownDarts[]`, `unlocked180`.
  - **Dice Cup State**: `dicePoses[5]`, `diceFaces[5]`, `cupLift`, `currentBid`, `challengerResult`.

### Interactive Component & State Mapping

- **Proximity & Interaction Sensor**: Every frame in `'lounge'` mode, checks player avatar distance to the 7 interactive hotspots (`Pool Table`, `Ludo Table`, `Dartboard`, `Dice Cup Table`, `Lobby Arcade Cabinet`, `Bartender Counter`, `Jukebox`) and nearby NPCs. Displays a crisp contextual prompt (`[E] Play Ludo · 飞行棋/卢多`, `[E] Play 8-Ball Pool · 八球台球`, etc.) and triggers `activeStation` transition on `E`.
- **Background NPC Activity Loop**: While the player walks around the lounge, idle tables run lightweight autonomous loops—pool NPCs periodically line up and strike a ball across the baize, and dart NPCs toss darts into the board with subtle woody thuds—Pausing cleanly when the player takes over that station.
- **PeerJS WebRTC Multiplayer**: Opening the Arcade Terminal initializes a PeerJS instance with a deterministic 6-character room code generator, syncing remote player avatar coordinates `(x, z, yaw, activeStation)` and station turn/shot actions over a reliable WebRTC `DataChannel`, with a local simulated partner fallback when testing offline.
