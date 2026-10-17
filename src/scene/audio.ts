// Procedural Web Audio Synthesizer, Impulse-Response Room Reverb & 4-Track Jukebox for CLUB No.9.

export class ClubAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  reverb: ConvolverNode | null = null;
  sfxGain: GainNode | null = null;
  bgmGain: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  muted = false;
  currentTrack = 0;
  private bgmTimer: number | null = null;
  private stepIdx = 0;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    // Dynamic compressor + master gain
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(comp);

    // Procedural Impulse Response (IR) decay filter for warm bar room acoustics
    this.reverb = this.ctx.createConvolver();
    const irLen = Math.floor(this.ctx.sampleRate * 0.85);
    const irBuf = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.8) * 0.25;
      }
    }
    this.reverb.buffer = irBuf;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.24;
    this.reverb.connect(wet);
    wet.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);
    this.sfxGain.connect(this.reverb);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.22;
    this.bgmGain.connect(this.master);
    this.bgmGain.connect(this.reverb);

    // Shared white noise buffer
    const n = Math.floor(this.ctx.sampleRate * 0.45);
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;

    this._startBgmLoop();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  setTrack(idx: number): void {
    this.currentTrack = ((idx % 4) + 4) % 4;
    this.stepIdx = 0;
    this.play('tick');
  }

  _tone(
    f: number,
    dur: number,
    {
      type = 'square',
      gain = 0.2,
      slide = 0,
      delay = 0,
      attack = 0.005,
      toBgm = false,
    }: {
      type?: OscillatorType;
      gain?: number;
      slide?: number;
      delay?: number;
      attack?: number;
      toBgm?: boolean;
    } = {},
  ): void {
    const c = this.ctx;
    const out = toBgm ? this.bgmGain : this.sfxGain;
    if (!c || !out || this.muted) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slide) {
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  _noise(
    dur: number,
    {
      gain = 0.2,
      freq = 1800,
      q = 1,
      delay = 0,
      type = 'bandpass',
    }: {
      gain?: number;
      freq?: number;
      q?: number;
      delay?: number;
      type?: BiquadFilterType;
    } = {},
  ): void {
    const c = this.ctx;
    if (!c || !this.sfxGain || !this.noiseBuf || this.muted) return;
    const t0 = c.currentTime + delay;
    const s = c.createBufferSource();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  play(name: string, o: { gain?: number; step?: number } = {}): void {
    if (!this.ctx || this.muted) return;
    const v = o.gain ?? 1;
    switch (name) {
      // Ludo & Dice sounds (matching Club No.9 Ludo audio.js)
      case 'throw':
        this._noise(0.28, { gain: 0.22 * v, freq: 2600, q: 0.7 });
        for (let i = 0; i < 5; i++) {
          this._noise(0.04, {
            gain: 0.15 * v,
            freq: 1500 + Math.random() * 1800,
            q: 3,
            delay: i * 0.045,
          });
        }
        break;
      case 'hit':
        this._noise(0.07, { gain: 0.3 * v, freq: 700 + Math.random() * 600, q: 2 });
        this._tone(160 + Math.random() * 40, 0.08, {
          type: 'triangle',
          gain: 0.2 * v,
          slide: -60,
        });
        break;
      case 'land':
        this._tone(110, 0.12, { type: 'triangle', gain: 0.3 * v, slide: -40 });
        this._noise(0.05, { gain: 0.2 * v, freq: 500, q: 1 });
        break;
      case 'tick':
        this._tone(900, 0.04, { gain: 0.08 * v });
        break;
      case 'pick':
        this._tone(660, 0.06, { gain: 0.14 * v });
        this._tone(990, 0.08, { gain: 0.12 * v, delay: 0.06 });
        break;
      case 'hop':
        this._tone(420 + (o.step || 0) * 28, 0.07, {
          type: 'square',
          gain: 0.1 * v,
          slide: 120,
        });
        break;
      case 'place':
        this._tone(200, 0.1, { type: 'triangle', gain: 0.25 * v, slide: -80 });
        this._noise(0.04, { gain: 0.12 * v, freq: 900 });
        break;
      case 'six':
        [523, 659, 784, 1046].forEach((f, i) =>
          this._tone(f, 0.12, { gain: 0.13 * v, delay: i * 0.07 }),
        );
        break;
      case 'capture':
        this._tone(300, 0.3, { type: 'sawtooth', gain: 0.18 * v, slide: -240 });
        this._noise(0.2, { gain: 0.22 * v, freq: 400 });
        break;
      case 'home':
        [523, 659, 784].forEach((f, i) =>
          this._tone(f, 0.16, { type: 'triangle', gain: 0.2 * v, delay: i * 0.09 }),
        );
        break;
      case 'nomove':
        this._tone(200, 0.2, { type: 'triangle', gain: 0.18 * v, slide: -60 });
        break;
      case 'win':
        [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
          this._tone(f, 0.2, { type: 'square', gain: 0.12 * v, delay: i * 0.12 }),
        );
        break;
      case 'turn':
        this._tone(520, 0.05, { gain: 0.07 * v });
        break;
      // Pool & Darts & Bartender SFX
      case 'cueStrike':
        this._noise(0.06, { gain: 0.32 * v, freq: 1400, q: 2.5 });
        this._tone(240, 0.09, { type: 'triangle', gain: 0.28 * v, slide: -110 });
        break;
      case 'ballClack':
        this._tone(1680 + Math.random() * 240, 0.035, {
          type: 'sine',
          gain: 0.24 * v,
          slide: -300,
        });
        break;
      case 'pocketDrop':
        this._tone(140, 0.18, { type: 'triangle', gain: 0.3 * v, slide: -65 });
        this._noise(0.12, { gain: 0.18 * v, freq: 600, q: 1.2, delay: 0.05 });
        break;
      case 'dartThud':
        this._tone(155, 0.09, { type: 'triangle', gain: 0.28 * v, slide: -75 });
        this._noise(0.04, { gain: 0.2 * v, freq: 900, q: 2 });
        break;
      case 'pourBeer':
        this._noise(0.4, { gain: 0.18 * v, freq: 1900, q: 1.5 });
        [440, 554, 659].forEach((f, i) =>
          this._tone(f, 0.12, { type: 'sine', gain: 0.14 * v, delay: 0.15 + i * 0.08 }),
        );
        break;
      default:
        break;
    }
  }

  private _startBgmLoop(): void {
    if (this.bgmTimer != null) return;
    const chords = [
      // Track 0: Late-Night Rhodes Jazz
      [
        [261.6, 329.6, 392.0, 493.9],
        [293.7, 349.2, 440.0, 523.3],
        [246.9, 311.1, 392.0, 466.2],
        [220.0, 277.2, 329.6, 415.3],
      ],
      // Track 1: 90s Synthwave
      [
        [220.0, 261.6, 329.6],
        [174.6, 220.0, 261.6],
        [196.0, 246.9, 293.7],
        [164.8, 196.0, 246.9],
      ],
      // Track 2: 8-Bit Chiptune
      [
        [523.3, 659.3, 784.0],
        [587.3, 740.0, 880.0],
        [493.9, 659.3, 784.0],
        [440.0, 554.4, 659.3],
      ],
      // Track 3: Rain & Fireplace Lo-Fi
      [
        [196.0, 246.9, 293.7, 369.9],
        [174.6, 220.0, 261.6, 329.6],
        [164.8, 207.7, 246.9, 311.1],
        [146.8, 185.0, 220.0, 277.2],
      ],
    ];

    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || this.muted || document.hidden) return;
      const track = chords[this.currentTrack] || chords[0];
      const chord = track[Math.floor(this.stepIdx / 4) % track.length];
      const note = chord[this.stepIdx % chord.length];
      const wave: OscillatorType =
        this.currentTrack === 2 ? 'square' : this.currentTrack === 1 ? 'sawtooth' : 'sine';
      this._tone(note, 0.42, {
        type: wave,
        gain: this.currentTrack === 2 ? 0.08 : 0.14,
        attack: 0.03,
        toBgm: true,
      });
      this.stepIdx++;
    }, 480);
  }
}
