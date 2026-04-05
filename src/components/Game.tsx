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

// Category filters for collision
const CATEGORY = {
  WALL: 0x0001,
  PADDLE: 0x0002,
  BALL: 0x0004,
};

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const paddleRef = useRef<Matter.Body | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const animFrameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(GAME_WIDTH / 2);

  const [lives, setLives] = useState(INITIAL_LIVES);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [launched, setLaunched] = useState(false);

  const livesRef = useRef(INITIAL_LIVES);
  const gameOverRef = useRef(false);
  const launchedRef = useRef(false);

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
    livesRef.current = INITIAL_LIVES;
    gameOverRef.current = false;
    setLives(INITIAL_LIVES);
    setScore(0);
    setGameOver(false);
    resetBall();
  }, [resetBall]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Create engine (no gravity — we control the ball via velocity)
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0 },
    });
    engineRef.current = engine;

    // Walls: top, left, right (no bottom — ball falls through)
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
          mask: CATEGORY.WALL | CATEGORY.PADDLE,
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

    // Runner
    const runner = Matter.Runner.create();
    runnerRef.current = runner;
    Matter.Runner.run(runner, engine);

    // After each physics update, enforce constant ball speed
    Matter.Events.on(engine, "afterUpdate", () => {
      if (!launchedRef.current || gameOverRef.current) {
        // Keep ball on paddle when not launched
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

      // Check if ball fell below the screen
      if (b.position.y > GAME_HEIGHT + BALL_RADIUS * 2) {
        livesRef.current -= 1;
        setLives(livesRef.current);

        if (livesRef.current <= 0) {
          gameOverRef.current = true;
          setGameOver(true);
          Matter.Body.setVelocity(b, { x: 0, y: 0 });
        } else {
          // Reset ball to paddle
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

      // Prevent nearly-horizontal bouncing (causes stalling)
      if (Math.abs(b.velocity.y) < 1) {
        const sign = b.velocity.y >= 0 ? 1 : -1;
        const newVy = sign * 1.5;
        const newVx =
          Math.sign(b.velocity.x) *
          Math.sqrt(BALL_SPEED * BALL_SPEED - newVy * newVy);
        Matter.Body.setVelocity(b, { x: newVx, y: newVy });
      }
    });

    // Collision event — paddle angle influence
    Matter.Events.on(engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        const isPaddleA = pair.bodyA.label === "paddle";
        const isPaddleB = pair.bodyB.label === "paddle";
        if (isPaddleA || isPaddleB) {
          const ball = isPaddleA ? pair.bodyB : pair.bodyA;
          const paddleBody = isPaddleA ? pair.bodyA : pair.bodyB;

          // Calculate offset from paddle center (-1 to 1)
          const offset =
            (ball.position.x - paddleBody.position.x) / (PADDLE_WIDTH / 2);
          const clampedOffset = Math.max(-1, Math.min(1, offset));

          // Map offset to angle: left edge -> ~150°, center -> ~90° (straight up), right edge -> ~30°
          const angle = (-Math.PI / 2) + clampedOffset * (Math.PI / 3);
          Matter.Body.setVelocity(ball, {
            x: Math.cos(angle) * BALL_SPEED,
            y: Math.sin(angle) * BALL_SPEED,
          });

          setScore((prev) => prev + 10);
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

      // Draw paddle
      if (paddleRef.current) {
        const p = paddleRef.current;
        const px = p.position.x - PADDLE_WIDTH / 2;
        const py = p.position.y - PADDLE_HEIGHT / 2;

        // Paddle glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = "rgba(99, 102, 241, 0.6)";

        // Paddle gradient
        const grad = ctx.createLinearGradient(px, py, px, py + PADDLE_HEIGHT);
        grad.addColorStop(0, "#818cf8");
        grad.addColorStop(1, "#6366f1");
        ctx.fillStyle = grad;

        // Rounded rectangle
        const r = 7;
        ctx.beginPath();
        ctx.moveTo(px + r, py);
        ctx.lineTo(px + PADDLE_WIDTH - r, py);
        ctx.quadraticCurveTo(px + PADDLE_WIDTH, py, px + PADDLE_WIDTH, py + r);
        ctx.lineTo(px + PADDLE_WIDTH, py + PADDLE_HEIGHT - r);
        ctx.quadraticCurveTo(
          px + PADDLE_WIDTH,
          py + PADDLE_HEIGHT,
          px + PADDLE_WIDTH - r,
          py + PADDLE_HEIGHT
        );
        ctx.lineTo(px + r, py + PADDLE_HEIGHT);
        ctx.quadraticCurveTo(px, py + PADDLE_HEIGHT, px, py + PADDLE_HEIGHT - r);
        ctx.lineTo(px, py + r);
        ctx.quadraticCurveTo(px, py, px + r, py);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
      }

      // Draw ball
      if (ballRef.current) {
        const b = ballRef.current;

        // Ball trail glow
        ctx.shadowBlur = 25;
        ctx.shadowColor = "rgba(244, 114, 182, 0.8)";

        // Ball gradient
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

    // Mouse
    const onMouseMove = (e: MouseEvent) => {
      movePaddle(getCanvasX(e.clientX));
    };
    const onMouseDown = (e: MouseEvent) => {
      movePaddle(getCanvasX(e.clientX));
      if (!launchedRef.current && !gameOverRef.current) {
        launchBall();
      }
    };

    // Touch
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
  }, [launchBall, resetBall]);

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
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400 uppercase tracking-wide">
            Score
          </span>
          <span className="text-lg font-mono font-bold text-indigo-400">
            {score}
          </span>
        </div>
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
