// app/components/BrandLogo.tsx
// โลโก้ระบบ: กล่องไล่สีม่วง→ฟ้า มีไอคอนคลิปบอร์ด + ประกายแสงวิ่งผ่านเป็นระยะ

import Icon from "@/app/components/Icon";

export default function BrandLogo({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[30%] text-on-brand shadow-[0_8px_20px_-8px_rgba(16,150,110,0.7)] ${className}`}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #10a77a 0%, #2bcc9b 50%, #22c1c3 100%)",
      }}
    >
      <Icon name="clipboard" size={size * 0.55} strokeWidth={2} />
      <span className="logo-shine absolute inset-0" />
    </span>
  );
}
