// app/sheets/page.tsx — รายการแบบฟอร์มทั้ง 8 ใบ + แผ่นงานที่กรอกไว้

import Link from "next/link";
import { AUDIT_FORMS, getAuditForm } from "@/lib/audit-forms/registry";
import { listAuditSheets } from "@/lib/audit-forms/service";
import { summarize, type SheetRow } from "@/lib/audit-forms/compute";
import PageHeader from "@/app/components/PageHeader";
import Icon from "@/app/components/Icon";

export const dynamic = "force-dynamic";

function thaiDateTime(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

/** จำนวนแถวที่กรอกจริง — ไว้บอกว่าแผ่นไหนยังว่างอยู่ */
function filledRows(formCode: string, rows: unknown): number {
  const form = getAuditForm(formCode);
  if (!form || !Array.isArray(rows)) return 0;
  return summarize(form, rows as SheetRow[]).rows;
}

export default async function SheetsPage() {
  const sheets = await listAuditSheets();

  return (
    <div className="space-y-8">
      <PageHeader
        icon="clipboard"
        title="แบบฟอร์มตรวจสอบคุณภาพข้อมูล"
        subtitle="ครบทั้ง 8 ใบตามภาคผนวก ข ของคู่มือ สนย. มีนาคม 2558 — กรอกในระบบ ระบบคิดคะแนนรวมและสัดส่วนให้เอง แล้วดาวน์โหลดเป็น .docx ตามแบบฟอร์มเดิม"
      />

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Icon name="plus" className="text-brand-400" />
          สร้างแผ่นงานใหม่
        </h2>
        <div className="stagger grid gap-4 md:grid-cols-2">
          {AUDIT_FORMS.map((f) => (
            <Link
              key={f.code}
              href={`/sheets/new?form=${f.code}`}
              className="card card-pad card-hover group flex items-start gap-4"
            >
              <span className="icon-orb icon-orb-lg transition-transform duration-500 group-hover:-rotate-12 group-hover:scale-110">
                <span className="text-base font-bold">{f.code}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-lg font-semibold">Form {f.code}</span>
                  <span className="badge">{f.scope}</span>
                </span>
                <span className="mt-1 block text-zinc-600">{f.title}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-400 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">
                  เริ่มกรอก <Icon name="arrowRight" size={14} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card animate-rise overflow-hidden">
        <h2 className="card-title">
          <span className="icon-orb"><Icon name="folder" /></span>
          แผ่นงานที่กรอกไว้
          <span className="badge tabular ml-auto">{sheets.length}</span>
        </h2>

        {sheets.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="icon-orb icon-orb-lg mx-auto mb-4 animate-float">
              <Icon name="inbox" size={26} />
            </span>
            <p className="text-lg text-zinc-500">ยังไม่มีแผ่นงาน</p>
            <p className="mt-1 text-zinc-400">เลือกแบบฟอร์มด้านบนเพื่อเริ่มกรอก</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>ฟอร์ม</th>
                  <th>ชื่อแผ่นงาน</th>
                  <th className="text-center">แถวที่กรอก</th>
                  <th>แก้ไขล่าสุด</th>
                  <th>โดย</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="badge badge-brand">{s.formCode}</span>
                    </td>
                    <td>
                      <Link href={`/sheets/${s.id}`} className="link">
                        {s.title || "(ไม่ได้ตั้งชื่อ)"}
                      </Link>
                    </td>
                    <td className="tabular text-center">{filledRows(s.formCode, s.rows)}</td>
                    <td className="text-zinc-600">{thaiDateTime(s.updatedAt)}</td>
                    <td className="text-zinc-600">{s.updatedBy ?? "—"}</td>
                    <td>
                      <a href={`/api/sheets/${s.id}/export`} className="btn btn-sm" title="ดาวน์โหลด .docx">
                        <Icon name="download" size={16} />
                        .docx
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
