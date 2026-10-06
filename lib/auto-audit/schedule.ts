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

/** สูงสุดต่อรอบ — กันตั้งค่าผิดแล้วยิง AI หลายพันครั้งในรอบเดียว */
export const MAX_VISITS_CAP = 300;

export const settingsSchema = z.object({
  enabled: z.boolean(),
  runTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "เวลาต้องเป็น ชม:นาที เช่น 12:00"),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1, "เลือกวันอย่างน้อย 1 วัน")
    .transform((d) => [...new Set(d)].sort()),
  targetDay: z.enum(["yesterday", "today"]),
  maxVisits: z.number().int().min(1, "อย่างน้อย 1 ราย").max(MAX_VISITS_CAP, `ไม่เกิน ${MAX_VISITS_CAP} ราย`),
});

export type AutoAuditSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AutoAuditSettings = {
  enabled: false,
  runTime: "12:00",
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  targetDay: "yesterday",
  maxVisits: 20,
};

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
