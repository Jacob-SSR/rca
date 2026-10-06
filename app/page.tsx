// app/page.tsx — หน้าแรก: ทางเข้างาน + รายการเคสล่าสุด

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import UploadForm from "@/app/components/UploadForm";
import ScoreBadge from "@/app/components/ScoreBadge";
import { getSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/ownership";
import Icon from "@/app/components/Icon";
import CountUp from "@/app/components/CountUp";
import OrbitSystem from "@/app/components/OrbitSystem";

export const dynamic = "force-dynamic";

/** คำทักตามช่วงเวลาไทย */
function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Bangkok" }).format(new Date()),
  );
  if (h < 12) return "สวัสดีตอนเช้า";
  if (h < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

function thaiDate(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

export default async function Home() {
  const session = await getSession();

  // เที่ยงคืนตามเวลาไทยของวันนี้ — ไว้นับ "ตรวจวันนี้"
  const todayTh = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const startOfToday = new Date(`${todayTh}T00:00:00+07:00`);

  const [caseCount, reviewStats, reviewsToday] = await Promise.all([
    prisma.case.count(),
    prisma.review.aggregate({
      where: { status: "COMPLETED" },
      _count: { _all: true },
      _avg: { percentage: true },
    }),
    prisma.review.count({ where: { status: "COMPLETED", createdAt: { gte: startOfToday } } }),
  ]);
  const avgPct = reviewStats._avg.percentage === null ? null : Number(reviewStats._avg.percentage);

  const stats = [
    { label: "เคสทั้งหมด", value: caseCount, icon: "folder" as const, tone: "from-brand-500 to-brand-300" },
    { label: "ตรวจเสร็จแล้ว", value: reviewStats._count._all, icon: "check" as const, tone: "from-emerald-600 to-emerald-700" },
    { label: "ตรวจวันนี้", value: reviewsToday, icon: "sparkles" as const, tone: "from-cyan-glow to-brand-300" },
    { label: "คะแนนเฉลี่ย", value: avgPct, suffix: "%", decimals: 1, icon: "target" as const, tone: "from-pink-glow to-warn-600" },
  ];

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
      {/* ── ฮีโร่: คำทัก + สถิติ + ระบบดาว ──────────────────────────────────── */}
      <section className="card animate-rise overflow-hidden">
        <div className="grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_17rem]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 ring-1 ring-brand-200/60">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-700 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-700" />
              </span>
              ระบบพร้อมใช้งาน
            </p>
            <h1 className="mt-4 text-3xl leading-snug font-bold sm:text-4xl sm:leading-snug">
              {greeting()}
              {session ? (
                <>
                  , <span className="text-cosmic">{session.name}</span>
                </>
              ) : null}
            </h1>
            <p className="mt-2 max-w-xl text-lg text-zinc-600">
              ศูนย์ควบคุมคุณภาพเวชระเบียนผู้ป่วยนอก — กรอก ตรวจ และออกรายงานได้ในที่เดียว
            </p>

            <dl className="stagger mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((st) => (
                <div
                  key={st.label}
                  className="rounded-2xl bg-zinc-50/80 p-4 ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:ring-brand-300/50"
                >
                  <dt className="flex items-center gap-2 text-sm text-zinc-500">
                    <span className={`grid size-7 place-items-center rounded-lg bg-gradient-to-br ${st.tone} text-[#0b0b2a]`}>
                      <Icon name={st.icon} size={16} strokeWidth={2.4} />
                    </span>
                    {st.label}
                  </dt>
                  <dd className="tabular mt-2 text-3xl font-bold tracking-tight">
                    {st.value === null ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <>
                        <CountUp value={st.value} decimals={st.decimals ?? 0} />
                        {st.suffix ? <span className="ml-0.5 text-lg font-medium text-zinc-500">{st.suffix}</span> : null}
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <OrbitSystem className="mx-auto hidden w-full max-w-[17rem] lg:block" />
        </div>
      </section>

      {/* ── ทางเข้างานหลัก ─────────────────────────────────────────────────── */}
      <div className="stagger grid gap-5 md:grid-cols-2">
        <section className="card card-pad card-hover group flex flex-col">
          <div className="flex items-center gap-3">
            <span className="icon-orb icon-orb-lg transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
              <Icon name="filePlus" size={26} />
            </span>
            <h2 className="text-xl font-semibold">กรอกฟอร์มบันทึกเวชระเบียน</h2>
          </div>
          <p className="mt-3 text-zinc-600">
            กรอกฟอร์มที่มีหัวข้อตรงตามเกณฑ์ สนย. ทั้ง 6 ข้อ ระบบจะสร้างเอกสาร .docx
            ให้แล้วส่งให้ AI ตรวจในคลิกเดียว
          </p>
          {/* 4 ขั้นตอนของฟอร์ม — ให้เห็นภาพก่อนกดเข้าไป */}
          <ol className="mt-5 flex-1 space-y-2.5">
            {[
              { icon: "search" as const, text: "ค้นหาผู้ป่วยจาก HOSxP ด้วย HN ชื่อ หรือเลขบัตร" },
              { icon: "calendar" as const, text: "เลือกครั้งที่มารับบริการ ระบบดึงข้อมูลมาให้" },
              { icon: "pencil" as const, text: "ตรวจทาน แก้ไข เห็นคะแนนเบื้องต้นทันที" },
              { icon: "sparkles" as const, text: "บันทึกและให้ AI ตรวจตามเกณฑ์" },
            ].map((st, i) => (
              <li key={st.text} className="flex items-center gap-3 text-zinc-700">
                <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-zinc-100 text-sm font-semibold text-brand-400 ring-1 ring-zinc-200">
                  {i + 1}
                </span>
                <Icon name={st.icon} className="text-zinc-400" />
                <span>{st.text}</span>
              </li>
            ))}
          </ol>
          <Link href="/forms/new" className="btn btn-primary mt-5 self-start">
            <Icon name="rocket" />
            สร้างฟอร์มใหม่
          </Link>
        </section>

        <UploadForm />
      </div>

      {/* ── รายการเคส ──────────────────────────────────────────────────────── */}
      <section className="card animate-rise overflow-hidden [animation-delay:0.25s]">
        <h2 className="card-title">
          <span className="icon-orb"><Icon name="layers" /></span>
          เคสล่าสุด
          <span className="badge ml-auto tabular">{cases.length} รายการ</span>
        </h2>

        {cases.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="icon-orb icon-orb-lg mx-auto mb-4 animate-float">
              <Icon name="inbox" size={26} />
            </span>
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
                  <th>ผู้สร้าง</th>
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
                        <Link href={`/cases/${c.id}`} className="link inline-flex items-center gap-1.5 font-medium whitespace-nowrap">
                          <Icon name="folder" size={16} className="text-brand-300" />
                          {c.caseNumber}
                        </Link>
                        {c.title ? (
                          <div className="text-sm text-zinc-500">{c.title}</div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap text-zinc-600">
                        {c.createdByName || c.createdBy || (
                          <span className="text-zinc-400">— ไม่ทราบ —</span>
                        )}
                        {isOwner(session, c) ? (
                          <span className="badge badge-brand ml-2">ของฉัน</span>
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
                          <span className="badge bg-warn-50 text-warn-600">
                            <Icon name="clock" size={14} />
                            {r.status}
                          </span>
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
