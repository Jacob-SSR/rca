"use client";

// ฟอร์มเข้าสู่ระบบ — ส่งผ่าน Server Action ที่ตั้ง cookie แล้ว redirect ฝั่ง server
// จึงไม่ต้องมีโค้ดเปลี่ยนหน้าฝั่ง client เลย

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type LoginState } from "@/app/actions/auth";
import Icon from "@/app/components/Icon";

const initialState: LoginState = { error: null };

export default function LoginForm() {
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="card card-pad">
      {/* ปลายทางหลัง login — proxy ใส่ ?next= มาให้ตอนเด้งผู้ใช้มาที่นี่
          ฝั่ง server ตรวจซ้ำว่าเป็น path ภายในเท่านั้น (safeRedirectTarget) */}
      <input type="hidden" name="next" value={searchParams.get("next") ?? ""} />

      <label className="mb-4 block">
        <span className="label">ชื่อผู้ใช้</span>
        <span className="relative block">
          <Icon name="user" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          name="username"
          autoComplete="username"
          autoFocus
          required
          disabled={pending}
          className="input pl-11"
        />
        </span>
      </label>

      <label className="mb-6 block">
        <span className="label">รหัสผ่าน</span>
        <span className="relative block">
          <Icon name="lock" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          className="input pl-11"
        />
        </span>
      </label>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Icon name="rocket" />
        )}
        {pending ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
      </button>

      {state.error ? <p role="alert" className="alert alert-error mt-4 flex items-center gap-2"><Icon name="alert" />{state.error}</p> : null}
    </form>
  );
}
