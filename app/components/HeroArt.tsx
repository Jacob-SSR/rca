// app/components/HeroArt.tsx
// ภาพประกอบหน้าแรก: เอกสารที่กำลังถูกตรวจ + ป้ายผลลัพธ์ลอยรอบๆ

import Icon from "@/app/components/Icon";
import ScanningDoc from "@/app/components/ScanningDoc";

const CHIPS = [
  { icon: "shield" as const, text: "ปิดบังข้อมูลส่วนตัว", cls: "top-2 -left-2", tone: "text-brand-600 bg-brand-50", delay: "0s" },
  { icon: "check" as const, text: "17/17 คะแนน", cls: "top-16 -right-4", tone: "text-emerald-700 bg-emerald-50", delay: "1.2s" },
  { icon: "sparkles" as const, text: "AI สกัดข้อมูล", cls: "bottom-4 left-0", tone: "text-cyan-700 bg-cyan-50", delay: "2.1s" },
];

export default function HeroArt({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`relative h-60 ${className}`}>
      {/* วงแสงด้านหลัง */}
      <div className="absolute top-1/2 left-1/2 size-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-brand-100 via-cyan-50 to-lime-50" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <ScanningDoc className="scale-125" />
      </div>
      {CHIPS.map((c) => (
        <span
          key={c.text}
          className={`absolute ${c.cls} inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium whitespace-nowrap text-zinc-700 shadow-[0_10px_24px_-12px_rgba(10,90,70,0.35)] ring-1 ring-zinc-200 animate-float`}
          style={{ animationDelay: c.delay }}
        >
          <span className={`grid size-5 place-items-center rounded-full ${c.tone}`}>
            <Icon name={c.icon} size={12} strokeWidth={2.6} />
          </span>
          {c.text}
        </span>
      ))}
    </div>
  );
}
