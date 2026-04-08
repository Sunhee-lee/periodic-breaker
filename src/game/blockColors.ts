// ============================================================
// Element Breaker – Block Color System
// Colors based on periodic table element families,
// intensifying with game level (1–7).
// ============================================================

// ── Family palettes: level 1 (darkest) → level 7 (brightest) ──

const FAMILY_PALETTES: Record<string, string[]> = {
  alkali:         ["#7A2323","#A33030","#C93A36","#E44B42","#F76154","#FF7A66","#FF9B85"],
  alkalineEarth:  ["#7A4A12","#9D6115","#C77918","#E3921F","#F5AA3A","#FFBF63","#FFD28E"],
  transition:     ["#1E3C73","#245093","#2A67B8","#3780D8","#5498F0","#74B0FF","#9AC8FF"],
  postTransition: ["#34437A","#41539A","#5268BF","#637EE0","#7C96F5","#9BB1FF","#BACBFF"],
  metalloid:      ["#1B5B59","#23716F","#2A8A85","#34A39D","#4CBDB6","#6ED5CF","#98EBE6"],
  nonmetal:       ["#1E5A2B","#277333","#2E8E3C","#38A947","#4FC15D","#72D97F","#9BEFA4"],
  halogen:        ["#553073","#6A3891","#8345B5","#9B55D4","#B370EE","#CA95FF","#E0BCFF"],
  nobleGas:       ["#1E5C71","#24708A","#2A89A8","#33A3C7","#4DBDE0","#75D5F2","#A3EBFF"],
  lanthanide:     ["#7A2E6A","#98377F","#BC4297","#D955AF","#EE72C4","#FFA1DA","#FFC8EB"],
  actinide:       ["#7A274B","#9A2F60","#BE3A77","#DB4C90","#F368AA","#FF90C0","#FFBAD8"],
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

// Build reverse map
for (const [family, symbols] of Object.entries(FAMILY_SYMBOLS)) {
  for (const s of symbols) SYMBOL_FAMILY[s] = family;
}

// ── Helper functions ──

export function getElementFamily(symbol: string): string {
  return SYMBOL_FAMILY[symbol] ?? "nonmetal";
}

/** Lighten a hex color by amount (0–1). 0.15 = 15% brighter */
export function lightenColor(hex: string, amount: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const r = Math.min(255, Math.round(parseInt(m[1], 16) + (255 - parseInt(m[1], 16)) * amount));
  const g = Math.min(255, Math.round(parseInt(m[2], 16) + (255 - parseInt(m[2], 16)) * amount));
  const b = Math.min(255, Math.round(parseInt(m[3], 16) + (255 - parseInt(m[3], 16)) * amount));
  return `rgb(${r},${g},${b})`;
}

/** Convert hex to rgba string */
export function hexToRgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return `rgba(128,128,128,${alpha})`;
  return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${alpha})`;
}

export function getBlockFillColor(symbol: string, level: number): string {
  const family = getElementFamily(symbol);
  const palette = FAMILY_PALETTES[family] ?? FAMILY_PALETTES.nonmetal;
  const idx = Math.max(0, Math.min(6, level - 1));
  return palette[idx];
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
}

export function getBlockVisualStyle(symbol: string, level: number): BlockVisualStyle {
  const family = getElementFamily(symbol);
  const fillColor = getBlockFillColor(symbol, level);

  // Border: 15-20% brighter than fill
  const borderColor = lightenColor(fillColor, 0.18);

  // Glow: intensity scales with level
  const glowAlpha = level <= 2 ? 0.3 : level <= 4 ? 0.45 : 0.65;
  const glowColor = hexToRgba(fillColor, glowAlpha);

  // Hit flash: 40% brighter
  const hitFlashColor = lightenColor(fillColor, 0.4);

  return {
    symbol,
    family,
    level,
    fillColor,
    borderColor,
    glowColor,
    hitFlashColor,
    textColor: "#F8FAFF",
  };
}
