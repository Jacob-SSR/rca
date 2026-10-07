// lib/auto-audit/schedule.ts
// ตัดสินว่า "ตอนนี้ถึงเวลารันตรวจอัตโนมัติหรือยัง" — pure function ทดสอบได้โดยไม่ต้องมี DB
//
// ทุกอย่างคิดเป็นเวลาไทย (Asia/Bangkok) ไม่ว่าเครื่องจะตั้ง TZ อะไร
// เพราะ "เที่ยงวัน" ของผู้ใช้คือเที่ยงวันที่โรงพยาบาล

import { z } from "zod";

export const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

export const TARGET_DAYS = {
  yesterday: "เมื่อวาน (ทั้งวัน)",
  today: "วันนี้ (เฉพาะที่มาก่อนเวลารัน)",
} as const;

export type TargetDay = keyof typeof TARGET_DAYS;

/** สูงสุดต่อรอบ (โหมดสุ่ม) — กันพิมพ์เลขผิดแล้วยิง AI หลายพันครั้ง */
export const MAX_VISITS_CAP = 300;

/**
 * maxVisits = 0 คือ "ตรวจทุกรายของวัน" (ไม่สุ่ม)
 * โควตา AI หมดกลางทาง → รอบหยุดรอ แล้วตรวจต่อเองหลังรีเซ็ต (ดู runner.ts)
 */
export const ALL_VISITS = 0;

/** จำนวนที่รอบหนึ่งต้องตรวจ — null = ทุกราย */
export const visitLimitOf = (maxVisits: number): number | null => (maxVisits === ALL_VISITS ? null : maxVisits);

export const settingsSchema = z.object({
  enabled: z.boolean(),
  runTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "เวลาต้องเป็น ชม:นาที เช่น 12:00"),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1, "เลือกวันอย่างน้อย 1 วัน")
    .transform((d) => [...new Set(d)].sort()),
  targetDay: z.enum(["yesterday", "today"]),
  /** รหัสแผนก (depcode) ที่ให้ตรวจ — ว่าง = ทุกแผนก */
  departments: z.array(z.string().trim().min(1).max(20)).max(200).default([]),
  maxVisits: z
    .number({ error: "ใส่จำนวนราย" })
    .int()
    .min(ALL_VISITS, "จำนวนต้องไม่ติดลบ")
    .max(MAX_VISITS_CAP, `ไม่เกิน ${MAX_VISITS_CAP} ราย (ถ้าต้องการทุกราย เลือก "ตรวจทุกรายของวัน")`),
});

export type AutoAuditSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AutoAuditSettings = {
  enabled: false,
  runTime: "12:00",
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  targetDay: "yesterday",
  maxVisits: 20,
  departments: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// ตัวกรองของรอบตรวจ: แผนก + ช่วงเวลาที่มา (หรือเวร)
// ─────────────────────────────────────────────────────────────────────────────

/** เวรมาตรฐานของโรงพยาบาล — ช่วงเวลาคิดจากเวลาที่ผู้ป่วยมา (vsttime) ของวันเดียวกัน */
export const SHIFTS = {
  morning: { label: "เวรเช้า", from: "08:00", to: "16:00" },
  afternoon: { label: "เวรบ่าย", from: "16:00", to: "24:00" },
  night: { label: "เวรดึก", from: "00:00", to: "08:00" },
} as const;

export type ShiftKey = keyof typeof SHIFTS;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export const runFiltersSchema = z
  .object({
    departments: z.array(z.string().trim().min(1).max(20)).max(200).default([]),
    shift: z.enum(["morning", "afternoon", "night"]).nullish(),
    timeFrom: z.string().regex(HHMM, "เวลาต้องเป็น ชม:นาที").nullish(),
    timeTo: z.string().regex(HHMM, "เวลาต้องเป็น ชม:นาที").nullish(),
  })
  .refine((f) => !f.timeFrom === !f.timeTo, { message: "ใส่เวลาให้ครบทั้งเริ่มและสิ้นสุด" })
  .refine((f) => !f.timeFrom || f.timeFrom !== f.timeTo, { message: "เวลาเริ่มกับสิ้นสุดต้องไม่เท่ากัน" });

export type RunFilters = z.infer<typeof runFiltersSchema>;

/** ช่วงเวลาที่ใช้จริง — เลือกเวรมา ใช้เวลาของเวร, ใส่เวลาเอง ใช้เวลาที่ใส่ */
export function timeRangeOf(f: RunFilters): { from: string; to: string } | null {
  if (f.shift) return { from: SHIFTS[f.shift].from, to: SHIFTS[f.shift].to };
  if (f.timeFrom && f.timeTo) return { from: f.timeFrom, to: f.timeTo };
  return null;
}

/**
 * visit นี้เข้าเงื่อนไขของรอบไหม
 * ช่วงเวลา: from ≤ เวลา < to · ถ้า from > to ถือว่าข้ามเที่ยงคืน (เช่น 20:00–02:00)
 */
export function matchesFilters(v: { depcode?: string; time: string }, f: RunFilters): boolean {
  if (f.departments.length > 0 && !f.departments.includes((v.depcode ?? "").trim())) return false;

  const range = timeRangeOf(f);
  if (range) {
    const t = v.time.slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(t)) return false;
    const inRange = range.from < range.to ? t >= range.from && t < range.to : t >= range.from || t < range.to;
    if (!inRange) return false;
  }
  return true;
}

export function parseWeekdays(s: string): number[] {
  return [...new Set(s.split(",").map((x) => Number(x.trim())))]
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort();
}

/** เวลาไทยตอนนี้ แยกเป็นส่วน ๆ */
export function bangkokParts(now: Date): { date: string; time: string; weekday: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday };
}

/** YYYY-MM-DD ± n วัน (คิดแบบปฏิทิน ไม่สนเวลา) */
export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** วันที่ของ visit ที่รอบนี้ต้องตรวจ */
export function targetDateFor(runDate: string, targetDay: TargetDay): string {
  return targetDay === "yesterday" ? shiftDate(runDate, -1) : runDate;
}

/** key ของรอบอัตโนมัติวันนั้น — unique ใน DB กันรันซ้ำ */
export const autoRunKey = (runDate: string) => `auto:${runDate}`;

/**
 * ถึงเวลารันหรือยัง
 *
 * "ถึงเวลาแล้วและวันนี้ยังไม่ได้รัน" ไม่ใช่ "ตรงนาทีพอดี" — ถ้าเครื่องดับ/รีสตาร์ท
 * ช่วงเที่ยงแล้วเปิดกลับมาบ่ายโมง ก็ยังรันของวันนั้นให้ (การกันซ้ำอยู่ที่ runKey ใน DB)
 */
export function isDue(settings: AutoAuditSettings, now: Date): { due: boolean; runDate: string } {
  const p = bangkokParts(now);
  const due = settings.enabled && settings.weekdays.includes(p.weekday) && p.time >= settings.runTime;
  return { due, runDate: p.date };
}

/** รอบถัดไปจะรันเมื่อไร (ไว้แสดงในหน้าตั้งค่า) — null ถ้าปิดอยู่ */
export function nextRun(settings: AutoAuditSettings, now: Date, ranToday: boolean): string | null {
  if (!settings.enabled || settings.weekdays.length === 0) return null;
  const p = bangkokParts(now);
  for (let i = 0; i < 8; i++) {
    const date = shiftDate(p.date, i);
    const weekday = (p.weekday + i) % 7;
    if (!settings.weekdays.includes(weekday)) continue;
    if (i === 0 && (ranToday || p.time >= settings.runTime)) {
      // วันนี้ผ่านเวลาไปแล้ว: ถ้ายังไม่ได้รัน ตัวตั้งเวลาจะรันภายในนาทีนี้
      if (!ranToday) return `${date} (ภายใน 1 นาที)`;
      continue;
    }
    return `${date} ${settings.runTime}`;
  }
  return null;
}

/** สุ่มเลือก n รายการ (Fisher–Yates) — ใช้สุ่มตัวอย่าง visit ของวัน */
export function sample<T>(items: T[], n: number, rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, n));
}

/** ฟอร์มที่มีอยู่แล้วของ visit หนึ่ง — ใช้ตัดสินว่าต้องตรวจ visit นั้นอีกไหม */
export type ExistingForm = {
  id: string;
  hosxpVisitRef: string | null;
  /** ฟอร์มที่รอบอัตโนมัติสร้างเอง (ไม่ใช่คนกรอก) */
  byAutoAudit: boolean;
  /** มีผลตรวจที่เสร็จสมบูรณ์ (COMPLETED) แล้ว */
  completed: boolean;
};

/**
 * เลือก visit ที่รอบนี้ต้องตรวจ
 *
 * "ตรวจแล้ว" = มีผลตรวจ COMPLETED เท่านั้น — ไม่ใช่แค่ "มีฟอร์ม"
 * เพราะรอบอัตโนมัติสร้างเคส+ฟอร์มก่อนเรียก AI ถ้า AI ล้ม (เช่นโควตาหมด)
 * visit นั้นจะมีฟอร์มค้างอยู่ ถ้านับว่าตรวจแล้วจะหลุดไปตลอดกาล
 *
 *   - มีผลตรวจ COMPLETED                       → ข้าม
 *   - ฟอร์มที่คนกรอกเอง ยังไม่เสร็จ             → ข้าม (คนกำลังทำอยู่ อย่าไปแย่ง)
 *   - ฟอร์มของรอบอัตโนมัติ ที่ตรวจไม่สำเร็จ    → ตรวจซ้ำ ใช้เคส/ฟอร์มเดิม (ไม่สร้างเคสซ้ำ)
 *   - ยังไม่มีฟอร์ม                            → ตรวจใหม่
 *
 * limit = null → ทุกรายตามลำดับที่มา, ตัวเลข → สุ่มเท่านั้นราย
 */
export function planVisits<V extends { vn: string }>(
  visits: V[],
  forms: ExistingForm[],
  limit: number | null,
  rand: () => number = Math.random,
): { todo: Array<V & { reuseFormId?: string }>; skipped: number } {
  const byVn = new Map<string, ExistingForm[]>();
  for (const f of forms) {
    if (!f.hosxpVisitRef) continue;
    byVn.set(f.hosxpVisitRef, [...(byVn.get(f.hosxpVisitRef) ?? []), f]);
  }

  const candidates: Array<V & { reuseFormId?: string }> = [];
  for (const v of visits) {
    const fs = byVn.get(v.vn) ?? [];
    if (fs.some((f) => f.completed)) continue;
    if (fs.some((f) => !f.byAutoAudit)) continue;
    const retry = fs.find((f) => f.byAutoAudit);
    candidates.push(retry ? { ...v, reuseFormId: retry.id } : { ...v });
  }

  const todo = limit === null ? candidates : sample(candidates, limit, rand);
  return { todo, skipped: visits.length - candidates.length };
}
