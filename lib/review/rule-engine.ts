// lib/review/rule-engine.ts
// รับ ExtractedFacts + Criterion[] (จาก DB) → คืน ReviewItem[] + คะแนนรวม
//
// pure function ล้วน: ไม่แตะ DB, ไม่เรียก AI, ไม่อ่าน env
// → เทสต์ด้วย mock facts ได้ตรงๆ (สเปกข้อ 10.7)

import { OPD_A1_RULES } from "@/lib/review/criteria/opd-a1";
import type {
  CriterionInput,
  CriterionRule,
  ExtractedFacts,
  ReviewItemResult,
  RuleEngineResult,
} from "@/lib/review/types";

export class RuleEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleEngineError";
  }
}

/** ชุดกติกาแยกตาม CriteriaSet.code — Phase 1 มีชุดเดียว */
const RULE_SETS: Record<string, Record<string, CriterionRule>> = {
  A1_OPD_2015: OPD_A1_RULES,
};

export function getRuleSet(criteriaSetCode: string): Record<string, CriterionRule> {
  // เวอร์ชันถัดไป (A1_OPD_2015_V2) ใช้กติกาชุดเดิมจนกว่าจะประกาศชุดใหม่
  const base = criteriaSetCode.replace(/_V\d+$/, "");
  const rules = RULE_SETS[base];
  if (!rules) {
    throw new RuleEngineError(`No rule set registered for CriteriaSet "${criteriaSetCode}"`);
  }
  return rules;
}

export function runRuleEngine(
  facts: ExtractedFacts,
  criteria: CriterionInput[],
  criteriaSetCode: string,
): RuleEngineResult {
  if (criteria.length === 0) {
    throw new RuleEngineError("criteria list is empty — seed ยังไม่ถูกรันหรือ CriteriaSet ผิด");
  }

  const rules = getRuleSet(criteriaSetCode);

  const items: ReviewItemResult[] = criteria.map((criterion) => {
    const rule = rules[criterion.code];
    if (!rule) {
      throw new RuleEngineError(
        `No rule implemented for criterion "${criterion.code}" in ${criteriaSetCode}`,
      );
    }

    const outcome = rule(facts, criterion);

    // ── invariant checks ────────────────────────────────────────────────────
    if (outcome.isNA) {
      if (!criterion.allowNA) {
        throw new RuleEngineError(`Criterion ${criterion.code} returned N/A but allowNA=false`);
      }
      if (outcome.score !== null) {
        throw new RuleEngineError(`Criterion ${criterion.code} is N/A but score is not null`);
      }
    } else {
      if (outcome.score === null) {
        throw new RuleEngineError(`Criterion ${criterion.code} is not N/A but score is null`);
      }
      if (outcome.score < 0 || outcome.score > criterion.maxScore) {
        throw new RuleEngineError(
          `Criterion ${criterion.code} score ${outcome.score} out of range 0..${criterion.maxScore}`,
        );
      }
    }

    return {
      ...outcome,
      criterionId: criterion.id,
      criterionCode: criterion.code,
      criterionName: criterion.name,
      criterionMaxScore: criterion.maxScore,
    };
  });

  const scored = items.filter((i) => !i.isNA);

  const totalScore = scored.reduce((sum, i) => sum + (i.score ?? 0), 0);
  // maxScore รวมเฉพาะข้อที่ไม่ใช่ N/A (สเปกข้อ 7)
  const maxScore = scored.reduce((sum, i) => sum + i.criterionMaxScore, 0);

  const percentage =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : null;

  return { items, totalScore, maxScore, percentage };
}
