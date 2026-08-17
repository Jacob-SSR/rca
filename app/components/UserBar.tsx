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
    <div className="flex items-center gap-3 text-xs">
      <span className="text-zinc-600">
        {name} <span className="text-zinc-400">({role})</span>
      </span>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        className="rounded border border-zinc-300 px-2 py-1 disabled:opacity-50"
      >
        {busy ? "…" : "ออกจากระบบ"}
      </button>
    </div>
  );
}
