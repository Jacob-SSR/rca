// lib/review/pipeline.ts
// ต่อทุกขั้นของ Phase 1 เข้าด้วยกัน (สเปกข้อ 9)
//
//   DOCX → mammoth → PHI masking → AI extractFacts (1 ครั้ง) → Rule Engine
//        → Review + ReviewItem[] → TimelineEvent[]
//
// ลำดับนี้ห้ามสลับ: PHI masking ต้องมาก่อน AI เสมอ (สเปกข้อ 2.3)

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDocx } from "@/lib/docx/parse";
import { sanitizePHI, totalMasked, isUsableEvidence } from "@/lib/phi/sanitize";
import { storeDocument } from "@/lib/storage/documents";
import { getAIProvider } from "@/lib/ai";
import { runRuleEngine } from "@/lib/review/rule-engine";
import type { CriterionInput, ExtractedFacts } from "@/lib/review/types";

export const DEFAULT_CRITERIA_SET_CODE = "A1_OPD_2015";

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly step: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PipelineError";
  }
}

export type RunReviewInput = {
  caseId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
  criteriaSetCode?: string;
};

export type RunReviewOutput = {
  reviewId: string;
  documentId: string;
  totalScore: number;
  maxScore: number;
  percentage: number | null;
  maskCounts: Record<string, number>;
};

/**
 * รันทั้ง pipeline สำหรับเอกสาร 1 ไฟล์
 * Review ถูกสร้างด้วย status PENDING ก่อน แล้วอัปเดตเป็น COMPLETED/FAILED เมื่อจบ
 * → ถ้าพังกลางทางยังมีร่องรอยให้ audit ว่าเคยพยายามตรวจอะไร ตอนไหน ด้วย model ไหน
 */
export async function runReviewPipeline(input: RunReviewInput): Promise<RunReviewOutput> {
  const criteriaSetCode = input.criteriaSetCode ?? DEFAULT_CRITERIA_SET_CODE;

  const caseRow = await prisma.case.findUnique({ where: { id: input.caseId } });
  if (!caseRow) {
    throw new PipelineError(`ไม่พบ Case id=${input.caseId}`, "case-lookup");
  }

  const criteriaSet = await prisma.criteriaSet.findUnique({
    where: { code: criteriaSetCode },
    include: { criteria: { orderBy: { code: "asc" } } },
  });
  if (!criteriaSet) {
    throw new PipelineError(
      `ไม่พบ CriteriaSet code=${criteriaSetCode} — รัน \`npm run db:seed\` ก่อน`,
      "criteria-lookup",
    );
  }

  // ── 1) เก็บไฟล์ลง volume ────────────────────────────────────────────────────
  const stored = await storeDocument(input.caseId, input.fileName, input.data);

  // ── 2) parse DOCX ───────────────────────────────────────────────────────────
  const parsed = await parseDocx(input.data);

  const document = await prisma.document.create({
    data: {
      caseId: input.caseId,
      fileName: stored.fileName,
      filePath: stored.filePath,
      mimeType: input.mimeType,
      fileSize: stored.fileSize,
      extractedText: parsed.text,
      version: (await prisma.document.count({ where: { caseId: input.caseId } })) + 1,
    },
  });

  // ── 3) PHI data minimization — ก่อนเข้า AI เสมอ ─────────────────────────────
  const sanitized = sanitizePHI(parsed.text);

  const provider = getAIProvider();

  const review = await prisma.review.create({
    data: {
      caseId: input.caseId,
      documentId: document.id,
      criteriaSetId: criteriaSet.id,
      provider: provider.name,
      model: provider.model,
      status: "PENDING",
    },
  });

  try {
    // ── 4) AI extract facts — เรียกครั้งเดียว ────────────────────────────────
    const facts = await provider.extractFacts(sanitized.text);

    // ── 5) Rule Engine ตัดสินคะแนน ────────────────────────────────────────────
    const criteria: CriterionInput[] = criteriaSet.criteria.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      maxScore: c.maxScore,
      allowNA: c.allowNA,
    }));

    const result = runRuleEngine(facts, criteria, criteriaSet.code);

    // ── 6) เขียนผลลงฐานข้อมูลเป็นก้อนเดียว ───────────────────────────────────
    await prisma.$transaction([
      prisma.reviewItem.deleteMany({ where: { reviewId: review.id } }),
      prisma.reviewItem.createMany({
        data: result.items.map((item) => ({
          reviewId: review.id,
          criterionId: item.criterionId,
          score: item.score,
          isNA: item.isNA,
          reason: item.reason,
          // evidence ที่ใช้ไม่ได้ (ว่าง หรือเหลือแต่ mask token) เก็บเป็น null
          // ดีกว่าโชว์ "[ชื่อ]" เป็นหลักฐาน (สเปกข้อ 2.2 / 2.3)
          evidence: isUsableEvidence(item.evidence) ? item.evidence : null,
        })),
      }),
      prisma.review.update({
        where: { id: review.id },
        data: {
          status: "COMPLETED",
          totalScore: result.totalScore,
          maxScore: result.maxScore,
          percentage:
            result.percentage === null ? null : new Prisma.Decimal(result.percentage.toFixed(2)),
          factsJson: facts as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);

    // ── 7) Timeline — แทนที่ของเดิมที่มาจาก AI, ไม่แตะที่ผู้ใช้แก้เอง ─────────
    await syncTimelineFromFacts(input.caseId, facts);

    return {
      reviewId: review.id,
      documentId: document.id,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      percentage: result.percentage,
      maskCounts: { ...sanitized.counts, total: totalMasked(sanitized.counts) },
    };
  } catch (e) {
    await prisma.review.update({ where: { id: review.id }, data: { status: "FAILED" } });
    if (e instanceof PipelineError) throw e;
    throw new PipelineError(
      e instanceof Error ? e.message : String(e),
      "extract-or-score",
      { cause: e },
    );
  }
}

/**
 * เขียน TimelineEvent จาก facts.timeline
 * ลบเฉพาะ event ที่ source="ai" ของเคสนี้ — event ที่ผู้ใช้เพิ่ม/แก้เอง (source="manual") ไม่ถูกแตะ
 */
async function syncTimelineFromFacts(caseId: string, facts: ExtractedFacts): Promise<void> {
  await prisma.timelineEvent.deleteMany({ where: { caseId, source: "ai" } });

  if (facts.timeline.length === 0) return;

  await prisma.timelineEvent.createMany({
    data: facts.timeline.map((e) => ({
      caseId,
      eventTime: parseEventTime(e.eventTime),
      title: e.title.trim(),
      source: "ai",
    })),
  });
}

/** AI ส่งเวลามาเป็น string อิสระ — แปลงไม่ได้ก็เก็บ null ดีกว่าเก็บวันที่มั่ว */
function parseEventTime(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
