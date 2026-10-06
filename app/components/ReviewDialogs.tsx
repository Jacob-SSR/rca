"use client";

// หน้าต่างลอยของการ "ตรวจด้วย AI" ใช้ร่วมกันทุกจุดที่กดตรวจ
//   1. ReviewLoading  — ระหว่างรอ: เอกสารถูกสแกน + ขั้นตอน + เวลาที่ผ่านไป
//   2. ReviewDone     — ตรวจเสร็จ: คะแนน + ปุ่มไปดูผล
//   3. QuotaModal     — โควตา AI หมด: นับถอยหลังถึงเวลารีเซ็ต (วัน ชั่วโมง นาที วินาที)
//
// readReviewResponse() แปลงคำตอบจาก API ให้เป็นผลลัพธ์แบบเดียวกัน
// แล้วยิง event "rca:ai-quota" ให้แถบเตือนบนหัวเว็บอัปเดตทันที

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "@/app/components/Icon";
import ScoreRing from "@/app/components/ScoreRing";
import ScanningDoc from "@/app/components/ScanningDoc";
import BlurText from "@/app/components/reactbits/BlurText";
import ShinyText from "@/app/components/reactbits/ShinyText";

export type ReviewOutcome =
  | {
      kind: "done";
      reviewId: string;
      totalScore: number | null;
      maxScore: number | null;
      percentage: number | null;
      warnings?: string[];
    }
  | { kind: "quota"; message: string; scope: "minute" | "day"; resetAt: string };

export const AI_QUOTA_EVENT = "rca:ai-quota";

/** แปลงคำตอบของ /api/review หรือ /api/forms/[id]/review — คืน error เป็นข้อความถ้าไม่ใช่สองกรณีข้างบน */
export function readReviewResponse(res: Response, json: Record<string, unknown> | null): ReviewOutcome | { kind: "error"; message: string } {
  if (res.status === 429 && json?.code === "AI_QUOTA") {
    const outcome = {
      kind: "quota" as const,
      message: String(json.error ?? "โควตา AI หมดแล้ว"),
      scope: json.scope === "minute" ? ("minute" as const) : ("day" as const),
      resetAt: String(json.resetAt),
    };
    window.dispatchEvent(new CustomEvent(AI_QUOTA_EVENT));
    return outcome;
  }
  if (!res.ok || !json) {
    return { kind: "error", message: String(json?.error ?? `ตรวจไม่สำเร็จ (${res.status})`) };
  }
  return {
    kind: "done",
    reviewId: String(json.reviewId),
    totalScore: typeof json.totalScore === "number" ? json.totalScore : null,
    maxScore: typeof json.maxScore === "number" ? json.maxScore : null,
    percentage: typeof json.percentage === "number" ? json.percentage : null,
    warnings: Array.isArray(json.extractWarnings) ? (json.extractWarnings as string[]) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// โครงหน้าต่างลอย
// ─────────────────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose?: () => void;
  label: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // วาดลง <body> ผ่าน portal — ถ้าวางในการ์ดที่มี transform (ตอน hover/แอนิเมชัน)
  // position: fixed จะถูกขังอยู่ในการ์ดแทนที่จะเต็มจอ
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-zinc-900/35 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 text-center shadow-[0_30px_80px_-20px_rgba(10,90,70,0.4)] sm:p-8"
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

const noopSubscribe = () => () => {};

// ─────────────────────────────────────────────────────────────────────────────
// 1. ระหว่างรอ AI
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { icon: "fileText" as const, text: "อ่านข้อความในเอกสาร" },
  { icon: "shield" as const, text: "ปิดบังข้อมูลระบุตัวบุคคล" },
  { icon: "sparkles" as const, text: "AI สกัดข้อมูลจากเวชระเบียน" },
  { icon: "target" as const, text: "Rule Engine ให้คะแนนตามเกณฑ์" },
];

export function ReviewLoading({ open }: { open: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!open) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => {
      clearInterval(t);
      setElapsed(0);
    };
  }, [open]);

  // ขั้นที่กำลังทำ — เดาตามเวลา (API ไม่ได้ส่งความคืบหน้ามา) ขั้นสุดท้ายค้างไว้จนเสร็จจริง
  const active = Math.min(STEPS.length - 1, elapsed < 2 ? 0 : elapsed < 4 ? 1 : elapsed < 14 ? 2 : 3);

  return (
    <Modal open={open} label="กำลังตรวจเอกสาร">
      <ScanningDoc />
      <h2 className="mt-6 text-xl font-bold">
        <ShinyText text="AI กำลังตรวจเอกสาร…" color="#076a4e" shineColor="#5ee8c0" speed={2.2} />
      </h2>
      <p className="mt-1 text-sm text-zinc-500">โดยปกติใช้เวลา 10–40 วินาที กรุณาอย่าปิดหน้านี้</p>

      {/* แถบความคืบหน้าแบบวิ่งวน */}
      <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="absolute top-0 h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-glow"
          style={{ animation: "indeterminate 1.6s ease-in-out infinite" }}
        />
      </div>

      <ol className="mt-5 space-y-2 text-left">
        {STEPS.map((st, i) => {
          const state = i < active ? "done" : i === active ? "active" : "todo";
          return (
            <li
              key={st.text}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-500 ${
                state === "active" ? "bg-brand-50 text-brand-700" : state === "done" ? "text-zinc-600" : "text-zinc-400"
              }`}
            >
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full transition-all duration-500 ${
                  state === "done"
                    ? "bg-emerald-500 text-on-brand"
                    : state === "active"
                      ? "bg-brand-600 text-on-brand"
                      : "bg-zinc-100"
                }`}
              >
                {state === "done" ? (
                  <Icon name="check" size={15} strokeWidth={3} />
                ) : state === "active" ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Icon name={st.icon} size={15} />
                )}
              </span>
              <span className="text-base">{st.text}</span>
            </li>
          );
        })}
      </ol>

      <p className="tabular mt-4 text-sm text-zinc-400">ผ่านไป {elapsed} วินาที</p>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ตรวจเสร็จแล้ว
// ─────────────────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ["#2bcc9b", "#22c1c3", "#f05aa8", "#ffb020", "#0b8a65", "#a3e635"];

function Confetti() {
  // ตำแหน่ง/สีคงที่ตาม index — render ซ้ำได้ผลเหมือนเดิม
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0">
      {Array.from({ length: 28 }, (_, i) => {
        const left = (i * 37) % 100;
        const dx = ((i * 53) % 120) - 60;
        const rot = ((i * 97) % 720) - 360;
        return (
          <span
            key={i}
            className="absolute top-0 block h-2.5 w-1.5 rounded-sm"
            style={{
              left: `${left}%`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animation: `confetti-fall ${1.6 + (i % 5) * 0.25}s cubic-bezier(0.2, 0.7, 0.4, 1) ${(i % 7) * 0.06}s both`,
              ["--dx" as string]: `${dx}px`,
              ["--rot" as string]: `${rot}deg`,
            }}
          />
        );
      })}
    </div>
  );
}

export function ReviewDone({
  outcome,
  onClose,
}: {
  outcome: Extract<ReviewOutcome, { kind: "done" }> | null;
  onClose: () => void;
}) {
  const primary = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (outcome) setTimeout(() => primary.current?.focus(), 250);
  }, [outcome]);

  const pct = outcome?.percentage ?? null;
  const verdict =
    pct === null ? "ไม่มีหัวข้อที่นับคะแนน" : pct >= 80 ? "ผ่านเกณฑ์ดี" : pct >= 60 ? "พอใช้ ยังปรับปรุงได้" : "ต้องปรับปรุง";

  return (
    <Modal open={!!outcome} onClose={onClose} label="ตรวจเสร็จแล้ว">
      {outcome ? (
        <>
          <Confetti />
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            <Icon name="x" size={18} />
          </button>

          <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
            <Icon name="check" size={26} strokeWidth={3} />
          </span>
          <h2 className="mt-4 flex justify-center text-2xl font-bold">
            <BlurText text="ตรวจเสร็จแล้ว!" animateBy="words" direction="bottom" className="justify-center" />
          </h2>
          <p className="mt-1 text-zinc-500">คะแนนตัดสินโดย Rule Engine ตามเกณฑ์ สนย.</p>

          <div className="mt-5 flex items-center justify-center gap-5">
            <ScoreRing percentage={pct} size={120} />
            <div className="text-left">
              <div className="tabular text-3xl font-bold">
                {outcome.totalScore ?? "—"}
                <span className="text-lg font-medium text-zinc-400">/{outcome.maxScore ?? "—"}</span>
              </div>
              <div className="text-sm text-zinc-500">คะแนนที่ได้</div>
              <div
                className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium ${
                  pct === null ? "bg-zinc-100 text-zinc-600" : pct >= 80 ? "bg-good-50 text-good-600" : pct >= 60 ? "bg-warn-50 text-warn-600" : "bg-bad-50 text-bad-600"
                }`}
              >
                {verdict}
              </div>
            </div>
          </div>

          {outcome.warnings && outcome.warnings.length > 0 ? (
            <div className="alert alert-info mt-5 text-left text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <Icon name="info" size={16} /> เรื่องที่ควรรู้ก่อนดูคะแนน
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {outcome.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
            <Link ref={primary} href={`/reviews/${outcome.reviewId}`} className="btn btn-primary flex-1">
              <Icon name="target" />
              ดูผลตรวจ
            </Link>
            <button type="button" onClick={onClose} className="btn flex-1">
              อยู่หน้านี้ต่อ
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. โควตา AI หมด
// ─────────────────────────────────────────────────────────────────────────────

/** มิลลิวินาทีที่เหลือ อัปเดตทุกวินาที */
export function useCountdown(resetAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!resetAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resetAt]);
  return resetAt ? Math.max(0, new Date(resetAt).getTime() - now) : 0;
}

export function splitDuration(ms: number) {
  const s = Math.ceil(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function thaiDateTime(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(
    new Date(iso),
  );
}

function TimeBox({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="min-w-16 rounded-2xl bg-warn-50 px-2 py-2.5 ring-1 ring-amber-200">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={value}
          className="tabular text-3xl leading-none font-bold text-warn-600"
          initial={{ y: -14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 14, opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {String(value).padStart(2, "0")}
        </motion.div>
      </AnimatePresence>
      <div className="mt-1 text-xs text-zinc-500">{unit}</div>
    </div>
  );
}

export function QuotaModal({
  outcome,
  onClose,
}: {
  outcome: Extract<ReviewOutcome, { kind: "quota" }> | null;
  onClose: () => void;
}) {
  const left = useCountdown(outcome?.resetAt ?? null);
  const t = splitDuration(left);

  return (
    <Modal open={!!outcome} onClose={onClose} label="โควตา AI หมดแล้ว">
      {outcome ? (
        <>
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-warn-50 text-warn-600 ring-8 ring-amber-50 animate-float">
            <Icon name="clock" size={28} />
          </span>
          <h2 className="mt-4 text-2xl font-bold">
            {outcome.scope === "minute" ? "เรียก AI ถี่เกินไป" : "โควตา AI วันนี้หมดแล้ว"}
          </h2>
          <p className="mt-1 text-zinc-500">
            {outcome.scope === "minute"
              ? "ผู้ให้บริการ AI จำกัดจำนวนครั้งต่อนาที รอสักครู่แล้วลองใหม่"
              : "ใช้ token / จำนวนครั้งของ AI ครบตามโควตารายวันแล้ว ระบบจะตรวจได้อีกครั้งเมื่อรีเซ็ต"}
          </p>

          <p className="mt-5 text-sm font-medium text-zinc-600">{left > 0 ? "รีเซ็ตในอีก" : "รีเซ็ตแล้ว ลองใหม่ได้เลย"}</p>
          {left > 0 ? (
            <div className="mt-2 flex justify-center gap-2">
              {t.d > 0 ? <TimeBox value={t.d} unit="วัน" /> : null}
              <TimeBox value={t.h} unit="ชั่วโมง" />
              <TimeBox value={t.m} unit="นาที" />
              <TimeBox value={t.s} unit="วินาที" />
            </div>
          ) : null}
          <p className="mt-3 text-sm text-zinc-500">
            ประมาณ <strong className="text-zinc-700">{thaiDateTime(outcome.resetAt)} น.</strong> (เวลาไทย)
          </p>

          <p className="alert alert-info mt-5 flex items-start gap-2 text-left text-sm">
            <Icon name="info" size={16} className="mt-1" />
            ระหว่างรอ ยังกรอกฟอร์มและกด &ldquo;บันทึกร่าง&rdquo; ได้ตามปกติ — กลับมากดตรวจหลังรีเซ็ต
          </p>

          <button type="button" onClick={onClose} className="btn btn-primary mt-5 w-full">
            เข้าใจแล้ว
          </button>
        </>
      ) : null}
    </Modal>
  );
}

/** รวมทั้งสามไว้ในตัวเดียว — ผู้ใช้ส่งแค่ busy + outcome */
export default function ReviewDialogs({
  busy,
  outcome,
  onClose,
}: {
  busy: boolean;
  outcome: ReviewOutcome | null;
  onClose: () => void;
}) {
  return (
    <>
      <ReviewLoading open={busy} />
      <ReviewDone outcome={!busy && outcome?.kind === "done" ? outcome : null} onClose={onClose} />
      <QuotaModal outcome={!busy && outcome?.kind === "quota" ? outcome : null} onClose={onClose} />
    </>
  );
}
