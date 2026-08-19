// lib/review/pipeline.ts
// ต่อทุกขั้นของการตรวจเข้าด้วยกัน (สเปก Phase 1 ข้อ 9)
//
//   DOCX → mammoth → PHI masking → AI extractFacts (1 ครั้ง) → Rule Engine
//        → Review + ReviewItem[] → TimelineEvent[]
//
// ลำดับนี้ห้ามสลับ: PHI masking ต้องมาก่อน AI เสมอ (สเปกข้อ 2.3)
//
// เอกสารเข้าระบบได้สองทางและใช้เส้นทางตรวจเดียวกันทั้งคู่
//   1. ผู้ใช้อัปโหลด .docx เอง      → runReviewPipeline()
//   2. generate จาก RecordForm      → reviewExistingDocument()
// คะแนนจากสองทางจึงเทียบกันได้ เพราะผ่าน sanitizer / prompt / Rule Engine ชุดเดียวกัน

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractDocument } from "@/lib/documents/extract";
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

export type ReviewResult = {
  reviewId: string;
  documentId: string;
  totalScore: number;
  maxScore: number;
  percentage: number | null;
  maskCounts: Record<string, number>;
};

// ─────────────────────────────────────────────────────────────────────────────
// แกนกลาง — ใช้ร่วมกันทั้งสองเส้นทาง
// ─────────────────────────────────────────────────────────────────────────────

async function loadCriteriaSet(code: string) {
  const criteriaSet = await prisma.criteriaSet.findUnique({
    where: { code },
    include: { criteria: { orderBy: { code: "asc" } } },
  });

  if (!criteriaSet) {
    throw new PipelineError(
      `ไม่พบ CriteriaSet code=${code} — รัน \`npm run db:seed\` ก่อน`,
      "criteria-lookup",
    );
  }

  return criteriaSet;
}

type ScoreDocumentInput = {
  caseId: string;
  documentId: string;
  text: string;
  criteriaSetCode: string;
  sourceType: "upload" | "form";
};

/**
 * ตรวจเอกสารที่มีอยู่แล้วในระบบ
 *
 * Review ถูกสร้างด้วย status PENDING ก่อน แล้วอัปเดตเป็น COMPLETED/FAILED เมื่อจบ
 * → ถ้าพังกลางทางยังมีร่องรอยให้ audit ว่าเคยพยายามตรวจอะไร ตอนไหน ด้วย model ไหน
 */
async function scoreDocument(input: ScoreDocumentInput): Promise<ReviewResult> {
  const criteriaSet = await loadCriteriaSet(input.criteriaSetCode);

  // ── PHI data minimization — ก่อนเข้า AI เสมอ ────────────────────────────────
  const sanitized = sanitizePHI(input.text);

  const provider = getAIProvider();

  const review = await prisma.review.create({
    data: {
      caseId: input.caseId,
      documentId: input.documentId,
      criteriaSetId: criteriaSet.id,
      provider: provider.name,
      model: provider.model,
      status: "PENDING",
      sourceType: input.sourceType,
    },
  });

  try {
    // ── AI extract facts — เรียกครั้งเดียว ────────────────────────────────────
    const facts = await provider.extractFacts(sanitized.text);

    // ── Rule Engine ตัดสินคะแนน ───────────────────────────────────────────────
    const criteria: CriterionInput[] = criteriaSet.criteria.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      maxScore: c.maxScore,
      allowNA: c.allowNA,
    }));

    const result = runRuleEngine(facts, criteria, criteriaSet.code);

    // ── เขียนผลลงฐานข้อมูลเป็นก้อนเดียว ──────────────────────────────────────
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

    // ── Timeline — แทนที่ของเดิมที่มาจาก AI, ไม่แตะที่ผู้ใช้แก้เอง ────────────
    await syncTimelineFromFacts(input.caseId, facts);

    return {
      reviewId: review.id,
      documentId: input.documentId,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      percentage: result.percentage,
      maskCounts: { ...sanitized.counts, total: totalMasked(sanitized.counts) },
    };
  } catch (e) {
    await prisma.review.update({ where: { id: review.id }, data: { status: "FAILED" } });
    if (e instanceof PipelineError) throw e;
    throw new PipelineError(e instanceof Error ? e.message : String(e), "extract-or-score", {
      cause: e,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// เส้นทางที่ 1 — ผู้ใช้อัปโหลด .docx เอง
// ─────────────────────────────────────────────────────────────────────────────

export type RunReviewInput = {
  caseId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
  criteriaSetCode?: string;
  /** ผู้อัปโหลด — ใช้ตัดสินสิทธิ์ลบ/แทนที่ไฟล์ทีหลัง */
  actor?: { username: string; name: string } | null;
};

export async function runReviewPipeline(input: RunReviewInput): Promise<ReviewResult> {
  const criteriaSetCode = input.criteriaSetCode ?? DEFAULT_CRITERIA_SET_CODE;

  const caseRow = await prisma.case.findUnique({ where: { id: input.caseId } });
  if (!caseRow) {
    throw new PipelineError(`ไม่พบ Case id=${input.caseId}`, "case-lookup");
  }

  // ตรวจว่าเกณฑ์มีอยู่ก่อนจะไปเขียนไฟล์ — จะได้ไม่ทิ้งขยะไว้บน volume
  await loadCriteriaSet(criteriaSetCode);

  // สกัดข้อความก่อนเก็บไฟล์ — ชนิดที่อ่านไม่ได้จะรู้ตั้งแต่ตรงนี้
  const parsed = await extractDocument(input.data, input.fileName, input.mimeType);

  if (!parsed.reviewable) {
    // ⚠️ ยังไม่เก็บไฟล์ — เส้นทางนี้คือ "อัปแล้วตรวจเลย" ถ้าตรวจไม่ได้ก็ไม่ควร
    //    สร้าง Document ค้างไว้แบบไม่มี Review ผูก ผู้เรียกต้องไปใช้เส้นทางแนบไฟล์
    throw new PipelineError(parsed.reason ?? "ไฟล์นี้ตรวจอัตโนมัติไม่ได้", "extract");
  }

  const stored = await storeDocument(input.caseId, input.fileName, input.data);

  const document = await prisma.document.create({
    data: {
      caseId: input.caseId,
      fileName: stored.fileName,
      filePath: stored.filePath,
      mimeType: input.mimeType,
      fileSize: stored.fileSize,
      extractedText: parsed.text,
      createdBy: input.actor?.username ?? null,
      createdByName: input.actor?.name ?? null,
      version: (await prisma.document.count({ where: { caseId: input.caseId } })) + 1,
    },
  });

  return scoreDocument({
    caseId: input.caseId,
    documentId: document.id,
    text: parsed.text,
    criteriaSetCode,
    sourceType: "upload",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// เส้นทางที่ 2 — เอกสารที่ generate จาก RecordForm แล้ว
// ─────────────────────────────────────────────────────────────────────────────

export async function reviewExistingDocument(
  documentId: string,
  criteriaSetCode: string = DEFAULT_CRITERIA_SET_CODE,
): Promise<ReviewResult> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, caseId: true, extractedText: true },
  });

  if (!document) {
    throw new PipelineError(`ไม่พบเอกสาร id=${documentId}`, "document-lookup");
  }

  if (!document.extractedText?.trim()) {
    throw new PipelineError("เอกสารนี้ไม่มีข้อความที่อ่านได้", "document-empty");
  }

  return scoreDocument({
    caseId: document.caseId,
    documentId: document.id,
    text: document.extractedText,
    criteriaSetCode,
    sourceType: "form",
  });
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
