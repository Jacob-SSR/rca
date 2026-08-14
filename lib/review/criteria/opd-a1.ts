// lib/review/criteria/opd-a1.ts
// กติกาให้คะแนน Form A1 (OPD) — แมป ExtractedFacts → คะแนน ตาม data/criteria/opd-a1.json
//
// ⚠️ ที่นี่คือที่เดียวที่ "ตัดสินคะแนน" ได้ (สเปกข้อ 2.1)
//    - ห้ามอ่าน description จาก AI มาเป็นตัวตัดสิน
//    - ห้ามให้ AI ส่ง score กลับมา
//    - เปลี่ยน AI provider แล้วคะแนนต้องไม่เปลี่ยน ถ้า facts เหมือนกัน
//
// เลข level ทุกอันอ้างอิงข้อความใน opd-a1.json ตรงๆ — แก้ที่นี่ต้องเทียบ JSON เสมอ

import type { CriterionRule, ExtractedFacts } from "@/lib/review/types";

/** ตัดข้อความหลักฐานให้ไม่ยาวเกินไปตอนโชว์/เก็บ แต่ยังอ่านรู้เรื่อง */
const MAX_EVIDENCE_CHARS = 500;

function ev(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > MAX_EVIDENCE_CHARS ? `${t.slice(0, MAX_EVIDENCE_CHARS)}…` : t;
}

// ── SERVICE_DATETIME (max 1) ──────────────────────────────────────────────────
// 0 = ไม่บันทึกวันและเวลา / 1 = บันทึกวันหรือเวลาครบถ้วน
const serviceDateTimeRule: CriterionRule = (facts) => {
  const { hasDate, hasTime, evidence } = facts.serviceDateTime;

  if (!hasDate && !hasTime) {
    return {
      score: 0,
      isNA: false,
      reason: "ไม่พบการบันทึกวันและเวลาที่มารับบริการ",
      evidence: ev(evidence),
    };
  }

  const found = [hasDate && "วันที่", hasTime && "เวลา"].filter(Boolean).join(" และ ");
  return {
    score: 1,
    isNA: false,
    reason: `พบการบันทึก${found}ที่มารับบริการ`,
    evidence: ev(evidence),
  };
};

// ── CC (max 2) ────────────────────────────────────────────────────────────────
// 0 = ไม่บันทึก
// 1 = บันทึกอาการแต่ไม่ระบุระยะเวลา หรือเหตุผลที่มาที่แยกรายละเอียดไม่ได้ ("มาตามนัด")
// 2 = บันทึกอาการ + ระยะเวลา หรือเหตุผลที่มาที่แยกรายละเอียดได้
const ccRule: CriterionRule = (facts) => {
  const { text, hasSymptom, hasDuration, evidence } = facts.chiefComplaint;
  const evidenceText = ev(evidence || text);

  if (!text.trim()) {
    return {
      score: 0,
      isNA: false,
      reason: "ไม่พบการบันทึกอาการสำคัญหรือเหตุผลที่มา",
      evidence: evidenceText,
    };
  }

  if (!hasSymptom) {
    return {
      score: 1,
      isNA: false,
      reason: "บันทึกเหตุผลที่มาแต่ไม่มีความหมายพอจะแยกรายละเอียดได้ (เช่น มาตามนัด / รับยาเดิม)",
      evidence: evidenceText,
    };
  }

  if (!hasDuration) {
    return {
      score: 1,
      isNA: false,
      reason: "บันทึกอาการสำคัญแต่ไม่ระบุระยะเวลา",
      evidence: evidenceText,
    };
  }

  return {
    score: 2,
    isNA: false,
    reason: "บันทึกอาการสำคัญพร้อมระยะเวลา หรือเหตุผลที่มาที่แยกรายละเอียดได้",
    evidence: evidenceText,
  };
};

// ── HISTORY (max 3) ───────────────────────────────────────────────────────────
// 0 = ไม่บันทึก / 1 = เฉพาะประวัติปัจจุบัน
// 2 = ปัจจุบัน + โรคประจำตัวหรือประวัติอดีต
// 3 = ปัจจุบัน + อดีต + ประวัติส่วนตัว/ปัจจัยเสี่ยง
const historyRule: CriterionRule = (facts) => {
  const { presentIllness, pastHistory, personalHistory, riskFactors, evidence } = facts.history;
  const evidenceText = ev(evidence);
  const hasPersonal = personalHistory || riskFactors;

  if (!presentIllness && !pastHistory && !hasPersonal) {
    return {
      score: 0,
      isNA: false,
      reason: "ไม่พบการบันทึกประวัติการเจ็บป่วย",
      evidence: evidenceText,
    };
  }

  if (!presentIllness) {
    // เกณฑ์ไล่ระดับจาก "ประวัติปัจจุบัน" เป็นฐาน — ถ้าขาดฐานนี้ ขึ้นระดับ 2 ไม่ได้
    return {
      score: 1,
      isNA: false,
      reason: "มีบันทึกประวัติบางส่วนแต่ไม่พบประวัติการเจ็บป่วยปัจจุบัน จึงขึ้นระดับสูงกว่านี้ไม่ได้",
      evidence: evidenceText,
    };
  }

  if (!pastHistory) {
    return {
      score: 1,
      isNA: false,
      reason: "บันทึกเฉพาะประวัติปัจจุบัน ไม่พบโรคประจำตัวหรือประวัติอดีต",
      evidence: evidenceText,
    };
  }

  if (!hasPersonal) {
    return {
      score: 2,
      isNA: false,
      reason: "บันทึกประวัติปัจจุบันและโรคประจำตัว/ประวัติอดีต แต่ไม่พบประวัติส่วนตัวหรือปัจจัยเสี่ยง",
      evidence: evidenceText,
    };
  }

  return {
    score: 3,
    isNA: false,
    reason: "บันทึกครบทั้งประวัติปัจจุบัน โรคประจำตัว/ประวัติอดีต และประวัติส่วนตัว/ปัจจัยเสี่ยง",
    evidence: evidenceText,
  };
};

// ── PHYSICAL_EXAM (max 4) ─────────────────────────────────────────────────────
// 0 = ไม่บันทึก / 1 = ระบบเดียว / 2 = สองระบบ
// 3 = มากกว่าสองระบบ แต่ไม่บันทึกผลชันสูตร ทั้งที่มีผล
// 4 = มากกว่าสองระบบ + บันทึกผลชันสูตร
// specialRule: ไม่ได้ตรวจชันสูตรเลย → ให้ 4 ได้
const physicalExamRule: CriterionRule = (facts) => {
  const { systemsCount, labResultExists, labWasOrdered, evidence } = facts.physicalExam;
  const evidenceText = ev(evidence);
  const systems = Number.isFinite(systemsCount) ? Math.max(0, Math.trunc(systemsCount)) : 0;

  if (systems <= 0) {
    return {
      score: 0,
      isNA: false,
      reason: "ไม่พบการบันทึกผลการตรวจร่างกาย",
      evidence: evidenceText,
    };
  }

  if (systems === 1) {
    return {
      score: 1,
      isNA: false,
      reason: "บันทึกผลการตรวจร่างกายเพียงระบบเดียว",
      evidence: evidenceText,
    };
  }

  if (systems === 2) {
    return {
      score: 2,
      isNA: false,
      reason: "บันทึกผลการตรวจร่างกายสองระบบ",
      evidence: evidenceText,
    };
  }

  if (labResultExists) {
    return {
      score: 4,
      isNA: false,
      reason: `บันทึกผลการตรวจร่างกาย ${systems} ระบบ และมีบันทึกผลการตรวจชันสูตร`,
      evidence: evidenceText,
    };
  }

  if (labWasOrdered) {
    return {
      score: 3,
      isNA: false,
      reason: `บันทึกผลการตรวจร่างกาย ${systems} ระบบ แต่มีการส่งตรวจชันสูตรโดยไม่บันทึกผล`,
      evidence: evidenceText,
    };
  }

  // ไม่ได้ตรวจชันสูตรเลย → specialRules ของ JSON ให้ 4 ได้
  return {
    score: 4,
    isNA: false,
    reason: `บันทึกผลการตรวจร่างกาย ${systems} ระบบ และไม่มีการตรวจชันสูตร (ตามหมายเหตุเกณฑ์ ให้คะแนนเต็มได้)`,
    evidence: evidenceText,
  };
};

// ── DIAGNOSIS (max 4, allowNA) ────────────────────────────────────────────────
// 0 = ไม่บันทึก หรือใช้รหัส ICD / คำบรรยายรหัส ICD แทนคำวินิจฉัย
// 1 = บันทึกไม่ครบตามจำนวนโรค
// 2 = ครบ แต่บางคำกำกวม ขาดชนิด/ตำแหน่งโรค
// 3 = ครบ + รายละเอียดครบ แต่มีคำย่อ/อ่านไม่ออก
// 4 = ครบ + รายละเอียดครบ + ไม่มีคำย่อ
const diagnosisRule: CriterionRule = (facts, criterion) => {
  const { isNA, diagnoses, evidence } = facts.diagnosis;
  const evidenceText = ev(evidence);

  if (isNA && criterion.allowNA) {
    return {
      score: null,
      isNA: true,
      reason: "N/A — ผู้ป่วยไม่มีโรคใดๆ อยู่เลย",
      evidence: evidenceText,
    };
  }

  if (diagnoses.length === 0) {
    return {
      score: 0,
      isNA: false,
      reason: "ไม่พบคำวินิจฉัยโรค หรือใช้รหัส ICD แทนคำวินิจฉัยโรค",
      evidence: evidenceText,
    };
  }

  const incomplete = diagnoses.filter((d) => !d.complete);
  if (incomplete.length > 0) {
    return {
      score: 1,
      isNA: false,
      reason: `บันทึกคำวินิจฉัยไม่ครบตามจำนวนโรคที่เป็นอยู่ (${incomplete.length} รายการไม่ครบ)`,
      evidence: ev(evidence || incomplete.map((d) => d.text).join(", ")),
    };
  }

  const vague = diagnoses.filter((d) => !d.locationSpecified);
  if (vague.length > 0) {
    return {
      score: 2,
      isNA: false,
      reason: `บันทึกครบตามจำนวนโรค แต่ยังกำกวม ขาดชนิดหรือตำแหน่งโรค: ${vague
        .map((d) => d.text)
        .join(", ")}`,
      evidence: ev(evidence || vague.map((d) => d.text).join(", ")),
    };
  }

  const abbreviated = diagnoses.filter((d) => d.isAbbreviation);
  if (abbreviated.length > 0) {
    return {
      score: 3,
      isNA: false,
      reason: `บันทึกครบและมีรายละเอียดครบ แต่มีคำวินิจฉัยที่เป็นคำย่อ: ${abbreviated
        .map((d) => d.text)
        .join(", ")}`,
      evidence: ev(evidence || abbreviated.map((d) => d.text).join(", ")),
    };
  }

  return {
    score: 4,
    isNA: false,
    reason: `บันทึกคำวินิจฉัยครบ ${diagnoses.length} รายการ มีรายละเอียดชนิด/ตำแหน่งโรคครบ และไม่มีคำย่อ`,
    evidence: ev(evidence || diagnoses.map((d) => d.text).join(", ")),
  };
};

// ── TREATMENT (max 3, allowNA) ────────────────────────────────────────────────
// 0 = มีการรักษาแต่ไม่บันทึก หรือบันทึกแบบไม่มีรายละเอียด (RM, same, ให้ยาเดิม)
// 1 = ขาดรายละเอียดส่วนใหญ่ / 2 = ขาดรายละเอียดปลีกย่อย / 3 = มีรายละเอียดทั้งหมด
const TREATMENT_SCORE = { none: 0, minimal: 1, partial: 2, full: 3 } as const;

const TREATMENT_REASON: Record<keyof typeof TREATMENT_SCORE, string> = {
  none: "มีการรักษาแต่ไม่บันทึก หรือบันทึกข้อความที่ไม่มีรายละเอียด (เช่น RM, same, ให้ยาเดิม)",
  minimal: "บันทึกการรักษาแต่ขาดรายละเอียดส่วนใหญ่ (เช่น มีชื่อยาแต่ไม่ระบุวิธีใช้และปริมาณ)",
  partial: "บันทึกการรักษาแต่ขาดรายละเอียดปลีกย่อย (เช่น ไม่ระบุรูปแบบยา)",
  full: "บันทึกการรักษาโดยมีรายละเอียดครบทุกด้าน",
};

const treatmentRule: CriterionRule = (facts, criterion) => {
  const { isNA, hasDetail, evidence } = facts.treatment;
  const evidenceText = ev(evidence);

  if (isNA && criterion.allowNA) {
    return {
      score: null,
      isNA: true,
      reason: "N/A — ไม่มีการรักษาใดๆ",
      evidence: evidenceText,
    };
  }

  const score = TREATMENT_SCORE[hasDetail];
  if (score === undefined) {
    throw new Error(`Unknown treatment.hasDetail: ${JSON.stringify(hasDetail)}`);
  }

  return {
    score,
    isNA: false,
    reason: TREATMENT_REASON[hasDetail],
    evidence: evidenceText,
  };
};

/**
 * ทะเบียนกติกาต่อ criterion.code
 * key ต้องตรงกับ code ใน data/criteria/opd-a1.json ทุกตัว
 */
export const OPD_A1_RULES: Record<string, CriterionRule> = {
  SERVICE_DATETIME: serviceDateTimeRule,
  CC: ccRule,
  HISTORY: historyRule,
  PHYSICAL_EXAM: physicalExamRule,
  DIAGNOSIS: diagnosisRule,
  TREATMENT: treatmentRule,
};

export type { ExtractedFacts };
