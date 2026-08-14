// app/reviews/[id]/page.tsx — ผลตรวจ 1 ครั้ง: คะแนนต่อหัวข้อ + เหตุผล + evidence จริง
// "ไม่ต้องสวย พอเห็นคะแนนต่อหัวข้อ + evidence" (สเปกข้อ 9)

import Link from "next/link";
import { notFound } from "next/navigation";
import { getReviewDetail } from "@/lib/review/queries";

export const dynamic = "force-dynamic";

function thaiDate(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

export default async function ReviewPage({ params }: PageProps<"/reviews/[id]">) {
  const { id } = await params;
  const review = await getReviewDetail(id);
  if (!review) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/cases/${review.caseId}`} className="text-sm text-blue-700 underline">
          ← กลับไปที่เคส {review.case.caseNumber}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">ผลการตรวจ · {review.document.fileName}</h1>
        <p className="text-sm text-zinc-500">
          {thaiDate(review.createdAt)} · เกณฑ์ {review.criteriaSet.code} v{review.criteriaSet.version}{" "}
          · สกัดข้อมูลโดย {review.provider}
          {review.model ? ` (${review.model})` : ""}
        </p>
      </div>

      {review.status !== "COMPLETED" ? (
        <p className="rounded bg-amber-50 p-4 text-sm text-amber-800">
          สถานะ: {review.status} — ยังไม่มีคะแนน
        </p>
      ) : (
        <>
          <div className="rounded border border-zinc-200 bg-white p-4">
            <div className="text-3xl font-semibold">
              {review.totalScore} / {review.maxScore}
              {review.percentage ? (
                <span className="ml-2 text-xl text-zinc-500">
                  ({Number(review.percentage).toFixed(2)}%)
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              คะแนนเต็มนับเฉพาะหัวข้อที่ไม่ใช่ N/A · ตัดสินโดย Rule Engine ตามเกณฑ์
            </p>
            <a
              href={`/api/reviews/${review.id}/export`}
              className="mt-3 inline-block rounded bg-zinc-900 px-4 py-2 text-sm text-white"
            >
              ดาวน์โหลดสรุปผล (.docx)
            </a>
          </div>

          <section className="space-y-3">
            {review.items.map((item) => (
              <article key={item.id} className="rounded border border-zinc-200 bg-white p-4">
                <header className="flex items-baseline justify-between gap-4">
                  <h3 className="font-semibold">
                    <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                      {item.criterion.code}
                    </span>
                    {item.criterion.name}
                  </h3>
                  <span className="shrink-0 text-lg font-semibold">
                    {item.isNA ? "N/A" : `${item.score} / ${item.criterion.maxScore}`}
                  </span>
                </header>

                <p className="mt-2 text-sm text-zinc-700">
                  <span className="text-zinc-500">เหตุผล: </span>
                  {item.reason}
                </p>

                <p className="mt-1 text-sm">
                  <span className="text-zinc-500">หลักฐานจากเอกสาร: </span>
                  {item.evidence ? (
                    <span className="rounded bg-yellow-50 px-1">{item.evidence}</span>
                  ) : (
                    <span className="text-zinc-400">— ไม่พบข้อความอ้างอิงในเอกสาร —</span>
                  )}
                </p>

                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-zinc-500">
                    ดูเกณฑ์การให้คะแนนของหัวข้อนี้
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                    {item.criterion.levels.map((level) => (
                      <li
                        key={level.id}
                        className={level.score === item.score ? "font-semibold text-zinc-900" : ""}
                      >
                        {level.score} — {level.description}
                      </li>
                    ))}
                  </ul>
                  {item.criterion.allowNA && item.criterion.naRule ? (
                    <p className="mt-1 text-xs text-zinc-500">N/A: {item.criterion.naRule}</p>
                  ) : null}
                </details>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
