// app/components/ScanningDoc.tsx
// เอกสารจำลองที่กำลังถูกสแกน — บรรทัดค่อยๆ ถูกอ่าน มีแสงสแกนวิ่งขึ้นลง
// ใช้ในหน้าต่างรอ AI และภาพประกอบหน้าแรก (คีย์เฟรมอยู่ใน globals.css)

import Icon from "@/app/components/Icon";

export default function ScanningDoc({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative mx-auto h-32 w-26 rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_14px_30px_-14px_rgba(90,62,240,0.5)] ${className}`}
    >
      <div className="mb-2 h-2 w-10 rounded bg-brand-200" />
      {[90, 70, 85, 60, 78, 50].map((w, i) => (
        <div key={i} className="mb-1.5 h-1.5 rounded bg-zinc-100">
          <div
            className="h-full origin-left rounded bg-gradient-to-r from-brand-500 to-cyan-glow"
            style={{ width: `${w}%`, animation: `line-fill 2.6s ease-in-out ${i * 0.18}s infinite alternate` }}
          />
        </div>
      ))}
      <div
        className="absolute inset-x-1 h-6 rounded-full bg-gradient-to-b from-transparent via-cyan-glow/35 to-transparent"
        style={{ animation: "scan 2.2s ease-in-out infinite" }}
      />
      <span className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-brand-600 text-on-brand shadow-lg animate-pulse-ring">
        <Icon name="sparkles" size={15} />
      </span>
    </div>
  );
}
