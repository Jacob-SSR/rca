// app/page.tsx — หน้าแรก: ทางเข้างาน + รายการเคสล่าสุด

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import UploadForm from "@/app/components/UploadForm";
import ScoreBadge from "@/app/components/ScoreBadge";

export const dynamic = "force-dynamic";

function thaiDate(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

export default async function Home() {
  const cases = await prisma.case.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      _count: { select: { documents: true, forms: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, totalScore: true, maxScore: true, percentage: true },
      },
    },
  });

  return (
    <div className="space-y-8">
      {/* ── ทางเข้างานหลัก ─────────────────────────────────────────────────── */}
      <div className="grid gap-5 md:grid-cols-2">
        <section className="card card-pad flex flex-col">
          <h2 className="text-xl font-semibold">กรอกฟอร์มบันทึกเวชระเบียน</h2>
          <p className="mt-2 flex-1 text-zinc-600">
            กรอกฟอร์มที่มีหัวข้อตรงตามเกณฑ์ สนย. ทั้ง 6 ข้อ ระบบจะสร้างเอกสาร .docx
            ให้แล้วส่งให้ AI ตรวจในคลิกเดียว
          </p>
          <Link href="/forms/new" className="btn btn-primary mt-5 self-start">
            + สร้างฟอร์มใหม่
          </Link>
        </section>

        <UploadForm />
      </div>

      {/* ── รายการเคส ──────────────────────────────────────────────────────── */}
      <section className="card overflow-hidden">
        <h2 className="card-title">เคสล่าสุด</h2>

        {cases.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-lg text-zinc-500">ยังไม่มีเคสในระบบ</p>
            <p className="mt-1 text-zinc-400">
              เริ่มจากสร้างฟอร์มใหม่ หรืออัปโหลดเอกสารด้านบน
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>เลขที่เคส</th>
                  <th>วันที่สร้าง</th>
                  <th className="text-center">ฟอร์ม</th>
                  <th className="text-center">เอกสาร</th>
                  <th>คะแนนล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const r = c.reviews[0];
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/cases/${c.id}`} className="link font-medium">
                          {c.caseNumber}
                        </Link>
                        {c.title ? (
                          <div className="text-sm text-zinc-500">{c.title}</div>
                        ) : null}
                      </td>
                      <td className="tabular whitespace-nowrap text-zinc-600">
                        {thaiDate(c.createdAt)}
                      </td>
                      <td className="tabular text-center text-zinc-600">{c._count.forms}</td>
                      <td className="tabular text-center text-zinc-600">
                        {c._count.documents}
                      </td>
                      <td>
                        {!r ? (
                          <span className="text-zinc-400">—</span>
                        ) : r.status !== "COMPLETED" ? (
                          <span className="badge bg-warn-50 text-warn-600">{r.status}</span>
                        ) : (
                          <Link href={`/reviews/${r.id}`}>
                            <ScoreBadge
                              total={r.totalScore}
                              max={r.maxScore}
                              percentage={r.percentage?.toString() ?? null}
                            />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
