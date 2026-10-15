// lib/auto-audit/runner.ts
// รันตรวจอัตโนมัติหนึ่งรอบ: ดึง visit OPD ของวันเป้าหมายจาก HOSxP → สุ่มตามจำนวนที่ตั้ง
// (Stratified Random Sampling ตามรหัสโรคหลัก — สัดส่วนดู ICD_STRATA ใน schedule.ts)
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
import { opdDiagByDate } from "@/lib/hosxp/icd";
import { recordFormSchema } from "@/lib/form/schema";
import { caseNumberFor, generateDocumentFromForm, isFormEmpty } from "@/lib/form/service";
import { reviewExistingDocument } from "@/lib/review/pipeline";
import { AIQuotaError, assertAiAvailable } from "@/lib/ai";
import { opdDepartmentLabel } from "@/lib/departments";
import { currentQuotaBlock, quotaMessage } from "@/lib/ai/quota";
import { type AuditStep, type LiveVisit, trackRun } from "@/lib/auto-audit/progress";
import {
  DEFAULT_SETTINGS,
  autoRunKey,
  bangkokParts,
  matchesFilters,
  parseWeekdays,
  planVisits,
  needsIcd,
  passesDepartmentIcd,
  pruneRules,
  quotasOf,
  savedRulesSchema,
  guidelineSampleSize,
  stratumOf,
  strataSummary,
  type StratumKey,
  type RunFilters,
  runFiltersSchema,
  runTarget,
  targetDateFor,
  visitLimitOf,
  type AutoAuditSettings,
  type TargetDay,
} from "@/lib/auto-audit/schedule";

export const AUTO_AUDIT_USER = "auto-audit";
const AUTO_AUDIT_NAME = "ตรวจอัตโนมัติ (AI)";

export type RunResultItem = {
  vn: string;
  /** แผนกของ visit — รอบ resume ใช้นับว่าแต่ละแผนกตรวจครบจำนวนหรือยัง */
  depcode?: string;
  /** ชั้นของการสุ่ม (กลุ่มรหัสโรคหลัก) — ไว้นับว่าแต่ละรหัสตรวจไปกี่ราย */
  stratum?: StratumKey;
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
    departments: (row.departments ?? "").split(",").map((d) => d.trim()).filter(Boolean),
    departmentRules: savedRulesSchema.safeParse(row.departmentRules ?? {}).data ?? {},
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
    departments: s.departments.length > 0 ? s.departments.join(",") : null,
    departmentRules:
      Object.keys(s.departmentRules).length > 0
        ? (s.departmentRules as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
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
  trigger: "auto" | "manual" | "resume";
  startedBy: string | null;
  startedByName: string | null;
  visitLimit: number | null;
  resumedFrom: string | null;
  filters: RunFilters;
}) {
  try {
    const { filters, ...rest } = opts;
    return await prisma.autoAuditRun.create({
      data: { ...rest, filters: filters as unknown as Prisma.InputJsonValue, status: "RUNNING" },
    });
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

/**
 * ตรวจ visit เดียว — คืนผลหรือข้อผิดพลาด ไม่ throw (รายเดียวพังไม่ล้มทั้งรอบ)
 * reuseFormId: ฟอร์มที่รอบก่อนสร้างไว้แต่ตรวจไม่สำเร็จ → ตรวจฟอร์มเดิม ไม่สร้างเคสซ้ำ
 */
async function auditVisit(
  v: { vn: string; hn: string; department?: string; depcode?: string; reuseFormId?: string },
  targetDate: string,
  owner: { username: string; name: string },
  /** บอกว่ากำลังทำขั้นไหน — ใช้วาดความคืบหน้าสดในหน้าตั้งค่า */
  onStep: (step: AuditStep) => void = () => {},
): Promise<RunResultItem> {
  const depcode = v.depcode || undefined;
  try {
    if (v.reuseFormId) {
      onStep("document");
      const form = await prisma.recordForm.findUniqueOrThrow({
        where: { id: v.reuseFormId },
        select: { id: true, caseId: true },
      });
      const doc = await generateDocumentFromForm(form.id);
      onStep("review");
      const review = await reviewExistingDocument(doc.documentId);
      return { vn: v.vn, depcode, caseId: form.caseId, percentage: review.percentage };
    }

    onStep("lookup");
    const looked = await lookupVisit({ hn: v.hn, vn: v.vn });
    if (!looked.available) return { vn: v.vn, depcode, error: looked.reason };

    const parsed = recordFormSchema.safeParse(looked.prefill.values);
    if (!parsed.success) return { vn: v.vn, depcode, error: "ข้อมูลจาก HOSxP ไม่ผ่านการตรวจรูปแบบ" };
    if (isFormEmpty(parsed.data)) return { vn: v.vn, depcode, error: "ไม่มีข้อมูลใน HOSxP ให้ตรวจ" };

    onStep("form");
    const created = await prisma.case.create({
      data: {
        caseNumber: await caseNumberFor(parsed.data.hn ?? v.hn, parsed.data.serviceDate ?? targetDate),
        title: `ตรวจอัตโนมัติ OPD ${targetDate}`,
        hosxpPatientRef: parsed.data.hn ?? (v.hn || null),
        hosxpVisitRef: v.vn,
        // เจ้าของเคส = คนที่กดรัน (รอบตามเวลาไม่มีคนกด → "ตรวจอัตโนมัติ (AI)")
        // ส่วนฟอร์มยังเป็นของ AUTO_AUDIT_USER เสมอ — planVisits ใช้แยกฟอร์มของรอบอัตโนมัติ
        // ออกจากฟอร์มที่คนกรอกเอง
        createdBy: owner.username,
        createdByName: owner.name,
        // รอบอัตโนมัติไม่มีคนเลือกแผนก → ใช้แผนก OPD ของ visit (ชื่อชุดเดียวกับตัวเลือกในฟอร์ม)
        department: opdDepartmentLabel(v.depcode) || v.department || parsed.data.department || null,
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

    onStep("document");
    const doc = await generateDocumentFromForm(form.id);
    onStep("review");
    const review = await reviewExistingDocument(doc.documentId);
    return { vn: v.vn, depcode, caseId: created.id, percentage: review.percentage };
  } catch (e) {
    console.error(`auto-audit: ตรวจ VN ${v.vn} ไม่สำเร็จ:`, e);
    return { vn: v.vn, depcode, error: e instanceof Error ? e.message.slice(0, 300) : "ตรวจไม่สำเร็จ" };
  }
}

/** โควตา AI หมด → หยุดรอบไว้ก่อน (สถานะ PAUSED) ตัวตั้งเวลาจะตรวจต่อหลังรีเซ็ต */
class QuotaPausedError extends Error {}

/**
 * รันหนึ่งรอบ
 *   trigger "auto"   → runKey = auto:<วันที่รัน> (หนึ่งครั้งต่อวัน)
 *   trigger "manual" → กดรันเองจากหน้าตั้งค่า เลือกวันที่ได้ รันเพิ่มได้เสมอ
 *   trigger "resume" → ตรวจต่อจากรอบที่หยุดรอโควตา (เรียกจาก resumePausedRun)
 */
export async function runAutoAudit(opts: {
  trigger: "auto" | "manual" | "resume";
  /** manual/resume: วันที่ของ visit ที่จะตรวจ — ไม่ระบุ = ตามที่ตั้งค่าไว้ */
  targetDate?: string;
  startedBy?: string | null;
  now?: Date;
  /** จำนวนที่ต้องตรวจ (null = ทุกราย) — ไม่ระบุ = ตามที่ตั้งค่าไว้ */
  visitLimit?: number | null;
  /** resume: id ของรอบที่หยุดไว้ */
  resumedFrom?: string;
  /** ชื่อที่แสดงของคนกดรัน — เป็นผู้สร้างเคส */
  startedByName?: string | null;
  /** แผนก/ค่าแยกรายแผนก (จำนวน, ICD-10)/ช่วงเวลา — ไม่ระบุ = ตามที่ตั้งค่าไว้ ทั้งวัน */
  filters?: Partial<RunFilters>;
}) {
  const settings = await loadSettings();
  const runDate = bangkokParts(opts.now ?? new Date()).date;
  const targetDate = opts.targetDate ?? targetDateFor(runDate, settings.targetDay);
  const limitSetting = opts.visitLimit !== undefined ? opts.visitLimit : visitLimitOf(settings.maxVisits);
  // ตามแนวทาง → ยังไม่รู้จำนวนจนกว่าจะเห็นผู้ป่วยของวันนั้น (คิดแล้วบันทึกทับที่รอบหลังดึง visit)
  let visitLimit = limitSetting === "guideline" ? null : limitSetting;
  const departments = opts.filters?.departments ?? settings.departments;
  const filters: RunFilters = {
    departments,
    // ส่งแผนกมาเอง (กดรันเอง) แต่ไม่ส่งค่าแยกรายแผนก = ไม่มีจำนวน/ICD แยกแผนก
    rules: pruneRules(
      departments,
      opts.filters?.rules ?? (opts.filters?.departments ? {} : settings.departmentRules),
    ),
    shift: opts.filters?.shift ?? null,
    timeFrom: opts.filters?.timeFrom ?? null,
    timeTo: opts.filters?.timeTo ?? null,
  };
  const owner = opts.startedBy
    ? { username: opts.startedBy, name: opts.startedByName || opts.startedBy }
    : { username: AUTO_AUDIT_USER, name: AUTO_AUDIT_NAME };

  if (await runningRun()) {
    throw new RunAlreadyClaimedError("มีรอบตรวจที่กำลังทำงานอยู่ — รอให้เสร็จก่อน");
  }

  const run = await claimRun({
    runKey:
      opts.trigger === "auto"
        ? autoRunKey(runDate)
        : opts.trigger === "resume"
          ? `resume:${opts.resumedFrom}`
          : `manual:${Date.now()}`,
    targetDate,
    trigger: opts.trigger,
    startedBy: opts.startedBy ?? null,
    startedByName: opts.startedByName ?? null,
    visitLimit,
    resumedFrom: opts.resumedFrom ?? null,
    filters,
  });

  const tracker = trackRun(run.id);
  const results: RunResultItem[] = [];
  let found = 0;
  let skipped = 0;
  const tally = () => ({
    found,
    skipped,
    reviewed: results.filter((r) => r.caseId && !r.error).length,
    failed: results.filter((r) => r.error).length,
  });

  try {
    if (!isHosxpEnabled()) throw new Error("ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP");

    const dayVisits = await listVisitsByDate(targetDate, 2000, { opdOnly: true, withDiag: false });
    // รหัสวินิจฉัยของทั้งวัน ใช้สองอย่าง:
    //   - แผนกที่เซ็ต ICD-10 ไว้ → ตรวจเฉพาะ visit ของแผนกนั้นที่มีรหัสนั้น (ไม่มี/ไม่ได้ลงรหัส = ข้าม)
    //   - โหมดสุ่ม → Stratified Random Sampling ตามรหัสโรคหลัก (สัดส่วนใน ICD_STRATA)
    // อ่านรหัสไม่ได้ให้ล้มทั้งรอบ — ถ้าปล่อยไปจะกลายเป็นตรวจทุกโรค/สุ่มผิดวิธี
    const quotas = quotasOf(filters.rules);
    const sampling = limitSetting !== null || Object.keys(quotas).length > 0;
    const diagOf = needsIcd(filters.rules) || sampling ? await opdDiagByDate(targetDate) : null;
    const stratumOfVisit = (v: { vn: string }) => stratumOf(diagOf?.get(v.vn)?.principal);
    tracker.phase("planning");
    const visits = dayVisits.filter(
      (v) =>
        v.hn &&
        matchesFilters(v, filters) &&
        (!diagOf || passesDepartmentIcd(v, diagOf.get(v.vn)?.codes ?? [], filters.rules)),
    );
    found = visits.length;

    if (limitSetting === "guideline") {
      // ผู้ป่วยที่มารับบริการ = คนไม่ซ้ำ (HN) ของกองรวม — แผนกที่กำหนดจำนวนแยกไว้ไม่นับรวม
      const patients = new Set(visits.filter((v) => !((v.depcode ?? "").trim() in quotas)).map((v) => v.hn)).size;
      visitLimit = guidelineSampleSize(patients);
      await prisma.autoAuditRun.update({ where: { id: run.id }, data: { visitLimit } });
    }

    // ฟอร์มที่มีอยู่แล้วของ visit ทั้งวัน (ไม่ใช่แค่ที่ผ่านตัวกรอง) + มีผลตรวจเสร็จแล้วหรือยัง
    // ทั้งวันเพราะต้องรู้ว่าคนนี้ถูกตรวจไปแล้วจาก visit อื่นในวันเดียวกันหรือยัง (ดูกติกาใน planVisits)
    const existing = await prisma.recordForm.findMany({
      where: { hosxpVisitRef: { in: dayVisits.map((v) => v.vn) } },
      select: {
        id: true,
        hosxpVisitRef: true,
        createdBy: true,
        documents: { select: { reviews: { where: { status: "COMPLETED" }, select: { id: true }, take: 1 } } },
      },
    });
    const plan = planVisits(
      visits,
      existing.map((f) => ({
        id: f.id,
        hosxpVisitRef: f.hosxpVisitRef,
        byAutoAudit: f.createdBy === AUTO_AUDIT_USER,
        completed: f.documents.some((d) => d.reviews.length > 0),
      })),
      visitLimit,
      { quotas, sameDay: dayVisits, stratum: stratumOfVisit },
    );
    skipped = plan.skipped;
    // สรุปการแบ่งชั้นไว้แสดงในประวัติ — ไม่ได้อ่านรหัสวินิจฉัย (ตรวจทุกราย) ก็ไม่มีอะไรให้สรุป
    if (diagOf) {
      await prisma.autoAuditRun.update({
        where: { id: run.id },
        data: {
          strata: strataSummary(plan.candidates, plan.todo, stratumOfVisit) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const liveOf = (v: (typeof plan.todo)[number]): LiveVisit => ({
      vn: v.vn,
      department: opdDepartmentLabel(v.depcode) || v.department || null,
      time: v.time || null,
    });

    // โควตา AI หมดอยู่ → ยังไม่เริ่ม หยุดรอไว้ก่อน แล้วตรวจต่อหลังรีเซ็ต
    const blockedAtStart = currentQuotaBlock();
    if (blockedAtStart) throw new QuotaPausedError(`รอโควตา AI: ${quotaMessage(blockedAtStart)}`);
    assertAiAvailable();

    tracker.plan(plan.todo.map(liveOf));
    for (const v of plan.todo) {
      const lv = liveOf(v);
      tracker.start(lv, v.reuseFormId ? "document" : "lookup");
      const result = await auditVisit(v, targetDate, owner, tracker.step);
      results.push(diagOf ? { ...result, stratum: stratumOfVisit(v) } : result);
      tracker.finish({ ...lv, caseId: result.caseId, percentage: result.percentage, error: result.error });

      // โควตาหมดกลางรอบ → หยุดเลย visit ที่เหลือจะโดน 429 ทุกตัวอยู่ดี
      // visit ที่ค้างอยู่ (รวมตัวที่เพิ่งโดน 429) จะถูกตรวจต่อในรอบ resume
      const blocked = currentQuotaBlock();
      if (blocked) throw new QuotaPausedError(`หยุดรอโควตา AI — ${quotaMessage(blocked)} แล้วจะตรวจต่อเอง`);

      // อัปเดตความคืบหน้าระหว่างทาง — หน้าตั้งค่าจะเห็นตัวเลขขยับ และเปิดดูเคสที่เสร็จแล้วได้เลย
      await prisma.autoAuditRun.update({
        where: { id: run.id },
        data: { ...tally(), results: results as unknown as Prisma.InputJsonValue },
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
        ...tally(),
        avgPercent: avg === null ? null : Math.round(avg * 100) / 100,
        results: results as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    const paused = e instanceof QuotaPausedError || e instanceof AIQuotaError;
    if (paused) console.warn(`auto-audit: หยุดรอโควตา AI (visit ${targetDate})`);
    else console.error("auto-audit: รอบนี้ล้มเหลว:", e);

    const scores = results.map((r) => r.percentage).filter((p): p is number => typeof p === "number");
    return await prisma.autoAuditRun.update({
      where: { id: run.id },
      data: {
        status: paused ? "PAUSED" : "FAILED",
        ...tally(),
        avgPercent: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
        results: results as unknown as Prisma.InputJsonValue,
        error: e instanceof Error ? e.message.slice(0, 1000) : String(e),
        finishedAt: new Date(),
      },
    });
  } finally {
    tracker.end();
  }
}

/** ย้อนดูรอบที่หยุดรอโควตาได้ไม่เกินกี่วัน — เก่ากว่านี้ปล่อยไว้ (ไม่ไล่ตรวจงานค้างไม่รู้จบ) */
const RESUME_WINDOW_DAYS = 14;

/**
 * ตรวจต่อจากรอบที่หยุดรอโควตา — ตัวตั้งเวลาเรียกทุกนาที
 * ทำเมื่อ: โควตาไม่ติดอยู่ + ไม่มีรอบอื่นกำลังรัน + มีรอบ PAUSED (เก่าสุดก่อน)
 *
 * จองด้วยการเปลี่ยนสถานะ PAUSED → RESUMED แบบมีเงื่อนไข (updateMany)
 * ใครเปลี่ยนได้ก่อนคนนั้นรัน — กันสอง instance รับช่วงรอบเดียวกัน
 */
export async function resumePausedRun(now: Date = new Date()) {
  if (currentQuotaBlock(now)) return null;
  if (await runningRun()) return null;

  const paused = await prisma.autoAuditRun.findFirst({
    where: { status: "PAUSED", startedAt: { gte: new Date(now.getTime() - RESUME_WINDOW_DAYS * 86_400_000) } },
    orderBy: { startedAt: "asc" },
  });
  if (!paused) return null;

  const claimed = await prisma.autoAuditRun.updateMany({
    where: { id: paused.id, status: "PAUSED" },
    data: { status: "RESUMED" },
  });
  if (claimed.count === 0) return null;

  // ที่เหลือต้องตรวจ — แผนกที่กำหนดจำนวนไว้นับแยกแผนก ที่เหลือนับรวม
  const prev = runFiltersSchema.safeParse(paused.filters ?? {});
  const filters: Partial<RunFilters> = prev.success ? prev.data : {};
  const done = ((paused.results ?? []) as unknown as RunResultItem[]).filter((r) => r.caseId && !r.error);
  const rules = Object.fromEntries(
    Object.entries(filters.rules ?? {}).map(([dep, r]) => [
      dep,
      { ...r, quota: r.quota === null ? null : Math.max(0, r.quota - done.filter((x) => x.depcode === dep).length) },
    ]),
  );
  const quotas = quotasOf(rules);
  const sharedDone = done.filter((r) => !(r.depcode && r.depcode in quotas)).length;
  const remaining = paused.visitLimit === null ? null : Math.max(0, paused.visitLimit - sharedDone);
  if (runTarget({ departments: filters.departments ?? [], quotas }, remaining) === 0) return null;

  console.log(`auto-audit: ตรวจต่อรอบที่หยุดรอโควตา (visit ${paused.targetDate})`);
  return runAutoAudit({
    trigger: "resume",
    targetDate: paused.targetDate,
    visitLimit: remaining,
    resumedFrom: paused.id,
    startedBy: paused.startedBy,
    startedByName: paused.startedByName,
    filters: { ...filters, departments: filters.departments ?? [], rules },
    now,
  });
}
