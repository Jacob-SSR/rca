// app/components/PageHeader.tsx
// หัวหน้าเพจมาตรฐาน: ลิงก์ย้อนกลับ + ไอคอนเรืองแสง + ชื่อหน้า + คำอธิบาย

import Link from "next/link";
import type { ReactNode } from "react";
import Icon, { type IconName } from "@/app/components/Icon";

type Props = {
  icon: IconName;
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  /** ปุ่ม/ป้ายด้านขวา */
  actions?: ReactNode;
  children?: ReactNode;
};

export default function PageHeader({ icon, title, subtitle, back, actions, children }: Props) {
  return (
    <div className="animate-rise">
      {back ? (
        <Link href={back.href} className="back-link mb-4">
          <Icon name="arrowLeft" size={16} />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="icon-orb icon-orb-lg mt-0.5">
            <Icon name={icon} size={26} />
          </span>
          <div className="min-w-0">
            <h1 className="text-cosmic text-2xl font-bold sm:text-3xl">{title}</h1>
            {subtitle ? <div className="mt-1.5 max-w-3xl text-zinc-600">{subtitle}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
