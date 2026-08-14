// scripts/test-rule-engine.ts
// ทดสอบ Rule Engine ด้วย mock facts — ไม่ต้องมี DB และไม่เรียก AI (สเปกข้อ 10.6-10.7)
//   npm run test:rules

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runRuleEngine } from "@/lib/review/rule-engine";
import { criteriaFileSchema } from "@/lib/criteria/schema";
import type { CriterionInput, ExtractedFacts } from "@/lib/review/types";

// ── โหลดเกณฑ์จาก JSON ตัวจริง (ไม่ hardcode) ─────────────────────────────────
const file = criteriaFileSchema.parse(
  JSON.parse(readFileSync(path.join(process.cwd(), "data/criteria/opd-a1.json"), "utf8")),
);

const CRITERIA: CriterionInput[] = file.criteria.map((c) => ({
  id: `test-${c.code}`,
  code: c.code,
  name: c.name,
  maxScore: c.maxScore,
  allowNA: c.allowNA,
}));

const SET_CODE = "A1_OPD_2015";

// ── mock facts ────────────────────────────────────────────────────────────────
function perfectFacts(): ExtractedFacts {
  return {
    serviceDateTime: { hasDate: true, hasTime: true, evidence: "14 ส.ค. 2569 เวลา 09:15 น." },
    chiefComplaint: {
      text: "ไข้ ไอ เจ็บคอ 2 วัน",
      hasSymptom: true,
      hasDuration: true,
      evidence: "CC: ไข้ ไอ เจ็บคอ 2 วัน",
    },
    history: {
      presentIllness: true,
      pastHistory: true,
      personalHistory: true,
      riskFactors: true,
      evidence: "PI: ไข้สูง 2 วัน ไอมีเสมหะ / PH: DM type 2 / SH: สูบบุหรี่วันละ 5 มวน",
    },
    physicalExam: {
      systemsCount: 4,
      labResultExists: true,
      labWasOrdered: true,
      evidence: "V/S T 38.5 BP 120/80, HEENT: pharyngeal injection, Lungs: clear, CBC WBC 11,200",
    },
    diagnosis: {
      isNA: false,
      diagnoses: [
        {
          text: "Acute pharyngitis",
          complete: true,
          locationSpecified: true,
          isAbbreviation: false,
        },
      ],
      evidence: "Dx: Acute pharyngitis",
    },
    treatment: {
      isNA: false,
      hasDetail: "full",
      evidence: "Amoxicillin 500 mg cap 1x3 pc x 7 days, Paracetamol 500 mg tab 1 prn q6h",
    },
    timeline: [{ eventTime: "2026-08-14T09:15:00+07:00", title: "ผู้ป่วยมาถึงจุดคัดกรอง" }],
  };
}

function emptyFacts(): ExtractedFacts {
  return {
    serviceDateTime: { hasDate: false, hasTime: false, evidence: "" },
    chiefComplaint: { text: "", hasSymptom: false, hasDuration: false, evidence: "" },
    history: {
      presentIllness: false,
      pastHistory: false,
      personalHistory: false,
      riskFactors: false,
      evidence: "",
    },
    physicalExam: { systemsCount: 0, labResultExists: false, labWasOrdered: false, evidence: "" },
    diagnosis: { isNA: false, diagnoses: [], evidence: "" },
    treatment: { isNA: false, hasDetail: "none", evidence: "" },
    timeline: [],
  };
}

function scoreOf(result: ReturnType<typeof runRuleEngine>, code: string) {
  const item = result.items.find((i) => i.criterionCode === code);
  assert.ok(item, `missing item ${code}`);
  return item;
}

// ── test runner จิ๋ว ──────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("\n── criteria.json ──");

test("มี 6 เกณฑ์ และ maxScore รวม = 17", () => {
  assert.equal(CRITERIA.length, 6);
  assert.equal(
    CRITERIA.reduce((s, c) => s + c.maxScore, 0),
    17,
  );
});

test("DIAGNOSIS และ TREATMENT เท่านั้นที่ allowNA", () => {
  const naCodes = CRITERIA.filter((c) => c.allowNA).map((c) => c.code).sort();
  assert.deepEqual(naCodes, ["DIAGNOSIS", "TREATMENT"]);
});

console.log("\n── เคสคะแนนเต็ม / คะแนนศูนย์ ──");

test("เอกสารสมบูรณ์ → 17/17 = 100%", () => {
  const r = runRuleEngine(perfectFacts(), CRITERIA, SET_CODE);
  assert.equal(r.totalScore, 17);
  assert.equal(r.maxScore, 17);
  assert.equal(r.percentage, 100);
});

test("เอกสารว่างเปล่า → 0/17 = 0%", () => {
  const r = runRuleEngine(emptyFacts(), CRITERIA, SET_CODE);
  assert.equal(r.totalScore, 0);
  assert.equal(r.maxScore, 17);
  assert.equal(r.percentage, 0);
});

console.log("\n── N/A (สเปกข้อ 10.6) ──");

test("DIAGNOSIS เป็น N/A → maxScore ลดจาก 17 เหลือ 13", () => {
  const f = perfectFacts();
  f.diagnosis = { isNA: true, diagnoses: [], evidence: "ไม่มีโรค — มารับวัคซีน" };
  const r = runRuleEngine(f, CRITERIA, SET_CODE);
  assert.equal(scoreOf(r, "DIAGNOSIS").isNA, true);
  assert.equal(scoreOf(r, "DIAGNOSIS").score, null);
  assert.equal(r.maxScore, 13);
  assert.equal(r.totalScore, 13);
  assert.equal(r.percentage, 100);
});

test("DIAGNOSIS + TREATMENT เป็น N/A → maxScore เหลือ 10", () => {
  const f = perfectFacts();
  f.diagnosis = { isNA: true, diagnoses: [], evidence: "ไม่มีโรค" };
  f.treatment = { isNA: true, hasDetail: "none", evidence: "ไม่มีการรักษา" };
  const r = runRuleEngine(f, CRITERIA, SET_CODE);
  assert.equal(r.maxScore, 10);
  assert.equal(r.totalScore, 10);
});

test("isNA ของเกณฑ์ที่ allowNA=false ถูกเมิน (ไม่มีทางเกิด เพราะ rule ไม่คืน NA)", () => {
  const f = perfectFacts();
  const r = runRuleEngine(f, CRITERIA, SET_CODE);
  for (const item of r.items) {
    if (!CRITERIA.find((c) => c.code === item.criterionCode)!.allowNA) {
      assert.equal(item.isNA, false, `${item.criterionCode} ไม่ควรเป็น N/A`);
    }
  }
});

console.log("\n── SERVICE_DATETIME ──");

test("มีวันอย่างเดียว → 1", () => {
  const f = perfectFacts();
  f.serviceDateTime = { hasDate: true, hasTime: false, evidence: "14 ส.ค. 2569" };
  assert.equal(scoreOf(runRuleEngine(f, CRITERIA, SET_CODE), "SERVICE_DATETIME").score, 1);
});

test("ไม่มีทั้งวันและเวลา → 0", () => {
  const f = perfectFacts();
  f.serviceDateTime = { hasDate: false, hasTime: false, evidence: "" };
  assert.equal(scoreOf(runRuleEngine(f, CRITERIA, SET_CODE), "SERVICE_DATETIME").score, 0);
});

console.log("\n── CC ──");

test('"มาตามนัด" (ไม่มีความหมาย) → 1', () => {
  const f = perfectFacts();
  f.chiefComplaint = {
    text: "มาตามนัด",
    hasSymptom: false,
    hasDuration: false,
    evidence: "CC: มาตามนัด",
  };
  assert.equal(scoreOf(runRuleEngine(f, CRITERIA, SET_CODE), "CC").score, 1);
});

test("มีอาการแต่ไม่ระบุระยะเวลา → 1", () => {
  const f = perfectFacts();
  f.chiefComplaint = {
    text: "ปวดท้อง",
    hasSymptom: true,
    hasDuration: false,
    evidence: "CC: ปวดท้อง",
  };
  assert.equal(scoreOf(runRuleEngine(f, CRITERIA, SET_CODE), "CC").score, 1);
});

test("มีอาการ + ระยะเวลา → 2", () => {
  const f = perfectFacts();
  f.chiefComplaint = {
    text: "ปวดท้อง 2 วัน",
    hasSymptom: true,
    hasDuration: true,
    evidence: "CC: ปวดท้อง 2 วัน",
  };
  assert.equal(scoreOf(runRuleEngine(f, CRITERIA, SET_CODE), "CC").score, 2);
});

console.log("\n── HISTORY ──");

const historyCases: [string, Partial<ExtractedFacts["history"]>, number][] = [
  ["ไม่มีอะไรเลย → 0", {}, 0],
  ["ปัจจุบันอย่างเดียว → 1", { presentIllness: true }, 1],
  ["ปัจจุบัน + อดีต → 2", { presentIllness: true, pastHistory: true }, 2],
  [
    "ปัจจุบัน + อดีต + ปัจจัยเสี่ยง → 3",
    { presentIllness: true, pastHistory: true, riskFactors: true },
    3,
  ],
  ["มีอดีตแต่ไม่มีปัจจุบัน → 1 (ขาดฐาน)", { pastHistory: true, personalHistory: true }, 1],
];

for (const [name, patch, expected] of historyCases) {
  test(name, () => {
    const f = perfectFacts();
    f.history = {
      presentIllness: false,
      pastHistory: false,
      personalHistory: false,
      riskFactors: false,
      evidence: "mock",
      ...patch,
    };
    assert.equal(scoreOf(runRuleEngine(f, CRITERIA, SET_CODE), "HISTORY").score, expected);
  });
}

console.log("\n── PHYSICAL_EXAM ──");

const peCases: [string, ExtractedFacts["physicalExam"], number][] = [
  ["ไม่ตรวจเลย → 0", { systemsCount: 0, labResultExists: false, labWasOrdered: false, evidence: "" }, 0],
  ["1 ระบบ → 1", { systemsCount: 1, labResultExists: false, labWasOrdered: false, evidence: "m" }, 1],
  ["2 ระบบ → 2", { systemsCount: 2, labResultExists: false, labWasOrdered: false, evidence: "m" }, 2],
  [
    "3 ระบบ + สั่งแล็บแต่ไม่บันทึกผล → 3",
    { systemsCount: 3, labResultExists: false, labWasOrdered: true, evidence: "m" },
    3,
  ],
  [
    "3 ระบบ + มีผลแล็บ → 4",
    { systemsCount: 3, labResultExists: true, labWasOrdered: true, evidence: "m" },
    4,
  ],
  [
    "3 ระบบ + ไม่ได้ตรวจแล็บเลย → 4 (specialRule)",
    { systemsCount: 3, labResultExists: false, labWasOrdered: false, evidence: "m" },
    4,
  ],
];

for (const [name, pe, expected] of peCases) {
  test(name, () => {
    const f = perfectFacts();
    f.physicalExam = pe;
    assert.equal(scoreOf(runRuleEngine(f, CRITERIA, SET_CODE), "PHYSICAL_EXAM").score, expected);
  });
}

console.log("\n── DIAGNOSIS ──");

const dx = (patch: Partial<ExtractedFacts["diagnosis"]["diagnoses"][number]>) => ({
  text: "Acute pharyngitis",
  complete: true,
  locationSpecified: true,
  isAbbreviation: false,
  ...patch,
});

const dxCases: [string, ExtractedFacts["diagnosis"]["diagnoses"], number][] = [
  ["ไม่มีคำวินิจฉัย → 0", [], 0],
  ["บันทึกไม่ครบตามจำนวนโรค → 1", [dx({}), dx({ complete: false })], 1],
  ["ครบแต่ไม่ระบุตำแหน่ง → 2", [dx({ locationSpecified: false })], 2],
  ["ครบ+ละเอียด แต่เป็นคำย่อ → 3", [dx({ text: "URI", isAbbreviation: true })], 3],
  ["ครบทุกอย่าง → 4", [dx({})], 4],
];

for (const [name, list, expected] of dxCases) {
  test(name, () => {
    const f = perfectFacts();
    f.diagnosis = { isNA: false, diagnoses: list, evidence: "Dx: ..." };
    assert.equal(scoreOf(runRuleEngine(f, CRITERIA, SET_CODE), "DIAGNOSIS").score, expected);
  });
}

console.log("\n── TREATMENT ──");

for (const [detail, expected] of [
  ["none", 0],
  ["minimal", 1],
  ["partial", 2],
  ["full", 3],
] as const) {
  test(`hasDetail=${detail} → ${expected}`, () => {
    const f = perfectFacts();
    f.treatment = { isNA: false, hasDetail: detail, evidence: "Rx: ..." };
    assert.equal(scoreOf(runRuleEngine(f, CRITERIA, SET_CODE), "TREATMENT").score, expected);
  });
}

console.log("\n── invariants ──");

test("ทุก item มี reason และไม่มี score เกิน maxScore", () => {
  const r = runRuleEngine(perfectFacts(), CRITERIA, SET_CODE);
  for (const item of r.items) {
    assert.ok(item.reason.length > 0, `${item.criterionCode} ไม่มี reason`);
    if (!item.isNA) {
      assert.ok(item.score !== null && item.score <= item.criterionMaxScore);
    }
  }
});

test("ผลลัพธ์ deterministic — รันสองครั้งได้เท่ากัน", () => {
  const a = runRuleEngine(perfectFacts(), CRITERIA, SET_CODE);
  const b = runRuleEngine(perfectFacts(), CRITERIA, SET_CODE);
  assert.deepEqual(a, b);
});

test("criteria ว่าง → throw", () => {
  assert.throws(() => runRuleEngine(perfectFacts(), [], SET_CODE));
});

test("CriteriaSet code ที่ไม่รู้จัก → throw", () => {
  assert.throws(() => runRuleEngine(perfectFacts(), CRITERIA, "A3_IPD_2015"));
});

console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
process.exit(failed === 0 ? 0 : 1);
