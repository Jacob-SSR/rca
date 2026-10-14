// app/page.tsx — หน้าแรก: ทางเข้างาน + รายการเคสล่าสุด

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import UploadForm from "@/app/components/UploadForm";
import ScoreBadge from "@/app/components/ScoreBadge";
import { getSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/ownership";
import Icon from "@/app/components/Icon";
import CountUp from "@/app/components/reactbits/CountUp";
import BlurText from "@/app/components/reactbits/BlurText";
import GradientText from "@/app/components/reactbits/GradientText";
import HeroArt from "@/app/components/HeroArt";
import CaseFilters from "@/app/components/CaseFilters";
import { Suspense } from "react";

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

/** คอลัมน์ของรายการเคส (จอใหญ่) — หัวกับแถวใช้ชุดเดียวกันจะได้ตรงกันเสมอ */
const CASE_COLS = "grid-cols-[minmax(12.5rem,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_9.5rem_6.5rem_8.5rem] gap-x-4";

function thaiDate(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

export default async function Home(props: PageProps<"/">) {
  const session = await getSession();
  const sp = await props.searchParams;
  const depFilter = typeof sp.dep === "string" ? sp.dep.trim() : "";
  const mineOnly = sp.mine === "1" && !!session;

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
    { label: "เคสทั้งหมด", value: caseCount, icon: "folder" as const, tone: "from-brand-600 to-brand-300" },
    { label: "ตรวจเสร็จแล้ว", value: reviewStats._count._all, icon: "check" as const, tone: "from-emerald-500 to-teal-500" },
    { label: "ตรวจวันนี้", value: reviewsToday, icon: "sparkles" as const, tone: "from-cyan-glow to-brand-300" },
    { label: "คะแนนเฉลี่ย", value: avgPct, suffix: "%", decimals: 1, icon: "target" as const, tone: "from-pink-glow to-amber-400" },
  ];

  // แผนกที่มีเคสอยู่จริง — เป็นตัวเลือกของตัวกรอง (ไม่ต้องต่อ HOSxP)
  const deptRows = await prisma.case.groupBy({
    by: ["department"],
    where: { department: { not: null } },
    orderBy: { department: "asc" },
  });
  const departmentOptions = deptRows.map((r) => r.department).filter((d): d is string => !!d);

  const cases = await prisma.case.findMany({
    where: {
      ...(depFilter ? { department: depFilter } : {}),
      ...(mineOnly ? { createdBy: session!.username } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      _count: { select: { documents: true, forms: true } },
      // คลินิกจากฟอร์มล่าสุด — สำรองไว้แสดงถ้าเคสเก่ายังไม่มีแผนกที่สร้าง
      forms: { orderBy: { updatedAt: "desc" }, take: 1, select: { department: true } },
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
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              ระบบพร้อมใช้งาน
            </p>
            <h1 className="mt-4 flex flex-wrap items-baseline gap-x-2 text-3xl leading-snug font-bold sm:text-4xl sm:leading-snug">
              <BlurText text={session ? `${greeting()},` : greeting()} delay={120} />
              {session ? (
                <GradientText colors={["#0b8a65", "#22c1c3", "#2bcc9b", "#0b8a65"]} animationSpeed={6}>
                  {session.name}
                </GradientText>
              ) : null}
            </h1>
            <p className="mt-2 max-w-xl text-lg text-zinc-600">
              ศูนย์ควบคุมคุณภาพเวชระเบียนผู้ป่วยนอก — กรอก ตรวจ และออกรายงานได้ในที่เดียว
            </p>

            <dl className="stagger mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((st) => (
                <div
                  key={st.label}
                  className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md hover:ring-brand-200"
                >
                  <dt className="flex items-center gap-2 text-sm text-zinc-500">
                    <span className={`grid size-7 place-items-center rounded-lg bg-gradient-to-br ${st.tone} text-white`}>
                      <Icon name={st.icon} size={16} strokeWidth={2.4} />
                    </span>
                    {st.label}
                  </dt>
                  <dd className="tabular mt-2 text-3xl font-bold tracking-tight">
                    {st.value === null ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <>
                        <CountUp to={st.decimals ? Math.round(st.value * 10) / 10 : st.value} duration={1.2} separator="," />
                        {st.suffix ? <span className="ml-0.5 text-lg font-medium text-zinc-500">{st.suffix}</span> : null}
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <HeroArt className="mx-auto hidden w-full max-w-[17rem] lg:block" />
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
                <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600 ring-1 ring-brand-200">
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
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-5 py-4 sm:px-6">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold">
            <span className="icon-orb"><Icon name="layers" /></span>
            เคสล่าสุด
            <span className="badge tabular">{cases.length} รายการ</span>
          </h2>
          <div className="sm:ml-auto">
            <Suspense fallback={null}>
              <CaseFilters departments={departmentOptions} />
            </Suspense>
          </div>
        </div>

        {cases.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="icon-orb icon-orb-lg mx-auto mb-4 animate-float">
              <Icon name="inbox" size={26} />
            </span>
            <p className="text-lg text-zinc-500">
              {depFilter || mineOnly ? "ไม่มีเคสตามตัวกรองที่เลือก" : "ยังไม่มีเคสในระบบ"}
            </p>
            <p className="mt-1 text-zinc-400">
              เริ่มจากสร้างฟอร์มใหม่ หรืออัปโหลดเอกสารด้านบน
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {/* หัวคอลัมน์ — จอใหญ่เท่านั้น จอเล็กแต่ละแถวบอกตัวเองว่าอะไรคืออะไร */}
            <li aria-hidden className="hidden items-center gap-4 border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-sm font-semibold tracking-wide text-zinc-500 lg:flex">
              <div className={`grid flex-1 ${CASE_COLS}`}>
                <span>เลขที่เคส</span>
                <span>แผนกที่สร้าง</span>
                <span>ผู้สร้าง</span>
                <span>วันที่สร้าง</span>
                <span className="text-center">ฟอร์ม / เอกสาร</span>
                <span>คะแนนล่าสุด</span>
              </div>
              <span className="w-[22px]" />
            </li>
            {cases.map((c) => {
              const r = c.reviews[0];
              const dept = c.department || c.forms[0]?.department || null;
              const creator = c.createdByName || c.createdBy || null;
              const score = !r ? (
                <span className="text-sm text-zinc-400">ยังไม่ตรวจ</span>
              ) : r.status !== "COMPLETED" ? (
                <span className="badge bg-warn-50 text-warn-600">
                  <Icon name="clock" size={14} />
                  {r.status}
                </span>
              ) : (
                <ScoreBadge total={r.totalScore} max={r.maxScore} percentage={r.percentage?.toString() ?? null} />
              );
              return (
                <li key={c.id}>
                  {/* ทั้งแถวกดได้ → หน้าเคส (ผลตรวจทุกครั้งอยู่ในนั้น) */}
                  <Link href={`/cases/${c.id}`} className="row-link" aria-label={`เปิดเคส ${c.caseNumber}`}>
                    {/* จอเล็ก: เลขเคส + คะแนนบรรทัดแรก รายละเอียดบรรทัดล่าง */}
                    <div className="min-w-0 flex-1 lg:hidden">
                      {/* เลขเคสไม่ตัดกลางตัวเลข — ที่ไม่พอคะแนนจะลงไปบรรทัดถัดไปเอง */}
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="tabular font-semibold whitespace-nowrap text-brand-700">{c.caseNumber}</span>
                        <span className="shrink-0">{score}</span>
                      </div>
                      {c.title ? <p className="truncate text-sm text-zinc-600">{c.title}</p> : null}
                      <p className="mt-1 text-sm text-zinc-500">
                        {[dept, creator, thaiDate(c.createdAt)].filter(Boolean).join(" · ")}
                        {isOwner(session, c) ? <span className="badge badge-brand ml-2">ของฉัน</span> : null}
                      </p>
                    </div>

                    {/* จอใหญ่: คอลัมน์ตรงกับหัว */}
                    <div className={`hidden min-w-0 flex-1 items-center lg:grid ${CASE_COLS}`}>
                      <span className="min-w-0">
                        <span className="tabular flex items-center gap-1.5 font-semibold whitespace-nowrap text-brand-700">
                          <Icon name="folder" size={16} className="text-brand-300" />
                          {c.caseNumber}
                        </span>
                        {c.title ? <span className="block truncate text-sm text-zinc-500">{c.title}</span> : null}
                      </span>
                      <span className="truncate text-zinc-600">{dept ?? <span className="text-zinc-400">—</span>}</span>
                      <span className="min-w-0 text-zinc-600">
                        <span className="block truncate">{creator ?? <span className="text-zinc-400">ไม่ทราบ</span>}</span>
                        {isOwner(session, c) ? <span className="badge badge-brand mt-0.5">ของฉัน</span> : null}
                      </span>
                      <span className="tabular text-sm text-zinc-600">{thaiDate(c.createdAt)}</span>
                      <span className="tabular flex items-center justify-center gap-3 text-sm text-zinc-500">
                        <span className="inline-flex items-center gap-1" title="ฟอร์ม">
                          <Icon name="fileText" size={15} />
                          {c._count.forms}
                        </span>
                        <span className="inline-flex items-center gap-1" title="เอกสาร">
                          <Icon name="layers" size={15} />
                          {c._count.documents}
                        </span>
                      </span>
                      <span>{score}</span>
                    </div>

                    <Icon name="chevronRight" size={22} className="row-link-chevron" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
