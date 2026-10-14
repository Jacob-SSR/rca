// lib/auto-audit/progress.ts
// ความคืบหน้าสดของรอบตรวจอัตโนมัติที่กำลังรัน — ใช้วาด animation ในหน้าตั้งค่า
// (กำลังทำ visit ไหน อยู่ขั้นไหน เหลือคิวกี่ราย ผลรายล่าสุดเป็นยังไง)
//
// เก็บในหน่วยความจำ ไม่ลง DB — ขยับทุกขั้นของทุกราย ถ้าเขียน DB ทุกครั้งจะเปลืองโดยใช่เหตุ
// ตัวเลขที่ต้องอยู่รอด (ตรวจแล้ว/ไม่สำเร็จ/ผลรายเคส) runner ยังเขียนลง AutoAuditRun เหมือนเดิม
// ไม่มีข้อมูลสด (เช่นรอบรันอยู่อีก instance) หน้าเว็บก็ยังแสดงตัวเลขจาก DB ได้
//
// ⚠️ ใช้ globalThis เพราะตัวตั้งเวลา (instrumentation) กับ route handler อาจได้ module คนละก้อน
//    แต่อยู่ใน process เดียวกัน — แบบเดียวกับ lib/ai/quota.ts
// ⚠️ ไม่เก็บชื่อผู้ป่วย/HN — มีแค่ VN กับแผนก เหมือนที่ประวัติแสดงอยู่แล้ว

/** ขั้นของการตรวจหนึ่งราย — เรียงตามลำดับที่ทำจริงใน runner */
export const AUDIT_STEPS = ["lookup", "form", "document", "review"] as const;
export type AuditStep = (typeof AUDIT_STEPS)[number];

/** ช่วงของทั้งรอบ: ดึง visit จาก HOSxP → เลือกรายที่จะตรวจ → ตรวจทีละราย */
export type LivePhase = "fetching" | "planning" | "auditing";

export type LiveVisit = { vn: string; department: string | null; time: string | null };

export type LiveDone = LiveVisit & {
  caseId?: string;
  percentage?: number | null;
  error?: string;
};

export type LiveProgress = {
  runId: string;
  phase: LivePhase;
  /** จำนวนที่จะตรวจในรอบนี้ (รู้หลังเลือกรายแล้ว) */
  total: number;
  /** ทำเสร็จไปแล้วกี่ราย (สำเร็จ + ไม่สำเร็จ) */
  done: number;
  /** ในจำนวนที่เสร็จ มีกี่รายที่ตรวจไม่สำเร็จ */
  failed: number;
  current: (LiveVisit & { step: AuditStep; stepStartedAt: string }) | null;
  /** รายถัดไปที่รอคิว — ตัดไว้ไม่กี่รายพอให้เห็นภาพ */
  queue: LiveVisit[];
  /** ผลรายล่าสุด ใหม่สุดก่อน */
  recent: LiveDone[];
  updatedAt: string;
};

const QUEUE_SHOWN = 6;
const RECENT_SHOWN = 8;

const store = globalThis as unknown as { __mraAutoAuditLive?: Map<string, LiveProgress> };
const live = () => (store.__mraAutoAuditLive ??= new Map());

function put(runId: string, patch: Partial<LiveProgress>) {
  const prev = live().get(runId);
  if (!prev) return;
  live().set(runId, { ...prev, ...patch, updatedAt: new Date().toISOString() });
}

export function liveProgress(runId: string): LiveProgress | null {
  return live().get(runId) ?? null;
}

/**
 * ตัวจดความคืบหน้าของรอบหนึ่ง — runner เรียกตามจังหวะที่ทำงานจริง
 * ทุกเมธอดไม่ throw: จดความคืบหน้าพังต้องไม่ทำให้รอบตรวจพัง
 */
export function trackRun(runId: string) {
  const now = () => new Date().toISOString();
  live().set(runId, {
    runId,
    phase: "fetching",
    total: 0,
    done: 0,
    failed: 0,
    current: null,
    queue: [],
    recent: [],
    updatedAt: now(),
  });

  let pending: LiveVisit[] = [];

  return {
    phase(phase: LivePhase) {
      put(runId, { phase });
    },
    /** เลือกรายเสร็จแล้ว — รู้จำนวนทั้งหมดและคิว */
    plan(todo: LiveVisit[]) {
      pending = todo.slice();
      put(runId, { phase: "auditing", total: todo.length, queue: pending.slice(0, QUEUE_SHOWN) });
    },
    /** เริ่มตรวจรายถัดไป */
    start(v: LiveVisit, step: AuditStep) {
      pending = pending.filter((p) => p.vn !== v.vn);
      put(runId, {
        current: { ...v, step, stepStartedAt: now() },
        queue: pending.slice(0, QUEUE_SHOWN),
      });
    },
    step(step: AuditStep) {
      const cur = liveProgress(runId)?.current;
      if (cur && cur.step !== step) put(runId, { current: { ...cur, step, stepStartedAt: now() } });
    },
    /** ตรวจรายนี้จบ (สำเร็จหรือไม่ก็ตาม) */
    finish(item: LiveDone) {
      const prev = liveProgress(runId);
      if (!prev) return;
      put(runId, {
        current: null,
        done: prev.done + 1,
        failed: prev.failed + (item.error ? 1 : 0),
        recent: [item, ...prev.recent].slice(0, RECENT_SHOWN),
      });
    },
    /** รอบจบ — ลบทิ้ง หน้าเว็บจะไปอ่านผลสุดท้ายจาก DB แทน */
    end() {
      live().delete(runId);
    },
  };
}

export type RunTracker = ReturnType<typeof trackRun>;
