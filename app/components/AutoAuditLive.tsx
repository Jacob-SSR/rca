"use client";

// การ์ดความคืบหน้าสดของรอบตรวจอัตโนมัติที่กำลังรัน
// เห็นว่ากำลังตรวจ visit ไหน อยู่ขั้นไหน (HOSxP → ฟอร์ม → เอกสาร → AI) เหลือคิวกี่ราย
// และผลรายล่าสุดที่ทยอยเสร็จ — ข้อมูลมาจาก GET /api/auto-audit (running.live) ที่ poll อยู่แล้ว
//
// ไม่มีข้อมูลสด (รอบรันอยู่ process อื่น) ก็ยังแสดงแถบความคืบหน้าจากตัวเลขใน DB ได้
// animation ทั้งหมดหยุดเองเมื่อผู้ใช้ตั้ง prefers-reduced-motion (ดู globals.css)

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import Icon, { type IconName } from "@/app/components/Icon";
import OfficeScene from "@/app/components/OfficeScene";
import ShinyText from "@/app/components/reactbits/ShinyText";
import { pctTone } from "@/app/components/ScoreBadge";
import { formatThaiDateShort } from "@/lib/form/thai-date";
import type { AuditStep, LiveProgress } from "@/lib/auto-audit/progress";

const STEPS: { key: AuditStep; label: string; doing: string; icon: IconName }[] = [
  { key: "lookup", label: "ดึง HOSxP", doing: "กำลังดึงข้อมูล visit จาก HOSxP", icon: "search" },
  { key: "form", label: "สร้างฟอร์ม", doing: "กำลังสร้างเคสและฟอร์มบันทึก", icon: "clipboard" },
  { key: "document", label: "สร้างเอกสาร", doing: "กำลังสร้างเอกสารเวชระเบียน", icon: "layers" },
  { key: "review", label: "AI ตรวจ", doing: "AI กำลังตรวจตามเกณฑ์ Form A1", icon: "sparkles" },
];

const PHASE_TEXT: Record<LiveProgress["phase"], string> = {
  fetching: "กำลังดึงรายการ visit จาก HOSxP…",
  planning: "กำลังเลือกรายที่จะตรวจ…",
  auditing: "",
};

/** วินาทีที่ผ่านไปตั้งแต่เวลาที่ให้มา — เดินทุกวินาที */
function useElapsed(since: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000)) : 0;
}

function elapsedText(s: number): string {
  return s < 60 ? `${s} วิ` : `${Math.floor(s / 60)} นาที ${s % 60} วิ`;
}

export default function AutoAuditLive({
  targetDate,
  live,
  reviewed,
  failed,
  target,
}: {
  targetDate: string;
  live: LiveProgress | null;
  /** ตัวเลขจาก DB — ใช้เมื่อไม่มีข้อมูลสด */
  reviewed: number;
  failed: number;
  /** เป้าของรอบ (null = ทุกราย) */
  target: number | null;
}) {
  const done = live ? live.done : reviewed + failed;
  const total = live && live.phase === "auditing" ? live.total : target;
  const pct = total ? Math.min(100, (done / total) * 100) : null;
  const current = live?.current ?? null;
  const activeIdx = current ? STEPS.findIndex((s) => s.key === current.step) : -1;
  const stepElapsed = useElapsed(current?.stepStartedAt ?? null);
  const preparing = live && live.phase !== "auditing";

  return (
    <section
      className="card animate-rise overflow-hidden ring-1 ring-brand-200"
      aria-live="polite"
      aria-label="ความคืบหน้าการตรวจอัตโนมัติ"
    >
      {/* แถบไล่สีวิ่งด้านบน — บอกว่ามีงานกำลังทำอยู่ */}
      <div
        className="h-1 bg-gradient-to-r from-brand-500 via-cyan-glow to-brand-500"
        style={{ backgroundSize: "200% 100%", animation: "gradient-pan 3s ease infinite" }}
      />

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {/* ── หัว: ชื่อ + ตัวนับ ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-600 text-on-brand animate-pulse-ring">
              <Icon name="orbit" size={22} className="animate-spin [animation-duration:6s]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">
                <ShinyText text="กำลังตรวจอัตโนมัติ…" color="#076a4e" shineColor="#5ee8c0" speed={2.2} />
              </h2>
              <p className="text-sm text-zinc-500">visit วันที่ {formatThaiDateShort(targetDate)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="tabular text-3xl leading-none font-bold text-brand-700">
              <span key={done} className="inline-block animate-rise">{done}</span>
              <span className="text-xl text-zinc-400"> / {total ?? "—"}</span>
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              สำเร็จ {live ? live.done - live.failed : reviewed} · ไม่สำเร็จ {live ? live.failed : failed}
            </p>
          </div>
        </div>

        {/* ── แถบความคืบหน้า ─────────────────────────────────────────────── */}
        <div
          className="relative h-2.5 overflow-hidden rounded-full bg-zinc-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total ?? undefined}
          aria-valuenow={done}
        >
          {pct === null || preparing ? (
            <div
              className="absolute top-0 h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-glow"
              style={{ animation: "indeterminate 1.6s ease-in-out infinite" }}
            />
          ) : (
            <div
              className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-brand-500 to-cyan-glow transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(pct, 3)}%` }}
            >
              <span
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                style={{ animation: "shimmer 1.8s ease-in-out infinite" }}
              />
            </div>
          )}
        </div>

        {preparing ? (
          <div className="flex flex-col items-center gap-2">
            <OfficeScene step="lookup" className="w-80 max-w-full rounded-2xl ring-1 ring-brand-100" />
            <p className="text-center text-zinc-600">{PHASE_TEXT[live.phase]}</p>
          </div>
        ) : null}

        {/* ── ขั้นตอนของรายที่กำลังตรวจ ──────────────────────────────────── */}
        {live && !preparing ? (
          <ol className="flex items-start" aria-label="ขั้นตอนการตรวจ">
            {STEPS.map((st, i) => {
              const state = activeIdx < 0 ? "todo" : i < activeIdx ? "done" : i === activeIdx ? "active" : "todo";
              return (
                <Fragment key={st.key}>
                  {i > 0 ? <Connector filled={activeIdx >= i} flowing={i === activeIdx} /> : null}
                  <li className="flex w-16 shrink-0 flex-col items-center text-center sm:w-20">
                    <span
                      className={`relative grid size-11 place-items-center rounded-2xl transition-all duration-500 ${
                        state === "done"
                          ? "bg-brand-500 text-on-brand"
                          : state === "active"
                            ? "scale-110 bg-gradient-to-br from-brand-600 to-cyan-glow text-on-brand shadow-lg animate-pulse-ring"
                            : "bg-zinc-100 text-zinc-400"
                      }`}
                    >
                      <Icon name={state === "done" ? "check" : st.icon} size={20} strokeWidth={state === "done" ? 2.6 : 2} />
                      {state === "active" ? (
                        <span className="absolute -inset-1 animate-spin rounded-[1.1rem] border-2 border-transparent border-t-cyan-glow [animation-duration:1.4s]" />
                      ) : null}
                    </span>
                    <span
                      className={`mt-2 text-xs leading-tight sm:text-sm ${state === "active" ? "font-semibold text-brand-700" : state === "done" ? "text-zinc-600" : "text-zinc-400"}`}
                    >
                      {st.label}
                    </span>
                  </li>
                </Fragment>
              );
            })}
          </ol>
        ) : null}

        {/* ── รายที่กำลังตรวจ ────────────────────────────────────────────── */}
        {current ? (
          <div
            key={current.vn}
            className="flex animate-rise flex-col items-center gap-4 rounded-2xl bg-gradient-to-r from-brand-50 to-white p-4 ring-1 ring-brand-100 sm:flex-row"
          >
            {/* ฉากออฟฟิศ — ฟองความคิดบอกขั้นที่ทำอยู่ · ✓ +1 ทุกครั้งที่ตรวจเสร็จหนึ่งราย */}
            <OfficeScene
              step={current.step}
              cheer={done}
              job={current.vn}
              pending={live ? Math.max(0, live.total - live.done - 1) : 0}
              className="w-full max-w-md shrink-0 rounded-2xl ring-1 ring-brand-100 sm:w-80"
            />
            <div className="w-full min-w-0 flex-1">
              <p className="text-sm text-zinc-500">
                กำลังตรวจรายที่ {Math.min(done + 1, total ?? done + 1)}
                {total ? ` จาก ${total}` : ""}
              </p>
              <p className="tabular truncate text-xl font-bold">VN {current.vn}</p>
              <p className="truncate text-zinc-600">
                {current.department ?? "ไม่ทราบแผนก"}
                {current.time ? ` · มา ${current.time} น.` : ""}
              </p>
              <p className="mt-1 text-sm text-brand-700">
                <span className="mr-2 inline-block size-2 rounded-full bg-brand-500 align-middle animate-pulse-ring" />
                {STEPS[activeIdx]?.doing ?? "กำลังทำงาน"}
                <span className="tabular whitespace-nowrap text-zinc-500"> · {elapsedText(stepElapsed)}</span>
              </p>
            </div>
          </div>
        ) : null}

        {/* ── คิวถัดไป / เพิ่งเสร็จ ──────────────────────────────────────── */}
        {live && (live.queue.length > 0 || live.recent.length > 0) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-zinc-500">
                คิวถัดไป{live.total - live.done - (current ? 1 : 0) > 0 ? ` (${live.total - live.done - (current ? 1 : 0)} ราย)` : ""}
              </h3>
              {live.queue.length === 0 ? (
                <p className="text-sm text-zinc-400">รายสุดท้ายแล้ว</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {live.queue.map((q, i) => (
                    <li
                      key={q.vn}
                      className="badge tabular animate-rise"
                      style={{ animationDelay: `${i * 60}ms`, opacity: 1 - i * 0.12 }}
                      title={q.department ?? undefined}
                    >
                      VN {q.vn}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-zinc-500">เพิ่งตรวจเสร็จ</h3>
              {live.recent.length === 0 ? (
                <p className="text-sm text-zinc-400">ยังไม่มี</p>
              ) : (
                <ul className="space-y-1.5">
                  {live.recent.map((r, i) => {
                    const body = (
                      <>
                        <Icon
                          name={r.error ? "x" : "check"}
                          size={15}
                          strokeWidth={2.6}
                          className={r.error ? "text-red-600" : "text-emerald-600"}
                        />
                        <span className="tabular min-w-0 truncate text-zinc-600">VN {r.vn}</span>
                        {r.error ? (
                          <span className="min-w-0 flex-1 truncate text-red-700" title={r.error}>
                            {r.error}
                          </span>
                        ) : (
                          <span className="ml-auto flex shrink-0 items-center gap-1">
                            {typeof r.percentage === "number" ? (
                              <span className={`badge tabular ${pctTone(r.percentage)}`}>{r.percentage.toFixed(1)}%</span>
                            ) : null}
                            {r.caseId ? <Icon name="chevronRight" size={18} className="text-zinc-400" /> : null}
                          </span>
                        )}
                      </>
                    );
                    const cls = `flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm ring-1 ring-zinc-200 ${i === 0 ? "animate-rise bg-white" : "bg-zinc-50"}`;
                    return (
                      <li key={r.vn}>
                        {r.caseId && !r.error ? (
                          <Link
                            href={`/cases/${r.caseId}`}
                            className={`${cls} transition hover:bg-brand-50 hover:ring-brand-200`}
                            aria-label={`ดูเคส VN ${r.vn}`}
                          >
                            {body}
                          </Link>
                        ) : (
                          <div className={cls}>{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** เส้นเชื่อมระหว่างขั้น — ผ่านแล้วเติมสี ขั้นที่กำลังทำมีจุดข้อมูลวิ่งเข้าไปหา */
function Connector({ filled, flowing }: { filled: boolean; flowing: boolean }) {
  return (
    <span aria-hidden className="relative mt-5 h-1 flex-1 rounded-full bg-zinc-200">
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-500 to-cyan-glow transition-[width] duration-700 ease-out"
        style={{ width: filled ? "100%" : "0%" }}
      />
      {flowing ? (
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_3px_var(--color-cyan-glow)]"
          style={{ animation: "flow-dot 1.1s linear infinite" }}
        />
      ) : null}
    </span>
  );
}
