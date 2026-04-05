"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Matter from "matter-js";

const GAME_WIDTH = 480;
const GAME_HEIGHT = 640;
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 14;
const BALL_RADIUS = 8;
const WALL_THICKNESS = 20;
const INITIAL_LIVES = 3;
const BALL_SPEED = 6;

// Block dimensions for 18-column periodic table
const BLOCK_COLS = 18;
const BLOCK_GAP = 2;
const BLOCK_MARGIN_X = 6;
const BLOCK_WIDTH = Math.floor(
  (GAME_WIDTH - BLOCK_MARGIN_X * 2 - (BLOCK_COLS - 1) * BLOCK_GAP) / BLOCK_COLS
);
const BLOCK_HEIGHT = 30;
const BLOCK_TOP_OFFSET = 30;

// Category filters for collision
const CATEGORY = {
  WALL: 0x0001,
  PADDLE: 0x0002,
  BALL: 0x0004,
  BLOCK: 0x0008,
};

// Element groups
type ElementGroup =
  | "alkali-metal"
  | "alkaline-earth"
  | "noble-gas"
  | "halogen"
  | "other";

interface ElementData {
  atomicNumber: number;
  symbol: string;
  group: ElementGroup;
  row: number; // periodic table row (1-4)
  col: number; // periodic table column (1-18)
  isDestroyable: boolean;
  hp: number; // hit points: 1 for special groups, 2 for "other"
}

// Color schemes per group
const GROUP_COLORS: Record<
  ElementGroup,
  { fill: string; glow: string; text: string; border: string }
> = {
  "alkali-metal": {
    fill: "#dc2626",
    glow: "rgba(220, 38, 38, 0.5)",
    text: "#fecaca",
    border: "#f87171",
  },
  "alkaline-earth": {
    fill: "#ea580c",
    glow: "rgba(234, 88, 12, 0.5)",
    text: "#fed7aa",
    border: "#fb923c",
  },
  "noble-gas": {
    fill: "#0ea5e9",
    glow: "rgba(14, 165, 233, 0.6)",
    text: "#e0f2fe",
    border: "#38bdf8",
  },
  halogen: {
    fill: "#65a30d",
    glow: "rgba(101, 163, 13, 0.5)",
    text: "#ecfccb",
    border: "#84cc16",
  },
  other: {
    fill: "#52525b",
    glow: "rgba(82, 82, 91, 0.4)",
    text: "#e4e4e7",
    border: "#a1a1aa",
  },
};

// Damaged "other" colors (hp = 1, cracked)
const OTHER_DAMAGED_COLORS = {
  fill: "#3f3f46",
  glow: "rgba(63, 63, 70, 0.3)",
  text: "#d4d4d8",
  border: "#71717a",
};

// Elements 1-20 in standard 18-column layout
const ELEMENTS: ElementData[] = [
  // Row 1
  { atomicNumber: 1, symbol: "H", group: "other", row: 1, col: 1, isDestroyable: true, hp: 2 },
  { atomicNumber: 2, symbol: "He", group: "noble-gas", row: 1, col: 18, isDestroyable: true, hp: 1 },
  // Row 2
  { atomicNumber: 3, symbol: "Li", group: "alkali-metal", row: 2, col: 1, isDestroyable: true, hp: 1 },
  { atomicNumber: 4, symbol: "Be", group: "alkaline-earth", row: 2, col: 2, isDestroyable: true, hp: 1 },
  { atomicNumber: 5, symbol: "B", group: "other", row: 2, col: 13, isDestroyable: true, hp: 2 },
  { atomicNumber: 6, symbol: "C", group: "other", row: 2, col: 14, isDestroyable: true, hp: 2 },
  { atomicNumber: 7, symbol: "N", group: "other", row: 2, col: 15, isDestroyable: true, hp: 2 },
  { atomicNumber: 8, symbol: "O", group: "other", row: 2, col: 16, isDestroyable: true, hp: 2 },
  { atomicNumber: 9, symbol: "F", group: "halogen", row: 2, col: 17, isDestroyable: true, hp: 1 },
  { atomicNumber: 10, symbol: "Ne", group: "noble-gas", row: 2, col: 18, isDestroyable: true, hp: 1 },
  // Row 3
  { atomicNumber: 11, symbol: "Na", group: "alkali-metal", row: 3, col: 1, isDestroyable: true, hp: 1 },
  { atomicNumber: 12, symbol: "Mg", group: "alkaline-earth", row: 3, col: 2, isDestroyable: true, hp: 1 },
  { atomicNumber: 13, symbol: "Al", group: "other", row: 3, col: 13, isDestroyable: true, hp: 2 },
  { atomicNumber: 14, symbol: "Si", group: "other", row: 3, col: 14, isDestroyable: true, hp: 2 },
  { atomicNumber: 15, symbol: "P", group: "other", row: 3, col: 15, isDestroyable: true, hp: 2 },
  { atomicNumber: 16, symbol: "S", group: "other", row: 3, col: 16, isDestroyable: true, hp: 2 },
  { atomicNumber: 17, symbol: "Cl", group: "halogen", row: 3, col: 17, isDestroyable: true, hp: 1 },
  { atomicNumber: 18, symbol: "Ar", group: "noble-gas", row: 3, col: 18, isDestroyable: true, hp: 1 },
  // Row 4 (only K and Ca for elements 1-20)
  { atomicNumber: 19, symbol: "K", group: "alkali-metal", row: 4, col: 1, isDestroyable: true, hp: 1 },
  { atomicNumber: 20, symbol: "Ca", group: "alkaline-earth", row: 4, col: 2, isDestroyable: true, hp: 1 },
];

// Runtime block state attached to Matter.js bodies
interface BlockState {
  element: ElementData;
  hp: number;
  body: Matter.Body;
  alive: boolean;
}

function getBlockPosition(row: number, col: number) {
  const x =
    BLOCK_MARGIN_X + (col - 1) * (BLOCK_WIDTH + BLOCK_GAP) + BLOCK_WIDTH / 2;
  const y = BLOCK_TOP_OFFSET + (row - 1) * (BLOCK_HEIGHT + BLOCK_GAP) + BLOCK_HEIGHT / 2;
  return { x, y };
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const paddleRef = useRef<Matter.Body | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const blocksRef = useRef<BlockState[]>([]);
  const animFrameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(GAME_WIDTH / 2);
  const destroyEffectsRef = useRef<
    { x: number; y: number; color: string; tick: number }[]
  >([]);

  const [lives, setLives] = useState(INITIAL_LIVES);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [blocksLeft, setBlocksLeft] = useState(ELEMENTS.length);

  const livesRef = useRef(INITIAL_LIVES);
  const scoreRef = useRef(0);
  const gameOverRef = useRef(false);
  const launchedRef = useRef(false);

  const createBlocks = useCallback((engine: Matter.Engine): BlockState[] => {
    const blocks: BlockState[] = [];

    for (const el of ELEMENTS) {
      const pos = getBlockPosition(el.row, el.col);
      const body = Matter.Bodies.rectangle(
        pos.x,
        pos.y,
        BLOCK_WIDTH,
        BLOCK_HEIGHT,
        {
          isStatic: true,
          restitution: 1,
          friction: 0,
          frictionStatic: 0,
          collisionFilter: { category: CATEGORY.BLOCK },
          label: `block-${el.atomicNumber}`,
        }
      );

      const state: BlockState = {
        element: { ...el },
        hp: el.hp,
        body,
        alive: true,
      };
      blocks.push(state);
      Matter.Composite.add(engine.world, body);
    }

    return blocks;
  }, []);

  const resetBall = useCallback(() => {
    if (!ballRef.current || !paddleRef.current) return;
    const paddle = paddleRef.current;
    const ball = ballRef.current;
    Matter.Body.setPosition(ball, {
      x: paddle.position.x,
      y: paddle.position.y - PADDLE_HEIGHT / 2 - BALL_RADIUS - 2,
    });
    Matter.Body.setVelocity(ball, { x: 0, y: 0 });
    launchedRef.current = false;
    setLaunched(false);
  }, []);

  const launchBall = useCallback(() => {
    if (!ballRef.current || launchedRef.current || gameOverRef.current) return;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    Matter.Body.setVelocity(ballRef.current, {
      x: Math.cos(angle) * BALL_SPEED,
      y: Math.sin(angle) * BALL_SPEED,
    });
    launchedRef.current = true;
    setLaunched(true);
  }, []);

  const restartGame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    // Remove old blocks
    for (const block of blocksRef.current) {
      Matter.Composite.remove(engine.world, block.body);
    }

    // Create fresh blocks
    blocksRef.current = createBlocks(engine);
    setBlocksLeft(ELEMENTS.length);

    livesRef.current = INITIAL_LIVES;
    scoreRef.current = 0;
    gameOverRef.current = false;
    destroyEffectsRef.current = [];
    setLives(INITIAL_LIVES);
    setScore(0);
    setGameOver(false);
    resetBall();
  }, [resetBall, createBlocks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Create engine (no gravity)
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0 },
    });
    engineRef.current = engine;

    // Walls: top, left, right (no bottom)
    const wallOptions: Matter.IChamferableBodyDefinition = {
      isStatic: true,
      restitution: 1,
      friction: 0,
      frictionStatic: 0,
      collisionFilter: { category: CATEGORY.WALL },
    };

    const topWall = Matter.Bodies.rectangle(
      GAME_WIDTH / 2,
      -WALL_THICKNESS / 2,
      GAME_WIDTH + WALL_THICKNESS * 2,
      WALL_THICKNESS,
      wallOptions
    );
    const leftWall = Matter.Bodies.rectangle(
      -WALL_THICKNESS / 2,
      GAME_HEIGHT / 2,
      WALL_THICKNESS,
      GAME_HEIGHT,
      wallOptions
    );
    const rightWall = Matter.Bodies.rectangle(
      GAME_WIDTH + WALL_THICKNESS / 2,
      GAME_HEIGHT / 2,
      WALL_THICKNESS,
      GAME_HEIGHT,
      wallOptions
    );

    // Paddle
    const paddle = Matter.Bodies.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT - 40,
      PADDLE_WIDTH,
      PADDLE_HEIGHT,
      {
        isStatic: true,
        restitution: 1,
        friction: 0,
        frictionStatic: 0,
        chamfer: { radius: 7 },
        collisionFilter: { category: CATEGORY.PADDLE },
        label: "paddle",
      }
    );
    paddleRef.current = paddle;

    // Ball
    const ball = Matter.Bodies.circle(
      GAME_WIDTH / 2,
      GAME_HEIGHT - 40 - PADDLE_HEIGHT / 2 - BALL_RADIUS - 2,
      BALL_RADIUS,
      {
        restitution: 1,
        friction: 0,
        frictionAir: 0,
        frictionStatic: 0,
        inertia: Infinity,
        inverseInertia: 0,
        density: 1,
        collisionFilter: {
          category: CATEGORY.BALL,
          mask: CATEGORY.WALL | CATEGORY.PADDLE | CATEGORY.BLOCK,
        },
        label: "ball",
      }
    );
    ballRef.current = ball;

    Matter.Composite.add(engine.world, [
      topWall,
      leftWall,
      rightWall,
      paddle,
      ball,
    ]);

    // Create element blocks
    blocksRef.current = createBlocks(engine);

    // Runner
    const runner = Matter.Runner.create();
    runnerRef.current = runner;
    Matter.Runner.run(runner, engine);

    // After each physics update, enforce constant ball speed
    Matter.Events.on(engine, "afterUpdate", () => {
      if (!launchedRef.current || gameOverRef.current) {
        if (!launchedRef.current && paddleRef.current && ballRef.current) {
          Matter.Body.setPosition(ballRef.current, {
            x: paddleRef.current.position.x,
            y:
              paddleRef.current.position.y -
              PADDLE_HEIGHT / 2 -
              BALL_RADIUS -
              2,
          });
        }
        return;
      }

      const b = ballRef.current;
      if (!b) return;

      // Ball fell below screen
      if (b.position.y > GAME_HEIGHT + BALL_RADIUS * 2) {
        livesRef.current -= 1;
        setLives(livesRef.current);

        if (livesRef.current <= 0) {
          gameOverRef.current = true;
          setGameOver(true);
          Matter.Body.setVelocity(b, { x: 0, y: 0 });
        } else {
          if (paddleRef.current) {
            Matter.Body.setPosition(b, {
              x: paddleRef.current.position.x,
              y:
                paddleRef.current.position.y -
                PADDLE_HEIGHT / 2 -
                BALL_RADIUS -
                2,
            });
            Matter.Body.setVelocity(b, { x: 0, y: 0 });
            launchedRef.current = false;
            setLaunched(false);
          }
        }
        return;
      }

      // Enforce constant speed
      const vx = b.velocity.x;
      const vy = b.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > 0 && Math.abs(speed - BALL_SPEED) > 0.1) {
        const scale = BALL_SPEED / speed;
        Matter.Body.setVelocity(b, { x: vx * scale, y: vy * scale });
      }

      // Prevent nearly-horizontal bouncing
      if (Math.abs(b.velocity.y) < 1) {
        const sign = b.velocity.y >= 0 ? 1 : -1;
        const newVy = sign * 1.5;
        const newVx =
          Math.sign(b.velocity.x) *
          Math.sqrt(BALL_SPEED * BALL_SPEED - newVy * newVy);
        Matter.Body.setVelocity(b, { x: newVx, y: newVy });
      }
    });

    // Collision events
    Matter.Events.on(engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        const isPaddleA = pair.bodyA.label === "paddle";
        const isPaddleB = pair.bodyB.label === "paddle";

        // Paddle collision — angle influence
        if (isPaddleA || isPaddleB) {
          const ballBody = isPaddleA ? pair.bodyB : pair.bodyA;
          const paddleBody = isPaddleA ? pair.bodyA : pair.bodyB;

          const offset =
            (ballBody.position.x - paddleBody.position.x) / (PADDLE_WIDTH / 2);
          const clampedOffset = Math.max(-1, Math.min(1, offset));
          const angle = -Math.PI / 2 + clampedOffset * (Math.PI / 3);
          Matter.Body.setVelocity(ballBody, {
            x: Math.cos(angle) * BALL_SPEED,
            y: Math.sin(angle) * BALL_SPEED,
          });
          continue;
        }

        // Block collision
        const isBlockA = pair.bodyA.label.startsWith("block-");
        const isBlockB = pair.bodyB.label.startsWith("block-");
        if (isBlockA || isBlockB) {
          const blockBody = isBlockA ? pair.bodyA : pair.bodyB;
          const block = blocksRef.current.find(
            (b) => b.body === blockBody && b.alive
          );
          if (block) {
            block.hp -= 1;
            if (block.hp <= 0) {
              block.alive = false;
              Matter.Composite.remove(engine.world, block.body);

              // Destroy effect
              const colors = GROUP_COLORS[block.element.group];
              destroyEffectsRef.current.push({
                x: block.body.position.x,
                y: block.body.position.y,
                color: colors.border,
                tick: 0,
              });

              // Score: higher atomic number = more points
              const points = block.element.atomicNumber * 10;
              scoreRef.current += points;
              setScore(scoreRef.current);
              setBlocksLeft(
                blocksRef.current.filter((b) => b.alive).length
              );
            }
          }
        }
      }
    });

    // ---- Rendering loop ----
    const render = () => {
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Background
      ctx.fillStyle = "#0f0f1a";
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Subtle grid
      ctx.strokeStyle = "rgba(99, 102, 241, 0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x < GAME_WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GAME_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < GAME_HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(GAME_WIDTH, y);
        ctx.stroke();
      }

      // Border glow
      ctx.shadowBlur = 15;
      ctx.shadowColor = "rgba(99, 102, 241, 0.4)";
      ctx.strokeStyle = "rgba(99, 102, 241, 0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, GAME_WIDTH - 2, GAME_HEIGHT - 2);
      ctx.shadowBlur = 0;

      // ---- Draw blocks ----
      for (const block of blocksRef.current) {
        if (!block.alive) continue;

        const { element, hp } = block;
        const pos = block.body.position;
        const bx = pos.x - BLOCK_WIDTH / 2;
        const by = pos.y - BLOCK_HEIGHT / 2;

        const isDamaged = element.group === "other" && hp === 1;
        const colors = isDamaged
          ? OTHER_DAMAGED_COLORS
          : GROUP_COLORS[element.group];

        // Block glow
        ctx.shadowBlur = element.group === "noble-gas" ? 15 : 8;
        ctx.shadowColor = colors.glow;

        // Block fill
        ctx.fillStyle = colors.fill;
        const r = 3;
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + BLOCK_WIDTH - r, by);
        ctx.quadraticCurveTo(bx + BLOCK_WIDTH, by, bx + BLOCK_WIDTH, by + r);
        ctx.lineTo(bx + BLOCK_WIDTH, by + BLOCK_HEIGHT - r);
        ctx.quadraticCurveTo(
          bx + BLOCK_WIDTH,
          by + BLOCK_HEIGHT,
          bx + BLOCK_WIDTH - r,
          by + BLOCK_HEIGHT
        );
        ctx.lineTo(bx + r, by + BLOCK_HEIGHT);
        ctx.quadraticCurveTo(bx, by + BLOCK_HEIGHT, bx, by + BLOCK_HEIGHT - r);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.closePath();
        ctx.fill();

        // Block border
        ctx.shadowBlur = 0;
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Crack lines for damaged "other" blocks
        if (isDamaged) {
          ctx.strokeStyle = "rgba(161, 161, 170, 0.5)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx + BLOCK_WIDTH * 0.3, by);
          ctx.lineTo(bx + BLOCK_WIDTH * 0.5, by + BLOCK_HEIGHT * 0.5);
          ctx.lineTo(bx + BLOCK_WIDTH * 0.7, by + BLOCK_HEIGHT);
          ctx.stroke();
        }

        // Atomic number (top-left, tiny)
        ctx.fillStyle = colors.text;
        ctx.globalAlpha = 0.5;
        ctx.font = "bold 7px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(element.atomicNumber), bx + 2, by + 2);
        ctx.globalAlpha = 1;

        // Element symbol (center)
        ctx.fillStyle = colors.text;
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(element.symbol, pos.x, pos.y + 2);
      }

      // ---- Destroy effects (expanding ring) ----
      const effects = destroyEffectsRef.current;
      for (let i = effects.length - 1; i >= 0; i--) {
        const eff = effects[i];
        eff.tick += 1;
        const progress = eff.tick / 20;
        if (progress >= 1) {
          effects.splice(i, 1);
          continue;
        }
        const radius = BLOCK_WIDTH * 0.5 + progress * BLOCK_WIDTH;
        ctx.strokeStyle = eff.color;
        ctx.globalAlpha = 1 - progress;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(eff.x, eff.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // ---- Draw paddle ----
      if (paddleRef.current) {
        const p = paddleRef.current;
        const px = p.position.x - PADDLE_WIDTH / 2;
        const py = p.position.y - PADDLE_HEIGHT / 2;

        ctx.shadowBlur = 20;
        ctx.shadowColor = "rgba(99, 102, 241, 0.6)";

        const grad = ctx.createLinearGradient(px, py, px, py + PADDLE_HEIGHT);
        grad.addColorStop(0, "#818cf8");
        grad.addColorStop(1, "#6366f1");
        ctx.fillStyle = grad;

        const r = 7;
        ctx.beginPath();
        ctx.moveTo(px + r, py);
        ctx.lineTo(px + PADDLE_WIDTH - r, py);
        ctx.quadraticCurveTo(
          px + PADDLE_WIDTH,
          py,
          px + PADDLE_WIDTH,
          py + r
        );
        ctx.lineTo(px + PADDLE_WIDTH, py + PADDLE_HEIGHT - r);
        ctx.quadraticCurveTo(
          px + PADDLE_WIDTH,
          py + PADDLE_HEIGHT,
          px + PADDLE_WIDTH - r,
          py + PADDLE_HEIGHT
        );
        ctx.lineTo(px + r, py + PADDLE_HEIGHT);
        ctx.quadraticCurveTo(
          px,
          py + PADDLE_HEIGHT,
          px,
          py + PADDLE_HEIGHT - r
        );
        ctx.lineTo(px, py + r);
        ctx.quadraticCurveTo(px, py, px + r, py);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // ---- Draw ball ----
      if (ballRef.current) {
        const b = ballRef.current;

        ctx.shadowBlur = 25;
        ctx.shadowColor = "rgba(244, 114, 182, 0.8)";

        const ballGrad = ctx.createRadialGradient(
          b.position.x - 2,
          b.position.y - 2,
          0,
          b.position.x,
          b.position.y,
          BALL_RADIUS
        );
        ballGrad.addColorStop(0, "#fbbf24");
        ballGrad.addColorStop(1, "#f472b6");
        ctx.fillStyle = ballGrad;

        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    // ---- Input handlers ----
    const getCanvasX = (clientX: number) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = GAME_WIDTH / rect.width;
      return (clientX - rect.left) * scaleX;
    };

    const movePaddle = (x: number) => {
      if (!paddleRef.current || gameOverRef.current) return;
      const clampedX = Math.max(
        PADDLE_WIDTH / 2,
        Math.min(GAME_WIDTH - PADDLE_WIDTH / 2, x)
      );
      Matter.Body.setPosition(paddleRef.current, {
        x: clampedX,
        y: paddleRef.current.position.y,
      });
      lastMouseXRef.current = clampedX;
    };

    const onMouseMove = (e: MouseEvent) => {
      movePaddle(getCanvasX(e.clientX));
    };
    const onMouseDown = (e: MouseEvent) => {
      movePaddle(getCanvasX(e.clientX));
      if (!launchedRef.current && !gameOverRef.current) {
        launchBall();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const touch = e.touches[0];
      movePaddle(getCanvasX(touch.clientX));
      if (!launchedRef.current && !gameOverRef.current) {
        launchBall();
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!isDraggingRef.current) return;
      const touch = e.touches[0];
      movePaddle(getCanvasX(touch.clientX));
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      isDraggingRef.current = false;
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      Matter.Runner.stop(runner);
      Matter.Engine.clear(engine);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [launchBall, resetBall, createBlocks]);

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      {/* Header */}
      <h1 className="text-3xl font-bold tracking-wider bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
        PERIODIC BREAKER
      </h1>

      {/* HUD */}
      <div className="flex items-center justify-between w-full max-w-[480px] px-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400 uppercase tracking-wide">
            Lives
          </span>
          <div className="flex gap-1">
            {Array.from({ length: INITIAL_LIVES }).map((_, i) => (
              <span
                key={i}
                className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                  i < lives
                    ? "bg-pink-500 shadow-[0_0_8px_rgba(244,114,182,0.6)]"
                    : "bg-zinc-700"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-zinc-400 uppercase tracking-wide">
              Blocks
            </span>
            <span className="text-lg font-mono font-bold text-emerald-400">
              {blocksLeft}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-zinc-400 uppercase tracking-wide">
              Score
            </span>
            <span className="text-lg font-mono font-bold text-indigo-400">
              {score}
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 text-xs max-w-[480px]">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-600" /> Alkali
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-orange-600" /> Alkaline
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Noble Gas
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-lime-600" /> Halogen
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-zinc-600" /> Other (×2)
        </span>
      </div>

      {/* Canvas */}
      <div className="relative rounded-lg overflow-hidden shadow-[0_0_40px_rgba(99,102,241,0.15)]">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="block cursor-none max-w-full"
          style={{ aspectRatio: `${GAME_WIDTH}/${GAME_HEIGHT}` }}
        />

        {/* Overlay: Start / Game Over */}
        {(!launched || gameOver) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            {gameOver ? (
              <>
                <p className="text-4xl font-bold text-red-400 mb-2">
                  GAME OVER
                </p>
                <p className="text-zinc-400 mb-4">
                  Final Score:{" "}
                  <span className="text-indigo-400 font-bold">{score}</span>
                </p>
                <button
                  onClick={restartGame}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                >
                  RESTART
                </button>
              </>
            ) : (
              <>
                <p className="text-xl text-zinc-300 mb-1 animate-pulse">
                  Click or Tap to Launch
                </p>
                <p className="text-sm text-zinc-500">
                  Move mouse or drag to control paddle
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
