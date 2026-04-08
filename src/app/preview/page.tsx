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
      <h1 className="text-2xl font-bold text-center mb-2">블록 색상 미리보기</h1>
      <p className="text-xs text-zinc-500 text-center mb-6">레벨 = 메인색 | 테두리 = 계열색</p>

      {/* Level color bar */}
      <div className="flex gap-1 justify-center mb-6">
        {[1,2,3,4,5,6,7].map(lv => {
          const vs = getBlockVisualStyle("H", lv);
          return (
            <div key={lv} className="flex flex-col items-center gap-1">
              <div className="w-12 h-8 rounded" style={{ background: vs.fillColor }} />
              <span className="text-[10px] text-zinc-400">Lv.{lv}</span>
            </div>
          );
        })}
      </div>

      {/* Each family across levels */}
      {FAMILIES.map(({ key, label, symbols }) => {
        const vs4 = getBlockVisualStyle(symbols[0], 4);
        return (
          <div key={key} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ background: vs4.accentColor }} />
              <h2 className="text-sm font-bold text-zinc-300">{label}</h2>
              <span className="text-[10px] text-zinc-600">accent: {vs4.accentColor}</span>
            </div>
            <div className="flex gap-1">
              {[1,2,3,4,5,6,7].map(lv => {
                const vs = getBlockVisualStyle(symbols[0], lv);
                return (
                  <div key={lv} className="flex flex-col items-center gap-0.5">
                    <div className="w-14 h-10 rounded flex flex-col items-center justify-center relative overflow-hidden"
                      style={{
                        background: vs.fillColor,
                        border: `${vs.borderWidth}px solid ${vs.borderColor}`,
                        boxShadow: `0 0 8px ${vs.glowColor}`,
                      }}>
                      {/* Top accent bar */}
                      <div className="absolute top-0 left-1 right-1 h-[2px]" style={{ background: vs.accentColor }} />
                      <span className="text-[7px] opacity-50" style={{ color: vs.textColor }}>Lv{lv}</span>
                      <span className="text-xs font-bold" style={{ color: vs.textColor }}>{symbols[0]}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Sample elements at Lv4 */}
            <div className="flex gap-1 mt-1">
              {symbols.map(s => {
                const vs = getBlockVisualStyle(s, 4);
                return (
                  <div key={s} className="w-12 h-10 rounded flex flex-col items-center justify-center relative overflow-hidden"
                    style={{
                      background: vs.fillColor,
                      border: `${vs.borderWidth}px solid ${vs.borderColor}`,
                      boxShadow: `0 0 6px ${vs.glowColor}`,
                    }}>
                    <div className="absolute top-0 left-1 right-1 h-[2px]" style={{ background: vs.accentColor }} />
                    <span className="text-xs font-bold" style={{ color: vs.textColor }}>{s}</span>
                  </div>
                );
              })}
              <span className="text-[9px] text-zinc-600 self-center ml-1">← Lv4</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
