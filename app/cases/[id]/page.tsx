// app/cases/[id]/page.tsx — รายละเอียดเคส: ฟอร์ม, ผลตรวจ, timeline

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import UploadForm from "@/app/components/UploadForm";
import TimelineEditor from "@/app/components/TimelineEditor";
import ScoreBadge from "@/app/components/ScoreBadge";

export const dynamic = "force-dynamic";

function thaiDate(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;

  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      forms: { orderBy: { updatedAt: "desc" } },
      events: { orderBy: [{ eventTime: "asc" }, { createdAt: "asc" }] },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { document: { select: { fileName: true, version: true } } },
      },
    },
  });

  if (!c) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="link text-base">
          ← กลับหน้าแรก
        </Link>
        <h1 className="tabular mt-3 text-2xl font-semibold">{c.caseNumber}</h1>
        {c.title ? <p className="mt-1 text-zinc-600">{c.title}</p> : null}
        <p className="mt-1 text-sm text-zinc-500">สร้างเมื่อ {thaiDate(c.createdAt)}</p>
      </div>

      {/* ── ฟอร์มในเคสนี้ ──────────────────────────────────────────────────── */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">ฟอร์มบันทึกเวชระเบียน</h2>
          <Link href="/forms/new" className="btn btn-sm">
            + สร้างฟอร์มใหม่
          </Link>
        </div>

        {c.forms.length === 0 ? (
          <p className="px-6 py-8 text-zinc-500">ยังไม่มีฟอร์มในเคสนี้</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {c.forms.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <Link href={`/forms/${f.id}`} className="link font-medium">
                    {f.chiefComplaint?.trim() || "(ยังไม่ได้กรอกอาการสำคัญ)"}
                  </Link>
                  <div className="tabular mt-0.5 text-sm text-zinc-500">
                    {f.serviceDate ?? "ไม่ระบุวันที่"}
                    {f.serviceTime ? ` ${f.serviceTime} น.` : ""} · แก้ล่าสุด{" "}
                    {thaiDate(f.updatedAt)}
                  </div>
                </div>
                {f.source === "hosxp" ? <span className="badge">จาก HOSxP</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── ผลการตรวจ ─────────────────────────────────────────────────────── */}
      <section className="card overflow-hidden">
        <h2 className="card-title">ผลการตรวจ</h2>

        {c.reviews.length === 0 ? (
          <p className="px-6 py-8 text-zinc-500">ยังไม่มีผลการตรวจ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>เอกสาร</th>
                  <th>วันที่ตรวจ</th>
                  <th>ที่มา</th>
                  <th>คะแนน</th>
                </tr>
              </thead>
              <tbody>
                {c.reviews.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/reviews/${r.id}`} className="link font-medium">
                        {r.document.fileName}
                      </Link>
                      <div className="text-sm text-zinc-500">ฉบับที่ {r.document.version}</div>
                    </td>
                    <td className="tabular whitespace-nowrap text-zinc-600">
                      {thaiDate(r.createdAt)}
                    </td>
                    <td>
                      <span className="badge">
                        {r.sourceType === "form" ? "จากฟอร์ม" : "อัปโหลด"}
                      </span>
                    </td>
                    <td>
                      {r.status === "COMPLETED" ? (
                        <ScoreBadge
                          total={r.totalScore}
                          max={r.maxScore}
                          percentage={r.percentage?.toString() ?? null}
                        />
                      ) : (
                        <span className="badge bg-warn-50 text-warn-600">{r.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <TimelineEditor
        caseId={c.id}
        initialEvents={c.events.map((e) => ({
          eventTime: e.eventTime?.toISOString() ?? null,
          title: e.title,
          source: e.source,
        }))}
      />

      <UploadForm caseId={c.id} />
    </div>
  );
}
