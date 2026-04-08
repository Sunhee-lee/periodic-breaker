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

/** Metal clang for Fe/Ti */
export function sndMetal() {
  play((c, t) => {
    // High metallic ping
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(800, t + 0.15);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.2);
    // Low metallic thud
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = "sine";
    o2.frequency.setValueAtTime(150, t);
    o2.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o2.connect(g2).connect(c.destination);
    o2.start(t);
    o2.stop(t + 0.15);
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
//  Background Music — mp3 files per level
// ────────────────────────────────────────────────────────────

const BGM_SRCS = ["/level1.mp3", "/level2.mp3", "/level3.mp3", "/level4.mp3", "/level5.mp3", "/level6.mp3", "/level7.mp3"];
let bgmAudio: HTMLAudioElement | null = null;

export function startBGM(level: number) {
  stopBGM();
  try {
    const idx = Math.max(0, Math.min(BGM_SRCS.length - 1, level - 1));
    bgmAudio = new Audio(BGM_SRCS[idx]);
    bgmAudio.loop = true;
    bgmAudio.volume = 0.3;
    bgmAudio.play().catch(() => { /* autoplay blocked */ });
  } catch { /* */ }
}

export function setBGMVolume(vol: number) {
  if (bgmAudio) bgmAudio.volume = Math.max(0, Math.min(1, vol));
}

export function getBGMVolume(): number {
  return bgmAudio?.volume ?? 0.3;
}

export function stopBGM() {
  if (bgmAudio) {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
    bgmAudio = null;
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
