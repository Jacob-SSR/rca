// app/cases/[id]/page.tsx — รายละเอียดเคส: เอกสาร, ผลตรวจ, timeline editor

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCaseDetail } from "@/lib/review/queries";
import UploadForm from "@/app/components/UploadForm";
import TimelineEditor from "@/app/components/TimelineEditor";

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
  const c = await getCaseDetail(id);
  if (!c) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-blue-700 underline">
          ← กลับหน้าแรก
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{c.caseNumber}</h1>
        {c.title ? <p className="text-zinc-600">{c.title}</p> : null}
        <p className="text-sm text-zinc-500">สร้างเมื่อ {thaiDate(c.createdAt)}</p>
      </div>

      <section className="rounded border border-zinc-200 bg-white">
        <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold">ผลการตรวจ</h2>
        {c.reviews.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">ยังไม่มีผลการตรวจ</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {c.reviews.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <Link href={`/reviews/${r.id}`} className="text-blue-700 underline">
                    {r.document.fileName}
                  </Link>
                  <div className="text-xs text-zinc-500">
                    {thaiDate(r.createdAt)} · {r.provider}
                    {r.model ? ` (${r.model})` : ""}
                  </div>
                </div>
                <div className="text-right">
                  {r.status === "COMPLETED" ? (
                    <span className="font-medium">
                      {r.totalScore}/{r.maxScore}
                      {r.percentage ? ` (${Number(r.percentage).toFixed(2)}%)` : ""}
                    </span>
                  ) : (
                    <span className="text-amber-700">{r.status}</span>
                  )}
                </div>
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

      <UploadForm caseId={c.id} />
    </div>
  );
}
