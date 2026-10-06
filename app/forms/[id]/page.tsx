// app/forms/[id]/page.tsx — แก้ฟอร์ม + ดูเอกสารที่สร้างไปแล้ว

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RecordFormEditor from "@/app/components/RecordFormEditor";
import ScoreBadge from "@/app/components/ScoreBadge";
import type { RecordFormInput } from "@/lib/form/schema";
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

export default async function FormPage({ params }: PageProps<"/forms/[id]">) {
  const { id } = await params;

  const form = await prisma.recordForm.findUnique({
    where: { id },
    include: {
      case: { select: { id: true, caseNumber: true } },
      documents: {
        orderBy: { createdAt: "desc" },
        include: {
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, status: true, totalScore: true, maxScore: true, percentage: true },
          },
        },
      },
    },
  });

  if (!form) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        icon="pencil"
        back={{ href: `/cases/${form.caseId}`, label: `กลับไปที่เคส ${form.case.caseNumber}` }}
        title="แก้ไขบันทึกเวชระเบียน"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2 text-sm">
            <Icon name="clock" size={16} /> แก้ล่าสุด {thaiDate(form.updatedAt)}
            {form.source === "hosxp" ? <span className="badge badge-brand">ข้อมูลตั้งต้นจาก HOSxP</span> : null}
          </span>
        }
      />

      {form.documents.length > 0 ? (
        <section className="card animate-rise overflow-hidden">
          <h2 className="card-title">
            <span className="icon-orb"><Icon name="fileText" /></span>
            เอกสารที่สร้างจากฟอร์มนี้
          </h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>ฉบับ</th>
                  <th>สร้างเมื่อ</th>
                  <th>ผลตรวจ</th>
                </tr>
              </thead>
              <tbody>
                {form.documents.map((d) => {
                  const r = d.reviews[0];
                  return (
                    <tr key={d.id}>
                      <td className="tabular font-medium">ฉบับที่ {d.version}</td>
                      <td className="tabular whitespace-nowrap text-zinc-600">
                        {thaiDate(d.createdAt)}
                      </td>
                      <td>
                        {!r ? (
                          <span className="text-zinc-400">ยังไม่ได้ตรวจ</span>
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
          <div className="border-t border-zinc-200 px-5 py-4 sm:px-6">
            <a href={`/api/forms/${form.id}/generate`} className="btn btn-sm">
              <Icon name="download" />
              ดาวน์โหลดเอกสารฉบับล่าสุด (.docx)
            </a>
          </div>
        </section>
      ) : null}

      <RecordFormEditor
        formId={form.id}
        caseNumber={form.case.caseNumber}
        initial={form as unknown as RecordFormInput}
      />
    </div>
  );
}
