// ============================================================
// Periodic Breaker – Effect System
// Pure-logic handlers. Each function receives the shared
// GameState and mutates it.  VFX spawning is done via the
// state.spawnVfx() callback so rendering stays decoupled.
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
  chainDepth: number; // current chain-explosion depth for bonus scoring
  addScore: (base: number) => void;
  destroyBlock: (block: BlockRuntime) => void;
  spawnVfx: (key: VfxKey, x: number, y: number, extra?: Record<string, unknown>) => void;
  now: number; // performance.now() at time of effect
  stageClear: boolean;
  gasZoneEnd: number;
  gasZoneHeight: number;
}

// ── Helper: find alive neighbours within radius ───────────

function nearbyBlocks(
  state: GameState,
  cx: number,
  cy: number,
  radius: number,
  exclude?: BlockRuntime,
): BlockRuntime[] {
  return state.blocks.filter((b) => {
    if (!b.alive || b === exclude) return false;
    const dx = b.x - cx;
    const dy = b.y - cy;
    return Math.sqrt(dx * dx + dy * dy) <= radius;
  });
}

// ── Effect registry ───────────────────────────────────────

export type EffectHandler = (
  block: BlockRuntime,
  state: GameState,
) => void;

const handlers: Record<string, EffectHandler> = {};

/** Register an effect handler */
function register(name: string, fn: EffectHandler) {
  handlers[name] = fn;
}

/** Execute the named effect (no-op if unknown) */
export function executeEffect(
  effectName: string,
  block: BlockRuntime,
  state: GameState,
) {
  const fn = handlers[effectName];
  if (fn) fn(block, state);
}

// ────────────────────────────────────────────────────────────
//  ATTACK effects
// ────────────────────────────────────────────────────────────

register("explosion", (block, state) => {
  const r = block.params.radius ?? 100;
  state.spawnVfx("explosion_red", block.x, block.y, { radius: r });

  const nearby = nearbyBlocks(state, block.x, block.y, r, block);
  for (const nb of nearby) {
    nb.hp -= 1;
    if (nb.hp <= 0 && nb.alive) {
      state.chainDepth += 1;
      state.destroyBlock(nb);
    }
  }
});

register("chain_lightning", (block, state) => {
  const targets = block.params.targets ?? 2;
  const range = block.params.range ?? 160;

  // Find closest alive blocks
  const candidates = state.blocks
    .filter((b) => b.alive && b !== block)
    .map((b) => ({
      b,
      dist: Math.sqrt((b.x - block.x) ** 2 + (b.y - block.y) ** 2),
    }))
    .filter((c) => c.dist <= range)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, targets);

  for (const c of candidates) {
    state.spawnVfx("chain_lightning", block.x, block.y, {
      tx: c.b.x,
      ty: c.b.y,
    });
    c.b.hp -= 1;
    if (c.b.hp <= 0 && c.b.alive) {
      state.chainDepth += 1;
      state.destroyBlock(c.b);
    }
  }
});

register("explosion_chain", (block, state) => {
  const r = block.params.radius ?? 140;
  state.spawnVfx("explosion_orange", block.x, block.y, { radius: r });

  const nearby = nearbyBlocks(state, block.x, block.y, r, block);
  for (const nb of nearby) {
    nb.hp -= 1;
    if (nb.hp <= 0 && nb.alive) {
      state.chainDepth += 1;
      state.destroyBlock(nb);
    }
  }
});

register("fast_chain_explosion", (block, state) => {
  const r = block.params.radius ?? 170;
  state.spawnVfx("fast_explosion", block.x, block.y, { radius: r });

  const nearby = nearbyBlocks(state, block.x, block.y, r, block);
  for (const nb of nearby) {
    nb.hp -= 1;
    if (nb.hp <= 0 && nb.alive) {
      state.chainDepth += 1;
      state.destroyBlock(nb);
    }
  }
});

// ────────────────────────────────────────────────────────────
//  DEFENSE effects
// ────────────────────────────────────────────────────────────

register("shard_splash", (block, state) => {
  const count = block.params.shardCount ?? 4;
  const range = block.params.range ?? 80;
  state.spawnVfx("shard_splash", block.x, block.y, { count, range });

  const nearby = nearbyBlocks(state, block.x, block.y, range, block);
  for (const nb of nearby) {
    nb.hp -= 1;
    if (nb.hp <= 0 && nb.alive) {
      state.chainDepth += 1;
      state.destroyBlock(nb);
    }
  }
});

register("none", () => {
  /* Carbon – no special effect, just high durability */
});

register("sharp_reflect", (block, state) => {
  const mult = block.params.reflectMultiplier ?? 1.25;
  // Sharpen the ball's angle by amplifying horizontal velocity
  state.ball.vx *= mult;
  // Re-normalise to keep constant speed
  const sp = state.ball.speed;
  const mag = Math.sqrt(state.ball.vx ** 2 + state.ball.vy ** 2);
  if (mag > 0) {
    state.ball.vx = (state.ball.vx / mag) * sp;
    state.ball.vy = (state.ball.vy / mag) * sp;
  }
  state.spawnVfx("sharp_reflect", block.x, block.y);
});

register("floor_shield", (block, state) => {
  const dur = block.params.duration ?? 4000;
  state.floorShieldEnd = state.now + dur;
  state.spawnVfx("shield_blue", block.x, block.y, { duration: dur });
});

// ────────────────────────────────────────────────────────────
//  UTILITY effects
// ────────────────────────────────────────────────────────────

register("lift", (_block, state) => {
  const boost = _block.params.upwardBoost ?? 1.5;
  state.ball.vy = -Math.abs(state.ball.vy) * boost;
  // Re-normalise
  const sp = state.ball.speed;
  const mag = Math.sqrt(state.ball.vx ** 2 + state.ball.vy ** 2);
  if (mag > 0) {
    state.ball.vx = (state.ball.vx / mag) * sp;
    state.ball.vy = (state.ball.vy / mag) * sp;
  }
  state.spawnVfx("lift_white", _block.x, _block.y);
});

register("slow_control", (block, state) => {
  const mult = block.params.slowMultiplier ?? 0.75;
  const dur = block.params.duration ?? 1500;
  state.ball.speed = state.ball.baseSpeed * mult;
  state.spawnVfx("slow_blue", block.x, block.y);

  state.timedEffects.push({
    key: "slow_control",
    endTime: state.now + dur,
    revert: () => {
      state.ball.speed = state.ball.baseSpeed;
    },
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
    revert: () => {
      state.ball.radius = state.ball.baseRadius;
    },
  });
});

register("bounce", (block, state) => {
  const power = block.params.bouncePower ?? 1.15;
  // Temporarily boost speed for one bounce
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

// ────────────────────────────────────────────────────────────
//  DEBUFF effects
// ────────────────────────────────────────────────────────────

register("corrosion", (block, state) => {
  const r = block.params.radius ?? 120;
  const down = block.params.durabilityDown ?? 1;
  state.spawnVfx("corrosion_green", block.x, block.y, { radius: r });

  const nearby = nearbyBlocks(state, block.x, block.y, r, block);
  for (const nb of nearby) {
    nb.hp -= down;
    if (nb.hp <= 0 && nb.alive) {
      state.chainDepth += 1;
      state.destroyBlock(nb);
    }
  }
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
    revert: () => {
      state.paddle.speedMultiplier = 1;
      state.gasZoneEnd = 0;
    },
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
    revert: () => {
      state.paddle.width = state.paddle.baseWidth;
    },
  });
});

// ────────────────────────────────────────────────────────────
//  SCORE effects
// ────────────────────────────────────────────────────────────

register("freeze_score", (block, state) => {
  const r = block.params.radius ?? 120;
  const mult = block.params.multiplier ?? 1.5;
  const dur = block.params.duration ?? 3000;
  state.spawnVfx("freeze_ice", block.x, block.y, { radius: r });

  // Freeze nearby blocks (they glow blue, give bonus on break)
  const nearby = nearbyBlocks(state, block.x, block.y, r, block);
  for (const nb of nearby) {
    nb.frozen = true;
  }

  state.scoreMultiplier = mult;
  state.timedEffects.push({
    key: "freeze_score",
    endTime: state.now + dur,
    revert: () => {
      state.scoreMultiplier = 1;
      for (const nb of nearby) nb.frozen = false;
    },
  });
});

register("flash_bonus", (block, state) => {
  const bonus = block.params.bonus ?? 500;
  state.addScore(bonus);
  state.spawnVfx("flash_white", block.x, block.y, { bonus });
});

// ────────────────────────────────────────────────────────────
//  BOSS effect
// ────────────────────────────────────────────────────────────

register("boss_core", (block, state) => {
  state.spawnVfx("boss_shatter", block.x, block.y);
  if (block.params.clearOnBreak) {
    state.stageClear = true;
  }
});

// ────────────────────────────────────────────────────────────
//  Category-based effects (auto-generated elements)
// ────────────────────────────────────────────────────────────

/** Transition metal: reflect ball with slight angle change */
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

/** Post-transition metal: small score bonus on break */
register("score_block", (block, state) => {
  const bonus = block.params.bonus ?? 100;
  state.addScore(bonus);
  state.spawnVfx("score_glow", block.x, block.y, { bonus });
});

/** Metalloid: conduct – boost nearby block damage by 1 */
register("conduct", (block, state) => {
  const range = block.params.range ?? 120;
  state.spawnVfx("conduct_pulse", block.x, block.y, { range });
  const nearby = nearbyBlocks(state, block.x, block.y, range, block);
  for (const nb of nearby) {
    nb.hp -= 1;
    if (nb.hp <= 0 && nb.alive) {
      state.chainDepth += 1;
      state.destroyBlock(nb);
    }
  }
});

/** Nonmetal: generic state change – slight ball speed boost */
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

/** Lanthanide: rare support – score bonus + brief ball powerup */
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

/** Actinide: radiation – area damage like explosion */
register("radiation", (block, state) => {
  const r = block.params.radius ?? 130;
  state.spawnVfx("radiation_burst", block.x, block.y, { radius: r });
  const nearby = nearbyBlocks(state, block.x, block.y, r, block);
  for (const nb of nearby) {
    nb.hp -= 1;
    if (nb.hp <= 0 && nb.alive) {
      state.chainDepth += 1;
      state.destroyBlock(nb);
    }
  }
});

/** Heavy block (Pb): slows ball on hit */
register("heavy_block", (block, state) => {
  const reduction = block.params.speedReduction ?? 0.7;
  const dur = 2000;
  state.ball.speed = state.ball.baseSpeed * reduction;
  state.spawnVfx("heavy_impact", block.x, block.y);
  state.timedEffects.push({
    key: "heavy_block",
    endTime: state.now + dur,
    revert: () => { state.ball.speed = state.ball.baseSpeed; },
  });
});

/** Slippery (Hg): random slight angle distortion */
register("slippery", (block, state) => {
  const dur = block.params.duration ?? 2500;
  // Random angle shift
  const angle = (Math.random() - 0.5) * 0.4;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const nvx = state.ball.vx * cos - state.ball.vy * sin;
  const nvy = state.ball.vx * sin + state.ball.vy * cos;
  state.ball.vx = nvx;
  state.ball.vy = nvy;
  state.spawnVfx("none", block.x, block.y);
  // Brief speed wobble
  state.ball.speed = state.ball.baseSpeed * 0.9;
  state.timedEffects.push({
    key: "slippery",
    endTime: state.now + dur,
    revert: () => { state.ball.speed = state.ball.baseSpeed; },
  });
});
