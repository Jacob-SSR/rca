// app/settings/auto-audit/page.tsx — ตั้งค่า "ตรวจอัตโนมัติด้วย AI ประจำวัน" (OPD)

import { getSession } from "@/lib/auth/session";
import { hasCapability } from "@/lib/auth/permissions";
import AutoAuditSettings from "@/app/components/AutoAuditSettings";

export const dynamic = "force-dynamic";

export default async function AutoAuditSettingsPage() {
  const session = await getSession();

  if (!hasCapability(session?.role, "manage")) {
    return (
      <section className="card card-pad">
        <h1 className="text-2xl font-semibold">ตั้งค่าตรวจอัตโนมัติ</h1>
        <p className="alert alert-error mt-4">
          หน้านี้สำหรับผู้มีสิทธิ์จัดการระบบเท่านั้น (เวชระเบียน/แพทย์/ผู้บริหาร/IT)
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">ตั้งค่า · ตรวจอัตโนมัติด้วย AI (OPD)</h1>
        <p className="mt-1 text-zinc-600">
          ทุกวันตามเวลาที่ตั้ง ระบบจะดึงผู้ป่วยนอกจาก HOSxP สุ่มตามจำนวนที่กำหนด
          สร้างเอกสารและให้คะแนนตามเกณฑ์ Form A1 ด้วย AI เหมือนกดตรวจเอง ผลเข้าไปอยู่ในรายการเคสตามปกติ
        </p>
      </div>
      <AutoAuditSettings />
    </div>
  );
}
