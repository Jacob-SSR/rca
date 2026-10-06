// app/components/Cosmos.tsx
// ฉากหลังจักรวาล: ดาว 3 ชั้น (parallax) + เนบิวลา + ดาวเคราะห์ + ดาวตก
//
// ตำแหน่งดาวสุ่มด้วย seed คงที่ → server กับ client ได้ค่าเดียวกันทุกครั้ง
// ดาวทั้งชั้นวาดด้วย box-shadow ของ element เดียว — หลายร้อยดวงแต่ DOM แค่ 3 โหนด

function starLayer(count: number, seed: number, palette: string[]): string {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * 2560);
    const y = Math.floor(rand() * 2000);
    const c = palette[Math.floor(rand() * palette.length)];
    out.push(`${x}px ${y}px ${c}`);
  }
  return out.join(",");
}

const LAYER_1 = starLayer(420, 7, ["#ffffff", "#c9d4ff", "#a8b5ff"]);
const LAYER_2 = starLayer(140, 31, ["#ffffff", "#bfe9ff", "#ffd9f2"]);
const LAYER_3 = starLayer(45, 97, ["#ffffff", "#9fe6ff", "#d7c9ff"]);

export default function Cosmos() {
  return (
    <div className="cosmos" aria-hidden>
      <div className="nebula nebula-a" />
      <div className="nebula nebula-b" />
      <div className="nebula nebula-c" />
      <div className="stars stars-1" style={{ boxShadow: LAYER_1 }} />
      <div className="stars stars-2" style={{ boxShadow: LAYER_2 }} />
      <div className="stars stars-3" style={{ boxShadow: LAYER_3 }} />
      <div className="moon" />
      <div className="planet" />
      <div>
        <span className="shooting-star" />
        <span className="shooting-star" />
        <span className="shooting-star" />
      </div>
    </div>
  );
}
