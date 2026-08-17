// app/login/page.tsx
// หน้าเข้าสู่ระบบ — ใช้บัญชีเดียวกับระบบ dashboard (ppc-hos-10667)

import { Suspense } from "react";
import LoginForm from "@/app/login/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="mb-1 text-xl font-semibold">เข้าสู่ระบบ</h1>
      <p className="mb-6 text-sm text-zinc-600">
        ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกับระบบ dashboard โรงพยาบาล
      </p>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
