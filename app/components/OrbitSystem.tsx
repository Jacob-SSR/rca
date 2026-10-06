// app/components/OrbitSystem.tsx
// ระบบสุริยะจำลองบนหน้าแรก — ดวงอาทิตย์คือ "เวชระเบียน" ดาวเคราะห์คือหัวข้อที่ตรวจ
// ล้วน CSS: วงแหวนหมุน ดาวเคราะห์หมุนสวนทางเพื่อให้ไอคอนตั้งตรงเสมอ

import Icon, { type IconName } from "@/app/components/Icon";

const RINGS: { size: number; duration: number; planets: { icon: IconName; color: string; at: number }[] }[] = [
  { size: 46, duration: 18, planets: [{ icon: "clock", color: "#4fe3ff", at: 0 }, { icon: "stethoscope", color: "#ff6ad5", at: 180 }] },
  { size: 72, duration: 30, planets: [{ icon: "fileText", color: "#ffc857", at: 60 }, { icon: "activity", color: "#3ee6a8", at: 240 }] },
  { size: 98, duration: 46, planets: [{ icon: "target", color: "#b3b9ff", at: 120 }, { icon: "shield", color: "#ff9db0", at: 300 }] },
];

export default function OrbitSystem({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`relative aspect-square ${className}`}>
      {/* ดวงอาทิตย์ */}
      <div className="absolute top-1/2 left-1/2 grid size-[24%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff4d6,#ffb347_40%,#ff5e7a_75%,#7a1d6e)] shadow-[0_0_60px_10px_rgba(255,150,90,0.45),0_0_120px_30px_rgba(255,94,122,0.25)] animate-pulse-ring">
        <Icon name="sparkles" size="45%" className="text-on-brand/90" />
      </div>

      {RINGS.map((ring, i) => (
        <div
          key={i}
          className="absolute top-1/2 left-1/2 rounded-full border border-brand-300/25"
          style={{
            width: `${ring.size}%`,
            height: `${ring.size}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className="absolute inset-0"
            style={{ animation: `orbit-spin ${ring.duration}s linear infinite` }}
          >
            {ring.planets.map((p) => (
              <div key={p.icon} className="absolute inset-0" style={{ transform: `rotate(${p.at}deg)` }}>
                <span
                  className="absolute top-0 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
                  style={{
                    background: `radial-gradient(circle at 35% 30%, #fff, ${p.color} 45%, #1a1240)`,
                    boxShadow: `0 0 18px 2px ${p.color}80`,
                  }}
                >
                  {/* หมุนสวนทางวงแหวน + ชดเชยมุมตั้งต้น → ไอคอนตั้งตรงตลอด */}
                  <span
                    className="grid place-items-center text-[#140c3a]"
                    style={{ animation: `orbit-spin ${ring.duration}s linear infinite reverse` }}
                  >
                    <span className="grid place-items-center" style={{ transform: `rotate(-${p.at}deg)` }}>
                      <Icon name={p.icon} size={18} strokeWidth={2.2} />
                    </span>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
