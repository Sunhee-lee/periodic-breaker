// ============================================================
// Layer 1: elementBaseData — all 118 elements with periodic
// table metadata.  Pure reference data, no game logic.
// ============================================================

export type ElementCategory =
  | "alkali_metal"
  | "alkaline_earth_metal"
  | "transition_metal"
  | "post_transition_metal"
  | "metalloid"
  | "nonmetal"
  | "halogen"
  | "noble_gas"
  | "lanthanide"
  | "actinide";

export interface BaseElement {
  z: number;        // atomic number
  symbol: string;
  name: string;
  category: ElementCategory;
  group: number;    // IUPAC group 1-18  (0 = lanthanide/actinide)
  period: number;   // 1-7
  row: number;      // display row in 18-col grid (1-9, 8/9 = Ln/Ac rows)
  col: number;      // display col 1-18
}

// Helper to build entries concisely
function e(
  z: number, symbol: string, name: string,
  category: ElementCategory, group: number, period: number,
  row: number, col: number,
): BaseElement {
  return { z, symbol, name, category, group, period, row, col };
}

export const BASE_ELEMENTS: BaseElement[] = [
  // ── Period 1 ──
  e(1,"H","Hydrogen","nonmetal",1,1, 1,1),
  e(2,"He","Helium","noble_gas",18,1, 1,18),
  // ── Period 2 ──
  e(3,"Li","Lithium","alkali_metal",1,2, 2,1),
  e(4,"Be","Beryllium","alkaline_earth_metal",2,2, 2,2),
  e(5,"B","Boron","metalloid",13,2, 2,13),
  e(6,"C","Carbon","nonmetal",14,2, 2,14),
  e(7,"N","Nitrogen","nonmetal",15,2, 2,15),
  e(8,"O","Oxygen","nonmetal",16,2, 2,16),
  e(9,"F","Fluorine","halogen",17,2, 2,17),
  e(10,"Ne","Neon","noble_gas",18,2, 2,18),
  // ── Period 3 ──
  e(11,"Na","Sodium","alkali_metal",1,3, 3,1),
  e(12,"Mg","Magnesium","alkaline_earth_metal",2,3, 3,2),
  e(13,"Al","Aluminium","post_transition_metal",13,3, 3,13),
  e(14,"Si","Silicon","metalloid",14,3, 3,14),
  e(15,"P","Phosphorus","nonmetal",15,3, 3,15),
  e(16,"S","Sulfur","nonmetal",16,3, 3,16),
  e(17,"Cl","Chlorine","halogen",17,3, 3,17),
  e(18,"Ar","Argon","noble_gas",18,3, 3,18),
  // ── Period 4 ──
  e(19,"K","Potassium","alkali_metal",1,4, 4,1),
  e(20,"Ca","Calcium","alkaline_earth_metal",2,4, 4,2),
  e(21,"Sc","Scandium","transition_metal",3,4, 4,3),
  e(22,"Ti","Titanium","transition_metal",4,4, 4,4),
  e(23,"V","Vanadium","transition_metal",5,4, 4,5),
  e(24,"Cr","Chromium","transition_metal",6,4, 4,6),
  e(25,"Mn","Manganese","transition_metal",7,4, 4,7),
  e(26,"Fe","Iron","transition_metal",8,4, 4,8),
  e(27,"Co","Cobalt","transition_metal",9,4, 4,9),
  e(28,"Ni","Nickel","transition_metal",10,4, 4,10),
  e(29,"Cu","Copper","transition_metal",11,4, 4,11),
  e(30,"Zn","Zinc","transition_metal",12,4, 4,12),
  e(31,"Ga","Gallium","post_transition_metal",13,4, 4,13),
  e(32,"Ge","Germanium","metalloid",14,4, 4,14),
  e(33,"As","Arsenic","metalloid",15,4, 4,15),
  e(34,"Se","Selenium","nonmetal",16,4, 4,16),
  e(35,"Br","Bromine","halogen",17,4, 4,17),
  e(36,"Kr","Krypton","noble_gas",18,4, 4,18),
  // ── Period 5 ──
  e(37,"Rb","Rubidium","alkali_metal",1,5, 5,1),
  e(38,"Sr","Strontium","alkaline_earth_metal",2,5, 5,2),
  e(39,"Y","Yttrium","transition_metal",3,5, 5,3),
  e(40,"Zr","Zirconium","transition_metal",4,5, 5,4),
  e(41,"Nb","Niobium","transition_metal",5,5, 5,5),
  e(42,"Mo","Molybdenum","transition_metal",6,5, 5,6),
  e(43,"Tc","Technetium","transition_metal",7,5, 5,7),
  e(44,"Ru","Ruthenium","transition_metal",8,5, 5,8),
  e(45,"Rh","Rhodium","transition_metal",9,5, 5,9),
  e(46,"Pd","Palladium","transition_metal",10,5, 5,10),
  e(47,"Ag","Silver","transition_metal",11,5, 5,11),
  e(48,"Cd","Cadmium","transition_metal",12,5, 5,12),
  e(49,"In","Indium","post_transition_metal",13,5, 5,13),
  e(50,"Sn","Tin","post_transition_metal",14,5, 5,14),
  e(51,"Sb","Antimony","metalloid",15,5, 5,15),
  e(52,"Te","Tellurium","metalloid",16,5, 5,16),
  e(53,"I","Iodine","halogen",17,5, 5,17),
  e(54,"Xe","Xenon","noble_gas",18,5, 5,18),
  // ── Period 6 ──
  e(55,"Cs","Caesium","alkali_metal",1,6, 6,1),
  e(56,"Ba","Barium","alkaline_earth_metal",2,6, 6,2),
  // Lanthanides (z 57-71) → display row 8
  e(57,"La","Lanthanum","lanthanide",0,6, 8,3),
  e(58,"Ce","Cerium","lanthanide",0,6, 8,4),
  e(59,"Pr","Praseodymium","lanthanide",0,6, 8,5),
  e(60,"Nd","Neodymium","lanthanide",0,6, 8,6),
  e(61,"Pm","Promethium","lanthanide",0,6, 8,7),
  e(62,"Sm","Samarium","lanthanide",0,6, 8,8),
  e(63,"Eu","Europium","lanthanide",0,6, 8,9),
  e(64,"Gd","Gadolinium","lanthanide",0,6, 8,10),
  e(65,"Tb","Terbium","lanthanide",0,6, 8,11),
  e(66,"Dy","Dysprosium","lanthanide",0,6, 8,12),
  e(67,"Ho","Holmium","lanthanide",0,6, 8,13),
  e(68,"Er","Erbium","lanthanide",0,6, 8,14),
  e(69,"Tm","Thulium","lanthanide",0,6, 8,15),
  e(70,"Yb","Ytterbium","lanthanide",0,6, 8,16),
  e(71,"Lu","Lutetium","lanthanide",0,6, 8,17),
  // Back to period 6 main
  e(72,"Hf","Hafnium","transition_metal",4,6, 6,4),
  e(73,"Ta","Tantalum","transition_metal",5,6, 6,5),
  e(74,"W","Tungsten","transition_metal",6,6, 6,6),
  e(75,"Re","Rhenium","transition_metal",7,6, 6,7),
  e(76,"Os","Osmium","transition_metal",8,6, 6,8),
  e(77,"Ir","Iridium","transition_metal",9,6, 6,9),
  e(78,"Pt","Platinum","transition_metal",10,6, 6,10),
  e(79,"Au","Gold","transition_metal",11,6, 6,11),
  e(80,"Hg","Mercury","transition_metal",12,6, 6,12),
  e(81,"Tl","Thallium","post_transition_metal",13,6, 6,13),
  e(82,"Pb","Lead","post_transition_metal",14,6, 6,14),
  e(83,"Bi","Bismuth","post_transition_metal",15,6, 6,15),
  e(84,"Po","Polonium","post_transition_metal",16,6, 6,16),
  e(85,"At","Astatine","halogen",17,6, 6,17),
  e(86,"Rn","Radon","noble_gas",18,6, 6,18),
  // ── Period 7 ──
  e(87,"Fr","Francium","alkali_metal",1,7, 7,1),
  e(88,"Ra","Radium","alkaline_earth_metal",2,7, 7,2),
  // Actinides (z 89-103) → display row 9
  e(89,"Ac","Actinium","actinide",0,7, 9,3),
  e(90,"Th","Thorium","actinide",0,7, 9,4),
  e(91,"Pa","Protactinium","actinide",0,7, 9,5),
  e(92,"U","Uranium","actinide",0,7, 9,6),
  e(93,"Np","Neptunium","actinide",0,7, 9,7),
  e(94,"Pu","Plutonium","actinide",0,7, 9,8),
  e(95,"Am","Americium","actinide",0,7, 9,9),
  e(96,"Cm","Curium","actinide",0,7, 9,10),
  e(97,"Bk","Berkelium","actinide",0,7, 9,11),
  e(98,"Cf","Californium","actinide",0,7, 9,12),
  e(99,"Es","Einsteinium","actinide",0,7, 9,13),
  e(100,"Fm","Fermium","actinide",0,7, 9,14),
  e(101,"Md","Mendelevium","actinide",0,7, 9,15),
  e(102,"No","Nobelium","actinide",0,7, 9,16),
  e(103,"Lr","Lawrencium","actinide",0,7, 9,17),
  // Back to period 7 main
  e(104,"Rf","Rutherfordium","transition_metal",4,7, 7,4),
  e(105,"Db","Dubnium","transition_metal",5,7, 7,5),
  e(106,"Sg","Seaborgium","transition_metal",6,7, 7,6),
  e(107,"Bh","Bohrium","transition_metal",7,7, 7,7),
  e(108,"Hs","Hassium","transition_metal",8,7, 7,8),
  e(109,"Mt","Meitnerium","transition_metal",9,7, 7,9),
  e(110,"Ds","Darmstadtium","transition_metal",10,7, 7,10),
  e(111,"Rg","Roentgenium","transition_metal",11,7, 7,11),
  e(112,"Cn","Copernicium","transition_metal",12,7, 7,12),
  e(113,"Nh","Nihonium","post_transition_metal",13,7, 7,13),
  e(114,"Fl","Flerovium","post_transition_metal",14,7, 7,14),
  e(115,"Mc","Moscovium","post_transition_metal",15,7, 7,15),
  e(116,"Lv","Livermorium","post_transition_metal",16,7, 7,16),
  e(117,"Ts","Tennessine","halogen",17,7, 7,17),
  e(118,"Og","Oganesson","noble_gas",18,7, 7,18),
];
