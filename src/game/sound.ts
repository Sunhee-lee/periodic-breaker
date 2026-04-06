// ============================================================
// Element Breaker – Sound System (Web Audio API)
// Procedural synth sounds — no audio files needed.
// ============================================================

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function play(fn: (c: AudioContext, t: number) => void) {
  try {
    const c = getCtx();
    fn(c, c.currentTime);
  } catch {
    // Audio not available
  }
}

/** Short click for paddle bounce */
export function sndPaddle() {
  play((c, t) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(220, t + 0.08);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.08);
  });
}

/** Pop sound for normal block break */
export function sndBlockBreak() {
  play((c, t) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.1);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.1);
  });
}

/** Boom for explosive elements */
export function sndExplosion() {
  play((c, t) => {
    // Noise burst
    const buf = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.06));
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    // Low rumble
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.2, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(g).connect(c.destination);
    o.connect(g2).connect(c.destination);
    src.start(t);
    o.start(t);
    o.stop(t + 0.3);
  });
}

/** Geiger counter click for radioactive pierce activation */
export function sndRadioactive() {
  play((c, t) => {
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(2000 + Math.random() * 1000, t + i * 0.06);
      g.gain.setValueAtTime(0.1, t + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.03);
      o.connect(g).connect(c.destination);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 0.03);
    }
  });
}

/** Rising chime for combo */
export function sndCombo(level: number) {
  play((c, t) => {
    const baseFreq = 400 + level * 100;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(baseFreq, t);
    o.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, t + 0.12);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.15);
  });
}

/** Power-up jingle for paddle grow */
export function sndPowerup() {
  play((c, t) => {
    [523, 659, 784].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.1, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.15);
      o.connect(g).connect(c.destination);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.15);
    });
  });
}

// ────────────────────────────────────────────────────────────
//  Background Music — procedural 8-bit chiptune per level
// ────────────────────────────────────────────────────────────

let bgmInterval: ReturnType<typeof setInterval> | null = null;
let bgmGain: GainNode | null = null;
let bgmPlaying = false;
let bgmLevel = 0;

// Note frequencies (C4=262, etc)
const N: Record<string, number> = {
  C3:131,D3:147,E3:165,F3:175,G3:196,A3:220,B3:247,
  C4:262,D4:294,E4:330,F4:349,G4:392,A4:440,B4:494,
  C5:523,D5:587,E5:659,F5:698,G5:784,A5:880,B5:988,
};

function playNote(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(vol, start);
  g.gain.setValueAtTime(vol, start + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur);
}

function schedulePattern(c: AudioContext, dest: AudioNode, t: number, melody: number[], bass: number[], tempo: number) {
  const step = 60 / tempo / 2; // 8th notes
  melody.forEach((freq, i) => {
    if (freq > 0) playNote(c, freq, t + i * step, step * 0.8, "square", 0.06, dest);
  });
  bass.forEach((freq, i) => {
    if (freq > 0) playNote(c, freq, t + i * step, step * 0.9, "triangle", 0.08, dest);
  });
}

// Level 1: bright, bouncy C major
const L1_MELODY = [N.E4,N.G4,N.C5,N.G4, N.E4,N.D4,N.C4,N.D4, N.E4,N.G4,N.A4,N.G4, N.E4,N.D4,N.E4,0];
const L1_BASS   = [N.C3,0,N.C3,0, N.G3,0,N.G3,0, N.A3,0,N.A3,0, N.G3,0,N.F3,0];

// Level 2: tense, minor key, faster
const L2_MELODY = [N.A4,N.C5,N.E5,N.C5, N.A4,N.G4,N.F4,N.G4, N.A4,N.B4,N.C5,N.B4, N.A4,N.G4,N.A4,0];
const L2_BASS   = [N.A3,0,N.A3,0, N.F3,0,N.F3,0, N.D3,0,N.D3,0, N.E3,0,N.E3,0];

// Level 3: intense, dramatic, fastest
const L3_MELODY = [N.E5,N.D5,N.C5,N.B4, N.A4,N.B4,N.C5,N.D5, N.E5,N.E5,N.D5,N.C5, N.B4,N.A4,N.B4,0];
const L3_BASS   = [N.A3,0,N.E3,0, N.F3,0,N.D3,0, N.A3,0,N.E3,0, N.G3,0,N.E3,0];

const MELODIES = [L1_MELODY, L2_MELODY, L3_MELODY];
const BASSES   = [L1_BASS,   L2_BASS,   L3_BASS];
const TEMPOS   = [140, 160, 180];

export function startBGM(level: number) {
  stopBGM();
  try {
    const c = getCtx();
    bgmGain = c.createGain();
    bgmGain.gain.value = 0.4;
    bgmGain.connect(c.destination);

    bgmLevel = Math.max(0, Math.min(2, level - 1));
    bgmPlaying = true;

    const melody = MELODIES[bgmLevel];
    const bass = BASSES[bgmLevel];
    const tempo = TEMPOS[bgmLevel];
    const patternDur = melody.length * (60 / tempo / 2) * 1000;

    // Play first pattern immediately
    schedulePattern(c, bgmGain, c.currentTime + 0.05, melody, bass, tempo);

    // Loop
    bgmInterval = setInterval(() => {
      if (!bgmPlaying) return;
      try {
        const cx = getCtx();
        if (bgmGain) schedulePattern(cx, bgmGain, cx.currentTime + 0.05, melody, bass, tempo);
      } catch { /* */ }
    }, patternDur);
  } catch { /* */ }
}

export function stopBGM() {
  bgmPlaying = false;
  if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
  if (bgmGain) {
    try { bgmGain.gain.setValueAtTime(0, getCtx().currentTime); } catch { /* */ }
    bgmGain = null;
  }
}

export function setBGMVolume(vol: number) {
  if (bgmGain) {
    try { bgmGain.gain.setValueAtTime(vol, getCtx().currentTime); } catch { /* */ }
  }
}

/** Life lost */
export function sndLifeLost() {
  play((c, t) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.4);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.4);
  });
}
