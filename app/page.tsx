// app/page.tsx — หน้าแรก: อัปโหลดเอกสาร + รายการเคสล่าสุด

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import UploadForm from "@/app/components/UploadForm";

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
      _count: { select: { documents: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, totalScore: true, maxScore: true, percentage: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">บันทึกเวชระเบียนใหม่</h2>
        <p className="mb-3 text-sm text-zinc-600">
          กรอกฟอร์มที่มีหัวข้อตรงตามเกณฑ์ สนย. ทั้ง 6 ข้อ → ระบบสร้างเอกสาร .docx ให้
          → ส่งให้ AI ตรวจ
        </p>
        <Link
          href="/forms/new"
          className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          + สร้างฟอร์มใหม่
        </Link>
      </section>

      <UploadForm />

      <section className="rounded border border-zinc-200 bg-white">
        <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold">เคสล่าสุด</h2>

        {cases.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">
            ยังไม่มีเคส — อัปโหลดเอกสารด้านบนเพื่อเริ่มตรวจ
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-600">
              <tr>
                <th className="px-4 py-2 font-medium">เลขที่เคส</th>
                <th className="px-4 py-2 font-medium">วันที่</th>
                <th className="px-4 py-2 font-medium">เอกสาร</th>
                <th className="px-4 py-2 font-medium">คะแนนล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const r = c.reviews[0];
                return (
                  <tr key={c.id} className="border-t border-zinc-100">
                    <td className="px-4 py-2">
                      <Link href={`/cases/${c.id}`} className="text-blue-700 underline">
                        {c.caseNumber}
                      </Link>
                      {c.title ? <span className="ml-2 text-zinc-500">{c.title}</span> : null}
                    </td>
                    <td className="px-4 py-2 text-zinc-600">{thaiDate(c.createdAt)}</td>
                    <td className="px-4 py-2 text-zinc-600">{c._count.documents}</td>
                    <td className="px-4 py-2">
                      {!r ? (
                        <span className="text-zinc-400">—</span>
                      ) : r.status !== "COMPLETED" ? (
                        <span className="text-amber-700">{r.status}</span>
                      ) : (
                        <Link href={`/reviews/${r.id}`} className="text-blue-700 underline">
                          {r.totalScore}/{r.maxScore}
                          {r.percentage ? ` (${Number(r.percentage).toFixed(2)}%)` : ""}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
