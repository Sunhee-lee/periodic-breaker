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
import { saveRank, getTopRanks, type RankEntry } from "@/game/firebase";
import { getBlockVisualStyle } from "@/game/blockColors";
import {
  sndPaddle, sndBlockBreak, sndExplosion, sndRadioactive,
  sndCombo, sndPowerup, sndLifeLost, sndMetal,
  startBGM, stopBGM, setBGMVolume, startMenuBGM, stopMenuBGM,
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
// Difficulty removed — always normal paddle size

// Top 3 most radioactive elements (shortest half-life) → multiball
const MULTIBALL_ELEMENTS = new Set([118, 117, 116]); // Og, Ts, Lv

const BASE_SPEED = 6;

// Level configs
const LEVEL_TIMES = [420, 300, 180, 180, 180, 120, 120]; // L1:7m L2:5m L3-5:3m L6-7:2m
const LEVEL_SPEED = [BASE_SPEED, BASE_SPEED * 1.2, BASE_SPEED * 1.5, BASE_SPEED * 1.7, BASE_SPEED * 1.7, BASE_SPEED * 1.9, BASE_SPEED * 2.1];
const LEVEL_PADDLE = [PADDLE_W, PADDLE_W, PADDLE_W, PADDLE_W * 0.8, PADDLE_W * 0.65, PADDLE_W * 0.6, PADDLE_W * 0.6];
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
  const touchPadRef = useRef<HTMLDivElement>(null);
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

  const [bgmVol, setBgmVol] = useState(0.3);
  const [showVolume, setShowVolume] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [rankSaved, setRankSaved] = useState(false);
  const [rankings, setRankings] = useState<RankEntry[]>([]);
  const [homeTab, setHomeTab] = useState("normal"); // mode for TOP 3 preview
  const [homeTop3, setHomeTop3] = useState<RankEntry[]>([]);
  const [showFullRanking, setShowFullRanking] = useState(false);
  const [rankingTab, setRankingTab] = useState("normal");
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
    const pw = PADDLE_W;
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

    setBlocksLeft(DESTROYABLE_COUNT);
    setScore(0);
    setLives(LIVES);
    setRankSaved(false);
    // Restart physics runner if stopped
    if (runnerRef.current && engineRef.current) Matter.Runner.run(runnerRef.current, engineRef.current);
    resetBall();
  }, [resetBall, createBlocks]);

  const nextLevel = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const newLv = levelRef.current + 1;
    if (newLv > 7) return; // max level 7
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
    const lvPW = LEVEL_PADDLE[newLv - 1] ?? PADDLE_W;
    paddleWRef.current = lvPW;
    if (stateRef.current) {
      stateRef.current.ball.speed = LEVEL_SPEED[newLv - 1] ?? BASE_SPEED;
      stateRef.current.ball.baseSpeed = LEVEL_SPEED[newLv - 1] ?? BASE_SPEED;
      stateRef.current.ball.pierce = false;
      stateRef.current.ball.radius = BALL_R;
      stateRef.current.paddle.width = lvPW;
      stateRef.current.paddle.baseWidth = lvPW;
      stateRef.current.stageClear = false;
    }
    setLevel(newLv);
    setTimeLeft(LEVEL_TIMES[newLv - 1]);
    setStageClear(false);

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

  // Load rankings for current difficulty
  useEffect(() => {
    if (difficulty) {
      getTopRanks(difficulty, 50).then(setRankings).catch(() => {});
    }
  }, [difficulty]);

  // Load home TOP 3 + start menu BGM
  useEffect(() => {
    getTopRanks("normal", 3).then(setHomeTop3).catch(() => {});
    if (!difficulty) {
      startMenuBGM();
    }
    return () => { stopMenuBGM(); };
  }, [difficulty]);

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

    const initPW = PADDLE_W;
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
        metal: false,
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
        const isMetal = blk.effect === "heavy_ball" || (blk.effect === "paddle_grow" && blk.id === 22);
        if (isExplosive) { sndExplosion(); }
        else if (isRadioactive) { sndRadioactive(); }
        else if (isMetal) { sndMetal(); }
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
            const angle = -Math.PI / 2 + (i === 0 ? -0.4 : 0.4);
            // Spawn at block position, ignore blocks initially to escape
            const mb = Matter.Bodies.circle(blk.x + (i === 0 ? -10 : 10), blk.y, BALL_R, {
              restitution: 1, friction: 0, frictionAir: 0, frictionStatic: 0,
              inertia: Infinity, inverseInertia: 0, density: 1,
              collisionFilter: { category: CAT.BALL, mask: CAT.WALL | CAT.PADDLE },
              label: "multiball",
            });
            Matter.Body.setVelocity(mb, {
              x: Math.cos(angle) * BASE_SPEED,
              y: Math.sin(angle) * BASE_SPEED,
            });
            Matter.Composite.add(engine.world, mb);
            // Restore block collision after 500ms (enough time to escape)
            setTimeout(() => {
              try { mb.collisionFilter.mask = CAT.WALL | CAT.PADDLE | CAT.BLOCK; } catch { /* */ }
            }, 500);
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
          // Reset pierce and metal on respawn
          gs.ball.pierce = false;
          gs.ball.metal = false;
          b.collisionFilter.mask = CAT.WALL | CAT.PADDLE | CAT.BLOCK;
          // Remove all multiballs
          for (const mb of multiBallsRef.current) {
            try { Matter.Composite.remove(engine.world, mb.body); } catch { /* */ }
          }
          multiBallsRef.current = [];
        }
        return;
      }

      // Enforce constant speed
      const sp = gs.ball.speed;
      const vx = b.velocity.x;
      const vy = b.velocity.y;
      const mag = Math.sqrt(vx * vx + vy * vy);

      // Ball stuck (speed near zero or in corner) — force it downward
      if (mag < 0.5) {
        const nx = (Math.random() - 0.5) * sp * 0.5;
        Matter.Body.setVelocity(b, { x: nx, y: sp * 0.8 });
        // Nudge away from walls/corners
        const bx = Math.max(BALL_R + 5, Math.min(GW - BALL_R - 5, b.position.x));
        const by = Math.max(BALL_R + 5, b.position.y);
        Matter.Body.setPosition(b, { x: bx, y: by + 3 });
      } else if (Math.abs(mag - sp) > 0.1) {
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
          comboRef.current = 0;
          // Radioactive pierce: only reset when MAIN ball hits paddle
          if (gs.ball.pierce && ballBody === ballRef.current) {
            gs.ball.pierce = false;
            gs.ball.pierceHits = 0;
            if (ballRef.current) {
              ballRef.current.collisionFilter.mask = CAT.WALL | CAT.PADDLE | CAT.BLOCK;
            }
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
        const vs = getBlockVisualStyle(el.symbol, levelRef.current);
        const bx = blk.x - BW / 2;
        const by = blk.y - BH / 2;

        // Frozen overlay tint
        const isFrozen = blk.frozen;

        // Opacity based on remaining HP (fades as damaged)
        const hpRatio = el.durability > 1 ? blk.hp / el.durability : 1;
        const blockAlpha = 0.35 + hpRatio * 0.65;
        ctx.globalAlpha = blockAlpha;

        // Glow
        ctx.shadowBlur = levelRef.current <= 2 ? 6 : levelRef.current <= 4 ? 10 : 14;
        ctx.shadowColor = isFrozen ? "rgba(56,189,248,0.6)" : vs.glowColor;

        // Fill — level color
        ctx.fillStyle = isFrozen ? "#0ea5e9" : vs.fillColor;
        roundRect(ctx, bx, by, BW, BH, 3);
        ctx.fill();

        // Border — family accent color
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isFrozen ? "#38bdf8" : vs.borderColor;
        ctx.lineWidth = vs.borderWidth;
        ctx.stroke();

        // Top accent bar — family identity stripe
        if (!isFrozen) {
          ctx.fillStyle = vs.accentColor;
          ctx.fillRect(bx + 2, by, BW - 4, 2);
        }
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
        ctx.fillStyle = vs.textColor;
        ctx.globalAlpha = 0.45;
        ctx.font = "bold 6px Pretendard, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(el.atomicNumber), bx + 1, by + 1);
        ctx.globalAlpha = 1;

        // Symbol (center)
        ctx.fillStyle = vs.textColor;
        if (levelRef.current >= 7) {
          ctx.shadowBlur = 2;
          ctx.shadowColor = "rgba(0,0,0,0.5)";
        }
        ctx.font = "bold 10px Pretendard, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.symbol, blk.x, blk.y + 2);
        ctx.shadowBlur = 0;


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
        const isMetal = gs.ball.metal;

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
          : isMetal
          ? "rgba(148,163,184,0.8)"
          : "rgba(244,114,182,0.8)";
        const bg = ctx.createRadialGradient(
          b.position.x - 2, b.position.y - 2, 0,
          b.position.x, b.position.y, br,
        );
        if (isPiercing) {
          bg.addColorStop(0, "#4ade80");
          bg.addColorStop(1, "#22c55e");
        } else if (isMetal) {
          bg.addColorStop(0, "#94a3b8"); // dark silver
          bg.addColorStop(1, "#475569"); // darker steel
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
          ctx.font = `bold ${Math.round(br * 1.4)}px Pretendard, sans-serif`;
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
        ctx.font = "600 14px Pretendard, sans-serif";
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

    // Touch pad below canvas — same handlers
    const tp = touchPadRef.current;
    if (tp) {
      tp.addEventListener("mousemove", onMM);
      tp.addEventListener("mousedown", onMD);
      tp.addEventListener("touchstart", onTS, { passive: false });
      tp.addEventListener("touchmove", onTM, { passive: false });
      tp.addEventListener("touchend", onTE, { passive: false });
    }

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
      if (tp) {
        tp.removeEventListener("mousemove", onMM);
        tp.removeEventListener("mousedown", onMD);
        tp.removeEventListener("touchstart", onTS);
        tp.removeEventListener("touchmove", onTM);
        tp.removeEventListener("touchend", onTE);
      }
    };
  }, [launchBall, resetBall, createBlocks, syncUI, difficulty]);


  // Difficulty select handler
  const startWithDifficulty = useCallback((diff: string) => {
    setDifficulty(diff);
    const pw = PADDLE_W;
    paddleWRef.current = pw;
    if (stateRef.current) {
      stateRef.current.paddle.width = pw;
      stateRef.current.paddle.baseWidth = pw;
    }
  }, []);

  // Full ranking screen
  if (showFullRanking) {
    return (
      <div className="flex flex-col items-center min-h-[100dvh] gap-4 select-none px-2 py-6 w-full">
        <h2 className="text-xl font-bold text-zinc-200">🏆 랭킹</h2>
        {/* Ranking list */}
        <div className="w-full max-w-[480px] max-h-[70vh] overflow-y-auto">
          {/* Header */}
          <div className="w-full flex items-center justify-between px-4 py-1.5 text-[11px] text-zinc-500 border-b border-zinc-700">
            <div className="flex items-center gap-3"><span className="w-6">순위</span><span>이름</span></div>
            <div className="flex items-center gap-6"><span>레벨</span><span className="w-16 text-right">점수</span></div>
          </div>
          <div className="bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden">
            {Array.from({ length: Math.max(30, rankings.length) }, (_, i) => {
              const r = rankings[i];
              return (
                <div key={i} className={`flex items-center justify-between px-4 py-2 text-sm ${i === 0 ? "bg-yellow-900/30" : i === 1 ? "bg-zinc-800/50" : i === 2 ? "bg-orange-900/20" : ""} ${i > 0 ? "border-t border-zinc-800" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-zinc-500 font-bold">{i + 1}</span>}</span>
                    <span className="text-zinc-200">{r ? r.player_name : "---"}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="text-zinc-500 text-xs">{r ? `Lv.${r.level ?? 1}` : ""}</span>
                    <span className="font-mono font-bold text-indigo-400 w-16 text-right">{r ? r.score.toLocaleString() : "---"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <button onClick={() => setShowFullRanking(false)}
          className="px-5 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg">
          ← 돌아가기
        </button>
      </div>
    );
  }

  // If no difficulty selected, show home screen
  if (!difficulty) {
    const bestScore = homeTop3[0]?.score;
    return (
      <div className="relative flex flex-col items-center justify-end w-full select-none"
        style={{ minHeight: "100dvh", backgroundImage: "url('/Title_image.webp')", backgroundSize: "cover", backgroundPosition: "center" }}>


        {/* UI overlay — bottom section */}
        <div className="relative z-10 flex flex-col items-center gap-3 px-4 w-full max-w-[400px]" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>

          {/* GAME START label */}
          <div className="flex items-center gap-2">
            <span className="w-8 h-px bg-amber-500/50" />
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.3em] font-semibold text-amber-400"
              style={{ textShadow: "0 0 8px rgba(245,158,11,0.5)" }}>
              Game Start
            </p>
            <span className="w-8 h-px bg-amber-500/50" />
          </div>

          {/* PLAY button — image */}
          <button onClick={() => startWithDifficulty("normal")}
            className="transition-all active:scale-95 hover:brightness-110"
            style={{ animation: "pulse-glow-orange 2s ease-in-out infinite" }}>
            <img src="/Play_image.png" alt="PLAY" className="w-[55vw] max-w-[260px]" />
          </button>

          {/* Ranking + Settings image buttons */}
          <div className="flex gap-3">
            <button onClick={async () => {
              setRankingTab("normal");
              const r = await getTopRanks("normal", 50);
              setRankings(r);
              setShowFullRanking(true);
            }}
              className="transition-all active:scale-95 hover:brightness-110">
              <img src="/Rank_image.png" alt="랭킹" className="w-[25vw] max-w-[120px]" />
            </button>
            <button onClick={() => setShowSettings(!showSettings)}
              className="transition-all active:scale-95 hover:brightness-110">
              <img src="/Setting_image.png" alt="설정" className="w-[25vw] max-w-[120px]" />
            </button>
          </div>
          {/* Start screen settings menu */}
          {showSettings && (
            <div className="flex flex-col gap-2 w-[70%] max-w-[260px] p-4 rounded-xl" style={{ background: "rgba(20,25,50,0.9)", border: "1px solid rgba(180,210,255,0.2)" }}>
              <p className="text-center text-sm font-bold mb-1" style={{ color: "#DCE7FF" }}>설정</p>
              <button onClick={() => { setBGMVolume(bgmVol > 0 ? 0 : 0.3); setBgmVol(bgmVol > 0 ? 0 : 0.3); }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(30,40,80,0.5)", color: "#DCE7FF" }}>
                <span>배경음</span>
                <span style={{ color: bgmVol > 0 ? "#63F5C8" : "#FF6B6B" }}>{bgmVol > 0 ? "ON" : "OFF"}</span>
              </button>
              <button className="flex items-center justify-between px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(30,40,80,0.5)", color: "#DCE7FF" }}>
                <span>효과음</span>
                <span style={{ color: "#63F5C8" }}>ON</span>
              </button>
              <button onClick={() => setShowSettings(false)}
                className="text-xs text-center mt-1" style={{ color: "rgba(220,231,255,0.4)" }}>
                닫기
              </button>
            </div>
          )}

          {/* Best score + level info */}
          <p className="text-xs text-white/70 font-medium" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
            현재 최고 점수: <span className="font-bold text-white">{bestScore != null ? bestScore.toLocaleString() : "---"}</span> | 레벨: <span className="font-bold text-white">1</span>
          </p>

          {/* Version */}
          <div className="mt-4" />
          <p className="text-[9px] text-white/30">버전 1.0.1</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 sm:gap-3 select-none py-2 sm:py-4 px-1 w-full max-w-[560px] mx-auto min-h-[100dvh] bg-black">
      {/* Title image */}
      <img src="/Title_inside.png" alt="Element Breaker" className="w-full max-w-[560px] h-auto" />

      {/* HUD */}
      {/* ── HUD ── */}
      <div className="flex items-start justify-between w-full px-2 py-1">
        {/* Left: Lives (atom icons) + settings/pause */}
        <div className="flex flex-col gap-1.5">
          {/* Atom lives — mint neon */}
          <div className="flex gap-1">
            {Array.from({ length: LIVES }).map((_, i) => {
              const active = i < lives;
              return (
                <svg key={i} width="19" height="19" viewBox="0 0 24 24" className="transition-opacity duration-300"
                  style={{ opacity: active ? 1 : 0.18 }}>
                  <circle cx="12" cy="12" r="3" fill={active ? "#63F5C8" : "#555"} />
                  {active && <circle cx="12" cy="12" r="3" fill="#63F5C8" style={{ filter: "drop-shadow(0 0 5px rgba(99,245,200,0.6))" }} />}
                  <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke={active ? "#B8FFE8" : "#444"} strokeWidth="1.2" opacity={active ? 0.7 : 0.3} />
                  <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke={active ? "#B8FFE8" : "#444"} strokeWidth="1.2" opacity={active ? 0.7 : 0.3} transform="rotate(60 12 12)" />
                  <ellipse cx="12" cy="12" rx="10" ry="4" fill="none" stroke={active ? "#B8FFE8" : "#444"} strokeWidth="1.2" opacity={active ? 0.7 : 0.3} transform="rotate(-60 12 12)" />
                </svg>
              );
            })}
          </div>
          {/* Settings + Pause */}
          {launched && (
            <div className="flex items-center gap-1">
              <button onClick={() => setShowSettings(!showSettings)}
                className="w-6 h-6 flex items-center justify-center rounded active:brightness-150"
                style={{ background: "rgba(30,40,80,0.45)", border: "1px solid rgba(180,210,255,0.28)" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DCE7FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              </button>
              {!gameOver && !stageClear && !paused ? (
                <button onClick={togglePause}
                  className="w-6 h-6 flex items-center justify-center rounded active:brightness-150"
                  style={{ background: "rgba(30,40,80,0.45)", border: "1px solid rgba(180,210,255,0.28)" }}>
                  <svg width="8" height="8" viewBox="0 0 14 14" fill="#DCE7FF"><rect x="2" y="1" width="3.5" height="12"/><rect x="8.5" y="1" width="3.5" height="12"/></svg>
                </button>
              ) : <div className="w-6" />}
            </div>
          )}
        </div>

        {/* Right: Lv+Time (line1) + Score (line2) */}
        <div className="flex flex-col items-end">
          <div className="flex items-baseline gap-3" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span style={{ fontSize: "16px", fontWeight: 600, lineHeight: 1.15, color: "#DCE7FF" }}>Lv.{level}</span>
            <span style={{ fontSize: "16px", fontWeight: 600, lineHeight: 1.15, color: timeLeft <= 30 ? "#FF5A5F" : "#DCE7FF" }}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
            </span>
          </div>
          <span style={{ fontSize: "22px", fontWeight: 800, lineHeight: 1, color: "#F4F7FF", textShadow: "0 0 8px rgba(120,160,255,0.28)", fontVariantNumeric: "tabular-nums", minWidth: "80px", textAlign: "right" as const, display: "inline-block", marginTop: "4px" }}>
            {score.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative rounded-lg overflow-hidden shadow-[0_0_40px_rgba(99,102,241,0.15)] w-full">
        <canvas ref={canvasRef} width={GW} height={GH}
          className="block w-full h-auto cursor-none touch-none"
          style={{ aspectRatio: `${GW}/${GH}` }} />

        {/* Settings menu overlay */}
        {showSettings && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-20 flex items-center justify-center">
            <div className="flex flex-col gap-2 w-[70%] max-w-[260px] p-4 rounded-xl" style={{ background: "rgba(20,25,50,0.9)", border: "1px solid rgba(180,210,255,0.2)" }}>
              <p className="text-center text-sm font-bold mb-1" style={{ color: "#DCE7FF" }}>설정</p>
              <button onClick={() => { setBGMVolume(bgmVol > 0 ? 0 : 0.3); setBgmVol(bgmVol > 0 ? 0 : 0.3); }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(30,40,80,0.5)", color: "#DCE7FF" }}>
                <span>배경음</span>
                <span style={{ color: bgmVol > 0 ? "#63F5C8" : "#FF6B6B" }}>{bgmVol > 0 ? "ON" : "OFF"}</span>
              </button>
              <button className="flex items-center justify-between px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(30,40,80,0.5)", color: "#DCE7FF" }}>
                <span>효과음</span>
                <span style={{ color: "#63F5C8" }}>ON</span>
              </button>
              <button onClick={() => { setShowSettings(false); restartGame(); }}
                className="flex items-center justify-center px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(30,40,80,0.5)", color: "#DCE7FF" }}>
                다시 시작
              </button>
              <button onClick={() => { setShowSettings(false); stopBGM(); restartGame(); setDifficulty(null); }}
                className="flex items-center justify-center px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(30,40,80,0.5)", color: "#DCE7FF" }}>
                홈으로 가기
              </button>
              <button onClick={() => setShowSettings(false)}
                className="text-xs text-center mt-1" style={{ color: "rgba(220,231,255,0.4)" }}>
                닫기
              </button>
            </div>
          </div>
        )}

        {/* Pause overlay — with periodic table */}
        {paused && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-10 flex flex-col items-center p-3">
            <p className="text-xl font-bold text-zinc-200 mb-1">PAUSED</p>
            <p className="text-xs text-zinc-500 mb-4">발견: {levelCollected.size}/118</p>
            {/* Same periodic table as game over/clear */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(18, 1fr)", gap: "1px" }} className="mb-2 w-full max-w-full overflow-hidden">
              {Array.from({ length: 9 * 18 }, (_, i) => {
                const r = Math.floor(i / 18) + 1, c = (i % 18) + 1;
                const el = ELEMENTS.find(e => e.row === r && e.col === c);
                if (!el) return <div key={i} />;
                const found = levelCollected.has(el.atomicNumber);
                const vs = getBlockVisualStyle(el.symbol, level);
                return (
                  <div key={el.atomicNumber}
                    className={`flex flex-col items-center justify-center rounded ${found ? "" : "opacity-15"}`}
                    style={{ background: found ? vs.fillColor : "#27272a", aspectRatio: "1" }}>
                    <span style={{ fontSize: "clamp(4px,1vw,6px)", color: found ? "rgba(255,255,255,0.5)" : "#555", lineHeight: 1 }}>{el.atomicNumber}</span>
                    <span style={{ fontSize: "clamp(6px,1.5vw,9px)", fontWeight: 700, color: found ? "#fff" : "#555", lineHeight: 1 }}>{el.symbol}</span>
                  </div>
                );
              })}
            </div>
            <button onClick={togglePause}
              className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors">
              RESTART
            </button>
          </div>
        )}

        {/* Overlays – pointer-events only on buttons, pass clicks to canvas */}
        {(!launched || gameOver || stageClear) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none">
            {stageClear ? (
              <div className="flex flex-col items-center w-full max-h-full overflow-y-auto p-4 pointer-events-auto">
                <p className="text-2xl sm:text-3xl font-bold text-emerald-400 mb-1">Level {level} Clear!</p>
                <p className="text-sm text-zinc-400 mb-1">Score: <span className="text-indigo-400 font-bold">{score.toLocaleString()}</span></p>
                <p className="text-xs text-zinc-500 mb-2">이번 레벨 발견: {levelCollected.size}개 | 전체: {collected.size}/118</p>
                {/* This level's collection grid — family colors */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(18, 1fr)", gap: "1px" }} className="mb-3 w-full max-w-full overflow-hidden">
                  {Array.from({ length: 9 * 18 }, (_, i) => {
                    const r = Math.floor(i / 18) + 1, c = (i % 18) + 1;
                    const el = ELEMENTS.find(e => e.row === r && e.col === c);
                    if (!el) return <div key={i} />;
                    const found = levelCollected.has(el.atomicNumber);
                    const vs = getBlockVisualStyle(el.symbol, level);
                    return (
                      <div key={el.atomicNumber}
                        className={`flex flex-col items-center justify-center rounded ${found ? "" : "opacity-15"}`}
                        style={{ background: found ? vs.fillColor : "#27272a", aspectRatio: "1" }}>
                        <span style={{ fontSize: "clamp(4px,1vw,6px)", color: found ? "rgba(255,255,255,0.5)" : "#555", lineHeight: 1 }}>{el.atomicNumber}</span>
                        <span style={{ fontSize: "clamp(6px,1.5vw,9px)", fontWeight: 700, color: found ? "#fff" : "#555", lineHeight: 1 }}>{el.symbol}</span>
                      </div>
                    );
                  })}
                </div>
                {level < 7 ? (
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
                <p className="text-sm text-zinc-400 mb-1">Level {level} | Score: <span className="text-indigo-400 font-bold">{score.toLocaleString()}</span></p>
                <p className="text-xs text-zinc-500 mb-2">이번 레벨 발견: {levelCollected.size}개 | 전체: {collected.size}/118</p>
                {/* Periodic table — only before ranking save */}
                {!rankSaved && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(18, 1fr)", gap: "1px" }} className="mb-3 w-full max-w-full overflow-hidden">
                    {Array.from({ length: 9 * 18 }, (_, i) => {
                      const r = Math.floor(i / 18) + 1, c = (i % 18) + 1;
                      const el = ELEMENTS.find(e => e.row === r && e.col === c);
                      if (!el) return <div key={i} />;
                      const found = levelCollected.has(el.atomicNumber);
                      const vs = getBlockVisualStyle(el.symbol, level);
                      return (
                        <div key={el.atomicNumber}
                          className={`flex flex-col items-center justify-center rounded ${found ? "" : "opacity-15"}`}
                          style={{ background: found ? vs.fillColor : "#27272a", aspectRatio: "1" }}>
                          <span style={{ fontSize: "clamp(4px,1vw,6px)", color: found ? "rgba(255,255,255,0.5)" : "#555", lineHeight: 1 }}>{el.atomicNumber}</span>
                          <span style={{ fontSize: "clamp(6px,1.5vw,9px)", fontWeight: 700, color: found ? "#fff" : "#555", lineHeight: 1 }}>{el.symbol}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Ranking save */}
                {!rankSaved ? (
                  <div className="flex flex-col items-center gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <input type="text" maxLength={10} placeholder="이름 입력"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, ""))}
                        className="px-2 py-1 text-sm bg-zinc-800 border border-zinc-600 rounded text-zinc-200 w-28 text-center" />
                      <button onClick={async () => {
                        if (!playerName.trim() || playerName.trim().length < 1) return;
                        await saveRank("normal", playerName.trim(), score, level);
                        await new Promise(res => setTimeout(res, 500));
                        const r = await getTopRanks("normal", 50);
                        setRankings(r);
                        setRankSaved(true);
                      }}
                        className="px-3 py-1 text-sm bg-yellow-600 hover:bg-yellow-500 text-white font-semibold rounded transition-colors">
                        등록
                      </button>
                    </div>
                    <button onClick={() => setRankSaved(true)}
                      className="text-xs text-zinc-500 hover:text-zinc-300">건너뛰기</button>
                  </div>
                ) : (
                  <div className="w-full max-w-[300px] max-h-[40vh] overflow-y-auto mb-2">
                    {playerName.trim() && <p className="text-xs text-emerald-400 mb-1 text-center">랭킹 등록 완료!</p>}
                    <div className="bg-zinc-900 rounded border border-zinc-700 overflow-hidden">
                      {rankings.length === 0 && <p className="text-[10px] text-zinc-500 text-center py-2">랭킹 데이터 없음</p>}
                      {rankings.map((r, i) => (
                        <div key={i} className={`flex items-center justify-between px-2 py-1 text-[10px] ${r.player_name === playerName.trim() ? "bg-indigo-900/40" : ""}`}>
                          <div className="flex items-center gap-1.5">
                            <span className="w-4 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-zinc-500 font-bold">{i + 1}</span>}</span>
                            <span className="text-zinc-200">{r.player_name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-500">Lv.{r.level ?? 1}</span>
                            <span className="font-mono font-bold text-indigo-400 w-16 text-right">{r.score.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

      {/* Touch pad — extra touch area below canvas for easier paddle control */}
      <div ref={touchPadRef}
        className="w-full h-16 sm:h-20 touch-none cursor-none bg-zinc-900/50 rounded-b-lg"
        style={{ maxWidth: "560px" }} />
    </div>
  );
}
