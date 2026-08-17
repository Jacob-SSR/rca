// app/reviews/[id]/page.tsx — ผลตรวจ 1 ครั้ง: คะแนนต่อหัวข้อ + เหตุผล + evidence จริง

import Link from "next/link";
import { notFound } from "next/navigation";
import { getReviewDetail } from "@/lib/review/queries";
import ScoreBadge from "@/app/components/ScoreBadge";

export const dynamic = "force-dynamic";

function thaiDate(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

/** แถบแสดงสัดส่วนคะแนนของหัวข้อนั้น — เห็นได้เร็วกว่าอ่านตัวเลข */
function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const color = pct >= 80 ? "bg-good-600" : pct >= 60 ? "bg-warn-600" : "bg-bad-600";

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function ReviewPage({ params }: PageProps<"/reviews/[id]">) {
  const { id } = await params;
  const review = await getReviewDetail(id);
  if (!review) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/cases/${review.caseId}`} className="link text-base">
          ← กลับไปที่เคส {review.case.caseNumber}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">ผลการตรวจคุณภาพการบันทึก</h1>
        <p className="mt-1 text-zinc-600">{review.document.fileName}</p>
      </div>

      {review.status !== "COMPLETED" ? (
        <p className="alert bg-warn-50 text-warn-600">
          สถานะ: {review.status} — ยังไม่มีคะแนน
        </p>
      ) : (
        <>
          {/* ── สรุปคะแนนรวม ─────────────────────────────────────────────── */}
          <section className="card card-pad">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div>
                <p className="text-zinc-600">คะแนนรวม</p>
                <div className="mt-2">
                  <ScoreBadge
                    total={review.totalScore}
                    max={review.maxScore}
                    percentage={review.percentage}
                    size="lg"
                  />
                </div>
                <p className="mt-3 text-sm text-zinc-500">
                  คะแนนเต็มนับเฉพาะหัวข้อที่ไม่ใช่ N/A · ตัดสินโดย Rule Engine ตามเกณฑ์
                </p>
              </div>

              <a href={`/api/reviews/${review.id}/export`} className="btn btn-primary">
                ดาวน์โหลดสรุปผล (.docx)
              </a>
            </div>

            <dl className="mt-6 grid gap-4 border-t border-zinc-100 pt-5 text-base sm:grid-cols-3">
              <div>
                <dt className="text-sm text-zinc-500">วันที่ตรวจ</dt>
                <dd className="tabular">{thaiDate(review.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">เกณฑ์ที่ใช้</dt>
                <dd className="tabular">
                  {review.criteriaSet.code} v{review.criteriaSet.version}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">ผู้ช่วยสกัดข้อมูล</dt>
                <dd>
                  {review.provider}
                  {review.model ? ` (${review.model})` : ""}
                </dd>
              </div>
            </dl>
          </section>

          {/* ── คะแนนรายหัวข้อ ───────────────────────────────────────────── */}
          <section className="space-y-4">
            {review.items.map((item) => (
              <article key={item.id} className="card card-pad">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="badge badge-brand">{item.criterion.code}</span>
                    <h3 className="mt-2 text-lg font-semibold">{item.criterion.name}</h3>
                  </div>

                  <div className="shrink-0 text-right">
                    {item.isNA ? (
                      <span className="badge">N/A</span>
                    ) : (
                      <span className="tabular text-2xl font-semibold">
                        {item.score}
                        <span className="text-lg font-normal text-zinc-400">
                          /{item.criterion.maxScore}
                        </span>
                      </span>
                    )}
                  </div>
                </header>

                {!item.isNA && item.score !== null ? (
                  <div className="mt-3">
                    <ScoreBar score={item.score} max={item.criterion.maxScore} />
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-500">เหตุผล</div>
                    <p className="mt-0.5">{item.reason}</p>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-zinc-500">หลักฐานจากเอกสาร</div>
                    {item.evidence ? (
                      <blockquote className="mt-1 rounded-lg border-l-4 border-brand-200 bg-brand-50/60 px-4 py-2.5">
                        {item.evidence}
                      </blockquote>
                    ) : (
                      <p className="mt-0.5 text-zinc-400">— ไม่พบข้อความอ้างอิงในเอกสาร —</p>
                    )}
                  </div>
                </div>

                <details className="mt-4 border-t border-zinc-100 pt-3">
                  <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-700">
                    ดูเกณฑ์การให้คะแนนของหัวข้อนี้
                  </summary>
                  <ul className="mt-3 space-y-1.5 text-base">
                    {item.criterion.levels.map((level) => {
                      const active = level.score === item.score && !item.isNA;
                      return (
                        <li
                          key={level.id}
                          className={
                            active
                              ? "rounded-lg bg-brand-50 px-3 py-2 font-medium text-brand-700"
                              : "px-3 py-2 text-zinc-600"
                          }
                        >
                          <span className="tabular mr-2 font-semibold">{level.score}</span>
                          {level.description}
                        </li>
                      );
                    })}
                  </ul>
                  {item.criterion.allowNA && item.criterion.naRule ? (
                    <p className="mt-2 px-3 text-sm text-zinc-500">
                      N/A: {item.criterion.naRule}
                    </p>
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
