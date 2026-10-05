// lib/review/auto-audit.ts
// ตรวจอัตโนมัติ (OPD เท่านั้น) — ประเมินคะแนน Form A1 จากช่องในฟอร์มทันทีที่พิมพ์
//
// ⚠️ นี่คือ "ผลประเมินเบื้องต้น" ไม่ใช่ผลตรวจจริง
//    - ผลตรวจจริงยังมาจากปุ่ม "ตรวจด้วย AI" (AI สกัด fact → Rule Engine)
//    - ที่นี่สกัด fact ด้วยกติกาข้อความล้วน (regex) แทน AI ไม่ต้องรอ ไม่เสียโควตา
//      แล้วส่งเข้า Rule Engine ตัวเดียวกัน — คะแนนจึงตัดสินด้วยกติกาชุดเดียวกับของจริง
//      ต่างกันแค่ "ความแม่นของการอ่านข้อความ"
//
// pure function ล้วน ใช้ได้ทั้งฝั่ง client และ server ไม่แตะ DB/AI/env

import criteriaJson from "@/data/criteria/opd-a1.json";
import { runRuleEngine } from "@/lib/review/rule-engine";
import type {
  CriterionInput,
  DiagnosisFact,
  ExtractedFacts,
  RuleEngineResult,
  TreatmentDetailLevel,
} from "@/lib/review/types";

export const OPD_CRITERIA_SET = "A1_OPD_2015";

export const OPD_CRITERIA: CriterionInput[] = criteriaJson.criteria.map((c) => ({
  id: c.code,
  code: c.code,
  name: c.name,
  maxScore: c.maxScore,
  allowNA: c.allowNA,
}));

type Values = Record<string, string | null | undefined>;

const v = (values: Values, key: string) => (values[key] ?? "").trim();

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

// ── CC ───────────────────────────────────────────────────────────────────────

/** ระยะเวลา / รายละเอียดจำแนก เช่น "2 วัน", "เมื่อเช้า", "ครั้งที่ 2" */
const DURATION =
  /(\d+(\.\d+)?\s*(นาที|ชั่วโมง|ชม\.?|วัน|สัปดาห์|สัปดาห|อาทิตย์|wk|เดือน|ด\.|ปี|hr|hrs|hour|day|days|d\b|week|month|year|yr))|เมื่อวาน|เมื่อเช้า|เมื่อคืน|เช้านี้|คืนนี้|วันนี้|ครึ่งวัน|ครั้งที่\s*\d|เข็มที่\s*\d|PTA/i;

/** เหตุผลที่มาที่ "แยกรายละเอียดไม่ได้" — เกณฑ์ยกตัวอย่างไว้ตรงๆ */
const VAGUE_REASON =
  /^(มา)?(ตาม)?นัด$|^มาตามนัด|^รับยาเดิม|^มารับยาเดิม|^ยาเดิม|^f\/?u\.?$|^follow\s*up$|^refill|^same$|^rm$/i;

// ── PE ───────────────────────────────────────────────────────────────────────

/** ระบบร่างกาย — นับ "ระบบ" ไม่ใช่นับบรรทัด ตามเกณฑ์ PHYSICAL_EXAM */
const PE_SYSTEMS: [string, RegExp][] = [
  ["GA", /\bGA\b|general appearance|ลักษณะทั่วไป|รู้สึกตัวดี|alert|conscious/i],
  ["HEENT", /HEENT|ศีรษะ|\bhead\b|\beyes?\b|ตาขาว|เยื่อบุตา|\bears?\b|หู|\bnose|จมูก|throat|คอหอย|tonsil|pharyn|ทอนซิล|conjunctiva|sclera/i],
  ["Neck", /\bneck\b|ลำคอ|thyroid|lymph\s*node|ต่อมน้ำเหลือง/i],
  ["Chest/Lung", /\bchest\b|\blungs?\b|ทรวงอก|ปอด|breath sound|wheez|crepitation|rhonchi|clear\b/i],
  ["Heart", /\bheart\b|หัวใจ|\bCVS\b|murmur|S1\s*S2|regular rhythm/i],
  ["Abdomen", /\babd(omen)?\b|ช่องท้อง|ท้อง|soft\b|tender|bowel sound|liver|spleen/i],
  ["GU/PV/PR", /\bGU\b|\bPV\b|\bPR exam|per rectal|ทางเดินปัสสาวะ|นรีเวช|อวัยวะเพศ|genit/i],
  ["Extremities", /\bext(remit(y|ies))?\b|แขนขา|แขน|ขาบวม|edema|บวม|pulse(s)? full|capillary refill/i],
  ["Neuro", /neuro|ระบบประสาท|motor|sensory|reflex|\bGCS\b|pupil|grade\s*[0-5]/i],
  ["Skin", /\bskin\b|ผิวหนัง|rash|ผื่น|wound|แผล|lesion/i],
];

export function countExamSystems(text: string): number {
  if (text.trim() === "") return 0;
  const hit = PE_SYSTEMS.filter(([, re]) => re.test(text)).length;
  // เขียนเป็นข้อความอิสระที่ไม่มีคำบอกระบบ → อย่างน้อยถือว่าตรวจไป 1 ระบบ
  return Math.max(hit, 1);
}

// ── Lab ──────────────────────────────────────────────────────────────────────

const LAB_PENDING = /ยังไม่มีผล|รอผล|pending|ไม่ได้บันทึกผล/i;

// ── Diagnosis ────────────────────────────────────────────────────────────────

/** รหัส ICD ล้วน เช่น J00, E11.9, (J00) */
const ICD_ONLY = /^\(?[A-Z]\d{2}(\.?\d{1,2})?\)?$/i;

/** คำย่อโรคที่พบบ่อยในเวชระเบียน — ใช้เป็นคำวินิจฉัยไม่ได้ (ได้สูงสุด 3) */
const COMMON_ABBR = new Set([
  "URI", "DM", "HT", "DLP", "CKD", "AGE", "UTI", "COPD", "CHF", "MI", "CVA", "TB", "AF",
  "GERD", "BPH", "OA", "RA", "IHD", "CAD", "ARF", "AKI", "DHF", "PU", "ALD", "HIV", "OM",
  "AR", "URTI", "LRTI", "CAP", "ACS", "DVT", "PE", "SLE", "UGIB", "LGIB",
]);

/**
 * คำวินิจฉัยที่ "กำกวม" ขาดชนิด/ตำแหน่ง — ตามตัวอย่างในคู่มือ
 * เช่น "ไข้", "ปวดท้อง", "แผล" ที่ไม่บอกว่าที่ไหน/ชนิดไหน
 */
const VAGUE_DX =
  /^(fever|ไข้|ปวดท้อง|ปวดหัว|ปวดศีรษะ|เวียนหัว|ไอ|cough|แผล|wound|ผื่น|rash|ท้องเสีย|diarrh(o)?ea|pain|ปวด|อักเสบ|infection|ติดเชื้อ|มะเร็ง|cancer|tumor|ก้อน|fracture|กระดูกหัก|anemia|โลหิตจาง|เบาหวาน|ความดัน)$/i;

/** ตัดรหัส ICD ในวงเล็บท้ายบรรทัดออก ("Acute pharyngitis (J02.9)" → "Acute pharyngitis") */
function stripCode(line: string): string {
  return line.replace(/\s*\(([A-Z]\d{2}(\.?\d{1,2})?)\)\s*$/i, "").trim();
}

function isAbbreviation(text: string): boolean {
  const words = text.split(/[\s,/+]+/).filter(Boolean);
  return words.some((w) => COMMON_ABBR.has(w.replace(/[.()]/g, "").toUpperCase()));
}

export function diagnosisFacts(text: string): DiagnosisFact[] {
  return lines(text)
    .map((line) => line.replace(/^[-•*\d.)\s]+(?=\D)/, "").trim())
    .filter((line) => line !== "" && !ICD_ONLY.test(line))
    .map((line) => {
      const body = stripCode(line);
      const abbr = isAbbreviation(body);
      return {
        text: line,
        // ไม่รู้จำนวนโรคจริงของผู้ป่วยจากฟอร์มได้ — ถือว่าครบ ให้คนตรวจตัดสินเอง
        complete: true,
        locationSpecified: !VAGUE_DX.test(body),
        isAbbreviation: abbr,
      };
    });
}

// ── Treatment ────────────────────────────────────────────────────────────────

const NO_DETAIL = /^(rm|same|ให้ยาเดิม|ยาเดิม|รับยาเดิม|continue( med(ication)?s?)?|ตามเดิม|refill)$/i;
const DOSE = /\d+(\.\d+)?\s*(mg|g|mcg|µg|ml|mL|cc|unit|units|iu|%|มก\.?|มล\.?)/i;
const FORM = /\b(tab|tabs|cap|caps|syr|syrup|susp|inj|amp|vial|cream|oint|gel|drop|spray|sachet|supp)\b|เม็ด|แคปซูล|ยาน้ำ|ขวด|ซอง|หลอด|ครีม|ยาทา|ยาหยอด|ยาฉีด|ยาเหน็บ|ยาพ่น/i;
const USAGE =
  /รับประทาน|กิน|ครั้งละ|วันละ|ก่อนอาหาร|หลังอาหาร|ก่อนนอน|ทุก\s*\d|เมื่อมีอาการ|ทาบาง|ทาวันละ|หยอด|พ่น|อมใต้ลิ้น|ฉีด|\b(od|bid|tid|qid|hs|prn|stat|q\d+h|oral|po|iv|im|sc)\b/i;
const QTY = /จำนวน\s*\d|#\s*\d|x\s*\d|\d+\s*(เม็ด|แคปซูล|ขวด|ซอง|หลอด|tab|cap)/i;

function treatmentLevel(text: string): { isNA: boolean; level: TreatmentDetailLevel } {
  const items = lines(text);
  // ช่องว่าง ≠ "ไม่มีการรักษา" — ให้ 0 ไว้ก่อนเหมือนคำวินิจฉัย ให้เห็นว่ายังไม่ได้กรอก
  // (คนที่ไม่ได้รักษาจริงจะได้ N/A จากการตรวจด้วย AI ซึ่งอ่านบริบททั้งเอกสาร)
  if (items.length === 0) return { isNA: false, level: "none" };
  if (items.every((l) => NO_DETAIL.test(l))) return { isNA: false, level: "none" };

  // คะแนนของรายการที่แย่ที่สุดคือคะแนนของทั้งข้อ — เกณฑ์ต้องการ "ยาทุกขนาน"
  let worst = 4;
  for (const l of items) {
    if (NO_DETAIL.test(l)) {
      worst = 0;
      continue;
    }
    // หัตถการที่มีคำอธิบายพอสมควรถือว่าครบส่วนใหญ่ (ประเมินละเอียดกว่านี้จากข้อความไม่ได้)
    if (/^หัตถการ|procedure|ทำแผล|เย็บแผล|suture|I\s*&\s*D|incision/i.test(l)) {
      worst = Math.min(worst, l.length > 40 ? 3 : 2);
      continue;
    }
    const parts = [DOSE.test(l), FORM.test(l), USAGE.test(l), QTY.test(l)].filter(Boolean).length;
    worst = Math.min(worst, parts);
  }

  // ชื่อยาอย่างเดียว (0 องค์ประกอบ) ยังนับว่า "บันทึกแต่ขาดรายละเอียดส่วนใหญ่"
  const level: TreatmentDetailLevel = worst >= 4 ? "full" : worst >= 2 ? "partial" : "minimal";
  return { isNA: false, level };
}

// ── รวม ───────────────────────────────────────────────────────────────────────

export function factsFromForm(values: Values): ExtractedFacts {
  const date = v(values, "serviceDate");
  const time = v(values, "serviceTime");
  const cc = v(values, "chiefComplaint");
  const pi = v(values, "presentIllness");
  const ph = v(values, "pastHistory");
  const sh = v(values, "personalHistory");
  const vs = v(values, "vitalSigns");
  const pe = v(values, "physicalExam");
  const lab = v(values, "labResult");
  const dx = v(values, "diagnosis");
  const tx = v(values, "treatment");

  const ccFirst = lines(cc)[0] ?? "";
  const dxFacts = diagnosisFacts(dx);
  const tr = treatmentLevel(tx);

  return {
    serviceDateTime: {
      hasDate: date !== "",
      hasTime: time !== "",
      evidence: [date, time].filter(Boolean).join(" "),
    },
    chiefComplaint: {
      text: cc,
      hasSymptom: cc !== "" && !VAGUE_REASON.test(ccFirst),
      hasDuration: DURATION.test(cc),
      evidence: cc,
    },
    history: {
      presentIllness: pi !== "",
      pastHistory: ph !== "",
      personalHistory: sh !== "",
      riskFactors: false,
      evidence: [pi, ph, sh].filter(Boolean).join(" | "),
    },
    physicalExam: {
      systemsCount: countExamSystems(pe),
      labResultExists: lab !== "" && !LAB_PENDING.test(lab),
      labWasOrdered: lab !== "",
      evidence: [vs, pe].filter(Boolean).join(" | "),
    },
    diagnosis: {
      // ฟอร์มว่าง ≠ ผู้ป่วยไม่มีโรค — ปล่อยเป็น 0 ให้เห็นว่ายังไม่ได้กรอก
      isNA: false,
      diagnoses: dxFacts,
      evidence: dx,
    },
    treatment: {
      isNA: tr.isNA,
      hasDetail: tr.level,
      evidence: tx,
    },
    timeline: [],
  };
}

/** คำแนะนำสั้นๆ ว่าต้องเติมอะไรจึงได้คะแนนเต็ม — แสดงคู่กับเหตุผลของ Rule Engine */
export function improvementTip(code: string, score: number | null, max: number): string | null {
  if (score === null || score >= max) return null;
  switch (code) {
    case "SERVICE_DATETIME":
      return "ใส่วันที่หรือเวลาที่มารับบริการ";
    case "CC":
      return score === 0
        ? "บันทึกอาการสำคัญ"
        : "ระบุระยะเวลาของอาการ เช่น “2 วัน” หรือเหตุผลที่มาที่ชัดเจน เช่น “รับวัคซีน DTP เข็มที่ 2”";
    case "HISTORY":
      return score <= 1
        ? "เติมโรคประจำตัว/ประวัติอดีต และประวัติส่วนตัว/ปัจจัยเสี่ยง"
        : "เติมประวัติส่วนตัว/ปัจจัยเสี่ยง เช่น สูบบุหรี่ สุรา อาชีพ แพ้ยา";
    case "PHYSICAL_EXAM":
      return score <= 2
        ? "บันทึกตรวจร่างกายให้มากกว่าสองระบบ (บรรทัดละระบบ เช่น HEENT / Lung / Heart / Abdomen)"
        : "มีการส่งตรวจชันสูตรแต่ยังไม่มีผล — บันทึกผลแล็บ/เอกซเรย์";
    case "DIAGNOSIS":
      return score === 0
        ? "เขียนคำวินิจฉัยเป็นคำเต็ม (ห้ามใช้รหัส ICD อย่างเดียว)"
        : score === 2
          ? "ระบุชนิด/ตำแหน่งของโรคให้ชัด เช่น “ไข้” → “Acute pharyngitis”"
          : "เขียนคำย่อให้เป็นคำเต็ม เช่น DM → Type 2 diabetes mellitus";
    case "TREATMENT":
      return "ระบุยาให้ครบ: ชื่อยา ขนาด รูปแบบ วิธีใช้ จำนวน";
    default:
      return null;
  }
}

/** ประเมินคะแนน A1 จากค่าในฟอร์ม — ใช้แสดงผลทันทีบนหน้าจอ */
export function autoAuditOpd(values: Values): RuleEngineResult {
  return runRuleEngine(factsFromForm(values), OPD_CRITERIA, OPD_CRITERIA_SET);
}
