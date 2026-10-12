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

// ─────────────────────────────────────────────────────────────────────────────
// ICD-10 ที่ให้ตรวจ — ตรวจเฉพาะ visit ที่มีรหัสตามที่ระบุ ไม่มี = ข้าม
// ─────────────────────────────────────────────────────────────────────────────

/** รหัส ICD-10 แบบไม่มีจุด ตัวพิมพ์ใหญ่ — HOSxP เก็บ ovstdiag.icd10 แบบนี้ (E119 ไม่ใช่ E11.9) */
export const normalizeIcd = (code: string) => code.toUpperCase().replace(/[\s.*]/g, "");

const ICD_CODE = /^[A-Z]\d{2}[0-9A-Z]{0,4}$/;

/**
 * รูปแบบที่ใส่ได้: รหัสเต็ม (J02.9) · ขึ้นต้นด้วย (E11 = E11 ทุกตัวย่อย) · ช่วง (I10-I15)
 * คืนรูปแบบที่ปรับแล้ว หรือ null ถ้าใช้ไม่ได้
 */
export function normalizeIcdPattern(raw: string): string | null {
  const parts = raw.split(/\s*[-–]\s*/).map(normalizeIcd);
  if (parts.length === 1) return ICD_CODE.test(parts[0]) ? parts[0] : null;
  if (parts.length !== 2 || !parts.every((x) => ICD_CODE.test(x))) return null;
  return parts[0] <= parts[1] ? `${parts[0]}-${parts[1]}` : null;
}

/** แยกข้อความที่ผู้ใช้พิมพ์ (คั่นด้วยจุลภาค/เว้นวรรค/ขึ้นบรรทัด) → รูปแบบที่ใช้ได้ + ตัวที่ผิด */
export function parseIcdList(text: string): { patterns: string[]; invalid: string[] } {
  const patterns: string[] = [];
  const invalid: string[] = [];
  // "I10 - I15" ต้องเป็นช่วงเดียว ไม่ใช่สามคำ
  const tokens = text.replace(/\s*[-–]\s*/g, "-").split(/[\s,;]+/).filter(Boolean);
  for (const t of tokens) {
    const p = normalizeIcdPattern(t);
    if (p === null) invalid.push(t);
    else if (!patterns.includes(p)) patterns.push(p);
  }
  return { patterns, invalid };
}

/** รหัสนี้เข้ารูปแบบไหม — ขึ้นต้นด้วย หรือ อยู่ในช่วง (เทียบเท่าความยาวของปลายช่วง) */
export function icdMatches(code: string, pattern: string): boolean {
  const c = normalizeIcd(code);
  const [from, to] = pattern.split("-");
  if (to === undefined) return c.startsWith(from);
  return c.slice(0, from.length) >= from && c.slice(0, to.length) <= to;
}

/** visit ที่มีรหัส ICD (ตัวใดก็ได้ ทั้งโรคหลักและโรคร่วม) เข้ารูปแบบใดรูปแบบหนึ่ง · ไม่ระบุรูปแบบ = ผ่านหมด */
export function visitHasIcd(codes: string[], patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  return codes.some((c) => patterns.some((p) => icdMatches(c, p)));
}

const icdListSchema = z
  .array(z.string())
  .max(200)
  .default([])
  .transform((list, ctx) => {
    const out: string[] = [];
    for (const raw of list) {
      const p = normalizeIcdPattern(raw);
      if (p === null) {
        ctx.addIssue({ code: "custom", message: `รหัส ICD-10 ไม่ถูกต้อง: ${raw}` });
        return z.NEVER;
      }
      if (!out.includes(p)) out.push(p);
    }
    return out;
  });

// ─────────────────────────────────────────────────────────────────────────────
// ค่าที่เซ็ตแยกรายแผนก: จำนวนต่อรอบ + ICD-10 ที่ให้ตรวจ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * quota: ตรวจกี่รายต่อรอบของแผนกนี้ · null = ใช้ "จำนวนที่ตรวจต่อรอบ" ร่วมกับแผนกอื่น
 *        (รอบ resume ใช้ 0 = แผนกนี้ครบแล้ว ไม่ตรวจเพิ่ม)
 * icd10: ตรวจเฉพาะ visit ของแผนกนี้ที่มีรหัสเหล่านี้ · ว่าง = ทุกโรค
 */
export type DepartmentRule = { quota: number | null; icd10: string[] };

const rulesSchema = (minQuota: number) =>
  z
    .record(
      z.string().trim().min(1).max(20),
      z.object({
        quota: z.number().int().min(minQuota).max(MAX_VISITS_CAP).nullable().default(null),
        icd10: icdListSchema,
      }),
    )
    .default({});

/** ค่าที่เซ็ตไว้ของแผนกในตั้งค่า — อ่านจาก JSON ใน DB (ค่าเสียทิ้งไปทั้งก้อน) */
export const savedRulesSchema = rulesSchema(1);

/** เก็บเฉพาะแผนกที่เลือกอยู่และมีค่าจริง — ไม่เลือกแผนก (ทุกแผนก) = ไม่มีค่าแยกแผนก */
export function pruneRules(
  departments: string[],
  rules: Record<string, DepartmentRule>,
): Record<string, DepartmentRule> {
  return Object.fromEntries(
    Object.entries(rules).filter(([d, r]) => departments.includes(d) && (r.quota !== null || r.icd10.length > 0)),
  );
}

/** { depcode: จำนวน } เฉพาะแผนกที่กำหนดจำนวนแยกไว้ */
export function quotasOf(rules: Record<string, DepartmentRule>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(rules).flatMap(([d, r]) => (r.quota === null ? [] : [[d, r.quota] as const])),
  );
}

/** มีแผนกไหนกำหนด ICD-10 ไว้ไหม — ไม่มีก็ไม่ต้องอ่านรหัสวินิจฉัยจาก HOSxP */
export const needsIcd = (rules: Record<string, DepartmentRule>) =>
  Object.values(rules).some((r) => r.icd10.length > 0);

/** visit นี้ผ่าน ICD-10 ของแผนกตัวเองไหม — แผนกที่ไม่ได้กำหนดรหัส ผ่านหมด */
export function passesDepartmentIcd(
  v: { depcode?: string },
  codes: string[],
  rules: Record<string, DepartmentRule>,
): boolean {
  return visitHasIcd(codes, rules[(v.depcode ?? "").trim()]?.icd10 ?? []);
}

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
  /** เซ็ตแยกรายแผนก (จำนวนต่อรอบ + ICD-10) — ใส่ได้เฉพาะแผนกที่เลือก */
  departmentRules: savedRulesSchema,
}).transform((s) => ({ ...s, departmentRules: pruneRules(s.departments, s.departmentRules) }))
  .refine((s) => Object.values(quotasOf(s.departmentRules)).reduce((a, b) => a + b, 0) <= MAX_VISITS_CAP, {
    message: `จำนวนต่อแผนกรวมกันไม่เกิน ${MAX_VISITS_CAP} ราย`,
  });

export type AutoAuditSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AutoAuditSettings = {
  enabled: false,
  runTime: "12:00",
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  targetDay: "yesterday",
  maxVisits: 20,
  departments: [],
  departmentRules: {},
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
    /** ค่าแยกรายแผนกของรอบนี้ — quota 0 = แผนกนี้ครบแล้ว (รอบ resume) ไม่ตรวจเพิ่ม */
    rules: rulesSchema(0),
    shift: z.enum(["morning", "afternoon", "night"]).nullish(),
    timeFrom: z.string().regex(HHMM, "เวลาต้องเป็น ชม:นาที").nullish(),
    timeTo: z.string().regex(HHMM, "เวลาต้องเป็น ชม:นาที").nullish(),
  })
  .refine((f) => !f.timeFrom === !f.timeTo, { message: "ใส่เวลาให้ครบทั้งเริ่มและสิ้นสุด" })
  .refine((f) => !f.timeFrom || f.timeFrom !== f.timeTo, { message: "เวลาเริ่มกับสิ้นสุดต้องไม่เท่ากัน" });

export type RunFilters = z.infer<typeof runFiltersSchema>;

type PoolInput = { departments: string[]; quotas: Record<string, number> };

/** แผนกที่ไม่ได้กำหนดจำนวนแยก ยังมีให้ตรวจไหม (ไม่เลือกแผนก = ทุกแผนกที่เหลือ) */
export function hasSharedPool(f: PoolInput): boolean {
  return f.departments.length === 0 || f.departments.some((d) => !(d in f.quotas));
}

/**
 * เป้าจำนวนรายของรอบ — null = ทุกราย
 * = ผลรวมจำนวนต่อแผนก + จำนวนรวม (visitLimit) ของแผนกที่ไม่ได้กำหนดแยก
 */
export function runTarget(f: PoolInput, visitLimit: number | null): number | null {
  const quota = Object.values(f.quotas).reduce((a, b) => a + b, 0);
  if (!hasSharedPool(f)) return quota;
  return visitLimit === null ? null : quota + visitLimit;
}

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
 * ⚠️ ไม่ตรวจคนเดิมซ้ำในวันเดียวกัน — นับคนด้วย HN (ไม่ใช่ชื่อ เพราะชื่อซ้ำกันได้ต่างคนกัน)
 *    ผู้ป่วยคนเดียวมาหลาย visit ในวันเดียว (เช่น ไปหลายคลินิก) ตรวจแค่ visit เดียว
 *    และถ้า visit ไหนของคนนั้นในวันนั้นตรวจไปแล้ว/มีคนกรอกอยู่ ก็ข้ามทั้งคน
 *    คนเดิมแต่คนละวัน = คนละรอบการมา ตรวจได้ตามปกติ (รายการ visit ของรอบคือวันเดียวอยู่แล้ว)
 *    sameDay = visit ทั้งหมดของวันนั้น (ก่อนกรองแผนก/เวร/ICD) ไว้รู้ว่า VN ไหนเป็นของใคร
 *
 * limit = null → ทุกรายตามลำดับที่มา, ตัวเลข → สุ่มเท่านั้นราย
 * quotas → แผนกที่กำหนดจำนวนไว้ สุ่มแยกแผนกละเท่านั้น ส่วนแผนกอื่นใช้ limit ร่วมกัน
 */
export function planVisits<V extends { vn: string; hn?: string; depcode?: string }>(
  visits: V[],
  forms: ExistingForm[],
  limit: number | null,
  opts: { quotas?: Record<string, number>; sameDay?: { vn: string; hn?: string }[] } = {},
  rand: () => number = Math.random,
): { todo: Array<V & { reuseFormId?: string }>; skipped: number } {
  const byVn = new Map<string, ExistingForm[]>();
  for (const f of forms) {
    if (!f.hosxpVisitRef) continue;
    byVn.set(f.hosxpVisitRef, [...(byVn.get(f.hosxpVisitRef) ?? []), f]);
  }
  const taken = (vn: string) => (byVn.get(vn) ?? []).some((f) => f.completed || !f.byAutoAudit);

  // ไม่มี HN = รู้ไม่ได้ว่าเป็นใคร → ถือเป็นคนละคนกัน (key ด้วย VN)
  const person = (v: { vn: string; hn?: string }) => (v.hn ?? "").trim() || `vn:${v.vn}`;
  const takenPeople = new Set<string>();
  for (const v of [...(opts.sameDay ?? []), ...visits]) if (taken(v.vn)) takenPeople.add(person(v));

  // หนึ่งคนหนึ่ง visit — มีฟอร์มค้างของรอบก่อนใช้ visit นั้น (ไม่สร้างเคสใหม่ให้คนเดิม) ไม่มีก็สุ่ม
  const groups = new Map<string, Array<V & { reuseFormId?: string }>>();
  for (const v of visits) {
    const who = person(v);
    if (takenPeople.has(who)) continue;
    const retry = (byVn.get(v.vn) ?? []).find((f) => f.byAutoAudit);
    groups.set(who, [...(groups.get(who) ?? []), retry ? { ...v, reuseFormId: retry.id } : { ...v }]);
  }
  const candidates = [...groups.values()].map(
    (g) => g.find((v) => v.reuseFormId) ?? g[Math.floor(rand() * g.length)] ?? g[0],
  );

  const quotas = opts.quotas ?? {};
  const shared = candidates.filter((v) => !((v.depcode ?? "").trim() in quotas));
  const todo = [
    ...Object.entries(quotas).flatMap(([dep, n]) =>
      sample(
        candidates.filter((v) => (v.depcode ?? "").trim() === dep),
        n,
        rand,
      ),
    ),
    ...(limit === null ? shared : sample(shared, limit, rand)),
  ];
  return { todo, skipped: visits.length - candidates.length };
}
