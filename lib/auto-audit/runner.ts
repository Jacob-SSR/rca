// lib/auto-audit/runner.ts
// รันตรวจอัตโนมัติหนึ่งรอบ: ดึง visit OPD ของวันเป้าหมายจาก HOSxP → สุ่มตามจำนวนที่ตั้ง
// → สร้างเคส + ฟอร์มจากข้อมูล HOSxP → สร้างเอกสาร → ตรวจด้วย AI (pipeline เดิม)
//
// ⚠️ ใช้ pipeline ตัวเดียวกับปุ่ม "บันทึกและตรวจด้วย AI" ทุกขั้น
//    คะแนนของรอบอัตโนมัติจึงเทียบกับที่คนกดเองได้ตรง ๆ (PHI ถูก mask ก่อนเข้า AI เหมือนเดิม)
//
// ⚠️ ทีละราย ไม่ยิงขนาน — ไม่แย่ง connection ของ HOSxP (production) และไม่ชน rate limit ของ AI

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isHosxpEnabled } from "@/lib/hosxp/env";
import { listVisitsByDate, lookupVisit } from "@/lib/hosxp/visit";
import { recordFormSchema } from "@/lib/form/schema";
import { generateDocumentFromForm, isFormEmpty, nextCaseNumber } from "@/lib/form/service";
import { reviewExistingDocument } from "@/lib/review/pipeline";
import {
  DEFAULT_SETTINGS,
  autoRunKey,
  bangkokParts,
  parseWeekdays,
  sample,
  targetDateFor,
  type AutoAuditSettings,
  type TargetDay,
} from "@/lib/auto-audit/schedule";

export const AUTO_AUDIT_USER = "auto-audit";
const AUTO_AUDIT_NAME = "ตรวจอัตโนมัติ (AI)";

export type RunResultItem = {
  vn: string;
  caseId?: string;
  percentage?: number | null;
  error?: string;
};

export async function loadSettings(): Promise<AutoAuditSettings & { updatedBy: string | null; updatedAt: Date | null }> {
  const row = await prisma.autoAuditSetting.findUnique({ where: { id: "default" } });
  if (!row) return { ...DEFAULT_SETTINGS, updatedBy: null, updatedAt: null };
  return {
    enabled: row.enabled,
    runTime: row.runTime,
    weekdays: parseWeekdays(row.weekdays),
    targetDay: (row.targetDay === "today" ? "today" : "yesterday") as TargetDay,
    maxVisits: row.maxVisits,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}

export async function saveSettings(s: AutoAuditSettings, by: string) {
  const data = {
    enabled: s.enabled,
    runTime: s.runTime,
    weekdays: s.weekdays.join(","),
    targetDay: s.targetDay,
    maxVisits: s.maxVisits,
    updatedBy: by,
  };
  await prisma.autoAuditSetting.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
}

/** รอบนี้ถูกจองไปแล้ว (มีคนรันอยู่/รันไปแล้ว) */
export class RunAlreadyClaimedError extends Error {}

/**
 * จองรอบด้วยการ insert แถวที่ runKey unique — ใครจองได้ก่อนคนนั้นรัน
 * กันซ้ำได้ทั้งกรณีหลาย instance และ container รีสตาร์ทกลางวัน
 */
async function claimRun(opts: {
  runKey: string;
  targetDate: string;
  trigger: "auto" | "manual";
  startedBy: string | null;
}) {
  try {
    return await prisma.autoAuditRun.create({ data: { ...opts, status: "RUNNING" } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new RunAlreadyClaimedError(`รอบ ${opts.runKey} ถูกรันไปแล้ว`);
    }
    throw e;
  }
}

/** มีรอบที่ยังรันอยู่ไหม — กันกดรันเองซ้อนกับรอบอัตโนมัติ */
export async function runningRun() {
  // รอบที่ค้าง RUNNING เกิน 3 ชม. ถือว่าตายไปแล้ว (เครื่องดับกลางรอบ) ไม่ขวางรอบใหม่
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return prisma.autoAuditRun.findFirst({
    where: { status: "RUNNING", startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
  });
}

/** ตรวจ visit เดียว — คืนผลหรือข้อผิดพลาด ไม่ throw (รายเดียวพังไม่ล้มทั้งรอบ) */
async function auditVisit(v: { vn: string; hn: string }, targetDate: string): Promise<RunResultItem> {
  try {
    const looked = await lookupVisit({ hn: v.hn, vn: v.vn });
    if (!looked.available) return { vn: v.vn, error: looked.reason };

    const parsed = recordFormSchema.safeParse(looked.prefill.values);
    if (!parsed.success) return { vn: v.vn, error: "ข้อมูลจาก HOSxP ไม่ผ่านการตรวจรูปแบบ" };
    if (isFormEmpty(parsed.data)) return { vn: v.vn, error: "ไม่มีข้อมูลใน HOSxP ให้ตรวจ" };

    const created = await prisma.case.create({
      data: {
        caseNumber: await nextCaseNumber(),
        title: `ตรวจอัตโนมัติ OPD ${targetDate}`,
        hosxpPatientRef: parsed.data.hn ?? (v.hn || null),
        hosxpVisitRef: v.vn,
        createdBy: AUTO_AUDIT_USER,
        createdByName: AUTO_AUDIT_NAME,
      },
    });

    const form = await prisma.recordForm.create({
      data: {
        ...parsed.data,
        caseId: created.id,
        source: "hosxp",
        hosxpVisitRef: v.vn,
        prefilledAt: new Date(),
        createdBy: AUTO_AUDIT_USER,
        updatedBy: AUTO_AUDIT_USER,
      },
    });

    const doc = await generateDocumentFromForm(form.id);
    const review = await reviewExistingDocument(doc.documentId);
    return { vn: v.vn, caseId: created.id, percentage: review.percentage };
  } catch (e) {
    console.error(`auto-audit: ตรวจ VN ${v.vn} ไม่สำเร็จ:`, e);
    return { vn: v.vn, error: e instanceof Error ? e.message.slice(0, 300) : "ตรวจไม่สำเร็จ" };
  }
}

/**
 * รันหนึ่งรอบ
 *   trigger "auto"   → runKey = auto:<วันที่รัน> (หนึ่งครั้งต่อวัน)
 *   trigger "manual" → กดรันเองจากหน้าตั้งค่า เลือกวันที่ได้ รันเพิ่มได้เสมอ
 */
export async function runAutoAudit(opts: {
  trigger: "auto" | "manual";
  /** manual: วันที่ของ visit ที่จะตรวจ — ไม่ระบุ = ตามที่ตั้งค่าไว้ */
  targetDate?: string;
  startedBy?: string | null;
  now?: Date;
}) {
  const settings = await loadSettings();
  const runDate = bangkokParts(opts.now ?? new Date()).date;
  const targetDate = opts.targetDate ?? targetDateFor(runDate, settings.targetDay);

  if (await runningRun()) {
    throw new RunAlreadyClaimedError("มีรอบตรวจที่กำลังทำงานอยู่ — รอให้เสร็จก่อน");
  }

  const run = await claimRun({
    runKey: opts.trigger === "auto" ? autoRunKey(runDate) : `manual:${Date.now()}`,
    targetDate,
    trigger: opts.trigger,
    startedBy: opts.startedBy ?? null,
  });

  const results: RunResultItem[] = [];
  let found = 0;
  let skipped = 0;

  try {
    if (!isHosxpEnabled()) throw new Error("ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP");

    const visits = (await listVisitsByDate(targetDate, 2000, { opdOnly: true, withDiag: false })).filter((v) => v.hn);
    found = visits.length;

    // visit ที่เคยตรวจไปแล้ว (ด้วยมือหรือรอบก่อน) ไม่ตรวจซ้ำ — เปลืองโควตา AI
    const done = new Set(
      (
        await prisma.recordForm.findMany({
          where: { hosxpVisitRef: { in: visits.map((v) => v.vn) } },
          select: { hosxpVisitRef: true },
        })
      ).map((f) => f.hosxpVisitRef),
    );
    const fresh = visits.filter((v) => !done.has(v.vn));
    skipped = visits.length - fresh.length;

    for (const v of sample(fresh, settings.maxVisits)) {
      results.push(await auditVisit(v, targetDate));
      // อัปเดตความคืบหน้าระหว่างทาง — หน้าตั้งค่าจะเห็นตัวเลขขยับ
      await prisma.autoAuditRun.update({
        where: { id: run.id },
        data: {
          found,
          skipped,
          reviewed: results.filter((r) => r.caseId).length,
          failed: results.filter((r) => r.error).length,
        },
      });
    }

    const scores = results
      .map((r) => r.percentage)
      .filter((p): p is number => typeof p === "number");
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    return await prisma.autoAuditRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        found,
        skipped,
        reviewed: results.filter((r) => r.caseId).length,
        failed: results.filter((r) => r.error).length,
        avgPercent: avg === null ? null : Math.round(avg * 100) / 100,
        results: results as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    console.error("auto-audit: รอบนี้ล้มเหลว:", e);
    return prisma.autoAuditRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        found,
        skipped,
        reviewed: results.filter((r) => r.caseId).length,
        failed: results.filter((r) => r.error).length,
        results: results as unknown as Prisma.InputJsonValue,
        error: e instanceof Error ? e.message.slice(0, 1000) : String(e),
        finishedAt: new Date(),
      },
    });
  }
}
