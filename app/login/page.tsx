// app/login/page.tsx
// หน้าเข้าสู่ระบบ — ใช้บัญชีเดียวกับระบบ dashboard (ppc-hos-10667)

import { Suspense } from "react";
import LoginForm from "@/app/login/LoginForm";
import OrbitLogo from "@/app/components/OrbitLogo";
import Icon from "@/app/components/Icon";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 py-6 lg:grid-cols-2 lg:py-14">
      {/* ── ซ้าย: แนะนำระบบ ── */}
      <div className="animate-rise hidden lg:block">
        <OrbitLogo size={120} className="animate-float" />
        <h1 className="mt-6 text-4xl leading-tight font-bold">
          ยินดีต้อนรับสู่
          <br />
          <span className="text-cosmic">จักรวาลเวชระเบียน</span>
        </h1>
        <p className="mt-4 max-w-md text-lg text-zinc-600">
          ระบบตรวจคุณภาพการบันทึกข้อมูลผู้ป่วยนอก ตามเกณฑ์ สนย. (Form A1)
        </p>
        <ul className="stagger mt-8 space-y-3">
          {[
            { icon: "filePlus" as const, text: "กรอกฟอร์มตรงเกณฑ์ ดึงข้อมูลจาก HOSxP ได้" },
            { icon: "sparkles" as const, text: "AI ช่วยสกัดข้อมูล · Rule Engine ให้คะแนน" },
            { icon: "shield" as const, text: "ปิดบังข้อมูลระบุตัวบุคคลก่อนประมวลผลเสมอ" },
          ].map((f) => (
            <li key={f.text} className="flex items-center gap-3 text-zinc-700">
              <span className="icon-orb">
                <Icon name={f.icon} />
              </span>
              {f.text}
            </li>
          ))}
        </ul>
      </div>

      {/* ── ขวา: ฟอร์ม ── */}
      <div className="animate-rise mx-auto w-full max-w-md [animation-delay:0.15s]">
        <div className="mb-6 text-center lg:hidden">
          <OrbitLogo size={84} className="mx-auto animate-float" />
        </div>
        <div className="mb-5 flex items-center gap-3">
          <span className="icon-orb icon-orb-lg">
            <Icon name="lock" size={24} />
          </span>
          <div>
            <h2 className="text-2xl font-bold">เข้าสู่ระบบ</h2>
            <p className="text-zinc-600">ใช้บัญชีเดียวกับระบบ dashboard โรงพยาบาล</p>
          </div>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
