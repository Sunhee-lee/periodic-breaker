// ============================================================
// Element Breaker – Block Color System v2
// Level = main fill color (strong visual progression)
// Family = accent/border color (identity preserved)
// ============================================================

// ── Level base colors: strong visual progression 1→7 ──

const LEVEL_BASE_COLORS = [
  "#5C6B73", // Lv1 — slate gray
  "#4A90E2", // Lv2 — blue
  "#2EC4B6", // Lv3 — teal
  "#8AC926", // Lv4 — lime green
  "#FFCA3A", // Lv5 — yellow
  "#FF924C", // Lv6 — orange
  "#FF595E", // Lv7 — red
];

// ── Family accent colors: identity via border/glow ──

const FAMILY_ACCENT_COLORS: Record<string, string> = {
  alkali:         "#D94F4F",
  alkalineEarth:  "#E39A3B",
  transition:     "#4D7CFE",
  postTransition: "#7B8CFF",
  metalloid:      "#33C3B3",
  nonmetal:       "#57C84D",
  halogen:        "#A66CFF",
  nobleGas:       "#59D9FF",
  lanthanide:     "#F472D0",
  actinide:       "#FF6FAE",
};

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

export function getElementFamily(symbol: string): string {
  return SYMBOL_FAMILY[symbol] ?? "nonmetal";
}

export function getLevelBaseColor(level: number): string {
  const idx = Math.max(0, Math.min(LEVEL_BASE_COLORS.length - 1, level - 1));
  return LEVEL_BASE_COLORS[idx];
}

export function getFamilyAccentColor(symbol: string): string {
  const family = getElementFamily(symbol);
  return FAMILY_ACCENT_COLORS[family] ?? "#57C84D";
}

export function lightenColor(hex: string, amount: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const r = Math.min(255, Math.round(parseInt(m[1], 16) + (255 - parseInt(m[1], 16)) * amount));
  const g = Math.min(255, Math.round(parseInt(m[2], 16) + (255 - parseInt(m[2], 16)) * amount));
  const b = Math.min(255, Math.round(parseInt(m[3], 16) + (255 - parseInt(m[3], 16)) * amount));
  return `rgb(${r},${g},${b})`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return `rgba(128,128,128,${alpha})`;
  return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${alpha})`;
}

export interface BlockVisualStyle {
  symbol: string;
  family: string;
  level: number;
  fillColor: string;
  borderColor: string;
  accentColor: string;
  glowColor: string;
  symbolGlowColor: string;
  hitFlashColor: string;
  textColor: string;
  borderWidth: number;
}

export function getBlockVisualStyle(symbol: string, level: number): BlockVisualStyle {
  const family = getElementFamily(symbol);
  const fillColor = getLevelBaseColor(level);
  const accentColor = FAMILY_ACCENT_COLORS[family] ?? "#57C84D";

  // Border = family accent
  const borderColor = accentColor;

  // Glow based on fill, intensity scales with level
  const glowAlpha = level <= 2 ? 0.25 : level <= 4 ? 0.4 : 0.6;
  const glowColor = hexToRgba(fillColor, glowAlpha);

  // Symbol glow = family accent glow
  const symGlowAlpha = level <= 2 ? 0.3 : level <= 4 ? 0.5 : 0.7;
  const symbolGlowColor = hexToRgba(accentColor, symGlowAlpha);

  // Hit flash = lighter fill
  const hitFlashColor = lightenColor(fillColor, 0.4);

  // Border thickness scales with level
  const borderWidth = level <= 2 ? 1 : level <= 4 ? 1.5 : 2;

  return {
    symbol,
    family,
    level,
    fillColor,
    borderColor,
    accentColor,
    glowColor,
    symbolGlowColor,
    hitFlashColor,
    textColor: "#F8FAFF",
    borderWidth,
  };
}
