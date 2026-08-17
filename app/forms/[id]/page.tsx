// app/forms/[id]/page.tsx — แก้ฟอร์ม + ดูเอกสารที่สร้างไปแล้ว

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RecordFormEditor from "@/app/components/RecordFormEditor";
import type { RecordFormInput } from "@/lib/form/schema";

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
    <div className="space-y-4">
      <div>
        <Link href={`/cases/${form.caseId}`} className="text-sm text-blue-700 underline">
          ← กลับไปที่เคส {form.case.caseNumber}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">แก้ไขบันทึกเวชระเบียน</h1>
        <p className="text-sm text-zinc-500">
          แก้ล่าสุด {thaiDate(form.updatedAt)}
          {form.source === "hosxp" ? " · ข้อมูลตั้งต้นจาก HOSxP" : ""}
        </p>
      </div>

      {form.documents.length > 0 ? (
        <section className="rounded border border-zinc-200 bg-white">
          <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold">
            เอกสารที่สร้างจากฟอร์มนี้
          </h2>
          <ul className="divide-y divide-zinc-100">
            {form.documents.map((d) => {
              const r = d.reviews[0];
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <span className="font-medium">ฉบับที่ {d.version}</span>
                    <span className="ml-2 text-zinc-500">{thaiDate(d.createdAt)}</span>
                  </div>
                  <div>
                    {!r ? (
                      <span className="text-zinc-400">ยังไม่ได้ตรวจ</span>
                    ) : r.status !== "COMPLETED" ? (
                      <span className="text-amber-700">{r.status}</span>
                    ) : (
                      <Link href={`/reviews/${r.id}`} className="text-blue-700 underline">
                        {r.totalScore}/{r.maxScore}
                        {r.percentage ? ` (${Number(r.percentage).toFixed(2)}%)` : ""}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-zinc-200 px-4 py-3">
            <a href={`/api/forms/${form.id}/generate`} className="text-sm text-blue-700 underline">
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
