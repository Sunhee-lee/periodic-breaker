// ============================================================
// Periodic Breaker – Effect System
// Pure-logic handlers. NO area damage — blocks are only
// destroyed by the ball. Effects modify ball/paddle/score.
// ============================================================

import type { EffectParams, VfxKey } from "./elements";

// ── Shared game-state contract ────────────────────────────

export interface BlockRuntime {
  id: number;
  x: number;
  y: number;
  alive: boolean;
  hp: number;
  frozen: boolean;
  symbol: string;
  effect: string;
  params: EffectParams;
  vfx: VfxKey;
  group: string;
  breakable: boolean;
}

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  speed: number;
  baseSpeed: number;
  trailDamage: boolean;
  trailEnd: number;
  trailInterval: number;
  pierce: boolean;
  pierceEnd: number;
  pierceHits: number; // counts paddle touches while piercing
  powerHit: boolean;
  powerHitEnd: number;
}

export interface PaddleState {
  x: number;
  y: number;
  width: number;
  baseWidth: number;
  speedMultiplier: number;
}

export interface TimedEffect {
  key: string;
  endTime: number;
  revert: () => void;
}

export interface GameState {
  blocks: BlockRuntime[];
  ball: BallState;
  paddle: PaddleState;
  score: number;
  scoreMultiplier: number;
  floorShieldEnd: number;
  trajectoryEnd: number;
  trajectoryBounces: number;
  timedEffects: TimedEffect[];
  addScore: (base: number) => void;
  destroyBlock: (block: BlockRuntime) => void;
  spawnVfx: (key: VfxKey, x: number, y: number, extra?: Record<string, unknown>) => void;
  now: number;
  stageClear: boolean;
  gasZoneEnd: number;
  gasZoneHeight: number;
}

// ── Effect registry ───────────────────────────────────────

export type EffectHandler = (block: BlockRuntime, state: GameState) => void;

const handlers: Record<string, EffectHandler> = {};

function register(name: string, fn: EffectHandler) {
  handlers[name] = fn;
}

export function executeEffect(effectName: string, block: BlockRuntime, state: GameState) {
  const fn = handlers[effectName];
  if (fn) fn(block, state);
}

// ────────────────────────────────────────────────────────────
//  ATTACK — ball buff effects (no area damage)
// ────────────────────────────────────────────────────────────

/** Radioactive: ball turns neon and pierces through all blocks until it hits the paddle */
register("radioactive_pierce", (block, state) => {
  state.ball.pierce = true;
  state.ball.pierceHits = 0; // resets on 2nd paddle touch
  state.spawnVfx("radiation_burst", block.x, block.y, { radius: 40 });
});

/** Explosive: visual explosion burst (no area damage) */
register("explosion", (block, state) => {
  state.spawnVfx("explosion_red", block.x, block.y, { radius: 50 });
  state.spawnVfx("fast_explosion", block.x, block.y, { radius: 30 });
});

/** Ball deals double damage to blocks */
register("ball_power", (block, state) => {
  const dur = block.params.duration ?? 3000;
  state.ball.powerHit = true;
  state.ball.powerHitEnd = state.now + dur;
  state.spawnVfx("explosion_orange", block.x, block.y, { radius: 25 });
  state.timedEffects.push({
    key: "ball_power",
    endTime: state.now + dur,
    revert: () => { state.ball.powerHit = false; },
  });
});

/** Ball speed boost */
register("ball_speed", (block, state) => {
  const dur = block.params.duration ?? 2500;
  state.ball.speed = state.ball.baseSpeed * 1.3;
  state.spawnVfx("fast_explosion", block.x, block.y, { radius: 20 });
  state.timedEffects.push({
    key: "ball_speed",
    endTime: state.now + dur,
    revert: () => { state.ball.speed = state.ball.baseSpeed; },
  });
});

// ────────────────────────────────────────────────────────────
//  DEFENSE — ball angle/speed modifiers, shields
// ────────────────────────────────────────────────────────────

register("none", () => { /* high durability block, no effect */ });

register("shard_splash", (block, state) => {
  // VFX only — no area damage
  state.spawnVfx("shard_splash", block.x, block.y, {
    count: block.params.shardCount ?? 4,
    range: block.params.range ?? 50,
  });
});

register("sharp_reflect", (block, state) => {
  const mult = block.params.reflectMultiplier ?? 1.25;
  state.ball.vx *= mult;
  const sp = state.ball.speed;
  const mag = Math.sqrt(state.ball.vx ** 2 + state.ball.vy ** 2);
  if (mag > 0) {
    state.ball.vx = (state.ball.vx / mag) * sp;
    state.ball.vy = (state.ball.vy / mag) * sp;
  }
  state.spawnVfx("sharp_reflect", block.x, block.y);
});

register("metal_reflect", (block, state) => {
  const mult = block.params.reflectMultiplier ?? 1.1;
  state.ball.vx *= mult;
  const sp = state.ball.speed;
  const mag = Math.sqrt(state.ball.vx ** 2 + state.ball.vy ** 2);
  if (mag > 0) {
    state.ball.vx = (state.ball.vx / mag) * sp;
    state.ball.vy = (state.ball.vy / mag) * sp;
  }
  state.spawnVfx("metal_reflect", block.x, block.y);
});

register("floor_shield", (block, state) => {
  const dur = block.params.duration ?? 4000;
  state.floorShieldEnd = state.now + dur;
  state.spawnVfx("shield_blue", block.x, block.y, { duration: dur });
});

register("heavy_block", (block, state) => {
  const reduction = block.params.speedReduction ?? 0.7;
  state.ball.speed = state.ball.baseSpeed * reduction;
  state.spawnVfx("heavy_impact", block.x, block.y);
  state.timedEffects.push({
    key: "heavy_block",
    endTime: state.now + 2000,
    revert: () => { state.ball.speed = state.ball.baseSpeed; },
  });
});

// ────────────────────────────────────────────────────────────
//  UTILITY — ball movement modifiers
// ────────────────────────────────────────────────────────────

register("lift", (block, state) => {
  const boost = block.params.upwardBoost ?? 1.5;
  state.ball.vy = -Math.abs(state.ball.vy) * boost;
  const sp = state.ball.speed;
  const mag = Math.sqrt(state.ball.vx ** 2 + state.ball.vy ** 2);
  if (mag > 0) {
    state.ball.vx = (state.ball.vx / mag) * sp;
    state.ball.vy = (state.ball.vy / mag) * sp;
  }
  state.spawnVfx("lift_white", block.x, block.y);
});

register("slow_control", (block, state) => {
  const mult = block.params.slowMultiplier ?? 0.75;
  const dur = block.params.duration ?? 1500;
  state.ball.speed = state.ball.baseSpeed * mult;
  state.spawnVfx("slow_blue", block.x, block.y);
  state.timedEffects.push({
    key: "slow_control",
    endTime: state.now + dur,
    revert: () => { state.ball.speed = state.ball.baseSpeed; },
  });
});

register("ball_powerup", (block, state) => {
  const sizeMult = block.params.sizeMultiplier ?? 1.3;
  const dur = block.params.duration ?? 2500;
  state.ball.radius = state.ball.baseRadius * sizeMult;
  state.spawnVfx("powerup_gold", block.x, block.y);
  state.timedEffects.push({
    key: "ball_powerup",
    endTime: state.now + dur,
    revert: () => { state.ball.radius = state.ball.baseRadius; },
  });
});

register("bounce", (block, state) => {
  const power = block.params.bouncePower ?? 1.15;
  state.ball.vy = -Math.abs(state.ball.vy) * power;
  state.ball.vx *= power;
  state.spawnVfx("neon_bounce", block.x, block.y);
});

register("trajectory_guide", (block, state) => {
  const dur = block.params.duration ?? 4000;
  state.trajectoryEnd = state.now + dur;
  state.trajectoryBounces = block.params.guideBounces ?? 3;
  state.spawnVfx("trajectory_line", block.x, block.y);
});

register("trail_damage", (block, state) => {
  const dur = block.params.duration ?? 2000;
  state.ball.trailDamage = true;
  state.ball.trailEnd = state.now + dur;
  state.ball.trailInterval = block.params.interval ?? 120;
  state.spawnVfx("trail_fire", block.x, block.y);
});

register("state_change", (block, state) => {
  const dur = block.params.duration ?? 2000;
  state.ball.speed = state.ball.baseSpeed * 1.1;
  state.spawnVfx("none", block.x, block.y);
  state.timedEffects.push({
    key: "state_change",
    endTime: state.now + dur,
    revert: () => { state.ball.speed = state.ball.baseSpeed; },
  });
});

register("conduct", (block, state) => {
  // Conduct = brief ball size boost (no area damage)
  const dur = block.params.duration ?? 2000;
  state.ball.radius = state.ball.baseRadius * 1.2;
  state.spawnVfx("conduct_pulse", block.x, block.y);
  state.timedEffects.push({
    key: "conduct",
    endTime: state.now + dur,
    revert: () => { state.ball.radius = state.ball.baseRadius; },
  });
});

register("rare_support", (block, state) => {
  const bonus = block.params.bonus ?? 200;
  const dur = block.params.duration ?? 3000;
  state.addScore(bonus);
  state.ball.radius = state.ball.baseRadius * 1.15;
  state.spawnVfx("rare_sparkle", block.x, block.y, { bonus });
  state.timedEffects.push({
    key: "rare_support",
    endTime: state.now + dur,
    revert: () => { state.ball.radius = state.ball.baseRadius; },
  });
});

register("slippery", (block, state) => {
  const dur = block.params.duration ?? 2500;
  const angle = (Math.random() - 0.5) * 0.4;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  state.ball.vx = state.ball.vx * cos - state.ball.vy * sin;
  state.ball.vy = state.ball.vx * sin + state.ball.vy * cos;
  state.ball.speed = state.ball.baseSpeed * 0.9;
  state.spawnVfx("none", block.x, block.y);
  state.timedEffects.push({
    key: "slippery",
    endTime: state.now + dur,
    revert: () => { state.ball.speed = state.ball.baseSpeed; },
  });
});

// ────────────────────────────────────────────────────────────
//  DEBUFF — paddle penalties (no area damage)
// ────────────────────────────────────────────────────────────

register("corrosion", (block, state) => {
  // Corrosion = paddle shrink (no neighbor damage)
  const dur = block.params.duration ?? 3000;
  state.paddle.width = state.paddle.baseWidth * 0.85;
  state.spawnVfx("corrosion_green", block.x, block.y);
  state.timedEffects.push({
    key: "corrosion",
    endTime: state.now + dur,
    revert: () => { state.paddle.width = state.paddle.baseWidth; },
  });
});

register("gas_zone", (block, state) => {
  const dur = block.params.duration ?? 3000;
  const height = block.params.zoneHeight ?? 100;
  const speedMult = block.params.paddleSpeedMultiplier ?? 0.8;
  state.gasZoneEnd = state.now + dur;
  state.gasZoneHeight = height;
  state.paddle.speedMultiplier = speedMult;
  state.spawnVfx("gas_yellow", block.x, block.y, { height, duration: dur });
  state.timedEffects.push({
    key: "gas_zone",
    endTime: state.now + dur,
    revert: () => { state.paddle.speedMultiplier = 1; state.gasZoneEnd = 0; },
  });
});

register("paddle_debuff", (block, state) => {
  const scale = block.params.scale ?? 0.8;
  const dur = block.params.duration ?? 3000;
  state.paddle.width = state.paddle.baseWidth * scale;
  state.spawnVfx("paddle_shrink", block.x, block.y);
  state.timedEffects.push({
    key: "paddle_debuff",
    endTime: state.now + dur,
    revert: () => { state.paddle.width = state.paddle.baseWidth; },
  });
});

// ────────────────────────────────────────────────────────────
//  SCORE — point bonuses
// ────────────────────────────────────────────────────────────

register("freeze_score", (block, state) => {
  const mult = block.params.multiplier ?? 1.5;
  const dur = block.params.duration ?? 3000;
  state.spawnVfx("freeze_ice", block.x, block.y);
  state.scoreMultiplier = mult;
  state.timedEffects.push({
    key: "freeze_score",
    endTime: state.now + dur,
    revert: () => { state.scoreMultiplier = 1; },
  });
});

register("flash_bonus", (block, state) => {
  const bonus = block.params.bonus ?? 500;
  state.addScore(bonus);
  state.spawnVfx("flash_white", block.x, block.y, { bonus });
});

register("score_block", (block, state) => {
  const bonus = block.params.bonus ?? 100;
  state.addScore(bonus);
  state.spawnVfx("score_glow", block.x, block.y, { bonus });
});

