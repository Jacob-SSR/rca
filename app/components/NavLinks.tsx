"use client";

// เมนูหลักด้านบน — ไฮไลต์หน้าที่อยู่ด้วยแคปซูลเรืองแสง
// เป็น client component เพราะต้องอ่าน pathname ปัจจุบัน

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/app/components/Icon";

type Item = { href: string; label: string; icon: IconName };

/** แถบวิ่งบนสุดของจอระหว่างรอหน้าใหม่ — มีอยู่เสมอ สลับแค่ความโปร่งใส ไม่ดันเลย์เอาต์ */
function PendingBar() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden transition-opacity duration-200 ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    >
      <span
        className="absolute top-0 h-full rounded-full bg-gradient-to-r from-brand-500 via-cyan-glow to-pink-glow"
        style={{ animation: "indeterminate 1.2s ease-in-out infinite" }}
      />
    </span>
  );
}

export default function NavLinks({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();

  const items: Item[] = [
    { href: "/", label: "หน้าแรก", icon: "home" },
    { href: "/sheets", label: "แบบฟอร์ม", icon: "clipboard" },
    { href: "/reports", label: "Form A1", icon: "chart" },
    ...(canManage ? [{ href: "/settings/auto-audit", label: "ตั้งค่า", icon: "sliders" as const }] : []),
  ];

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/cases") || pathname.startsWith("/forms") || pathname.startsWith("/reviews")
      : pathname.startsWith(href);

  return (
    <nav aria-label="เมนูหลัก" className="flex items-center justify-around gap-1 sm:justify-start">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={isActive(it.href) ? "page" : undefined}
          className="nav-link flex-col gap-0.5 px-3 py-1.5 sm:flex-row sm:gap-2 sm:px-3.5 sm:py-2"
          title={it.label}
        >
          <Icon name={it.icon} />
          <span className="text-xs sm:hidden md:inline md:text-base">{it.label}</span>
          <PendingBar />
        </Link>
      ))}
    </nav>
  );
}
