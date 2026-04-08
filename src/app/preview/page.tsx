import { getBlockVisualStyle } from "@/game/blockColors";

const FAMILIES = [
  { key: "alkali", label: "알칼리금속", symbols: ["Li","Na","K"] },
  { key: "alkalineEarth", label: "알칼리토금속", symbols: ["Be","Mg","Ca"] },
  { key: "transition", label: "전이금속", symbols: ["Fe","Cu","Au"] },
  { key: "postTransition", label: "후전이금속", symbols: ["Al","Sn","Pb"] },
  { key: "metalloid", label: "준금속", symbols: ["B","Si","Te"] },
  { key: "nonmetal", label: "비금속", symbols: ["H","C","O"] },
  { key: "halogen", label: "할로겐", symbols: ["F","Cl","Br"] },
  { key: "nobleGas", label: "비활성기체", symbols: ["He","Ne","Ar"] },
  { key: "lanthanide", label: "란타넘족", symbols: ["La","Nd","Eu"] },
  { key: "actinide", label: "악티늄족", symbols: ["U","Pu","Am"] },
];

export default function Preview() {
  return (
    <div className="min-h-screen bg-black text-white p-4" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <h1 className="text-2xl font-bold text-center mb-6">블록 색상 미리보기 (Level 1~7)</h1>

      {FAMILIES.map(({ key, label, symbols }) => (
        <div key={key} className="mb-6">
          <h2 className="text-sm font-bold text-zinc-400 mb-2">{label} ({key})</h2>
          <div className="flex gap-1">
            {[1,2,3,4,5,6,7].map(lv => {
              const vs = getBlockVisualStyle(symbols[0], lv);
              return (
                <div key={lv} className="flex flex-col items-center gap-1">
                  <span className="text-[9px] text-zinc-500">Lv.{lv}</span>
                  <div className="w-12 h-12 rounded flex flex-col items-center justify-center"
                    style={{
                      background: vs.fillColor,
                      border: `1px solid ${vs.borderColor}`,
                      boxShadow: `0 0 8px ${vs.glowColor}`,
                    }}>
                    <span className="text-[8px] opacity-50" style={{ color: vs.textColor }}>{symbols[0]}</span>
                  </div>
                  <span className="text-[7px] text-zinc-600">{vs.fillColor}</span>
                </div>
              );
            })}
          </div>
          {/* Sample elements at Lv4 */}
          <div className="flex gap-1 mt-1">
            {symbols.map(s => {
              const vs = getBlockVisualStyle(s, 4);
              return (
                <div key={s} className="w-10 h-10 rounded flex flex-col items-center justify-center"
                  style={{
                    background: vs.fillColor,
                    border: `1px solid ${vs.borderColor}`,
                    boxShadow: `0 0 6px ${vs.glowColor}`,
                  }}>
                  <span className="text-[7px] opacity-50" style={{ color: vs.textColor }}>Lv4</span>
                  <span className="text-[10px] font-bold" style={{ color: vs.textColor }}>{s}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
