import { getBlockVisualStyle, getBlockFillColor, getFamilyBaseColor } from "@/game/blockColors";

const SAMPLES = [
  { symbol: "H", label: "수소 (비금속)" },
  { symbol: "Na", label: "나트륨 (알칼리)" },
  { symbol: "Fe", label: "철 (전이금속)" },
  { symbol: "Cl", label: "염소 (할로겐)" },
  { symbol: "Ne", label: "네온 (비활성기체)" },
  { symbol: "U", label: "우라늄 (악티늄족)" },
  { symbol: "La", label: "란타넘 (란타넘족)" },
  { symbol: "Al", label: "알루미늄 (후전이)" },
  { symbol: "Si", label: "규소 (준금속)" },
  { symbol: "Ca", label: "칼슘 (알칼리토)" },
];

export default function Preview() {
  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white p-4" style={{ fontFamily: "'Pretendard', sans-serif" }}>
      <h1 className="text-xl font-bold text-center mb-1">블록 색상 미리보기 v3</h1>
      <p className="text-[10px] text-zinc-500 text-center mb-4">Family 기본색 + Level 틴트 블렌딩</p>

      {SAMPLES.map(({ symbol, label }) => {
        const base = getFamilyBaseColor(symbol);
        return (
          <div key={symbol} className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-4 h-4 rounded" style={{ background: base }} />
              <span className="text-xs font-bold text-zinc-300">{label}</span>
              <span className="text-[9px] text-zinc-600">base: {base}</span>
            </div>
            <div className="flex gap-1">
              {[1,2,3,4,5,6,7].map(lv => {
                const vs = getBlockVisualStyle(symbol, lv);
                const fill = getBlockFillColor(symbol, lv);
                return (
                  <div key={lv} className="flex flex-col items-center gap-0.5">
                    <span className="text-[8px] text-zinc-500">Lv.{lv}</span>
                    <div className="w-14 h-12 rounded flex flex-col items-center justify-center relative overflow-hidden"
                      style={{
                        background: vs.fillColor,
                        border: `${vs.borderWidth}px solid ${vs.borderColor}`,
                        boxShadow: `0 0 10px ${vs.glowColor}`,
                      }}>
                      <div className="absolute top-0 left-1 right-1 h-[2px]" style={{ background: vs.accentColor }} />
                      <span className="text-[7px] opacity-40" style={{ color: vs.textColor }}>Lv{lv}</span>
                      <span className="text-sm font-bold" style={{ color: vs.textColor }}>{symbol}</span>
                    </div>
                    <span className="text-[6px] text-zinc-700">{fill}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
