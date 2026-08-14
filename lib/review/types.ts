// lib/review/types.ts
// สัญญากลางระหว่าง AI (extract facts) กับ Rule Engine (ตัดสินคะแนน)
//
// ⚠️ AI ห้ามส่ง "คะแนน" หรือ "คำตัดสิน" กลับมา ส่งได้เฉพาะ fact ที่ตรวจสอบได้จากเอกสาร
//    การแมป fact → คะแนน อยู่ใน lib/review/criteria/opd-a1.ts ที่เดียว (สเปกข้อ 2.1)

/**
 * ข้อความจริงจากเอกสาร (หลัง PHI masking) ที่ใช้เป็นหลักฐานของแต่ละหัวข้อ
 * ห้ามเป็นคำสรุปของ AI และห้ามเป็น mask token ล้วนๆ (สเปกข้อ 2.2 / 2.3)
 */
export type Evidence = string;

export type TreatmentDetailLevel = "none" | "minimal" | "partial" | "full";

export type DiagnosisFact = {
  /** ข้อความคำวินิจฉัยตามที่เขียนในเอกสาร */
  text: string;
  /** บันทึกครบตามจำนวนโรคที่ผู้ป่วยเป็นอยู่หรือไม่ */
  complete: boolean;
  /** ระบุชนิด/ตำแหน่งโรคชัดเจนหรือไม่ */
  locationSpecified: boolean;
  /** เป็นคำย่อ (เช่น "URI", "DM") หรือไม่ */
  isAbbreviation: boolean;
};

export type ExtractedFacts = {
  serviceDateTime: {
    hasDate: boolean;
    hasTime: boolean;
    evidence: Evidence;
  };
  chiefComplaint: {
    text: string;
    /** เป็นอาการ/เหตุผลที่มาที่มีความหมาย แยกรายละเอียดได้ */
    hasSymptom: boolean;
    /** ระบุระยะเวลาของอาการ หรือรายละเอียดจำแนก (เช่น "ครั้งที่ 2") */
    hasDuration: boolean;
    evidence: Evidence;
  };
  history: {
    presentIllness: boolean;
    pastHistory: boolean;
    personalHistory: boolean;
    riskFactors: boolean;
    evidence: Evidence;
  };
  physicalExam: {
    /** จำนวนระบบที่ตรวจร่างกาย (นับตามระบบ ไม่ใช่จำนวนบรรทัด) */
    systemsCount: number;
    /** มีผลตรวจชันสูตรบันทึกไว้ */
    labResultExists: boolean;
    /** มีการสั่งตรวจชันสูตร (ต่อให้ผลยังไม่ถูกบันทึก) */
    labWasOrdered: boolean;
    evidence: Evidence;
  };
  diagnosis: {
    /** ผู้ป่วยไม่มีโรคใดๆ อยู่เลย → N/A ตาม naRule */
    isNA: boolean;
    diagnoses: DiagnosisFact[];
    evidence: Evidence;
  };
  treatment: {
    /** ไม่มีการรักษาใดๆ → N/A ตาม naRule */
    isNA: boolean;
    hasDetail: TreatmentDetailLevel;
    evidence: Evidence;
  };
  timeline: { eventTime: string | null; title: string }[];
};

// ── ฝั่ง Rule Engine ──────────────────────────────────────────────────────────

/** ข้อมูลเกณฑ์เท่าที่ Rule Engine ต้องใช้ (subset ของ Criterion ใน DB) */
export type CriterionInput = {
  id: string;
  code: string;
  name: string;
  maxScore: number;
  allowNA: boolean;
};

export type RuleOutcome = {
  score: number | null;
  isNA: boolean;
  reason: string;
  evidence: string;
};

/** ฟังก์ชันตัดสิน 1 หัวข้อ — pure function, ไม่แตะ DB / ไม่เรียก AI */
export type CriterionRule = (
  facts: ExtractedFacts,
  criterion: CriterionInput,
) => RuleOutcome;

export type ReviewItemResult = RuleOutcome & {
  criterionId: string;
  criterionCode: string;
  criterionName: string;
  criterionMaxScore: number;
};

export type RuleEngineResult = {
  items: ReviewItemResult[];
  totalScore: number;
  /** รวมเฉพาะข้อที่ไม่ใช่ N/A (สเปกข้อ 7) */
  maxScore: number;
  /** null เมื่อ maxScore = 0 (ทุกข้อเป็น N/A) — กันหาร 0 */
  percentage: number | null;
};
