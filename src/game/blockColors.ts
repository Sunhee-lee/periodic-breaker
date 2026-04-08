// ============================================================
// Element Breaker – Block Color System v3
// Family base color + Level tint overlay/blend
// Level 1 = pure family color
// Level 2~7 = family + increasingly strong level tint
// ============================================================

// ── Family base palettes (Lv1 color) ──

const FAMILY_BASE_COLORS: Record<string, string> = {
  alkali:         "#C93A36",
  alkalineEarth:  "#C77918",
  transition:     "#2A67B8",
  postTransition: "#5268BF",
  metalloid:      "#2A8A85",
  nonmetal:       "#2E8E3C",
  halogen:        "#8345B5",
  nobleGas:       "#2A89A8",
  lanthanide:     "#BC4297",
  actinide:       "#BE3A77",
};

// ── Level tint colors ──

const LEVEL_TINTS: (string | null)[] = [
  null,       // Lv1: no tint, pure family color
  "#4D8DFF",  // Lv2: blue
  "#45D96B",  // Lv3: green
  "#FFD84A",  // Lv4: yellow
  "#FF9F43",  // Lv5: orange
  "#FF5A5F",  // Lv6: red
  "#F8FBFF",  // Lv7: white glow
];

// ── Level blend ratios ──

const LEVEL_BLEND_RATIO = [0.00, 0.22, 0.32, 0.45, 0.58, 0.72, 0.82];

// ── Symbol → family mapping ──

const SYMBOL_FAMILY: Record<string, string> = {};

const FAMILY_SYMBOLS: Record<string, string[]> = {
  alkali:         ["Li","Na","K","Rb","Cs","Fr"],
  alkalineEarth:  ["Be","Mg","Ca","Sr","Ba","Ra"],
  transition:     ["Sc","Ti","V","Cr","Mn","Fe","Co","Ni","Cu","Zn","Y","Zr","Nb","Mo","Tc","Ru","Rh","Pd","Ag","Cd","Hf","Ta","W","Re","Os","Ir","Pt","Au","Hg","Rf","Db","Sg","Bh","Hs","Mt","Ds","Rg","Cn"],
  postTransition: ["Al","Ga","In","Sn","Tl","Pb","Bi","Nh","Fl","Mc","Lv"],
  metalloid:      ["B","Si","Ge","As","Sb","Te","Po"],
  nonmetal:       ["H","C","N","O","P","S","Se"],
  halogen:        ["F","Cl","Br","I","At","Ts"],
  nobleGas:       ["He","Ne","Ar","Kr","Xe","Rn","Og"],
  lanthanide:     ["La","Ce","Pr","Nd","Pm","Sm","Eu","Gd","Tb","Dy","Ho","Er","Tm","Yb","Lu"],
  actinide:       ["Ac","Th","Pa","U","Np","Pu","Am","Cm","Bk","Cf","Es","Fm","Md","No","Lr"],
};

for (const [family, symbols] of Object.entries(FAMILY_SYMBOLS)) {
  for (const s of symbols) SYMBOL_FAMILY[s] = family;
}

// ── Helper functions ──

function parseHex(hex: string): [number, number, number] {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return [128, 128, 128];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Blend two hex colors. ratio=0 → all color1, ratio=1 → all color2 */
export function blendColors(hex1: string, hex2: string, ratio: number): string {
  const [r1, g1, b1] = parseHex(hex1);
  const [r2, g2, b2] = parseHex(hex2);
  return toHex(
    r1 + (r2 - r1) * ratio,
    g1 + (g2 - g1) * ratio,
    b1 + (b2 - b1) * ratio,
  );
}

export function lightenColor(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Public API ──

export function getElementFamily(symbol: string): string {
  return SYMBOL_FAMILY[symbol] ?? "nonmetal";
}

export function getFamilyBaseColor(symbol: string): string {
  const family = getElementFamily(symbol);
  return FAMILY_BASE_COLORS[family] ?? FAMILY_BASE_COLORS.nonmetal;
}

export function getLevelTint(level: number): string | null {
  const idx = Math.max(0, Math.min(6, level - 1));
  return LEVEL_TINTS[idx];
}

export function getBlockFillColor(symbol: string, level: number): string {
  const base = getFamilyBaseColor(symbol);
  const idx = Math.max(0, Math.min(6, level - 1));
  const tint = LEVEL_TINTS[idx];
  if (!tint) return base; // Lv1
  return blendColors(base, tint, LEVEL_BLEND_RATIO[idx]);
}

export interface BlockVisualStyle {
  symbol: string;
  family: string;
  level: number;
  fillColor: string;
  borderColor: string;
  glowColor: string;
  hitFlashColor: string;
  textColor: string;
  borderWidth: number;
  accentColor: string;
}

export function getBlockVisualStyle(symbol: string, level: number): BlockVisualStyle {
  const family = getElementFamily(symbol);
  const baseColor = FAMILY_BASE_COLORS[family] ?? FAMILY_BASE_COLORS.nonmetal;
  const fillColor = getBlockFillColor(symbol, level);

  // Border: family base color, lightened slightly
  const borderColor = lightenColor(baseColor, 0.25);

  // Accent: family base
  const accentColor = baseColor;

  // Glow: fill-based, stronger at higher levels
  const glowAlpha = level <= 2 ? 0.25 : level <= 4 ? 0.4 : 0.6;
  const glowColor = hexToRgba(fillColor, glowAlpha);

  // Hit flash
  const hitFlashColor = lightenColor(fillColor, 0.4);

  // Border width scales with level
  const borderWidth = level <= 2 ? 1 : level <= 4 ? 1.5 : 2;

  // Lv7: nearly white fill → use dark text shadow for readability
  const textColor = level >= 7 ? "#1a1a2e" : "#F8FAFF";

  return {
    symbol,
    family,
    level,
    fillColor,
    borderColor,
    glowColor,
    hitFlashColor,
    textColor,
    borderWidth,
    accentColor,
  };
}
