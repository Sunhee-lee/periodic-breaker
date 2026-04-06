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
import {
  sndPaddle, sndBlockBreak, sndExplosion, sndRadioactive,
  sndCombo, sndPowerup, sndLifeLost,
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
  const [showCollection, setShowCollection] = useState(false);

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
  const shakeRef = useRef(0); // remaining shake frames
  const collectedRef = useRef<Set<number>>(new Set());
  const multiBallsRef = useRef<Matter.Body[]>([]); // extra balls

  // ── Sync helpers (React state ← refs for render loop) ──
  const syncUI = useCallback(() => {
    setScore(scoreRef.current);
    setLives(livesRef.current);
    setBlocksLeft(blocksRef.current.filter((b) => b.alive && b.breakable).length);
    setCombo(comboRef.current);
    setCollected(new Set(collectedRef.current));
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
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    Matter.Body.setVelocity(ballRef.current, {
      x: Math.cos(a) * BASE_SPEED,
      y: Math.sin(a) * BASE_SPEED,
    });
    launchedRef.current = true;
    setLaunched(true);
  }, []);

  const restartGame = useCallback(() => {
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
    // Remove multiball extras
    for (const mb of multiBallsRef.current) {
      try { Matter.Composite.remove(engine.world, mb); } catch { /* */ }
    }
    multiBallsRef.current = [];
    setGameOver(false);
    setStageClear(false);
    setBlocksLeft(DESTROYABLE_COUNT);
    setScore(0);
    setLives(LIVES);
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
    } else if (engineRef.current) {
      Matter.Runner.run(runner, engineRef.current);
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

    const paddle = Matter.Bodies.rectangle(GW / 2, GH - 40, PADDLE_W, PADDLE_H, {
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
        width: PADDLE_W, baseWidth: PADDLE_W,
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
        let ty = GH * 0.45;
        for (const ft of existingTexts) {
          if (Math.abs(ft.y - ty) < 22) ty += 22;
        }
        let displayText = getFlavorText(blk.id);
        if (comboLevel >= 2) displayText += ` x${comboLevel} COMBO!`;
        existingTexts.push({
          text: displayText,
          x: GW / 2, y: ty,
          life: 180, maxLife: 180,
          color: comboLevel >= 5 ? "#fbbf24" : (colors?.border ?? "#ffffff"),
        });

        // Trigger effect
        executeEffect(blk.effect, blk, gs);

        // Multiball: top 3 radioactive (Og, Ts, Lv) spawn 2 extra balls
        if (MULTIBALL_ELEMENTS.has(blk.id)) {
          for (let i = 0; i < 2; i++) {
            const angle = -Math.PI / 2 + (i === 0 ? -0.5 : 0.5);
            const mb = Matter.Bodies.circle(blk.x, blk.y, BALL_R, {
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
            multiBallsRef.current.push(mb);
          }
        }

        syncUI();
        // Stage clear
        const remaining = blocksRef.current.filter((b) => b.alive && b.breakable).length;
        if (remaining <= 0) {
          clearRef.current = true;
          gs.stageClear = true;
          setStageClear(true);
          Matter.Body.setVelocity(ball, { x: 0, y: 0 });
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
      paddleWRef.current = gs.paddle.width;
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
          Matter.Body.setVelocity(b, { x: 0, y: 0 });
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

      // Prevent horizontal stall — force ball downward toward paddle
      if (Math.abs(b.velocity.y) < 1.5) {
        const ny = 2.5; // always push down so it returns to paddle
        const nx = Math.sign(b.velocity.x || 1) * Math.sqrt(Math.max(0, sp * sp - ny * ny));
        Matter.Body.setVelocity(b, { x: nx, y: ny });
      }

      // Multiball cleanup: remove extra balls that fell off screen
      for (let i = multiBallsRef.current.length - 1; i >= 0; i--) {
        const mb = multiBallsRef.current[i];
        if (mb.position.y > GH + BALL_R * 2) {
          try { Matter.Composite.remove(engine.world, mb); } catch { /* */ }
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
        const colors = GROUP_COLORS[el.group];
        const bx = blk.x - BW / 2;
        const by = blk.y - BH / 2;

        // Frozen overlay tint
        const isFrozen = blk.frozen;

        // Opacity based on remaining HP (fades as damaged)
        const hpRatio = el.durability > 1 ? blk.hp / el.durability : 1;
        const blockAlpha = 0.35 + hpRatio * 0.65; // range: 0.35 (near death) → 1.0 (full)
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
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(251,191,36,0.6)";
        const mbg = ctx.createRadialGradient(mb.position.x - 1, mb.position.y - 1, 0, mb.position.x, mb.position.y, BALL_R);
        mbg.addColorStop(0, "#fde047");
        mbg.addColorStop(1, "#f97316");
        ctx.fillStyle = mbg;
        ctx.beginPath();
        ctx.arc(mb.position.x, mb.position.y, BALL_R, 0, Math.PI * 2);
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
        ctx.font = "bold 14px sans-serif";
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
    const onMD = (e: MouseEvent) => { movePad(getX(e.clientX)); if (!launchedRef.current && !goRef.current && !clearRef.current) launchBall(); };
    const onTS = (e: TouchEvent) => {
      e.preventDefault(); draggingRef.current = true;
      movePad(getX(e.touches[0].clientX));
      if (!launchedRef.current && !goRef.current && !clearRef.current) launchBall();
    };
    const onTM = (e: TouchEvent) => { e.preventDefault(); if (draggingRef.current) movePad(getX(e.touches[0].clientX)); };
    const onTE = (e: TouchEvent) => { e.preventDefault(); draggingRef.current = false; };

    canvas.addEventListener("mousemove", onMM);
    canvas.addEventListener("mousedown", onMD);
    canvas.addEventListener("touchstart", onTS, { passive: false });
    canvas.addEventListener("touchmove", onTM, { passive: false });
    canvas.addEventListener("touchend", onTE, { passive: false });

    return () => {
      cancelAnimationFrame(animRef.current);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      canvas.removeEventListener("mousemove", onMM);
      canvas.removeEventListener("mousedown", onMD);
      canvas.removeEventListener("touchstart", onTS);
      canvas.removeEventListener("touchmove", onTM);
      canvas.removeEventListener("touchend", onTE);
    };
  }, [launchBall, resetBall, createBlocks, syncUI]);

  // ── Group legend data ──
  const legend: { label: string; color: string }[] = [
    { label: "Attack", color: "#dc2626" },
    { label: "Defense", color: "#3b82f6" },
    { label: "Utility", color: "#8b5cf6" },
    { label: "Debuff", color: "#65a30d" },
    { label: "Score", color: "#eab308" },
  ];

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
        <h1 className="text-2xl sm:text-4xl font-bold tracking-wider bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          PERIODIC BREAKER
        </h1>
        <p className="text-zinc-400 text-sm sm:text-base">난이도를 선택하세요</p>
        <div className="flex gap-3">
          {([["easy", "Easy", "패들 130px", "#22c55e"],
             ["normal", "Normal", "패들 100px", "#3b82f6"],
             ["hard", "Hard", "패들 70px", "#ef4444"]] as const).map(([key, label, desc, color]) => (
            <button key={key} onClick={() => startWithDifficulty(key)}
              className="flex flex-col items-center gap-1 px-5 py-3 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <span className="font-bold text-lg" style={{ color }}>{label}</span>
              <span className="text-xs text-zinc-500">{desc}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 sm:gap-3 select-none py-2 sm:py-4 px-1 w-full max-w-[560px] mx-auto">
      {/* Title */}
      <h1 className="text-xl sm:text-3xl font-bold tracking-wider bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
        PERIODIC BREAKER
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
          {combo >= 2 && (
            <span className={`font-mono font-bold ${combo >= 5 ? "text-yellow-400" : "text-orange-400"}`}>
              x{combo}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1">
            <span className="text-zinc-400 uppercase tracking-wide">{collected.size}/118</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-400 uppercase tracking-wide">Score</span>
            <span className="text-base sm:text-lg font-mono font-bold text-indigo-400">{score}</span>
          </div>
          {launched && !gameOver && !stageClear && (
            <button onClick={togglePause}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 transition-colors text-zinc-300"
              aria-label={paused ? "Resume" : "Pause"}>
              {paused ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="3,1 12,7 3,13" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" /><rect x="8.5" y="1" width="3.5" height="12" /></svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2.5 text-[10px] sm:text-xs">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-0.5 sm:gap-1">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
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
              Resume
            </button>
            <button onClick={() => setShowCollection(true)}
              className="px-5 py-2 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors">
              원소 도감 ({collected.size}/118)
            </button>
            <p className="text-xs text-zinc-500 mt-2">ESC / P</p>
          </div>
        )}

        {/* Collection panel */}
        {showCollection && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-20 overflow-y-auto p-3">
            <div className="flex justify-between items-center mb-2">
              <p className="text-lg font-bold text-zinc-200">원소 도감 ({collected.size}/118)</p>
              <button onClick={() => setShowCollection(false)}
                className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded transition-colors">
                닫기
              </button>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-9 gap-1">
              {ELEMENTS.map((el) => {
                const found = collected.has(el.atomicNumber);
                const colors = GROUP_COLORS[el.group];
                return (
                  <div key={el.atomicNumber}
                    className={`flex flex-col items-center justify-center rounded p-0.5 text-center ${found ? "" : "opacity-20"}`}
                    style={{ background: found ? colors.fill : "#27272a", minHeight: "36px" }}>
                    <span className="text-[8px] text-zinc-400">{el.atomicNumber}</span>
                    <span className="text-[10px] font-bold" style={{ color: found ? colors.text : "#71717a" }}>{el.symbol}</span>
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
              <>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-400 mb-1">Stage Clear!</p>
                <p className="text-sm sm:text-base text-zinc-300 mb-3 sm:mb-4">118개 원소를 모두 정복했습니다!</p>
                <p className="text-sm text-zinc-400 mb-3 sm:mb-4">Final Score: <span className="text-indigo-400 font-bold">{score}</span></p>
                <button onClick={restartGame}
                  className="pointer-events-auto px-5 py-2 text-sm sm:text-base bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                  다시 시작
                </button>
              </>
            ) : gameOver ? (
              <>
                <p className="text-3xl sm:text-4xl font-bold text-red-400 mb-2">GAME OVER</p>
                <p className="text-sm text-zinc-400 mb-3 sm:mb-4">Final Score: <span className="text-indigo-400 font-bold">{score}</span></p>
                <button onClick={restartGame}
                  className="pointer-events-auto px-5 py-2 text-sm sm:text-base bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                  RESTART
                </button>
              </>
            ) : (
              <>
                <p className="text-base sm:text-xl text-zinc-300 mb-1 animate-pulse">Tap to Launch</p>
                <p className="text-xs sm:text-sm text-zinc-500">터치로 패들을 조작하세요</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
