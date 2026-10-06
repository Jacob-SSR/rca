// app/components/BrandLogo.tsx
// โลโก้ระบบ: กล่องไล่สีม่วง→ฟ้า มีไอคอนคลิปบอร์ด + ประกายแสงวิ่งผ่านเป็นระยะ

import Icon from "@/app/components/Icon";

export default function BrandLogo({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[30%] text-on-brand shadow-[0_8px_20px_-8px_rgba(90,62,240,0.8)] ${className}`}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #5a3ef0 0%, #7b5cff 50%, #12b5d6 100%)",
      }}
    >
      <Icon name="clipboard" size={size * 0.55} strokeWidth={2} />
      <span className="logo-shine absolute inset-0" />
    </span>
  );
}
