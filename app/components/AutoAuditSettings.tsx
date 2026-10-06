"use client";

// หน้าตั้งค่าตรวจอัตโนมัติด้วย AI — เปิด/ปิด, เวลา, วันในสัปดาห์, วันเป้าหมาย, จำนวนต่อรอบ
// + ปุ่มรันเดี๋ยวนี้ (เลือกวันที่ได้) + ประวัติรอบที่ผ่านมา

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AI_QUOTA_EVENT, Modal } from "@/app/components/ReviewDialogs";
import { Switch } from "@/app/components/AutoAuditPanel";
import { formatThaiDateShort } from "@/lib/form/thai-date";
import Icon from "@/app/components/Icon";
import {
  MAX_VISITS_CAP,
  TARGET_DAYS,
  WEEKDAY_LABELS,
  settingsSchema,
  type AutoAuditSettings as Settings,
  type TargetDay,
} from "@/lib/auto-audit/schedule";

type RunItem = { vn: string; caseId?: string; percentage?: number | null; error?: string };

type Run = {
  id: string;
  targetDate: string;
  trigger: string;
  status: string;
  found: number;
  reviewed: number;
  skipped: number;
  failed: number;
  avgPercent: string | null;
  results: RunItem[] | null;
  error: string | null;
  startedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type Data = {
  settings: Settings & { updatedBy: string | null; updatedAt: string | null };
  nextRun: string | null;
  hosxpEnabled: boolean;
  running: { id: string; targetDate: string } | null;
  runs: Run[];
};

const PRESETS: { label: string; days: number[] }[] = [
  { label: "ทุกวัน", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "จันทร์–ศุกร์", days: [1, 2, 3, 4, 5] },
];

function thaiDateTime(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

const STATUS: Record<string, { label: string; cls: string }> = {
  RUNNING: { label: "กำลังตรวจ…", cls: "bg-brand-50 text-brand-700" },
  COMPLETED: { label: "เสร็จ", cls: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "ล้มเหลว", cls: "bg-red-50 text-red-700" },
};

export default function AutoAuditSettings() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [runDate, setRunDate] = useState("");
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  /** รอบที่เพิ่งจบขณะเปิดหน้านี้อยู่ — แสดง popup สรุปผล */
  const [finished, setFinished] = useState<Run | null>(null);
  const runningId = useRef<string | null>(null);

  const load = useCallback(async (resetForm: boolean) => {
    const res = await fetch("/api/admin/auto-audit", { cache: "no-store" });
    if (!res.ok) {
      setMessage({ ok: false, text: `โหลดค่าตั้งค่าไม่สำเร็จ (${res.status})` });
      return;
    }
    const json = (await res.json()) as Data;
    setData(json);

    // เคยเห็นว่ากำลังรัน แล้วตอนนี้ไม่รันแล้ว = รอบนั้นเพิ่งจบ → popup
    const prev = runningId.current;
    runningId.current = json.running?.id ?? null;
    if (prev && !json.running) {
      const done = json.runs.find((r) => r.id === prev);
      if (done) {
        setFinished(done);
        if (done.error?.includes("โควตา")) window.dispatchEvent(new CustomEvent(AI_QUOTA_EVENT));
      }
    }
    if (resetForm) {
      const { enabled, runTime, weekdays, targetDay, maxVisits } = json.settings;
      setForm({ enabled, runTime, weekdays, targetDay, maxVisits });
      setDirty(false);
    }
  }, []);

  // โหลดครั้งแรกตอนเปิดหน้า (ค่าตั้งค่าอยู่ใน DB ฝั่ง server)
  useEffect(() => {
    (async () => {
      await load(true);
    })();
  }, [load]);

  // มีรอบกำลังรัน → ดึงความคืบหน้าทุก 5 วินาที
  const running = !!data?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(false), 5000);
    return () => clearInterval(t);
  }, [running, load]);

  function patch(p: Partial<Settings>) {
    setForm((f) => (f ? { ...f, ...p } : f));
    setDirty(true);
    setMessage(null);
  }

  const check = form ? settingsSchema.safeParse(form) : null;
  const formError = check && !check.success ? check.error.issues[0]?.message : null;

  async function save(next?: Settings) {
    const body = next ?? form;
    if (!body) return;
    const v = settingsSchema.safeParse(body);
    if (!v.success) {
      setMessage({ ok: false, text: v.error.issues[0]?.message ?? "ค่าตั้งค่าไม่ถูกต้อง" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/auto-audit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v.data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: json?.error ?? `บันทึกไม่สำเร็จ (${res.status})` });
        return;
      }
      setMessage({ ok: true, text: "บันทึกแล้ว" });
      await load(true);
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setStarting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/auto-audit/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runDate ? { targetDate: runDate } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: json?.error ?? `เริ่มรันไม่สำเร็จ (${res.status})` });
        return;
      }
      setMessage({ ok: true, text: "เริ่มตรวจแล้ว — ดูความคืบหน้าในประวัติด้านล่าง" });
      // รอให้รอบถูกจองใน DB ก่อนค่อยโหลด
      setTimeout(() => void load(false), 1200);
    } finally {
      setStarting(false);
    }
  }

  if (!data || !form) {
    return message ? (
      <p className="card card-pad text-zinc-500">{message.text}</p>
    ) : (
      <div className="space-y-5" role="status" aria-label="กำลังโหลด">
        {[0, 1].map((i) => (
          <div key={i} className="card card-pad space-y-3">
            <div className="skeleton h-5 w-48" />
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!data.hosxpEnabled ? (
        <p className="alert alert-error">
          ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP — ตรวจอัตโนมัติจะดึงผู้ป่วยไม่ได้ (ตั้ง HOSXP_* ใน .env)
        </p>
      ) : null}

      {/* ── สวิตช์หลัก ─────────────────────────────────────────────────────── */}
      <section className="card card-pad animate-rise flex flex-wrap items-center justify-between gap-4">
        <div>
          <Switch
            checked={form.enabled}
            label="ตรวจอัตโนมัติประจำวัน"
            onChange={(on) => {
              // สวิตช์บันทึกทันที — ไม่ต้องกดบันทึกอีกครั้ง
              const next = { ...form, enabled: on };
              setForm(next);
              void save(next);
            }}
          />
          <p className="mt-1 text-sm text-zinc-600">
            {form.enabled && data.nextRun ? (
              <>
                รอบถัดไป:{" "}
                <strong className="tabular">
                  {data.nextRun.replace(/^(\d{4}-\d{2}-\d{2})/, (d) => formatThaiDateShort(d))}
                </strong>
              </>
            ) : form.enabled ? (
              "ยังไม่มีรอบถัดไป — ตรวจสอบวันที่เลือก"
            ) : (
              "ปิดอยู่ — ระบบจะไม่ตรวจเองจนกว่าจะเปิด (ยังกด “ตรวจเดี๋ยวนี้” ได้)"
            )}
          </p>
        </div>
        {data.settings.updatedBy ? (
          <span className="text-sm text-zinc-500">
            แก้ล่าสุดโดย {data.settings.updatedBy}
            {data.settings.updatedAt ? ` · ${thaiDateTime(data.settings.updatedAt)}` : ""}
          </span>
        ) : null}
      </section>

      {/* ── ตั้งเวลา ───────────────────────────────────────────────────────── */}
      <section className="card animate-rise">
        <h2 className="card-title">
          <span className="icon-orb"><Icon name="calendar" /></span>
          กำหนดการ
        </h2>
        <div className="grid gap-6 px-5 py-5 sm:px-6 md:grid-cols-2">
          <div>
            <span className="label">วันที่ให้ตรวจ</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="วันในสัปดาห์">
              {WEEKDAY_LABELS.map((label, d) => {
                const on = form.weekdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      patch({
                        weekdays: on ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d].sort(),
                      })
                    }
                    className={`size-11 rounded-full border text-base font-medium transition ${
                      on
                        ? "border-brand-600 bg-brand-600 text-on-brand"
                        : "border-zinc-300 bg-surface text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-3 text-sm">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" className="link" onClick={() => patch({ weekdays: p.days })}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="aa-time">
              เวลาที่รัน (เวลาไทย)
            </label>
            <input
              id="aa-time"
              type="time"
              className="input tabular w-40"
              value={form.runTime}
              onChange={(e) => patch({ runTime: e.target.value })}
            />
            <span className="hint">ค่าตั้งต้น 12:00 (เที่ยงวัน) — เครื่องปิดอยู่ตอนนั้น จะรันทันทีที่เปิดกลับมาในวันเดียวกัน</span>
          </div>

          <div>
            <span className="label">ตรวจ visit ของวันไหน</span>
            <div className="space-y-2">
              {(Object.keys(TARGET_DAYS) as TargetDay[]).map((k) => (
                <label key={k} className="flex items-center gap-2.5 text-base">
                  <input
                    type="radio"
                    name="aa-target"
                    className="size-4 accent-brand-600"
                    checked={form.targetDay === k}
                    onChange={() => patch({ targetDay: k })}
                  />
                  {TARGET_DAYS[k]}
                </label>
              ))}
            </div>
            <span className="hint">
              แนะนำ &ldquo;เมื่อวาน&rdquo; — รอบเที่ยงจะได้ครบทั้งวัน ไม่ตกหล่นคนไข้ช่วงบ่าย และหมอบันทึกเสร็จแล้ว
            </span>
          </div>

          <div>
            <label className="label" htmlFor="aa-max">
              จำนวนสูงสุดต่อรอบ (ราย)
            </label>
            <input
              id="aa-max"
              type="number"
              min={1}
              max={MAX_VISITS_CAP}
              className="input tabular w-40"
              value={Number.isFinite(form.maxVisits) ? form.maxVisits : ""}
              onChange={(e) => patch({ maxVisits: e.target.valueAsNumber })}
            />
            <span className="hint">
              สุ่มจากผู้ป่วยนอกทั้งวัน (เฉพาะที่ยังไม่เคยตรวจ) — 1 รายใช้ AI 1 ครั้ง ตั้งสูงเกินจะเปลืองโควตา
              (สูงสุด {MAX_VISITS_CAP})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 px-5 py-4 sm:px-6">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !dirty || !!formError}
            onClick={() => void save()}
          >
            {saving ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="check" />}
            {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
          </button>
          {dirty && !formError ? <span className="text-sm text-warn-600">ยังไม่ได้บันทึก</span> : null}
          {formError ? (
            <span className="inline-flex items-center gap-1 text-sm text-red-700">
              <Icon name="x" size={15} />
              {formError}
            </span>
          ) : null}
          {message ? (
            <span className={message.ok ? "text-emerald-700" : "text-red-700"}>{message.text}</span>
          ) : null}
        </div>
      </section>

      {/* ── รันเดี๋ยวนี้ ───────────────────────────────────────────────────── */}
      <section className="card card-pad animate-rise">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold">
          <span className="icon-orb"><Icon name="rocket" /></span>
          ตรวจเดี๋ยวนี้
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          ไม่ต้องรอเวลา — เลือกวันที่ของ visit ที่จะตรวจ (ว่าง = ตามที่ตั้งไว้ด้านบน) ใช้จำนวนต่อรอบเดียวกัน
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="aa-run-date">
              วันที่ของ visit
            </label>
            <input
              id="aa-run-date"
              type="date"
              className="input tabular"
              max={todayIso()}
              value={runDate}
              onChange={(e) => setRunDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={starting || running || !data.hosxpEnabled}
            onClick={() => void runNow()}
          >
            {running || starting ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="rocket" />}
            {running ? "มีรอบกำลังตรวจอยู่…" : starting ? "กำลังเริ่ม…" : "ตรวจเดี๋ยวนี้"}
          </button>
        </div>
      </section>

      {/* ── ประวัติ ────────────────────────────────────────────────────────── */}
      <section className="card animate-rise overflow-hidden">
        <h2 className="card-title">
          <span className="icon-orb"><Icon name="clock" /></span>
          ประวัติการตรวจอัตโนมัติ
        </h2>
        {data.runs.length === 0 ? (
          <p className="px-5 py-6 text-zinc-500 sm:px-6">ยังไม่เคยรัน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>เริ่มเมื่อ</th>
                  <th>visit วันที่</th>
                  <th>สถานะ</th>
                  <th className="text-right">ตรวจแล้ว</th>
                  <th className="text-right">ไม่สำเร็จ</th>
                  <th className="text-right">คะแนนเฉลี่ย</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => {
                  const st = STATUS[r.status] ?? { label: r.status, cls: "" };
                  const isOpen = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td className="tabular whitespace-nowrap">
                          {thaiDateTime(r.startedAt)}
                          <span className="block text-xs text-zinc-500">
                            {r.trigger === "auto" ? "ตามเวลา" : `กดเอง${r.startedBy ? ` · ${r.startedBy}` : ""}`}
                          </span>
                        </td>
                        <td className="tabular whitespace-nowrap">{formatThaiDateShort(r.targetDate)}</td>
                        <td>
                          <span className={`badge ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="tabular text-right">
                          {r.reviewed}
                          <span className="block text-xs text-zinc-500">
                            จาก {r.found} ราย{r.skipped ? ` · ข้าม ${r.skipped}` : ""}
                          </span>
                        </td>
                        <td className="tabular text-right">{r.failed || "—"}</td>
                        <td className="tabular text-right">
                          {r.avgPercent !== null ? `${Number(r.avgPercent).toFixed(1)}%` : "—"}
                        </td>
                        <td>
                          {(r.results?.length ?? 0) > 0 || r.error ? (
                            <button
                              type="button"
                              className="btn btn-sm"
                              aria-expanded={isOpen}
                              onClick={() => setOpen(isOpen ? null : r.id)}
                            >
                              {isOpen ? "ซ่อน" : "รายละเอียด"}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr>
                          <td colSpan={7} className="bg-zinc-50">
                            {r.error ? <p className="alert alert-error mb-2">{r.error}</p> : null}
                            <ul className="space-y-1 text-sm">
                              {(r.results ?? []).map((it) => (
                                <li key={it.vn} className="flex flex-wrap gap-x-3">
                                  <span className="tabular text-zinc-500">VN {it.vn}</span>
                                  {it.caseId ? (
                                    <Link href={`/cases/${it.caseId}`} className="link">
                                      ดูเคส
                                      {typeof it.percentage === "number" ? ` · ${it.percentage.toFixed(1)}%` : ""}
                                    </Link>
                                  ) : (
                                    <span className="text-red-700">{it.error}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── popup เมื่อรอบที่กดรันเพิ่งจบ ─────────────────────────────────── */}
      <Modal open={!!finished} onClose={() => setFinished(null)} label="รอบตรวจอัตโนมัติจบแล้ว">
        {finished ? (
          <>
            <span
              className={`mx-auto grid size-14 place-items-center rounded-full ring-8 ${
                finished.status === "COMPLETED"
                  ? "bg-emerald-50 text-emerald-600 ring-emerald-50/60"
                  : "bg-warn-50 text-warn-600 ring-amber-50"
              }`}
            >
              <Icon name={finished.status === "COMPLETED" ? "check" : "alert"} size={28} strokeWidth={2.6} />
            </span>
            <h2 className="mt-4 text-2xl font-bold">
              {finished.status === "COMPLETED" ? "ตรวจอัตโนมัติเสร็จแล้ว!" : "รอบตรวจหยุดกลางทาง"}
            </h2>
            <p className="mt-1 text-zinc-500">visit วันที่ {finished.targetDate}</p>
            <dl className="mt-5 grid grid-cols-3 gap-2">
              {[
                { k: "ตรวจแล้ว", v: finished.reviewed, cls: "text-emerald-700" },
                { k: "ไม่สำเร็จ", v: finished.failed, cls: "text-red-700" },
                { k: "เฉลี่ย", v: finished.avgPercent === null ? "—" : `${Number(finished.avgPercent).toFixed(1)}%`, cls: "text-brand-700" },
              ].map((x) => (
                <div key={x.k} className="rounded-2xl bg-zinc-50 py-3 ring-1 ring-zinc-200">
                  <dd className={`tabular text-2xl font-bold ${x.cls}`}>{x.v}</dd>
                  <dt className="text-sm text-zinc-500">{x.k}</dt>
                </div>
              ))}
            </dl>
            {finished.error ? <p className="alert alert-error mt-4 text-left text-sm">{finished.error}</p> : null}
            <button type="button" className="btn btn-primary mt-6 w-full" onClick={() => setFinished(null)}>
              ตกลง
            </button>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
