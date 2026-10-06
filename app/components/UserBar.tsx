// app/components/UserBar.tsx
// แถบผู้ใช้มุมขวาบน — อวตาร, ชื่อ, สิทธิ์, ปุ่มออกจากระบบ
//
// เป็น server component ได้เพราะปุ่มออกจากระบบใช้ Server Action
// (ลบ cookie แล้ว redirect ฝั่ง server — ไม่ต้องมี state ฝั่ง client)

import { logoutAction } from "@/app/actions/auth";
import LogoutButton from "@/app/components/LogoutButton";

type Props = {
  name: string;
  role: string;
};

export default function UserBar({ name, role }: Props) {
  const initial = name.trim().charAt(0) || "?";
  return (
    <div className="flex items-center gap-2.5 border-l border-zinc-200 pl-2.5 sm:pl-3">
      <span
        aria-hidden
        className="relative grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-cyan-glow text-base font-bold text-on-brand shadow-[0_0_18px_-4px] shadow-brand-500"
      >
        {initial}
        <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-emerald-600 ring-2 ring-surface" />
      </span>
      <div className="hidden max-w-40 text-left leading-tight lg:block">
        <div className="truncate text-base font-medium">{name}</div>
        <div className="truncate text-sm text-zinc-500">{role}</div>
      </div>
      <form action={logoutAction}>
        <LogoutButton />
      </form>
    </div>
  );
}
