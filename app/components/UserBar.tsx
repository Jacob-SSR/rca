"use client";

// แถบผู้ใช้มุมขวาบน — ชื่อ, สิทธิ์, ปุ่มออกจากระบบ

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  name: string;
  role: string;
};

export default function UserBar({ name, role }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right leading-tight sm:block">
        <div className="text-base font-medium">{name}</div>
        <div className="text-sm text-zinc-500">{role}</div>
      </div>
      <button type="button" onClick={logout} disabled={busy} className="btn btn-sm">
        {busy ? "…" : "ออกจากระบบ"}
      </button>
    </div>
  );
}
