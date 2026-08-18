// app/sheets/page.tsx — รายการแบบฟอร์มทั้ง 8 ใบ + แผ่นงานที่กรอกไว้

import Link from "next/link";
import { AUDIT_FORMS, getAuditForm } from "@/lib/audit-forms/registry";
import { listAuditSheets } from "@/lib/audit-forms/service";
import { summarize, type SheetRow } from "@/lib/audit-forms/compute";

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
      <section className="card card-pad">
        <h1 className="text-2xl font-semibold">แบบฟอร์มตรวจสอบคุณภาพข้อมูล</h1>
        <p className="mt-2 text-zinc-600">
          ครบทั้ง 8 ใบตามภาคผนวก ข ของคู่มือ สนย. มีนาคม 2558 — กรอกในระบบ
          ระบบคิดคะแนนรวมและสัดส่วนให้เอง แล้วดาวน์โหลดเป็น .docx ตามแบบฟอร์มเดิม
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">สร้างแผ่นงานใหม่</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {AUDIT_FORMS.map((f) => (
            <Link
              key={f.code}
              href={`/sheets/new?form=${f.code}`}
              className="card card-pad transition hover:border-brand-500"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold">Form {f.code}</span>
                <span className="badge">{f.scope}</span>
              </div>
              <p className="mt-2 text-zinc-600">{f.title}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="card overflow-hidden">
        <h2 className="card-title">แผ่นงานที่กรอกไว้ ({sheets.length})</h2>

        {sheets.length === 0 ? (
          <div className="px-6 py-14 text-center">
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
                      <a href={`/api/sheets/${s.id}/export`} className="link">
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
