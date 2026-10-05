"use client";

// แผงผล "ตรวจอัตโนมัติ (OPD)" — คิดคะแนนใหม่ทุกครั้งที่ฟอร์มเปลี่ยน ไม่ยิงเซิร์ฟเวอร์
// ปิดได้ด้วยสวิตช์ (จำค่าไว้ในเครื่อง) สำหรับคนที่ไม่อยากเห็นคะแนนระหว่างพิมพ์

import { improvementTip } from "@/lib/review/auto-audit";
import type { RuleEngineResult } from "@/lib/review/types";

type Props = {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  result: RuleEngineResult | null;
  /** กดที่หัวข้อแล้วเลื่อนไปที่ส่วนนั้นของฟอร์ม */
  onJump: (criterionCode: string) => void;
};

/** สีตามสัดส่วนคะแนน — มีตัวเลขกำกับเสมอ ไม่ใช้สีอย่างเดียวบอกความหมาย */
export function scoreTone(score: number | null, max: number): string {
  if (score === null) return "bg-zinc-100 text-zinc-600";
  if (score >= max) return "bg-emerald-50 text-emerald-700";
  if (score === 0) return "bg-red-50 text-red-700";
  return "bg-warn-50 text-warn-600";
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 rounded-lg px-1 py-1 text-base font-medium text-zinc-800"
    >
      <span
        aria-hidden
        className={`relative inline-block h-6 w-11 rounded-full transition ${
          checked ? "bg-brand-600" : "bg-zinc-300"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[1.375rem]" : "left-0.5"
          }`}
        />
      </span>
      {label}
      <span className={`text-sm ${checked ? "text-brand-600" : "text-zinc-500"}`}>
        {checked ? "เปิด" : "ปิด"}
      </span>
    </button>
  );
}

export default function AutoAuditPanel({ enabled, onToggle, result, onJump }: Props) {
  const pct = result?.percentage ?? null;

  return (
    <section className="card overflow-hidden" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
        <Switch checked={enabled} onChange={onToggle} label="ตรวจอัตโนมัติ (OPD)" />
        {enabled && result ? (
          <div className="flex items-center gap-3">
            <span className="tabular text-2xl font-semibold text-zinc-900">
              {result.totalScore}
              <span className="text-base font-normal text-zinc-500">/{result.maxScore}</span>
            </span>
            {pct !== null ? (
              <span className={`badge tabular ${pct >= 80 ? "bg-emerald-50 text-emerald-700" : pct >= 50 ? "bg-warn-50 text-warn-600" : "bg-red-50 text-red-700"}`}>
                {pct.toFixed(0)}%
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {enabled && result ? (
        <>
          {/* แถบคะแนนรวม */}
          <div className="px-5 sm:px-6">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
          </div>

          <ul className="grid gap-px bg-zinc-100 pt-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((it) => {
              const tip = improvementTip(it.criterionCode, it.score, it.criterionMaxScore);
              return (
                <li key={it.criterionCode} className="bg-white">
                  <button
                    type="button"
                    onClick={() => onJump(it.criterionCode)}
                    className="block h-full w-full px-5 py-3 text-left hover:bg-zinc-50 sm:px-6"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-zinc-800">
                        {it.criterionName.split(" (")[0].split(" กรณี")[0]}
                      </span>
                      <span className={`badge tabular shrink-0 ${scoreTone(it.score, it.criterionMaxScore)}`}>
                        {it.isNA ? "N/A" : `${it.score}/${it.criterionMaxScore}`}
                      </span>
                    </span>
                    {tip ? <span className="mt-1 block text-sm text-zinc-500">→ {tip}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="border-t border-zinc-100 px-5 py-2.5 text-sm text-zinc-500 sm:px-6">
            ผลประเมินเบื้องต้นจากกติกาเกณฑ์ สนย. (Form A1 ผู้ป่วยนอก) คิดจากข้อความในฟอร์มทันที —
            ผลตรวจที่บันทึกจริงใช้ปุ่ม &ldquo;บันทึกและตรวจด้วย AI&rdquo; ด้านล่าง
          </p>
        </>
      ) : !enabled ? (
        <p className="px-5 pb-3 text-sm text-zinc-500 sm:px-6">
          ปิดอยู่ — เปิดเพื่อดูคะแนนเบื้องต้นของแต่ละหัวข้อระหว่างกรอก (เฉพาะผู้ป่วยนอก)
        </p>
      ) : null}
    </section>
  );
}
