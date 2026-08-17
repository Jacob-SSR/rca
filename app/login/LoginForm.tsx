"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error ?? `เข้าสู่ระบบไม่สำเร็จ (${res.status})`);
        return;
      }

      // กลับไปหน้าที่ตั้งใจจะเข้าก่อนถูกเด้งมา login
      // ⚠️ รับเฉพาะ path ภายใน กัน open redirect ไปเว็บนอก
      const next = searchParams.get("next");
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

      router.push(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded border border-zinc-200 bg-white p-5">
      <label className="mb-3 block">
        <span className="mb-1 block text-sm text-zinc-700">ชื่อผู้ใช้</span>
        <input
          name="username"
          autoComplete="username"
          autoFocus
          required
          disabled={busy}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="mb-4 block">
        <span className="mb-1 block text-sm text-zinc-700">รหัสผ่าน</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={busy}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
      </button>

      {error ? (
        <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>
      ) : null}
    </form>
  );
}
