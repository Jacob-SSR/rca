// app/components/UserBar.tsx
// แถบผู้ใช้มุมขวาบน — ชื่อ, สิทธิ์, ปุ่มออกจากระบบ
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
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right leading-tight sm:block">
        <div className="text-base font-medium">{name}</div>
        <div className="text-sm text-zinc-500">{role}</div>
      </div>
      <form action={logoutAction}>
        <LogoutButton />
      </form>
    </div>
  );
}
