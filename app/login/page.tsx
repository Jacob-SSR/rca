// app/login/page.tsx
// หน้าเข้าสู่ระบบ — ใช้บัญชีเดียวกับระบบ dashboard (ppc-hos-10667)

import { Suspense } from "react";
import LoginForm from "@/app/login/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-brand-600 text-2xl font-bold text-white">
          R
        </div>
        <h1 className="text-2xl font-semibold">เข้าสู่ระบบ</h1>
        <p className="mt-2 text-zinc-600">
          ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกับระบบ dashboard โรงพยาบาล
        </p>
      </div>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
