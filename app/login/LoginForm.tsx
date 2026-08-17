"use client";

// ฟอร์มเข้าสู่ระบบ — ส่งผ่าน Server Action ที่ตั้ง cookie แล้ว redirect ฝั่ง server
// จึงไม่ต้องมีโค้ดเปลี่ยนหน้าฝั่ง client เลย

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type LoginState } from "@/app/actions/auth";

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
        <input
          name="username"
          autoComplete="username"
          autoFocus
          required
          disabled={pending}
          className="input"
        />
      </label>

      <label className="mb-6 block">
        <span className="label">รหัสผ่าน</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          className="input"
        />
      </label>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
      </button>

      {state.error ? <p className="alert alert-error mt-4">{state.error}</p> : null}
    </form>
  );
}
