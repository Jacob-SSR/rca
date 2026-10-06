"use client";

// ปุ่มออกจากระบบ — แยกเป็น client component เพื่อใช้ useFormStatus
// อ่านสถานะของ <form> ที่ครอบอยู่ ไม่ต้องมี state ของตัวเอง

import { useFormStatus } from "react-dom";
import Icon from "@/app/components/Icon";

export default function LogoutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-sm btn-ghost size-10 rounded-full p-0 hover:text-red-700"
      title="ออกจากระบบ"
      aria-label="ออกจากระบบ"
    >
      {pending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="logout" size={20} />}
    </button>
  );
}
