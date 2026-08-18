// app/sheets/new/page.tsx — เริ่มกรอกแผ่นงานใหม่ของฟอร์มที่เลือก

import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuditForm } from "@/lib/audit-forms/registry";
import { getSession } from "@/lib/auth/session";
import { hasCapability } from "@/lib/auth/permissions";
import AuditSheetEditor from "@/app/components/AuditSheetEditor";

export const dynamic = "force-dynamic";

export default async function NewSheetPage(props: PageProps<"/sheets/new">) {
  const { form: formCode } = await props.searchParams;
  const form = getAuditForm(typeof formCode === "string" ? formCode : "");
  if (!form) notFound();

  const session = await getSession();
  const canEdit = hasCapability(session?.role ?? "", "review");

  return (
    <div className="space-y-6">
      <Link href="/sheets" className="link">
        ← กลับไปรายการแบบฟอร์ม
      </Link>

      {canEdit ? null : (
        <p className="alert alert-info">
          บัญชีของคุณดูได้อย่างเดียว ไม่มีสิทธิ์กรอกแบบฟอร์มตรวจสอบคุณภาพ
        </p>
      )}

      <AuditSheetEditor form={form} canEdit={canEdit} />
    </div>
  );
}
