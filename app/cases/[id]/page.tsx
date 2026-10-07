// app/cases/[id]/page.tsx — รายละเอียดเคส: ฟอร์ม, ผลตรวจ, timeline

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import UploadForm from "@/app/components/UploadForm";
import TimelineEditor from "@/app/components/TimelineEditor";
import ScoreBadge from "@/app/components/ScoreBadge";
import CaseActions from "@/app/components/CaseActions";
import { getSession } from "@/lib/auth/session";
import { canModify } from "@/lib/auth/ownership";
import PageHeader from "@/app/components/PageHeader";
import Icon from "@/app/components/Icon";

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

  const session = await getSession();
  const mine = canModify(session, c);

  return (
    <div className="space-y-6">
      <PageHeader
        icon="folder"
        back={{ href: "/", label: "กลับหน้าแรก" }}
        title={<span className="tabular">{c.caseNumber}</span>}
        subtitle={
          <>
            {c.title ? <p>{c.title}</p> : null}
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500">
              {c.department ? (
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="layers" size={16} />
                  {c.department}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Icon name="user" size={16} />
                {c.createdByName || c.createdBy || "ไม่ทราบ"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="calendar" size={16} />
                {thaiDate(c.createdAt)}
              </span>
            </p>
          </>
        }
      >

        {mine ? (
          <div className="mt-4">
            <CaseActions caseId={c.id} caseNumber={c.caseNumber} initialTitle={c.title ?? ""} />
          </div>
        ) : (
          <p className="alert alert-info mt-4 flex items-center gap-2">
            <Icon name="info" />
            เคสนี้สร้างโดยผู้ใช้คนอื่น — ดูได้อย่างเดียว แก้ไขหรือลบได้เฉพาะเจ้าของ
          </p>
        )}
      </PageHeader>

      {/* ── ฟอร์มในเคสนี้ ──────────────────────────────────────────────────── */}
      <section className="card animate-rise overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 sm:px-6">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold">
            <span className="icon-orb"><Icon name="fileText" /></span>
            ฟอร์มบันทึกเวชระเบียน
          </h2>
          <Link href="/forms/new" className="btn btn-sm">
            <Icon name="plus" size={16} />
            สร้างฟอร์มใหม่
          </Link>
        </div>

        {c.forms.length === 0 ? (
          <p className="px-6 py-8 text-zinc-500">ยังไม่มีฟอร์มในเคสนี้</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {c.forms.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-brand-50/30 sm:px-6">
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
      <section className="card animate-rise overflow-hidden [animation-delay:0.1s]">
        <h2 className="card-title">
          <span className="icon-orb"><Icon name="target" /></span>
          ผลการตรวจ
        </h2>

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
                        <Icon name={r.sourceType === "form" ? "fileText" : "upload"} size={14} />
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
                        <span className="badge bg-warn-50 text-warn-600">
                          <Icon name="clock" size={14} />
                          {r.status}
                        </span>
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

      {mine ? <UploadForm caseId={c.id} /> : null}
    </div>
  );
}
