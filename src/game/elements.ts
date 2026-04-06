// ============================================================
// Periodic Breaker – Element Block Builder
//
// 4-layer architecture:
//   1. elementBaseData   → pure periodic table data (118 elements)
//   2. categoryRules     → default effect/group/durability per category
//   3. overrides         → 23 hand-crafted unique elements
//   4. buildElementBlocks() → merges all layers into final ElementDef[]
// ============================================================

import { BASE_ELEMENTS, type ElementCategory, type BaseElement } from "./elementBaseData";

// ── Re-exports for backward compatibility ─────────────────
export type { ElementCategory } from "./elementBaseData";

export type ElementGroup = "attack" | "defense" | "utility" | "debuff" | "score";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type VfxKey =
  | "explosion_red" | "explosion_orange" | "chain_lightning" | "fast_explosion"
  | "shard_splash" | "none" | "sharp_reflect" | "shield_blue"
  | "lift_white" | "slow_blue" | "powerup_gold" | "neon_bounce"
  | "trajectory_line" | "trail_fire" | "corrosion_green" | "gas_yellow"
  | "paddle_shrink" | "freeze_ice" | "flash_white" | "boss_shatter"
  | "metal_reflect" | "dense_block" | "radiation_burst" | "rare_sparkle"
  | "conduct_pulse" | "heavy_impact" | "score_glow" | "phase_through"
  | "explosion_hydrogen" | "explosion_lithium" | "explosion_sodium"
  | "explosion_potassium" | "explosion_rubidium" | "explosion_cesium"
  | "paddle_grow";

export interface EffectParams {
  radius?: number;
  chain?: boolean;
  fastTrigger?: boolean;
  targets?: number;
  range?: number;
  shardCount?: number;
  durability?: number;
  reflectMultiplier?: number;
  duration?: number;
  upwardBoost?: number;
  slowMultiplier?: number;
  sizeMultiplier?: number;
  bouncePower?: number;
  guideBounces?: number;
  interval?: number;
  durabilityDown?: number;
  zoneHeight?: number;
  paddleSpeedMultiplier?: number;
  scale?: number;
  multiplier?: number;
  bonus?: number;
  clearOnBreak?: boolean;
  conductBoost?: number;
  speedReduction?: number;
}

export interface ElementDef {
  atomicNumber: number;
  symbol: string;
  name: string;
  category: ElementCategory;
  group: ElementGroup;
  rarity: Rarity;
  breakable: boolean;
  durability: number;
  effect: string;
  params: EffectParams;
  vfx: VfxKey;
  row: number;
  col: number;
}

// ────────────────────────────────────────────────────────────
//  Color palette per group
// ────────────────────────────────────────────────────────────

export const GROUP_COLORS: Record<
  ElementGroup,
  { fill: string; glow: string; text: string; border: string }
> = {
  attack:  { fill: "#dc2626", glow: "rgba(220,38,38,0.5)",  text: "#fecaca", border: "#f87171" },
  defense: { fill: "#3b82f6", glow: "rgba(59,130,246,0.5)", text: "#dbeafe", border: "#60a5fa" },
  utility: { fill: "#8b5cf6", glow: "rgba(139,92,246,0.5)", text: "#ede9fe", border: "#a78bfa" },
  debuff:  { fill: "#65a30d", glow: "rgba(101,163,13,0.5)", text: "#ecfccb", border: "#84cc16" },
  score:   { fill: "#eab308", glow: "rgba(234,179,8,0.5)",  text: "#fef9c3", border: "#facc15" },
};

// ────────────────────────────────────────────────────────────
//  Layer 2: Category Rules
// ────────────────────────────────────────────────────────────

interface CategoryRule {
  group: ElementGroup;
  effect: string;
  vfx: VfxKey;
  baseDurability: number;
  /** Durability scales with period: base + floor(period * scale) */
  durabilityScale: number;
  baseRarity: Rarity;
  buildParams: (el: BaseElement) => EffectParams;
}

const CATEGORY_RULES: Record<ElementCategory, CategoryRule> = {
  alkali_metal: {
    group: "attack",
    effect: "explosion",
    vfx: "explosion_orange",
    baseDurability: 1,
    durabilityScale: 0,
    baseRarity: "uncommon",
    buildParams: () => ({}),
  },
  alkaline_earth_metal: {
    group: "defense",
    effect: "shard_splash",
    vfx: "shard_splash",
    baseDurability: 1,
    durabilityScale: 0.15,
    baseRarity: "common",
    buildParams: (el) => ({
      shardCount: 2 + el.period,
      range: 30 + el.period * 5,
    }),
  },
  transition_metal: {
    group: "defense",
    effect: "metal_reflect",
    vfx: "metal_reflect",
    baseDurability: 1,
    durabilityScale: 0.12,
    baseRarity: "common",
    buildParams: (el) => ({
      reflectMultiplier: 1.0 + el.period * 0.05,
    }),
  },
  post_transition_metal: {
    group: "score",
    effect: "score_block",
    vfx: "score_glow",
    baseDurability: 1,
    durabilityScale: 0.2,
    baseRarity: "common",
    buildParams: (el) => ({
      bonus: 50 + el.period * 30,
    }),
  },
  metalloid: {
    group: "utility",
    effect: "conduct",
    vfx: "conduct_pulse",
    baseDurability: 1,
    durabilityScale: 0.15,
    baseRarity: "uncommon",
    buildParams: (el) => ({
      duration: 1500 + el.period * 200,
    }),
  },
  nonmetal: {
    group: "utility",
    effect: "state_change",
    vfx: "none",
    baseDurability: 1,
    durabilityScale: 0,
    baseRarity: "common",
    buildParams: (el) => ({
      duration: 1500 + el.period * 200,
    }),
  },
  halogen: {
    group: "debuff",
    effect: "corrosion",
    vfx: "corrosion_green",
    baseDurability: 1,
    durabilityScale: 0,
    baseRarity: "uncommon",
    buildParams: (el) => ({
      duration: 2000 + el.period * 300,
    }),
  },
  noble_gas: {
    group: "utility",
    effect: "bounce",
    vfx: "neon_bounce",
    baseDurability: 1,
    durabilityScale: 0,
    baseRarity: "rare",
    buildParams: (el) => ({
      bouncePower: 1.1 + el.period * 0.02,
    }),
  },
  lanthanide: {
    group: "utility",
    effect: "rare_support",
    vfx: "rare_sparkle",
    baseDurability: 1,
    durabilityScale: 0.1,
    baseRarity: "rare",
    buildParams: () => ({
      duration: 3000,
      bonus: 200,
    }),
  },
  actinide: {
    group: "attack",
    effect: "radioactive_pierce",
    vfx: "radiation_burst",
    baseDurability: 1,
    durabilityScale: 0.1,
    baseRarity: "epic",
    buildParams: () => ({}),
  },
};

// ────────────────────────────────────────────────────────────
//  Layer 3: Element Overrides (23 hand-crafted elements)
// ────────────────────────────────────────────────────────────

type PartialOverride = Partial<Pick<ElementDef, "group" | "effect" | "vfx" | "durability" | "rarity" | "breakable">> & { params?: EffectParams };

const OVERRIDES: Record<number, PartialOverride> = {
  // ── ATTACK ──
  // Explosive (H + alkali metals) — element-specific colored explosions
  1:  { group: "attack",  effect: "hydrogen_explosion",   vfx: "explosion_hydrogen", params: { radius: 80 } },  // 수소: 주변 블록 폭파
  3:  { group: "attack",  effect: "explosion",           vfx: "explosion_lithium" },     // 진홍색 (리튬 불꽃)
  11: { group: "attack",  effect: "explosion",           vfx: "explosion_sodium" },      // 노란색 (나트륨 불꽃)
  19: { group: "attack",  effect: "explosion",           vfx: "explosion_potassium" },   // 보라색 (칼륨 불꽃)
  37: { group: "attack",  effect: "explosion",           vfx: "explosion_rubidium" },    // 붉은-주황 (루비듐 불꽃)
  55: { group: "attack",  effect: "explosion",           vfx: "explosion_cesium" },      // 파란색 (세슘 불꽃)
  // Radioactive — ball goes neon + pierce until paddle
  92: { group: "attack",  effect: "radioactive_pierce",  vfx: "radiation_burst",  rarity: "legendary", durability: 2 },
  94: { group: "attack",  effect: "radioactive_pierce",  vfx: "radiation_burst",  rarity: "legendary", durability: 2 },

  // ── DEFENSE ──
  4:  { group: "defense",  effect: "shard_splash",   vfx: "shard_splash",   durability: 2, params: { shardCount: 4, range: 50 } },
  6:  { group: "defense",  effect: "none",           vfx: "none",           durability: 3, rarity: "rare" },
  13: { group: "defense",  effect: "sharp_reflect",  vfx: "sharp_reflect",  durability: 2, params: { reflectMultiplier: 1.25 } },
  47: { group: "defense",  effect: "sharp_reflect",  vfx: "sharp_reflect",  durability: 2, rarity: "epic", params: { reflectMultiplier: 1.35 } },
  82: { group: "defense",  effect: "heavy_block",    vfx: "heavy_impact",   durability: 3, rarity: "epic", params: { speedReduction: 0.7 } },
  // Radioactive main-group elements
  84: { group: "attack",  effect: "radioactive_pierce", vfx: "radiation_burst" },
  85: { group: "attack",  effect: "radioactive_pierce", vfx: "radiation_burst" },
  86: { group: "attack",  effect: "radioactive_pierce", vfx: "radiation_burst" },
  87: { group: "attack",  effect: "radioactive_pierce", vfx: "radiation_burst" },
  88: { group: "attack",  effect: "radioactive_pierce", vfx: "radiation_burst" },

  // ── UTILITY ──
  2:  { group: "utility",  effect: "ball_powerup",     vfx: "powerup_gold",    params: { sizeMultiplier: 1.8, duration: 10000 } }, // He — 헬륨풍선, 공이 커짐
  5:  { group: "utility",  effect: "slow_control",     vfx: "slow_blue",       params: { slowMultiplier: 0.75, duration: 1500 } },
  8:  { group: "utility",  effect: "ball_powerup",     vfx: "powerup_gold",    params: { sizeMultiplier: 1.3, duration: 2500 } },
  10: { group: "utility",  effect: "bounce",           vfx: "neon_bounce",     params: { bouncePower: 1.15 } },
  14: { group: "utility",  effect: "trajectory_guide", vfx: "trajectory_line", params: { duration: 4000, guideBounces: 3 } },
  15: { group: "utility",  effect: "trail_damage",     vfx: "trail_fire",      params: { duration: 2000, interval: 120 } },
  18: { group: "defense",  effect: "floor_shield",     vfx: "shield_blue",     params: { duration: 4000 } },
  80: { group: "debuff",   effect: "slippery",         vfx: "none",            rarity: "rare", params: { duration: 2500 } },

  // ── DEBUFF ──
  9:  { group: "debuff", effect: "corrosion",     vfx: "corrosion_green", params: { duration: 3000 } },
  16: { group: "debuff", effect: "gas_zone",      vfx: "gas_yellow",      params: { zoneHeight: 100, duration: 3000, paddleSpeedMultiplier: 0.8 } },
  17: { group: "debuff", effect: "paddle_debuff", vfx: "paddle_shrink",   params: { scale: 0.8, duration: 3000 } },

  // ── SCORE ──
  7:  { group: "score", effect: "freeze_score", vfx: "freeze_ice",  params: { multiplier: 1.5, duration: 3000 } },
  12: { group: "score", effect: "flash_bonus",  vfx: "flash_white", params: { bonus: 500 } },  // Mg — 섬광 점수 보너스
  79: { group: "score", effect: "flash_bonus",  vfx: "flash_white", rarity: "legendary", params: { bonus: 2000 } },

  // Ca — alkaline earth defense
  20: { group: "defense", effect: "shard_splash", vfx: "shard_splash", durability: 2, rarity: "uncommon", params: { shardCount: 6, range: 40 } },
};

// ────────────────────────────────────────────────────────────
//  Layer 4: buildElementBlocks()
// ────────────────────────────────────────────────────────────

function computeRarity(base: Rarity, z: number): Rarity {
  if (z > 103) return "epic";
  if (z > 86) return base === "common" ? "uncommon" : base;
  return base;
}

function computeDurability(rule: CategoryRule, el: BaseElement): number {
  return Math.max(1, rule.baseDurability + Math.floor(el.period * rule.durabilityScale));
}

export function buildElementBlocks(): ElementDef[] {
  return BASE_ELEMENTS.map((el) => {
    const rule = CATEGORY_RULES[el.category];
    const over = OVERRIDES[el.z];

    // Start from category rule defaults
    const def: ElementDef = {
      atomicNumber: el.z,
      symbol: el.symbol,
      name: el.name,
      category: el.category,
      group: over?.group ?? rule.group,
      rarity: over?.rarity ?? computeRarity(rule.baseRarity, el.z),
      breakable: over?.breakable ?? true,
      durability: over?.durability ?? computeDurability(rule, el),
      effect: over?.effect ?? rule.effect,
      params: over?.params ?? rule.buildParams(el),
      vfx: over?.vfx ?? rule.vfx,
      row: el.row,
      col: el.col,
    };

    return def;
  });
}

// ── Exported constants ────────────────────────────────────

export const ELEMENTS = buildElementBlocks();

export const DESTROYABLE_COUNT = ELEMENTS.filter((e) => e.breakable).length;
