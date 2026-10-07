// app/settings/auto-audit/page.tsx — ตรวจอัตโนมัติด้วย AI (OPD)
//
// ทุกคนที่ล็อกอินเข้าหน้านี้ได้: กด "ตรวจเดี๋ยวนี้" เลือกแผนก/วัน/เวรของตัวเอง และดูประวัติ
// ตารางเวลาของทั้งระบบ + ปุ่มจัดการ AI แก้ได้เฉพาะสิทธิ์ manage (คุมใน component และ API)

import { getSession } from "@/lib/auth/session";
import { hasCapability } from "@/lib/auth/permissions";
import AutoAuditSettings from "@/app/components/AutoAuditSettings";
import AiStatusCard from "@/app/components/AiStatusCard";
import PageHeader from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function AutoAuditSettingsPage() {
  const session = await getSession();

  return (
    <div className="space-y-5">
      <PageHeader
        icon="sliders"
        title="ตรวจอัตโนมัติด้วย AI (OPD)"
        subtitle="ดึงผู้ป่วยนอกจาก HOSxP ตามวัน แผนก และเวรที่เลือก สร้างเอกสารและให้คะแนนตามเกณฑ์ Form A1 ด้วย AI เหมือนกดตรวจเอง ผลเข้าไปอยู่ในรายการเคสตามปกติ"
      />
      <AiStatusCard canManage={hasCapability(session?.role, "manage")} />
      <AutoAuditSettings />
    </div>
  );
}
