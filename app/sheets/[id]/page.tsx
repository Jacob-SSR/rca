// app/sheets/[id]/page.tsx — แก้แผ่นงานที่กรอกไว้แล้ว

import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuditSheet } from "@/lib/audit-forms/service";
import { getSession } from "@/lib/auth/session";
import { hasCapability } from "@/lib/auth/permissions";
import AuditSheetEditor from "@/app/components/AuditSheetEditor";

export const dynamic = "force-dynamic";

export default async function SheetPage(props: PageProps<"/sheets/[id]">) {
  const { id } = await props.params;
  const sheet = await getAuditSheet(id);
  if (!sheet) notFound();

  const session = await getSession();
  const canEdit = hasCapability(session?.role ?? "", "review");

  return (
    <div className="space-y-6">
      <Link href="/sheets" className="link">
        ← กลับไปรายการแบบฟอร์ม
      </Link>

      {canEdit ? null : (
        <p className="alert alert-info">บัญชีของคุณดูได้อย่างเดียว แก้ไขแบบฟอร์มไม่ได้</p>
      )}

      <AuditSheetEditor
        form={sheet.form}
        sheetId={sheet.id}
        initialTitle={sheet.title ?? ""}
        initialMeta={sheet.meta}
        initialRows={sheet.rows}
        canEdit={canEdit}
      />
    </div>
  );
}
