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

// ── Constants ─────────────────────────────────────────────
const GW = 560;
const GH = 780;
const PADDLE_W = 100;
const PADDLE_H = 14;
const BALL_R = 8;
const WALL_T = 20;
const LIVES = 3;
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
  const animRef = useRef(0);
  const draggingRef = useRef(false);
  const stateRef = useRef<GameState | null>(null);

  const [lives, setLives] = useState(LIVES);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [stageClear, setStageClear] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [blocksLeft, setBlocksLeft] = useState(DESTROYABLE_COUNT);

  const livesRef = useRef(LIVES);
  const scoreRef = useRef(0);
  const goRef = useRef(false);
  const launchedRef = useRef(false);
  const clearRef = useRef(false);
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

  // ── Sync helpers (React state ← refs for render loop) ──
  const syncUI = useCallback(() => {
    setScore(scoreRef.current);
    setLives(livesRef.current);
    setBlocksLeft(blocksRef.current.filter((b) => b.alive && b.breakable).length);
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
    paddleWRef.current = PADDLE_W;
    paddleSpeedMultRef.current = 1;
    floorShieldEndRef.current = 0;
    trajectoryEndRef.current = 0;
    scoreMultRef.current = 1;
    timedEffectsRef.current = [];
    gasZoneEndRef.current = 0;
    vfxRef.current.clear();
    setGameOver(false);
    setStageClear(false);
    setBlocksLeft(DESTROYABLE_COUNT);
    setScore(0);
    setLives(LIVES);
    resetBall();
  }, [resetBall, createBlocks]);

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
        pierce: false, pierceEnd: 0,
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
        // score
        const points = blk.id * 10;
        scoreRef.current += Math.round(points * gs.scoreMultiplier);
        // trigger this block's own effect (no area damage possible)
        executeEffect(blk.effect, blk, gs);
        syncUI();
        // check stage clear
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
      // Prevent horizontal stall
      if (Math.abs(b.velocity.y) < 1) {
        const sign = b.velocity.y >= 0 ? 1 : -1;
        const ny = sign * 1.5;
        const nx = Math.sign(b.velocity.x) * Math.sqrt(sp * sp - ny * ny);
        Matter.Body.setVelocity(b, { x: nx, y: ny });
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
          continue;
        }

        // Block
        const isBlkA = pair.bodyA.label.startsWith("block-");
        const isBlkB = pair.bodyB.label.startsWith("block-");
        if (isBlkA || isBlkB) {
          const blkBody = isBlkA ? pair.bodyA : pair.bodyB;
          const ballBody = isBlkA ? pair.bodyB : pair.bodyA;
          const blk = blocksRef.current.find(
            (b) => (b as BlockRuntime & { body: Matter.Body }).body === blkBody && b.alive,
          );
          if (!blk) continue;

          gs.now = performance.now();
          if (paddleRef.current) {
            gs.paddle.x = paddleRef.current.position.x;
            gs.paddle.y = paddleRef.current.position.y;
          }

          // Power hit = double damage
          const dmg = gs.ball.powerHit ? 2 : 1;
          blk.hp -= dmg;

          if (blk.hp <= 0 && blk.breakable) {
            gs.destroyBlock(blk);
          } else if (!blk.breakable) {
            executeEffect(blk.effect, blk, gs);
          } else {
            // damaged but alive – reflect effects still fire
            if (blk.effect === "sharp_reflect" || blk.effect === "metal_reflect") {
              executeEffect(blk.effect, blk, gs);
            }
          }

          // Pierce: keep ball velocity through the block
          if (gs.ball.pierce && ballRef.current) {
            const sp = gs.ball.speed;
            const bv = ballRef.current.velocity;
            const mag = Math.sqrt(bv.x * bv.x + bv.y * bv.y);
            if (mag > 0) {
              Matter.Body.setVelocity(ballRef.current, {
                x: (bv.x / mag) * sp,
                y: (bv.y / mag) * sp,
              });
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
        ctx.shadowBlur = blk.group === "boss" ? 18 : 8;
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

        // Boss pulsing border
        if (blk.group === "boss") {
          const t = performance.now() / 500;
          ctx.strokeStyle = `rgba(251,146,60,${0.3 + Math.sin(t) * 0.2})`;
          ctx.lineWidth = 2;
          roundRect(ctx, bx - 1, by - 1, BW + 2, BH + 2, 4);
          ctx.stroke();
        }
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

        ctx.shadowBlur = 25;
        ctx.shadowColor = "rgba(244,114,182,0.8)";
        const bg = ctx.createRadialGradient(
          b.position.x - 2, b.position.y - 2, 0,
          b.position.x, b.position.y, br,
        );
        bg.addColorStop(0, "#fbbf24");
        bg.addColorStop(1, "#f472b6");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

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
    { label: "Boss", color: "#ea580c" },
  ];

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
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1">
            <span className="text-zinc-400 uppercase tracking-wide">Elem</span>
            <span className="text-base sm:text-lg font-mono font-bold text-emerald-400">{blocksLeft}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-400 uppercase tracking-wide">Score</span>
            <span className="text-base sm:text-lg font-mono font-bold text-indigo-400">{score}</span>
          </div>
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

      {/* Canvas – scales to fit viewport width */}
      <div className="relative rounded-lg overflow-hidden shadow-[0_0_40px_rgba(99,102,241,0.15)] w-full">
        <canvas ref={canvasRef} width={GW} height={GH}
          className="block w-full h-auto cursor-none touch-none"
          style={{ aspectRatio: `${GW}/${GH}` }} />

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
