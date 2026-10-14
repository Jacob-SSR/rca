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
  const latest = c.reviews.find((r) => r.status === "COMPLETED") ?? null;

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

      {/* ── ทางลัด: ผลตรวจล่าสุด — สิ่งที่คนเปิดเคสส่วนใหญ่อยากดู ─────────────── */}
      {latest ? (
        <Link
          href={`/reviews/${latest.id}`}
          className="card card-hover animate-rise group flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6"
        >
          <span className="flex min-w-0 flex-1 items-center gap-4">
            <span className="icon-orb icon-orb-lg shrink-0 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
              <Icon name="target" size={26} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-zinc-500">ผลตรวจล่าสุด · {thaiDate(latest.createdAt)}</span>
              <span className="block font-semibold break-all sm:truncate sm:text-lg">{latest.document.fileName}</span>
            </span>
          </span>
          <span className="flex items-center justify-between gap-4 sm:justify-end">
            <ScoreBadge
              size="lg"
              total={latest.totalScore}
              max={latest.maxScore}
              percentage={latest.percentage?.toString() ?? null}
            />
            <span className="btn btn-primary">
              ดูผลตรวจ
              <Icon name="chevronRight" size={18} className="transition-transform group-hover:translate-x-1" />
            </span>
          </span>
        </Link>
      ) : null}

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
              <li key={f.id}>
                <Link href={`/forms/${f.id}`} className="row-link" aria-label="เปิดฟอร์ม">
                  <span className="icon-orb hidden shrink-0 sm:grid"><Icon name="fileText" size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-zinc-900">
                      {f.chiefComplaint?.trim() || <span className="text-zinc-400">(ยังไม่ได้กรอกอาการสำคัญ)</span>}
                    </span>
                    <span className="tabular mt-0.5 block text-sm text-zinc-500">
                      มารับบริการ {f.serviceDate ?? "ไม่ระบุวันที่"}
                      {f.serviceTime ? ` ${f.serviceTime} น.` : ""} · แก้ล่าสุด {thaiDate(f.updatedAt)}
                    </span>
                  </span>
                  {f.source === "hosxp" ? <span className="badge hidden shrink-0 sm:inline-flex">จาก HOSxP</span> : null}
                  <span className="hidden shrink-0 text-sm font-medium text-brand-700 md:inline">เปิดฟอร์ม</span>
                  <Icon name="chevronRight" size={22} className="row-link-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── ผลการตรวจ ─────────────────────────────────────────────────────── */}
      <section className="card animate-rise overflow-hidden [animation-delay:0.1s]">
        <h2 className="card-title">
          <span className="icon-orb"><Icon name="target" /></span>
          ผลการตรวจทั้งหมด
          {c.reviews.length > 0 ? <span className="badge tabular">{c.reviews.length} ครั้ง</span> : null}
        </h2>

        {c.reviews.length === 0 ? (
          <p className="px-6 py-8 text-zinc-500">ยังไม่มีผลการตรวจ</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {c.reviews.map((r) => (
              <li key={r.id}>
                <Link href={`/reviews/${r.id}`} className="row-link" aria-label={`ดูผลตรวจ ${r.document.fileName}`}>
                  <span className="icon-orb hidden shrink-0 sm:grid">
                    <Icon name={r.sourceType === "form" ? "fileText" : "upload"} size={18} />
                  </span>
                  {/* จอเล็ก: คะแนนลงไปอยู่ใต้ชื่อไฟล์ ไม่บีบชื่อไฟล์จนอ่านไม่ออก */}
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium break-all text-zinc-900 sm:truncate">{r.document.fileName}</span>
                      <span className="tabular mt-0.5 block text-sm text-zinc-500">
                        ตรวจเมื่อ {thaiDate(r.createdAt)} · ฉบับที่ {r.document.version} ·{" "}
                        {r.sourceType === "form" ? "จากฟอร์ม" : "อัปโหลด"}
                      </span>
                    </span>
                    <span className="shrink-0">
                      {r.status === "COMPLETED" ? (
                        <ScoreBadge total={r.totalScore} max={r.maxScore} percentage={r.percentage?.toString() ?? null} />
                      ) : (
                        <span className="badge bg-warn-50 text-warn-600">
                          <Icon name="clock" size={14} />
                          {r.status}
                        </span>
                      )}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={22} className="row-link-chevron" />
                </Link>
              </li>
            ))}
          </ul>
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
