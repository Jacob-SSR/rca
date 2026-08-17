"use client";

// ปุ่มออกจากระบบ — แยกเป็น client component เพื่อใช้ useFormStatus
// อ่านสถานะของ <form> ที่ครอบอยู่ ไม่ต้องมี state ของตัวเอง

import { useFormStatus } from "react-dom";

export default function LogoutButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="btn btn-sm">
      {pending ? "…" : "ออกจากระบบ"}
    </button>
  );
}
