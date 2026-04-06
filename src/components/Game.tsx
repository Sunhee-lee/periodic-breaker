"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Matter from "matter-js";
import {
  ELEMENTS,
  DESTROYABLE_COUNT,
  GROUP_COLORS,
  type VfxKey,
} from "@/game/elements";
import { executeEffect, type BlockRuntime, type GameState } from "@/game/effects";
import { VfxManager } from "@/game/vfx";
import { getFlavorText } from "@/game/elementFlavor";
import { getKrName } from "@/game/elementKrNames";
import {
  sndPaddle, sndBlockBreak, sndExplosion, sndRadioactive,
  sndCombo, sndPowerup, sndLifeLost,
  startBGM, stopBGM, setBGMVolume,
} from "@/game/sound";

// ── Constants ─────────────────────────────────────────────
const GW = 560;
const GH = 780;
const PADDLE_W = 100;
const PADDLE_H = 14;
const BALL_R = 8;
const WALL_T = 20;
const LIVES = 3;
// Difficulty = paddle width
const DIFF_PADDLE: Record<string, number> = { easy: 130, normal: 100, hard: 70 };

// Top 3 most radioactive elements (shortest half-life) → multiball
const MULTIBALL_ELEMENTS = new Set([118, 117, 116]); // Og, Ts, Lv

const BASE_SPEED = 6;

// Level configs
const LEVEL_TIMES = [420, 300, 180]; // L1: 7min, L2: 5min, L3: 3min
const LEVEL_SPEED = [BASE_SPEED, BASE_SPEED * 1.2, BASE_SPEED * 1.5]; // L1, L2, L3
// Level color themes: [hue-shift in degrees, saturation-boost, brightness-boost]
// L1: original, L2: red/warm shift, L3: blue/ice shift
type LevelTheme = { hueShift: number; tintR: number; tintG: number; tintB: number };
const LEVEL_THEMES: LevelTheme[] = [
  { hueShift: 0, tintR: 0, tintG: 0, tintB: 0 },        // L1: original colors
  { hueShift: 0, tintR: 60, tintG: -20, tintB: -30 },    // L2: red/warm tint
  { hueShift: 0, tintR: -20, tintG: 20, tintB: 80 },     // L3: blue/white ice tint
];
const COLS = 18;
const BG = 1;
const BM = 4;
const BW = Math.floor((GW - BM * 2 - (COLS - 1) * BG) / COLS);
const BH = 22;
const BT = 20; // top offset
const LN_GAP = 8; // extra gap before lanthanide/actinide rows
const CAT = { WALL: 0x0001, PADDLE: 0x0002, BALL: 0x0004, BLOCK: 0x0008 };
// No chain explosions — blocks only destroyed by ball

interface FloatingText {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
}

// ── Helpers ───────────────────────────────────────────────
/** Apply level theme tint to a hex color */
function tintColor(hex: string, theme: LevelTheme): string {
  if (theme.tintR === 0 && theme.tintG === 0 && theme.tintB === 0) return hex;
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const r = Math.max(0, Math.min(255, parseInt(m[1], 16) + theme.tintR));
  const g = Math.max(0, Math.min(255, parseInt(m[2], 16) + theme.tintG));
  const b = Math.max(0, Math.min(255, parseInt(m[3], 16) + theme.tintB));
  return `rgb(${r},${g},${b})`;
}

function blockPos(row: number, col: number) {
  // Rows 1-7 are the main table, rows 8-9 are Ln/Ac with extra gap
  let y: number;
  if (row <= 7) {
    y = BT + (row - 1) * (BH + BG) + BH / 2;
  } else {
    // row 8 = lanthanides, row 9 = actinides (below main table with gap)
    y = BT + 7 * (BH + BG) + LN_GAP + (row - 8) * (BH + BG) + BH / 2;
  }
  return {
    x: BM + (col - 1) * (BW + BG) + BW / 2,
    y,
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ══════════════════════════════════════════════════════════
//  Component
// ══════════════════════════════════════════════════════════
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const paddleRef = useRef<Matter.Body | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const blocksRef = useRef<BlockRuntime[]>([]);
  const vfxRef = useRef(new VfxManager());
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const animRef = useRef(0);
  const draggingRef = useRef(false);
  const stateRef = useRef<GameState | null>(null);

  const [lives, setLives] = useState(LIVES);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [stageClear, setStageClear] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [blocksLeft, setBlocksLeft] = useState(DESTROYABLE_COUNT);
  const [paused, setPaused] = useState(false);
  const [difficulty, setDifficulty] = useState<string | null>(null); // null = show select
  const [combo, setCombo] = useState(0);
  const [collected, setCollected] = useState<Set<number>>(new Set());
  const [levelCollected, setLevelCollected] = useState<Set<number>>(new Set());
  const [showCollection, setShowCollection] = useState(false);
  const [bgmVol, setBgmVol] = useState(0.3);
  const [level, setLevel] = useState(1);
  const [timeLeft, setTimeLeft] = useState(LEVEL_TIMES[0]);

  const livesRef = useRef(LIVES);
  const scoreRef = useRef(0);
  const goRef = useRef(false);
  const launchedRef = useRef(false);
  const clearRef = useRef(false);
  const pausedRef = useRef(false);
  const ballSpeedRef = useRef(BASE_SPEED);
  const ballRadiusRef = useRef(BALL_R);
  const paddleWRef = useRef(PADDLE_W);
  const paddleSpeedMultRef = useRef(1);
  const floorShieldEndRef = useRef(0);
  const trajectoryEndRef = useRef(0);
  const trajectoryBouncesRef = useRef(0);
  const scoreMultRef = useRef(1);
  const timedEffectsRef = useRef<{ key: string; endTime: number; revert: () => void }[]>([]);
  const gasZoneEndRef = useRef(0);
  const gasZoneHeightRef = useRef(0);
  const comboRef = useRef(0);
  const shakeRef = useRef(0);
  const stallFramesRef = useRef(0); // counts frames where ball is nearly horizontal
  const levelRef = useRef(1);
  const timerStartRef = useRef(0); // performance.now() when launched // remaining shake frames
  const collectedRef = useRef<Set<number>>(new Set());
  const levelCollectedRef = useRef<Set<number>>(new Set()); // current level only
  const multiBallsRef = useRef<{ body: Matter.Body }[]>([]); // extra balls, no time limit

  // ── Sync helpers (React state ← refs for render loop) ──
  const syncUI = useCallback(() => {
    setScore(scoreRef.current);
    setLives(livesRef.current);
    setBlocksLeft(blocksRef.current.filter((b) => b.alive && b.breakable).length);
    setCombo(comboRef.current);
    setCollected(new Set(collectedRef.current));
    setLevelCollected(new Set(levelCollectedRef.current));
  }, []);

  // ── Create blocks ──
  const createBlocks = useCallback((engine: Matter.Engine): BlockRuntime[] => {
    const blocks: BlockRuntime[] = [];
    for (const el of ELEMENTS) {
      const p = blockPos(el.row, el.col);
      const body = Matter.Bodies.rectangle(p.x, p.y, BW, BH, {
        isStatic: true,
        restitution: 1,
        friction: 0,
        frictionStatic: 0,
        collisionFilter: { category: CAT.BLOCK },
        label: `block-${el.atomicNumber}`,
      });
      blocks.push({
        id: el.atomicNumber,
        x: p.x, y: p.y,
        alive: true,
        hp: el.durability,
        frozen: false,
        symbol: el.symbol,
        effect: el.effect,
        params: { ...el.params },
        vfx: el.vfx,
        group: el.group,
        breakable: el.breakable,
        body,
      } as BlockRuntime & { body: Matter.Body });
      Matter.Composite.add(engine.world, body);
    }
    return blocks;
  }, []);

  const resetBall = useCallback(() => {
    if (!ballRef.current || !paddleRef.current) return;
    Matter.Body.setPosition(ballRef.current, {
      x: paddleRef.current.position.x,
      y: paddleRef.current.position.y - PADDLE_H / 2 - BALL_R - 2,
    });
    Matter.Body.setVelocity(ballRef.current, { x: 0, y: 0 });
    launchedRef.current = false;
    setLaunched(false);
  }, []);

  const launchBall = useCallback(() => {
    if (!ballRef.current || launchedRef.current || goRef.current || clearRef.current) return;
    const sp = LEVEL_SPEED[levelRef.current - 1] ?? BASE_SPEED;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    if (timerStartRef.current === 0) timerStartRef.current = performance.now();
    Matter.Body.setVelocity(ballRef.current, {
      x: Math.cos(a) * sp,
      y: Math.sin(a) * sp,
    });
    launchedRef.current = true;
    setLaunched(true);
  }, []);

  const restartGame = useCallback(() => {
    stopBGM();
    const engine = engineRef.current;
    if (!engine) return;
    for (const b of blocksRef.current) {
      const body = (b as BlockRuntime & { body: Matter.Body }).body;
      if (body) Matter.Composite.remove(engine.world, body);
    }
    blocksRef.current = createBlocks(engine);
    livesRef.current = LIVES;
    scoreRef.current = 0;
    goRef.current = false;
    clearRef.current = false;
    ballSpeedRef.current = BASE_SPEED;
    ballRadiusRef.current = BALL_R;
    const pw = DIFF_PADDLE[difficulty ?? "normal"] ?? PADDLE_W;
    paddleWRef.current = pw;
    paddleSpeedMultRef.current = 1;
    floorShieldEndRef.current = 0;
    trajectoryEndRef.current = 0;
    scoreMultRef.current = 1;
    timedEffectsRef.current = [];
    gasZoneEndRef.current = 0;
    vfxRef.current.clear();
    floatingTextsRef.current = [];
    comboRef.current = 0;
    shakeRef.current = 0;
    collectedRef.current = new Set();
    levelCollectedRef.current = new Set();
    // Remove multiball extras
    for (const mb of multiBallsRef.current) {
      try { Matter.Composite.remove(engine.world, mb.body); } catch { /* */ }
    }
    multiBallsRef.current = [];
    levelRef.current = 1;
    timerStartRef.current = 0;
    setLevel(1);
    setTimeLeft(LEVEL_TIMES[levelRef.current - 1]);
    setGameOver(false);
    setStageClear(false);
    setShowCollection(false);
    setBlocksLeft(DESTROYABLE_COUNT);
    setScore(0);
    setLives(LIVES);
    // Restart physics runner if stopped
    if (runnerRef.current && engineRef.current) Matter.Runner.run(runnerRef.current, engineRef.current);
    resetBall();
  }, [resetBall, createBlocks]);

  const nextLevel = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const newLv = levelRef.current + 1;
    if (newLv > 3) return; // max level 3
    // Remove old blocks
    for (const b of blocksRef.current) {
      const body = (b as BlockRuntime & { body: Matter.Body }).body;
      if (body) try { Matter.Composite.remove(engine.world, body); } catch { /* */ }
    }
    // Remove multiball
    for (const mb of multiBallsRef.current) {
      try { Matter.Composite.remove(engine.world, mb.body); } catch { /* */ }
    }
    multiBallsRef.current = [];
    // Reset blocks
    blocksRef.current = createBlocks(engine);
    levelRef.current = newLv;
    timerStartRef.current = 0;
    clearRef.current = false;
    ballSpeedRef.current = LEVEL_SPEED[newLv - 1] ?? BASE_SPEED;
    ballRadiusRef.current = BALL_R;
    paddleSpeedMultRef.current = 1;
    floorShieldEndRef.current = 0;
    trajectoryEndRef.current = 0;
    scoreMultRef.current = 1;
    timedEffectsRef.current = [];
    gasZoneEndRef.current = 0;
    comboRef.current = 0;
    shakeRef.current = 0;
    levelCollectedRef.current = new Set();
    vfxRef.current.clear();
    floatingTextsRef.current = [];
    if (stateRef.current) {
      stateRef.current.ball.speed = LEVEL_SPEED[newLv - 1] ?? BASE_SPEED;
      stateRef.current.ball.baseSpeed = LEVEL_SPEED[newLv - 1] ?? BASE_SPEED;
      stateRef.current.ball.pierce = false;
      stateRef.current.ball.radius = BALL_R;
      stateRef.current.stageClear = false;
    }
    setLevel(newLv);
    setTimeLeft(LEVEL_TIMES[newLv - 1]);
    setStageClear(false);
    setShowCollection(false);
    setBlocksLeft(DESTROYABLE_COUNT);
    // Restart physics runner if stopped
    if (runnerRef.current && engineRef.current) Matter.Runner.run(runnerRef.current, engineRef.current);
    resetBall();
  }, [resetBall, createBlocks]);

  const togglePause = useCallback(() => {
    if (goRef.current || clearRef.current || !launchedRef.current) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    const runner = runnerRef.current;
    if (!runner) return;
    if (next) {
      Matter.Runner.stop(runner);
      stopBGM();
    } else if (engineRef.current) {
      Matter.Runner.run(runner, engineRef.current);
      startBGM(levelRef.current);
    }
  }, []);

  // Keyboard: Escape or P to toggle pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  // ══════════════════════════════════════════════════════
  //  Main effect – physics, collision, rendering
  // ══════════════════════════════════════════════════════
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const vfx = vfxRef.current;

    // ── Engine ──
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    engineRef.current = engine;

    const wo: Matter.IChamferableBodyDefinition = {
      isStatic: true, restitution: 1, friction: 0, frictionStatic: 0,
      collisionFilter: { category: CAT.WALL },
    };
    const topW = Matter.Bodies.rectangle(GW / 2, -WALL_T / 2, GW + WALL_T * 2, WALL_T, wo);
    const leftW = Matter.Bodies.rectangle(-WALL_T / 2, GH / 2, WALL_T, GH, wo);
    const rightW = Matter.Bodies.rectangle(GW + WALL_T / 2, GH / 2, WALL_T, GH, wo);

    const initPW = DIFF_PADDLE[difficulty ?? "normal"] ?? PADDLE_W;
    paddleWRef.current = initPW;
    const paddle = Matter.Bodies.rectangle(GW / 2, GH - 40, initPW, PADDLE_H, {
      isStatic: true, restitution: 1, friction: 0, frictionStatic: 0,
      chamfer: { radius: 7 },
      collisionFilter: { category: CAT.PADDLE },
      label: "paddle",
    });
    paddleRef.current = paddle;

    const ball = Matter.Bodies.circle(GW / 2, GH - 40 - PADDLE_H / 2 - BALL_R - 2, BALL_R, {
      restitution: 1, friction: 0, frictionAir: 0, frictionStatic: 0,
      inertia: Infinity, inverseInertia: 0, density: 1,
      collisionFilter: { category: CAT.BALL, mask: CAT.WALL | CAT.PADDLE | CAT.BLOCK },
      label: "ball",
    });
    ballRef.current = ball;
    Matter.Composite.add(engine.world, [topW, leftW, rightW, paddle, ball]);
    blocksRef.current = createBlocks(engine);

    const runner = Matter.Runner.create();
    runnerRef.current = runner;
    Matter.Runner.run(runner, engine);

    // ── Build shared GameState ──
    const gs: GameState = {
      blocks: blocksRef.current,
      ball: {
        x: 0, y: 0, vx: 0, vy: 0,
        radius: BALL_R, baseRadius: BALL_R,
        speed: BASE_SPEED, baseSpeed: BASE_SPEED,
        trailDamage: false, trailEnd: 0, trailInterval: 120,
        pierce: false, pierceEnd: 0, pierceHits: 0,
        powerHit: false, powerHitEnd: 0,
      },
      paddle: {
        x: GW / 2, y: GH - 40,
        width: initPW, baseWidth: initPW,
        speedMultiplier: 1,
      },
      score: 0,
      scoreMultiplier: 1,
      floorShieldEnd: 0,
      trajectoryEnd: 0,
      trajectoryBounces: 0,
      timedEffects: timedEffectsRef.current,
      addScore: (base: number) => {
        scoreRef.current += Math.round(base * gs.scoreMultiplier);
      },
      destroyBlock: (blk: BlockRuntime) => {
        if (!blk.alive) return;
        blk.alive = false;
        const body = (blk as BlockRuntime & { body: Matter.Body }).body;
        if (body) {
          try { Matter.Composite.remove(engine.world, body); } catch { /* already removed */ }
        }

        // Combo: increment (resets on paddle hit)
        comboRef.current += 1;
        const comboLevel = comboRef.current;

        // Score with combo multiplier
        const comboMult = 1 + (comboLevel - 1) * 0.25; // x1, x1.25, x1.5, ...
        const points = blk.id * 10;
        scoreRef.current += Math.round(points * gs.scoreMultiplier * comboMult);

        // Collection
        collectedRef.current.add(blk.id);
        levelCollectedRef.current.add(blk.id);

        // Sound
        const isExplosive = blk.effect === "explosion";
        const isRadioactive = blk.effect === "radioactive_pierce";
        if (isExplosive) { sndExplosion(); }
        else if (isRadioactive) { sndRadioactive(); }
        else { sndBlockBreak(); }
        if (comboLevel >= 3) sndCombo(comboLevel);
        if (blk.effect === "paddle_grow") sndPowerup();

        // Camera shake for big explosions
        if (isExplosive && [11, 19, 37, 55].includes(blk.id)) {
          shakeRef.current = 12; // frames
        }

        // Floating text — stagger Y
        const el = ELEMENTS.find((e) => e.atomicNumber === blk.id);
        const colors = el ? GROUP_COLORS[el.group] : null;
        const existingTexts = floatingTextsRef.current;
        const maxY = GH * 0.75; // never go below 75% of canvas (above paddle)
        let ty = GH * 0.35;
        for (const ft of existingTexts) {
          if (!ft.text.includes("COMBO") && Math.abs(ft.y - ty) < 20) ty += 20;
        }
        // If would overflow into paddle area, remove oldest non-combo text
        if (ty > maxY) {
          const oldest = existingTexts.findIndex(ft => !ft.text.includes("COMBO"));
          if (oldest >= 0) existingTexts.splice(oldest, 1);
          ty = maxY;
        }
        existingTexts.push({
          text: getFlavorText(blk.id),
          x: GW / 2, y: ty,
          life: 180, maxLife: 180,
          color: colors?.border ?? "#ffffff",
        });
        // Combo text — replace previous combo text instead of stacking
        if (comboLevel >= 2) {
          // Remove any existing combo texts
          for (let i = existingTexts.length - 1; i >= 0; i--) {
            if (existingTexts[i].text.includes("COMBO")) existingTexts.splice(i, 1);
          }
          existingTexts.push({
            text: `x${comboLevel} COMBO!`,
            x: GW - 70, y: GH - 80,
            life: 60, maxLife: 60,
            color: "#ffffff",
          });
        }

        // Trigger effect
        executeEffect(blk.effect, blk, gs);

        // Multiball: top 3 radioactive (Og, Ts, Lv) spawn 2 extra balls
        if (MULTIBALL_ELEMENTS.has(blk.id)) {
          for (let i = 0; i < 2; i++) {
            const angle = -Math.PI / 2 + (i === 0 ? -0.5 : 0.5);
            const mb = Matter.Bodies.circle(blk.x, blk.y + BH + BALL_R + 2, BALL_R, {
              restitution: 1, friction: 0, frictionAir: 0, frictionStatic: 0,
              inertia: Infinity, inverseInertia: 0, density: 1,
              collisionFilter: { category: CAT.BALL, mask: CAT.WALL | CAT.PADDLE | CAT.BLOCK },
              label: "multiball",
            });
            Matter.Body.setVelocity(mb, {
              x: Math.cos(angle) * BASE_SPEED,
              y: Math.sin(angle) * BASE_SPEED,
            });
            Matter.Composite.add(engine.world, mb);
            multiBallsRef.current.push({ body: mb });
          }
        }

        syncUI();
        // Stage clear
        const remaining = blocksRef.current.filter((b) => b.alive && b.breakable).length;
        if (remaining <= 0) {
          clearRef.current = true;
          gs.stageClear = true;
          setStageClear(true);
          stopBGM();
          Matter.Body.setVelocity(ball, { x: 0, y: 0 });
          if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
        }
      },
      spawnVfx: (key: VfxKey, x: number, y: number, extra?: Record<string, unknown>) => {
        vfx.spawn(key, x, y, extra);
      },
      now: performance.now(),
      stageClear: false,
      gasZoneEnd: 0,
      gasZoneHeight: 0,
    };
    stateRef.current = gs;

    // ── afterUpdate: speed enforcement, life loss, timed effects ──
    Matter.Events.on(engine, "afterUpdate", () => {
      const now = performance.now();
      gs.now = now;

      // Timer countdown
      if (timerStartRef.current > 0 && launchedRef.current && !goRef.current && !clearRef.current) {
        const elapsed = (now - timerStartRef.current) / 1000;
        const remaining = Math.max(0, LEVEL_TIMES[levelRef.current - 1] - elapsed);
        setTimeLeft(Math.ceil(remaining));
        if (remaining <= 0) {
          // Time up = game over, freeze everything
          goRef.current = true;
          setGameOver(true);
          stopBGM();
          if (ballRef.current) Matter.Body.setVelocity(ballRef.current, { x: 0, y: 0 });
          for (const mb of multiBallsRef.current) {
            Matter.Body.setVelocity(mb.body, { x: 0, y: 0 });
          }
          if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
          syncUI();
          return;
        }
      }

      // Expire timed effects
      for (let i = gs.timedEffects.length - 1; i >= 0; i--) {
        if (now >= gs.timedEffects[i].endTime) {
          gs.timedEffects[i].revert();
          gs.timedEffects.splice(i, 1);
        }
      }

      // Sync gs ← refs
      ballSpeedRef.current = gs.ball.speed;
      ballRadiusRef.current = gs.ball.radius;
      // Resize paddle physics body if width changed
      const newPW = gs.paddle.width;
      const oldPW = paddleWRef.current;
      if (Math.abs(newPW - oldPW) > 0.5 && paddleRef.current) {
        const scaleX = newPW / oldPW;
        Matter.Body.scale(paddleRef.current, scaleX, 1);
      }
      paddleWRef.current = newPW;
      paddleSpeedMultRef.current = gs.paddle.speedMultiplier;
      floorShieldEndRef.current = gs.floorShieldEnd;
      trajectoryEndRef.current = gs.trajectoryEnd;
      trajectoryBouncesRef.current = gs.trajectoryBounces;
      scoreMultRef.current = gs.scoreMultiplier;
      gasZoneEndRef.current = gs.gasZoneEnd;
      gasZoneHeightRef.current = gs.gasZoneHeight;

      if (!launchedRef.current || goRef.current || clearRef.current) {
        if (!launchedRef.current && paddleRef.current && ballRef.current) {
          Matter.Body.setPosition(ballRef.current, {
            x: paddleRef.current.position.x,
            y: paddleRef.current.position.y - PADDLE_H / 2 - BALL_R - 2,
          });
        }
        return;
      }

      const b = ballRef.current;
      if (!b) return;

      // Sync ball state → gs
      gs.ball.x = b.position.x;
      gs.ball.y = b.position.y;
      gs.ball.vx = b.velocity.x;
      gs.ball.vy = b.velocity.y;

      // Ball fell below screen
      if (b.position.y > GH + BALL_R * 2) {
        // Floor shield check
        if (now < floorShieldEndRef.current) {
          Matter.Body.setPosition(b, { x: b.position.x, y: GH - 10 });
          Matter.Body.setVelocity(b, { x: b.velocity.x, y: -Math.abs(b.velocity.y) });
          return;
        }
        livesRef.current -= 1;
        setLives(livesRef.current);
        sndLifeLost();
        comboRef.current = 0;
        if (livesRef.current <= 0) {
          goRef.current = true;
          setGameOver(true);
          stopBGM();
          Matter.Body.setVelocity(b, { x: 0, y: 0 });
          if (runnerRef.current) Matter.Runner.stop(runnerRef.current);
        } else if (paddleRef.current) {
          Matter.Body.setPosition(b, {
            x: paddleRef.current.position.x,
            y: paddleRef.current.position.y - PADDLE_H / 2 - BALL_R - 2,
          });
          Matter.Body.setVelocity(b, { x: 0, y: 0 });
          launchedRef.current = false;
          setLaunched(false);
        }
        return;
      }

      // Enforce constant speed
      const sp = gs.ball.speed;
      const vx = b.velocity.x;
      const vy = b.velocity.y;
      const mag = Math.sqrt(vx * vx + vy * vy);
      if (mag > 0 && Math.abs(mag - sp) > 0.1) {
        const s = sp / mag;
        Matter.Body.setVelocity(b, { x: vx * s, y: vy * s });
      }
      // Pierce mode: disable block collision mask, manually destroy overlapping blocks
      if (gs.ball.pierce) {
        // Make ball ignore blocks in physics
        if (b.collisionFilter.mask !== (CAT.WALL | CAT.PADDLE)) {
          b.collisionFilter.mask = CAT.WALL | CAT.PADDLE;
        }
        // Manually check overlap with alive blocks
        const bx = b.position.x;
        const by = b.position.y;
        const br = ballRadiusRef.current;
        for (const blk of blocksRef.current) {
          if (!blk.alive || !blk.breakable) continue;
          // Simple AABB overlap check
          const dx = Math.abs(bx - blk.x);
          const dy = Math.abs(by - blk.y);
          if (dx < BW / 2 + br && dy < BH / 2 + br) {
            blk.hp = 0;
            gs.destroyBlock(blk);
          }
        }
      } else {
        // Restore normal collision mask
        if (b.collisionFilter.mask !== (CAT.WALL | CAT.PADDLE | CAT.BLOCK)) {
          b.collisionFilter.mask = CAT.WALL | CAT.PADDLE | CAT.BLOCK;
        }
      }

      // Prevent horizontal stall — if ball stays nearly horizontal, force it down
      if (Math.abs(b.velocity.y) < sp * 0.45) {
        stallFramesRef.current += 1;
      } else {
        stallFramesRef.current = 0;
      }
      // Immediate correction
      if (Math.abs(b.velocity.y) < sp * 0.35) {
        const ny = sp * 0.6;
        const nx = Math.sign(b.velocity.x || 1) * Math.sqrt(Math.max(0, sp * sp - ny * ny));
        Matter.Body.setVelocity(b, { x: nx, y: ny });
      }
      // If stuck horizontal for 10+ frames (~0.17s), hard reset toward paddle
      if (stallFramesRef.current > 10) {
        stallFramesRef.current = 0;
        const ny = sp * 0.8;
        const nx = Math.sign(b.velocity.x || 1) * Math.sqrt(Math.max(0, sp * sp - ny * ny));
        Matter.Body.setVelocity(b, { x: nx, y: ny });
        // Also nudge position slightly down to escape trapped rows
        Matter.Body.setPosition(b, { x: b.position.x, y: b.position.y + 3 });
      }

      // Multiball: anti-stall + cleanup
      for (let i = multiBallsRef.current.length - 1; i >= 0; i--) {
        const mb = multiBallsRef.current[i];
        const mbv = mb.body.velocity;
        const mbsp = Math.sqrt(mbv.x * mbv.x + mbv.y * mbv.y) || sp;
        // Force multiball downward if moving too horizontally
        if (Math.abs(mbv.y) < mbsp * 0.35) {
          const ny = mbsp * 0.7;
          const nx = Math.sign(mbv.x || 1) * Math.sqrt(Math.max(0, mbsp * mbsp - ny * ny));
          Matter.Body.setVelocity(mb.body, { x: nx, y: ny });
          Matter.Body.setPosition(mb.body, { x: mb.body.position.x, y: mb.body.position.y + 2 });
        }
        // Remove if fell off screen
        if (mb.body.position.y > GH + BALL_R * 2) {
          try { Matter.Composite.remove(engine.world, mb.body); } catch { /* */ }
          multiBallsRef.current.splice(i, 1);
        }
      }
    });

    // ── Collision handler ──
    Matter.Events.on(engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        // Paddle
        const isPadA = pair.bodyA.label === "paddle";
        const isPadB = pair.bodyB.label === "paddle";
        if (isPadA || isPadB) {
          const ballBody = isPadA ? pair.bodyB : pair.bodyA;
          const padBody = isPadA ? pair.bodyA : pair.bodyB;
          const off = (ballBody.position.x - padBody.position.x) / (paddleWRef.current / 2);
          const clamped = Math.max(-1, Math.min(1, off));
          const angle = -Math.PI / 2 + clamped * (Math.PI / 3);
          const sp = ballSpeedRef.current;
          Matter.Body.setVelocity(ballBody, {
            x: Math.cos(angle) * sp,
            y: Math.sin(angle) * sp,
          });
          sndPaddle();
          comboRef.current = 0; // reset combo on paddle hit
          // Radioactive pierce: resets immediately on paddle hit
          if (gs.ball.pierce) {
            gs.ball.pierce = false;
            gs.ball.pierceHits = 0;
          }
          continue;
        }

        // Block
        const isBlkA = pair.bodyA.label.startsWith("block-");
        const isBlkB = pair.bodyB.label.startsWith("block-");
        if (isBlkA || isBlkB) {
          const blkBody = isBlkA ? pair.bodyA : pair.bodyB;
          const blk = blocksRef.current.find(
            (b) => (b as BlockRuntime & { body: Matter.Body }).body === blkBody && b.alive,
          );
          if (!blk) continue;

          gs.now = performance.now();
          if (paddleRef.current) {
            gs.paddle.x = paddleRef.current.position.x;
            gs.paddle.y = paddleRef.current.position.y;
          }

          if (gs.ball.pierce) {
            // Pierce handled in afterUpdate via manual overlap check
            continue;
          } else {
            // Normal hit
            const dmg = gs.ball.powerHit ? 2 : 1;
            blk.hp -= dmg;

            if (blk.hp <= 0 && blk.breakable) {
              gs.destroyBlock(blk);
            } else if (!blk.breakable) {
              executeEffect(blk.effect, blk, gs);
            } else {
              if (blk.effect === "sharp_reflect" || blk.effect === "metal_reflect") {
                executeEffect(blk.effect, blk, gs);
              }
            }
          }

          syncUI();
        }
      }
    });

    // ══════════════════════════════════════════════════════
    //  Render loop
    // ══════════════════════════════════════════════════════
    const render = () => {
      ctx.clearRect(0, 0, GW, GH);

      // Camera shake
      if (shakeRef.current > 0) {
        shakeRef.current -= 1;
        const intensity = shakeRef.current * 0.8;
        ctx.save();
        ctx.translate(
          (Math.random() - 0.5) * intensity * 2,
          (Math.random() - 0.5) * intensity * 2,
        );
      }

      // BG
      ctx.fillStyle = "#0f0f1a";
      ctx.fillRect(0, 0, GW, GH);

      // Grid
      ctx.strokeStyle = "rgba(99,102,241,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x < GW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GH); ctx.stroke(); }
      for (let y = 0; y < GH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GW, y); ctx.stroke(); }

      // Border
      ctx.shadowBlur = 15;
      ctx.shadowColor = "rgba(99,102,241,0.4)";
      ctx.strokeStyle = "rgba(99,102,241,0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, GW - 2, GH - 2);
      ctx.shadowBlur = 0;

      // ── VFX behind blocks ──
      vfx.update();
      vfx.render(ctx, GW, GH);

      // ── Blocks ──
      for (const blk of blocksRef.current) {
        if (!blk.alive) continue;
        const el = ELEMENTS.find((e) => e.atomicNumber === blk.id)!;
        const baseColors = GROUP_COLORS[el.group];
        const theme = LEVEL_THEMES[levelRef.current - 1] ?? LEVEL_THEMES[0];
        const colors = {
          fill: tintColor(baseColors.fill, theme),
          glow: baseColors.glow,
          text: "#ffffff",
          border: tintColor(baseColors.border, theme),
        };
        const bx = blk.x - BW / 2;
        const by = blk.y - BH / 2;

        // Frozen overlay tint
        const isFrozen = blk.frozen;

        // Opacity based on remaining HP (fades as damaged)
        const hpRatio = el.durability > 1 ? blk.hp / el.durability : 1;
        const blockAlpha = 0.35 + hpRatio * 0.65;
        ctx.globalAlpha = blockAlpha;

        // Glow
        ctx.shadowBlur = 8;
        ctx.shadowColor = isFrozen ? "rgba(56,189,248,0.6)" : colors.glow;

        // Fill
        ctx.fillStyle = isFrozen ? "#0ea5e9" : colors.fill;
        roundRect(ctx, bx, by, BW, BH, 3);
        ctx.fill();

        // Border
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isFrozen ? "#38bdf8" : colors.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Durability indicator for multi-hp blocks
        if (blk.hp > 1) {
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          const hpPct = blk.hp / el.durability;
          ctx.fillRect(bx + 1, by + BH - 3, (BW - 2) * hpPct, 2);
        }

        // Crack for damaged
        if (blk.hp === 1 && el.durability > 1) {
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx + BW * 0.3, by);
          ctx.lineTo(bx + BW * 0.5, by + BH * 0.5);
          ctx.lineTo(bx + BW * 0.7, by + BH);
          ctx.stroke();
        }

        // Atomic number (top-left, tiny)
        ctx.fillStyle = colors.text;
        ctx.globalAlpha = 0.45;
        ctx.font = "bold 6px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(el.atomicNumber), bx + 1, by + 1);
        ctx.globalAlpha = 1;

        // Symbol (center)
        ctx.fillStyle = colors.text;
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.symbol, blk.x, blk.y + 2);


      }

      // ── Trajectory guide ──
      if (performance.now() < trajectoryEndRef.current && ballRef.current && launchedRef.current) {
        const b = ballRef.current;
        let tx = b.position.x, ty = b.position.y;
        let tvx = b.velocity.x, tvy = b.velocity.y;
        ctx.strokeStyle = "rgba(167,139,250,0.3)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        let bounces = 0;
        for (let step = 0; step < 200 && bounces < trajectoryBouncesRef.current; step++) {
          tx += tvx;
          ty += tvy;
          if (tx <= BALL_R || tx >= GW - BALL_R) { tvx = -tvx; bounces++; }
          if (ty <= BALL_R) { tvy = -tvy; bounces++; }
          ctx.lineTo(tx, ty);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Paddle ──
      if (paddleRef.current) {
        const p = paddleRef.current;
        const pw = paddleWRef.current;
        const px = p.position.x - pw / 2;
        const py = p.position.y - PADDLE_H / 2;

        ctx.shadowBlur = 20;
        ctx.shadowColor = "rgba(99,102,241,0.6)";
        const grad = ctx.createLinearGradient(px, py, px, py + PADDLE_H);
        grad.addColorStop(0, "#818cf8");
        grad.addColorStop(1, "#6366f1");
        ctx.fillStyle = grad;
        roundRect(ctx, px, py, pw, PADDLE_H, 7);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Ball ──
      if (ballRef.current) {
        const b = ballRef.current;
        const br = ballRadiusRef.current;

        // Trail damage visual
        if (gs.ball.trailDamage && performance.now() < gs.ball.trailEnd) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = "rgba(249,115,22,0.6)";
          ctx.fillStyle = "rgba(249,115,22,0.15)";
          ctx.beginPath();
          ctx.arc(b.position.x, b.position.y, br + 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        const isPiercing = gs.ball.pierce;

        // Neon glow aura when radioactive pierce is active
        if (isPiercing) {
          ctx.shadowBlur = 30;
          ctx.shadowColor = "rgba(74,222,128,0.9)";
          ctx.fillStyle = "rgba(74,222,128,0.12)";
          ctx.beginPath();
          ctx.arc(b.position.x, b.position.y, br + 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        ctx.shadowBlur = 25;
        ctx.shadowColor = isPiercing
          ? "rgba(74,222,128,0.9)"
          : "rgba(244,114,182,0.8)";
        const bg = ctx.createRadialGradient(
          b.position.x - 2, b.position.y - 2, 0,
          b.position.x, b.position.y, br,
        );
        if (isPiercing) {
          bg.addColorStop(0, "#4ade80");
          bg.addColorStop(1, "#22c55e");
        } else {
          bg.addColorStop(0, "#fbbf24");
          bg.addColorStop(1, "#f472b6");
        }
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // ☢ radiation symbol when pierce is active
        if (isPiercing) {
          ctx.fillStyle = "#052e16";
          ctx.font = `bold ${Math.round(br * 1.4)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("☢", b.position.x, b.position.y);
        }
      }

      // ── Multiball extra balls ──
      for (const mb of multiBallsRef.current) {
        const mbp = mb.body.position;
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(251,191,36,0.6)";
        const mbg = ctx.createRadialGradient(mbp.x - 1, mbp.y - 1, 0, mbp.x, mbp.y, BALL_R);
        mbg.addColorStop(0, "#fde047");
        mbg.addColorStop(1, "#f97316");
        ctx.fillStyle = mbg;
        ctx.beginPath();
        ctx.arc(mbp.x, mbp.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ── Floating element info texts ──
      const fts = floatingTextsRef.current;
      for (let i = fts.length - 1; i >= 0; i--) {
        const ft = fts[i];
        ft.life -= 1;
        ft.y -= 0.2; // float upward very slowly
        if (ft.life <= 0) { fts.splice(i, 1); continue; }
        const progress = ft.life / ft.maxLife;
        // Fade in for first 20%, stay, fade out last 30%
        let alpha: number;
        if (progress > 0.8) alpha = (1 - progress) / 0.2;      // fade in
        else if (progress < 0.3) alpha = progress / 0.3;        // fade out
        else alpha = 1;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = ft.color;
        ctx.font = "600 14px 'Noto Sans KR', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Shadow for readability
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // End camera shake transform
      if (shakeRef.current >= 0) ctx.restore();

      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);

    // ── Input ──
    const getX = (cx: number) => {
      const r = canvas.getBoundingClientRect();
      return (cx - r.left) * (GW / r.width);
    };
    const movePad = (x: number) => {
      if (!paddleRef.current || goRef.current || clearRef.current) return;
      const pw = paddleWRef.current;
      const cx = Math.max(pw / 2, Math.min(GW - pw / 2, x));
      Matter.Body.setPosition(paddleRef.current, { x: cx, y: paddleRef.current.position.y });
    };
    const onMM = (e: MouseEvent) => movePad(getX(e.clientX));
    const onMD = (e: MouseEvent) => {
      movePad(getX(e.clientX));
      if (!launchedRef.current && !goRef.current && !clearRef.current) {
        startBGM(levelRef.current); // must be in direct user event handler
        launchBall();
      }
    };
    const onTS = (e: TouchEvent) => {
      e.preventDefault(); draggingRef.current = true;
      movePad(getX(e.touches[0].clientX));
      if (!launchedRef.current && !goRef.current && !clearRef.current) {
        startBGM(levelRef.current); // must be in direct user event handler
        launchBall();
      }
    };
    const onTM = (e: TouchEvent) => { e.preventDefault(); if (draggingRef.current) movePad(getX(e.touches[0].clientX)); };
    const onTE = (e: TouchEvent) => { e.preventDefault(); draggingRef.current = false; };

    canvas.addEventListener("mousemove", onMM);
    canvas.addEventListener("mousedown", onMD);
    canvas.addEventListener("touchstart", onTS, { passive: false });
    canvas.addEventListener("touchmove", onTM, { passive: false });
    canvas.addEventListener("touchend", onTE, { passive: false });

    return () => {
      stopBGM();
      cancelAnimationFrame(animRef.current);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      canvas.removeEventListener("mousemove", onMM);
      canvas.removeEventListener("mousedown", onMD);
      canvas.removeEventListener("touchstart", onTS);
      canvas.removeEventListener("touchmove", onTM);
      canvas.removeEventListener("touchend", onTE);
    };
  }, [launchBall, resetBall, createBlocks, syncUI, difficulty]);


  // Difficulty select handler
  const startWithDifficulty = useCallback((diff: string) => {
    setDifficulty(diff);
    const pw = DIFF_PADDLE[diff] ?? PADDLE_W;
    paddleWRef.current = pw;
    if (stateRef.current) {
      stateRef.current.paddle.width = pw;
      stateRef.current.paddle.baseWidth = pw;
    }
  }, []);

  // If no difficulty selected, show select screen
  if (!difficulty) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 select-none px-4">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-wider bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent" style={{ fontFamily: "'Inter', sans-serif" }}>
          Element Breaker
        </h1>
        <p className="text-zinc-400 text-sm sm:text-base">난이도를 선택하세요</p>
        <div className="flex flex-col gap-3 w-full max-w-[260px]">
          {([["easy", "Easy", "#22c55e"],
             ["normal", "Normal", "#3b82f6"],
             ["hard", "Hard", "#ef4444"]] as const).map(([key, label, color]) => (
            <button key={key} onClick={() => startWithDifficulty(key)}
              className="py-4 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <span className="font-bold text-lg" style={{ color }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 sm:gap-3 select-none py-2 sm:py-4 px-1 w-full max-w-[560px] mx-auto">
      {/* Title */}
      <h1 className="text-xl sm:text-3xl font-bold tracking-wider bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent" style={{ fontFamily: "'Inter', sans-serif" }}>
        Element Breaker
      </h1>

      {/* HUD */}
      <div className="flex items-center justify-between w-full px-1 sm:px-2 text-xs sm:text-sm">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-zinc-400 uppercase tracking-wide">Lives</span>
          <div className="flex gap-1">
            {Array.from({ length: LIVES }).map((_, i) => (
              <span key={i} className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-colors duration-300 ${
                i < lives ? "bg-pink-500 shadow-[0_0_8px_rgba(244,114,182,0.6)]" : "bg-zinc-700"
              }`} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-xs font-bold text-purple-400">Lv.{level}</span>
          <span className={`text-base sm:text-lg font-mono font-bold ${timeLeft <= 30 ? "text-red-400" : "text-zinc-300"}`}>
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-zinc-400 uppercase tracking-wide">Score</span>
            <span className="text-base sm:text-lg font-mono font-bold text-indigo-400">{score}</span>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative rounded-lg overflow-hidden shadow-[0_0_40px_rgba(99,102,241,0.15)] w-full">
        <canvas ref={canvasRef} width={GW} height={GH}
          className="block w-full h-auto cursor-none touch-none"
          style={{ aspectRatio: `${GW}/${GH}` }} />

        {/* Pause overlay */}
        {paused && !showCollection && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10">
            <p className="text-2xl sm:text-3xl font-bold text-zinc-200 mb-3">PAUSED</p>
            <button onClick={togglePause}
              className="px-5 py-2 text-sm sm:text-base bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors mb-2">
              재시작
            </button>
            <button onClick={() => setShowCollection(true)}
              className="px-5 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors">
              원소 도감 ({levelCollected.size}/118)
            </button>
            <p className="text-xs text-zinc-500 mt-2">ESC / P</p>
          </div>
        )}

        {/* Collection panel */}
        {showCollection && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm z-20 flex flex-col p-2">
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm font-bold text-zinc-200">원소 도감 ({levelCollected.size}/118)</p>
              <button onClick={() => setShowCollection(false)}
                className="px-2 py-0.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded transition-colors">
                닫기
              </button>
            </div>
            {/* 18-column periodic table — fills available space, no overflow */}
            <div className="flex-1 w-full max-w-full overflow-hidden" style={{ display: "grid", gridTemplateColumns: "repeat(18, 1fr)", gridTemplateRows: "repeat(9, 1fr)", gap: "1px" }}>
              {Array.from({ length: 9 * 18 }, (_, i) => {
                const row = Math.floor(i / 18) + 1;
                const col = (i % 18) + 1;
                const el = ELEMENTS.find(e => e.row === row && e.col === col);
                if (!el) return <div key={i} />;
                const found = levelCollected.has(el.atomicNumber);
                const colors = GROUP_COLORS[el.group];
                const krName = getKrName(el.atomicNumber);
                return (
                  <div key={el.atomicNumber}
                    className={`flex flex-col items-center justify-center rounded overflow-hidden ${found ? "" : "opacity-15"}`}
                    style={{ background: found ? colors.fill : "#27272a" }}>
                    <span style={{ fontSize: "clamp(3px,0.8vw,5px)", color: found ? "rgba(255,255,255,0.5)" : "#555", lineHeight: 1 }}>{el.atomicNumber}</span>
                    <span style={{ fontSize: "clamp(5px,1.4vw,9px)", fontWeight: 700, color: found ? "#fff" : "#555", lineHeight: 1.1 }}>{el.symbol}</span>
                    <span style={{ fontSize: "clamp(3px,0.7vw,4px)", color: found ? "rgba(255,255,255,0.5)" : "#444", lineHeight: 1 }}>{krName.slice(0, 3)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Overlays – pointer-events only on buttons, pass clicks to canvas */}
        {(!launched || gameOver || stageClear) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
            {stageClear ? (
              <div className="flex flex-col items-center w-full max-h-full overflow-y-auto p-4 pointer-events-auto">
                <p className="text-2xl sm:text-3xl font-bold text-emerald-400 mb-1">Level {level} Clear!</p>
                <p className="text-sm text-zinc-400 mb-1">Score: <span className="text-indigo-400 font-bold">{score}</span></p>
                <p className="text-xs text-zinc-500 mb-2">이번 레벨 발견: {levelCollected.size}개 | 전체: {collected.size}/118</p>
                {/* This level's collection grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(18, 1fr)", gap: "1px" }} className="mb-3 w-full max-w-full overflow-hidden">
                  {Array.from({ length: 9 * 18 }, (_, i) => {
                    const r = Math.floor(i / 18) + 1, c = (i % 18) + 1;
                    const el = ELEMENTS.find(e => e.row === r && e.col === c);
                    if (!el) return <div key={i} />;
                    const found = levelCollected.has(el.atomicNumber);
                    const clr = GROUP_COLORS[el.group];
                    return (
                      <div key={el.atomicNumber}
                        className={`flex flex-col items-center justify-center rounded ${found ? "" : "opacity-15"}`}
                        style={{ background: found ? clr.fill : "#27272a", aspectRatio: "1" }}>
                        <span style={{ fontSize: "3px", color: found ? "rgba(255,255,255,0.5)" : "#555", lineHeight: 1 }}>{el.atomicNumber}</span>
                        <span style={{ fontSize: "5px", fontWeight: 700, color: found ? "#fff" : "#555", lineHeight: 1 }}>{el.symbol}</span>
                        <span style={{ fontSize: "3px", color: found ? "rgba(255,255,255,0.4)" : "#444", lineHeight: 1 }}>{getKrName(el.atomicNumber).slice(0,3)}</span>
                      </div>
                    );
                  })}
                </div>
                {level < 3 ? (
                  <button onClick={nextLevel}
                    className="px-5 py-2 text-sm sm:text-base bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_20px_rgba(16,185,129,0.3)] mb-2">
                    Level {level + 1} 시작
                  </button>
                ) : (
                  <>
                    <p className="text-lg font-bold text-yellow-400 mb-2">All Clear!</p>
                    <button onClick={restartGame}
                      className="px-5 py-2 text-sm sm:text-base bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors">
                      처음부터
                    </button>
                  </>
                )}
              </div>
            ) : gameOver ? (
              <div className="flex flex-col items-center w-full max-h-full overflow-y-auto p-4 pointer-events-auto">
                <p className="text-3xl sm:text-4xl font-bold text-red-400 mb-2">{timeLeft <= 0 ? "TIME UP!" : "GAME OVER"}</p>
                <p className="text-sm text-zinc-400 mb-1">Level {level} | Score: <span className="text-indigo-400 font-bold">{score}</span></p>
                <p className="text-xs text-zinc-500 mb-2">이번 레벨 발견: {levelCollected.size}개 | 전체: {collected.size}/118</p>
                {/* This level's collection grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(18, 1fr)", gap: "1px" }} className="mb-3 w-full max-w-full overflow-hidden">
                  {Array.from({ length: 9 * 18 }, (_, i) => {
                    const r = Math.floor(i / 18) + 1, c = (i % 18) + 1;
                    const el = ELEMENTS.find(e => e.row === r && e.col === c);
                    if (!el) return <div key={i} />;
                    const found = levelCollected.has(el.atomicNumber);
                    const clr = GROUP_COLORS[el.group];
                    return (
                      <div key={el.atomicNumber}
                        className={`flex flex-col items-center justify-center rounded ${found ? "" : "opacity-15"}`}
                        style={{ background: found ? clr.fill : "#27272a", aspectRatio: "1" }}>
                        <span style={{ fontSize: "3px", color: found ? "rgba(255,255,255,0.5)" : "#555", lineHeight: 1 }}>{el.atomicNumber}</span>
                        <span style={{ fontSize: "5px", fontWeight: 700, color: found ? "#fff" : "#555", lineHeight: 1 }}>{el.symbol}</span>
                        <span style={{ fontSize: "3px", color: found ? "rgba(255,255,255,0.4)" : "#444", lineHeight: 1 }}>{getKrName(el.atomicNumber).slice(0,3)}</span>
                      </div>
                    );
                  })}
                </div>
                <button onClick={restartGame}
                  className="px-5 py-2 text-sm sm:text-base bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                  RESTART
                </button>
              </div>
            ) : (
              <>
                <p className="text-base sm:text-xl text-zinc-300 mb-1 animate-pulse">Tap to Launch</p>
                <p className="text-xs sm:text-sm text-zinc-500">터치로 패들을 조작하세요</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar — outside canvas */}
      {launched && (
        <div className="flex items-center justify-between w-full px-1 mt-1 text-xs">
          <button onClick={() => { stopBGM(); restartGame(); setDifficulty(null); }}
            className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400">
            ← 돌아가기
          </button>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">♪</span>
            <input type="range" min="0" max="100" value={Math.round(bgmVol * 100)}
              onChange={(e) => { const v = Number(e.target.value) / 100; setBgmVol(v); setBGMVolume(v); }}
              className="w-16 sm:w-20 h-1 accent-indigo-500" />
          </div>
          {!gameOver && !stageClear && !paused && (
            <button onClick={togglePause}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400">
              일시정지
            </button>
          )}
          {(gameOver || stageClear || paused) && (
            <div className="w-16" />
          )}
        </div>
      )}
    </div>
  );
}
