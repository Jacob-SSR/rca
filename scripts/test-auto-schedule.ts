// scripts/test-auto-schedule.ts
// เทสต์ตัวตั้งเวลาตรวจอัตโนมัติ + การแยกคำค้น HN / เลขบัตร / ชื่อ
//   npm run test:schedule

import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  bangkokParts,
  isDue,
  nextRun,
  parseWeekdays,
  matchesFilters,
  icdMatches,
  parseIcdList,
  passesDepartmentIcd,
  planVisits,
  ICD_STRATA,
  allocateStrata,
  stratifiedSample,
  stratumOf,
  strataSummary,
  pruneRules,
  quotasOf,
  runFiltersSchema,
  runTarget,
  sample,
  settingsSchema,
  shiftDate,
  targetDateFor,
  visitLimitOf,
  GUIDELINE_VISITS,
  guidelineSampleSize,
} from "@/lib/auto-audit/schedule";
import { caseNumberBase } from "@/lib/form/case-number";
import { classifySearch, isValidThaiCid, maskCid, parsePatientQuery } from "@/lib/hosxp/search-query";

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

/** เวลาไทย → Date (UTC+7) */
const bkk = (s: string) => new Date(`${s}:00+07:00`);

/** สร้างเลขบัตรที่ check digit ถูก */
function makeCid(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return first12 + String((11 - (sum % 11)) % 10);
}

const on = { ...DEFAULT_SETTINGS, enabled: true };

console.log("\n── ตัวตั้งเวลา ──");

test("เวลาไทยถูกต้องไม่ว่าเครื่องตั้ง TZ อะไร", () => {
  // 2026-10-06 05:00 UTC = 12:00 ที่ไทย วันอังคาร
  assert.deepEqual(bangkokParts(new Date("2026-10-06T05:00:00Z")), {
    date: "2026-10-06",
    time: "12:00",
    weekday: 2,
  });
});

test("ก่อนเที่ยงยังไม่รัน เที่ยงตรง/หลังเที่ยงรัน", () => {
  assert.equal(isDue(on, bkk("2026-10-06T11:59")).due, false);
  assert.equal(isDue(on, bkk("2026-10-06T12:00")).due, true);
  assert.equal(isDue(on, bkk("2026-10-06T15:30")).due, true);
});

test("ปิดอยู่ไม่รัน / วันที่ไม่ได้เลือกไม่รัน", () => {
  assert.equal(isDue(DEFAULT_SETTINGS, bkk("2026-10-06T12:00")).due, false);
  // 2026-10-10 เป็นวันเสาร์ — เลือกแค่ จ-ศ
  assert.equal(isDue({ ...on, weekdays: [1, 2, 3, 4, 5] }, bkk("2026-10-10T12:30")).due, false);
});

test("เมื่อวาน = วันก่อนหน้า ข้ามเดือน/ปีได้", () => {
  assert.equal(targetDateFor("2026-10-06", "yesterday"), "2026-10-05");
  assert.equal(targetDateFor("2026-10-06", "today"), "2026-10-06");
  assert.equal(shiftDate("2027-01-01", -1), "2026-12-31");
  assert.equal(shiftDate("2028-03-01", -1), "2028-02-29");
});

test("รอบถัดไป: วันนี้รันแล้ว → ไปวันถัดไปที่เลือก", () => {
  assert.equal(nextRun(on, bkk("2026-10-06T09:00"), false), "2026-10-06 12:00");
  assert.equal(nextRun(on, bkk("2026-10-06T13:00"), true), "2026-10-07 12:00");
  // ศุกร์บ่ายรันแล้ว เลือก จ-ศ → จันทร์หน้า
  assert.equal(nextRun({ ...on, weekdays: [1, 2, 3, 4, 5] }, bkk("2026-10-09T13:00"), true), "2026-10-12 12:00");
  assert.equal(nextRun(DEFAULT_SETTINGS, bkk("2026-10-06T09:00"), false), null);
});

test("ค่าตั้งค่า: วันว่าง/เวลาผิด/จำนวนเกิน ไม่ผ่าน", () => {
  assert.equal(settingsSchema.safeParse({ ...on, weekdays: [] }).success, false);
  assert.equal(settingsSchema.safeParse({ ...on, runTime: "25:00" }).success, false);
  assert.equal(settingsSchema.safeParse({ ...on, maxVisits: 5000 }).success, false);
  assert.equal(settingsSchema.safeParse(on).success, true);
  assert.deepEqual(parseWeekdays("5,1,1,9,x"), [1, 5]);
});

test("สุ่มตัวอย่างไม่เกินจำนวนและไม่ซ้ำ", () => {
  const s = sample([1, 2, 3, 4, 5], 3);
  assert.equal(s.length, 3);
  assert.equal(new Set(s).size, 3);
  assert.equal(sample([1, 2], 10).length, 2);
});

console.log("\n── ค้นหา HN / เลขบัตร / ชื่อ ──");

test("แยกชนิดคำค้น", () => {
  const cid = makeCid("110170020345");
  assert.equal(classifySearch(""), "empty");
  assert.equal(classifySearch("000012345"), "hn");
  assert.equal(classifySearch(cid), "cid");
  assert.equal(classifySearch(`${cid.slice(0, 1)}-${cid.slice(1, 5)}-${cid.slice(5, 10)}-${cid.slice(10, 12)}-${cid[12]}`), "cid");
  assert.equal(classifySearch("สมชาย ใจดี"), "name");
});

test("เลขบัตร check digit ผิดถูกปฏิเสธ", () => {
  const cid = makeCid("110170020345");
  assert.equal(isValidThaiCid(cid), true);
  const bad = cid.slice(0, 12) + String((Number(cid[12]) + 1) % 10);
  assert.equal(parsePatientQuery(bad).kind, "invalid");
  assert.equal(maskCid(cid), `1-xxxx-xxxxx-${cid.slice(10, 12)}-${cid[12]}`);
});

test("ชื่อ: ตัดคำนำหน้า แยกชื่อ/นามสกุล กันอักขระ wildcard", () => {
  assert.deepEqual(parsePatientQuery("นายสมชาย  ใจดี"), { kind: "name", first: "สมชาย", last: "ใจดี" });
  assert.deepEqual(parsePatientQuery("ใจดี"), { kind: "name", first: "ใจดี", last: null });
  assert.equal(parsePatientQuery("ก").kind, "invalid");
  assert.equal(parsePatientQuery("สม%").kind, "invalid");
});

// ── เลือก visit ที่ต้องตรวจ (ทุกราย / สุ่ม / ตรวจซ้ำรายที่ค้าง) ──────────────
const visits = ["v1", "v2", "v3", "v4", "v5"].map((vn) => ({ vn, hn: `hn-${vn}` }));
const form = (id: string, vn: string, byAutoAudit: boolean, completed: boolean) => ({
  id,
  hosxpVisitRef: vn,
  byAutoAudit,
  completed,
});

test("maxVisits 0 = ทุกราย (limit null), ตัวเลข = สุ่มเท่านั้น", () => {
  assert.equal(visitLimitOf(0), null);
  assert.equal(visitLimitOf(20), 20);
  assert.equal(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxVisits: 0 }).success, true);
  assert.equal(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxVisits: -2 }).success, false);
});

test("ทุกราย: ตรวจครบตามลำดับ ข้ามรายที่ตรวจเสร็จแล้ว", () => {
  const p = planVisits(visits, [form("f2", "v2", true, true)], null);
  assert.deepEqual(p.todo.map((v) => v.vn), ["v1", "v3", "v4", "v5"]);
  assert.equal(p.skipped, 1);
});

test("รายที่รอบอัตโนมัติตรวจไม่สำเร็จ (เช่นโควตาหมด) ถูกตรวจซ้ำด้วยฟอร์มเดิม", () => {
  const p = planVisits(visits, [form("f3", "v3", true, false)], null);
  assert.equal(p.todo.find((v) => v.vn === "v3")?.reuseFormId, "f3");
  assert.equal(p.skipped, 0);
});

test("ฟอร์มที่คนกรอกเองแต่ยังไม่ตรวจ ไม่ไปแย่ง — ข้าม", () => {
  const p = planVisits(visits, [form("f4", "v4", false, false)], null);
  assert.equal(p.todo.some((v) => v.vn === "v4"), false);
  assert.equal(p.skipped, 1);
});

test("โหมดสุ่ม: ได้ไม่เกิน limit และไม่มีรายที่ตรวจเสร็จแล้ว", () => {
  const p = planVisits(visits, [form("f1", "v1", false, true)], 2, {}, () => 0.3);
  assert.equal(p.todo.length, 2);
  assert.equal(p.todo.some((v) => v.vn === "v1"), false);
});

// ── ไม่ตรวจคนเดิมซ้ำในวันเดียวกัน ─────────────────────────────────────────────
test("คนเดียวกัน (HN เดียว) มาหลาย visit ในวันเดียว → ตรวจ visit เดียว", () => {
  const vs = [
    { vn: "a1", hn: "111" },
    { vn: "a2", hn: "111" },
    { vn: "b1", hn: "222" },
  ];
  const p = planVisits(vs, [], null);
  assert.equal(p.todo.length, 2);
  assert.equal(p.todo.filter((v) => v.hn === "111").length, 1);
  assert.equal(p.skipped, 1);
});

test("visit อื่นของคนนี้ในวันเดียวกันตรวจไปแล้ว (แม้อยู่นอกตัวกรอง) → ข้ามทั้งคน", () => {
  const day = [
    { vn: "a1", hn: "111" },
    { vn: "a2", hn: "111" },
    { vn: "b1", hn: "222" },
  ];
  // รอบนี้กรองเหลือ a2 กับ b1 แต่ a1 (คนเดิม) ตรวจเสร็จไปแล้วในรอบก่อน
  const p = planVisits([day[1], day[2]], [form("fa1", "a1", true, true)], null, { sameDay: day });
  assert.deepEqual(p.todo.map((v) => v.vn), ["b1"]);
});

test("คนเดิมมีฟอร์มค้างของรอบก่อน → ใช้ visit นั้นตรวจซ้ำ ไม่สร้างเคสใหม่จาก visit อื่น", () => {
  const vs = [
    { vn: "a1", hn: "111" },
    { vn: "a2", hn: "111" },
  ];
  const p = planVisits(vs, [form("fa2", "a2", true, false)], null, {}, () => 0);
  assert.deepEqual(p.todo.map((v) => [v.vn, v.reuseFormId]), [["a2", "fa2"]]);
});

test("ชื่อซ้ำแต่ HN ต่างกัน = คนละคน ตรวจทั้งคู่ · ไม่มี HN ถือเป็นคนละคน", () => {
  const vs = [
    { vn: "x1", hn: "111" },
    { vn: "x2", hn: "333" },
    { vn: "x3", hn: "" },
    { vn: "x4", hn: "" },
  ];
  assert.equal(planVisits(vs, [], null).todo.length, 4);
});

// ── จำนวนต่อรอบแยกแผนก ──────────────────────────────────────────────────────
test("แผนกที่เซ็ตจำนวนไว้ สุ่มแยกแผนก · แผนกอื่นใช้จำนวนรวม", () => {
  const vs = [
    ...Array.from({ length: 6 }, (_, i) => ({ vn: `m${i}`, hn: `m${i}`, depcode: "010" })),
    ...Array.from({ length: 6 }, (_, i) => ({ vn: `s${i}`, hn: `s${i}`, depcode: "020" })),
    ...Array.from({ length: 6 }, (_, i) => ({ vn: `o${i}`, hn: `o${i}`, depcode: "030" })),
  ];
  const p = planVisits(vs, [], 2, { quotas: { "010": 3, "020": 1 } });
  assert.equal(p.todo.filter((v) => v.depcode === "010").length, 3);
  assert.equal(p.todo.filter((v) => v.depcode === "020").length, 1);
  assert.equal(p.todo.filter((v) => v.depcode === "030").length, 2);
  // quota 0 (รอบ resume ที่แผนกนั้นครบแล้ว) = ไม่ตรวจเพิ่ม ไม่ไหลไปใช้จำนวนรวม
  const q = planVisits(vs, [], null, { quotas: { "010": 0 } });
  assert.equal(q.todo.filter((v) => v.depcode === "010").length, 0);
  assert.equal(q.todo.length, 12);
});

test("เป้าของรอบ = ผลรวมต่อแผนก (+ จำนวนรวม ถ้ายังมีแผนกที่ไม่ได้เซ็ต)", () => {
  assert.equal(runTarget({ departments: ["010", "020"], quotas: { "010": 3, "020": 2 } }, 20), 5);
  assert.equal(runTarget({ departments: ["010", "020"], quotas: { "010": 3 } }, 20), 23);
  assert.equal(runTarget({ departments: [], quotas: {} }, null), null);
  assert.equal(runTarget({ departments: ["010"], quotas: { "010": 3 } }, null), 3);
});

test("ตั้งค่าแยกรายแผนก: ตัดแผนกที่ไม่ได้เลือก/ไม่มีค่าออก · รหัส ICD ผิด = บันทึกไม่ได้", () => {
  const ok = settingsSchema.parse({
    ...DEFAULT_SETTINGS,
    departments: ["010"],
    departmentRules: {
      "010": { quota: 5, icd10: ["e11.9", "I10-I15"] },
      "020": { quota: 3, icd10: [] },
    },
  });
  assert.deepEqual(ok.departmentRules, { "010": { quota: 5, icd10: ["E119", "I10-I15"] } });
  assert.deepEqual(quotasOf(ok.departmentRules), { "010": 5 });
  assert.equal(
    settingsSchema.safeParse({ ...DEFAULT_SETTINGS, departments: ["010"], departmentRules: { "010": { quota: null, icd10: ["ไข้"] } } }).success,
    false,
  );
  assert.deepEqual(pruneRules(["010"], { "010": { quota: null, icd10: [] } }), {});
});

// ── ICD-10 ──────────────────────────────────────────────────────────────────
test("ICD-10: รหัสเต็ม / ขึ้นต้นด้วย / ช่วง · ใส่จุดหรือไม่ใส่ก็ได้", () => {
  assert.deepEqual(parseIcdList("J02.9, e11 I10 - I15, ไข้, J02.9"), {
    patterns: ["J029", "E11", "I10-I15"],
    invalid: ["ไข้"],
  });
  assert.equal(icdMatches("E119", "E11"), true);
  assert.equal(icdMatches("E10.9", "E11"), false);
  assert.equal(icdMatches("I109", "I10-I15"), true);
  assert.equal(icdMatches("I159", "I10-I15"), true);
  assert.equal(icdMatches("I160", "I10-I15"), false);
  assert.equal(icdMatches("J029", "J029"), true);
  assert.equal(icdMatches("J02", "J029"), false);
});

test("ICD-10 ของแต่ละแผนก: แผนกที่เซ็ตไว้ต้องมีรหัส · แผนกที่ไม่ได้เซ็ต ผ่านหมด", () => {
  const rules = { "010": { quota: null, icd10: ["E11", "I10"] } };
  assert.equal(passesDepartmentIcd({ depcode: "010" }, ["J029", "E119"], rules), true);
  assert.equal(passesDepartmentIcd({ depcode: "010" }, ["J029"], rules), false);
  assert.equal(passesDepartmentIcd({ depcode: "010" }, [], rules), false);
  assert.equal(passesDepartmentIcd({ depcode: "020" }, [], rules), true);
});

// ── ตัวกรองแผนก / เวร / ช่วงเวลา ─────────────────────────────────────────────
const f = (x: Record<string, unknown>) => runFiltersSchema.parse(x);

test("แผนก: ว่าง = ทุกแผนก, เลือกแล้วผ่านเฉพาะแผนกนั้น", () => {
  assert.equal(matchesFilters({ depcode: "010", time: "09:00" }, f({})), true);
  assert.equal(matchesFilters({ depcode: "010", time: "09:00" }, f({ departments: ["010", "020"] })), true);
  assert.equal(matchesFilters({ depcode: "030", time: "09:00" }, f({ departments: ["010"] })), false);
});

test("เวรเช้า 08:00–16:00 / บ่าย 16:00–24:00 / ดึก 00:00–08:00 (เริ่มรวม สิ้นสุดไม่รวม)", () => {
  assert.equal(matchesFilters({ time: "08:00" }, f({ shift: "morning" })), true);
  assert.equal(matchesFilters({ time: "15:59" }, f({ shift: "morning" })), true);
  assert.equal(matchesFilters({ time: "16:00" }, f({ shift: "morning" })), false);
  assert.equal(matchesFilters({ time: "23:59" }, f({ shift: "afternoon" })), true);
  assert.equal(matchesFilters({ time: "02:30" }, f({ shift: "night" })), true);
  assert.equal(matchesFilters({ time: "08:00" }, f({ shift: "night" })), false);
});

test("กำหนดเวลาเอง รวมช่วงข้ามเที่ยงคืน และ visit ไม่มีเวลา ไม่ผ่าน", () => {
  assert.equal(matchesFilters({ time: "10:30" }, f({ timeFrom: "10:00", timeTo: "12:00" })), true);
  assert.equal(matchesFilters({ time: "23:00" }, f({ timeFrom: "20:00", timeTo: "02:00" })), true);
  assert.equal(matchesFilters({ time: "03:00" }, f({ timeFrom: "20:00", timeTo: "02:00" })), false);
  assert.equal(matchesFilters({ time: "" }, f({ timeFrom: "10:00", timeTo: "12:00" })), false);
  assert.equal(runFiltersSchema.safeParse({ timeFrom: "10:00" }).success, false);
});

test("เลขที่เคส = HN-วันที่มา (พ.ศ.) · ไม่มี HN = null (ใช้เลขแบบเดิม)", () => {
  assert.equal(caseNumberBase("690000258", "2026-05-06"), "690000258-25690506");
  assert.equal(caseNumberBase(" 690000258 ", null, new Date("2026-10-07T03:00:00Z")), "690000258-25691007");
  assert.equal(caseNumberBase("", "2026-05-06"), null);
  assert.equal(caseNumberBase("69/123", "2026-05-06"), null);
});

console.log("\n── Stratified Random Sampling ตามรหัสโรคหลัก ──");

const plenty = Object.fromEntries(ICD_STRATA.map((s) => [s.key, 1000])) as Parameters<typeof allocateStrata>[0];
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

test("สัดส่วนรวมเป็นร้อยละ 100", () => {
  assert.equal(ICD_STRATA.reduce((a, s) => a + s.percent, 0), 100);
});

test("จัดชั้นด้วยรหัสโรคหลัก — A,B / D50-D89 / ตัวอักษร / อื่นๆ", () => {
  assert.equal(stratumOf("A09"), "AB");
  assert.equal(stratumOf("B35.4"), "AB");
  assert.equal(stratumOf("D509"), "D50-D89");
  assert.equal(stratumOf("D899"), "D50-D89");
  assert.equal(stratumOf("D48"), "OTHER"); // D ที่ไม่อยู่ในช่วง
  assert.equal(stratumOf("D90"), "OTHER");
  assert.equal(stratumOf("e119"), "E");
  assert.equal(stratumOf("J029"), "J");
  assert.equal(stratumOf("Z000"), "Z");
  assert.equal(stratumOf("H10"), "OTHER");
  assert.equal(stratumOf(null), "OTHER");
  assert.equal(stratumOf(""), "OTHER");
});

test("100 ราย มีครบทุกชั้น → ได้ตามสัดส่วนพอดี", () => {
  const r = allocateStrata(plenty, 100);
  assert.deepEqual(
    r,
    Object.fromEntries(ICD_STRATA.map((s) => [s.key, s.percent])),
  );
});

test("จำนวนที่ไม่ลงตัว → ปัดเศษแล้วรวมได้เท่าที่ขอพอดี", () => {
  for (const n of [1, 7, 20, 40, 63]) assert.equal(sum(allocateStrata(plenty, n)), n);
  const r = allocateStrata(plenty, 40);
  assert.equal(r.Z, 8);
  assert.equal(r.OTHER, 8);
  assert.equal(r.AB, 3); // 3.2
  assert.equal(r.E, 2); // 1.6
});

test("ชั้นที่มีไม่พอ → เกลี่ยส่วนที่ขาดไปชั้นอื่น ไม่เกินที่มี", () => {
  const avail = { ...plenty, Z: 2, O: 0 };
  const r = allocateStrata(avail, 50);
  assert.equal(sum(r), 50);
  assert.equal(r.Z, 2);
  assert.equal(r.O, 0);
  for (const s of ICD_STRATA) assert.ok(r[s.key] <= avail[s.key]);
});

test("ขอมากกว่าที่มีทั้งหมด → ได้ทุกราย", () => {
  const avail = Object.fromEntries(ICD_STRATA.map((s) => [s.key, 1])) as typeof plenty;
  assert.equal(sum(allocateStrata(avail, 50)), ICD_STRATA.length);
  assert.equal(sum(allocateStrata(avail, 0)), 0);
});

test("planVisits โหมดสุ่ม ใช้ stratum → แต่ละชั้นได้ตามสัดส่วน", () => {
  const codes = ["A09", "J029", "Z000", "H10", "E119"];
  const vs = Array.from({ length: 500 }, (_, i) => ({ vn: `s${i}`, hn: `h${i}`, icd: codes[i % codes.length] }));
  const p = planVisits(vs, [], 20, { stratum: (v) => stratumOf(v.icd) });
  assert.equal(p.todo.length, 20);
  const n = (k: string) => p.todo.filter((v) => stratumOf(v.icd) === k).length;
  // มีแค่ 5 ชั้น: AB 8 · E 4 · J 4 · Z 20 · OTHER 20 (รวม 56) → 20 ราย = 2.86/1.43/1.43/7.14/7.14
  // เศษ 2 รายให้ AB (.86) แล้ว E (.43 เท่ากับ J แต่อยู่ก่อนในตาราง)
  assert.deepEqual([n("AB"), n("E"), n("J"), n("Z"), n("OTHER")], [3, 2, 1, 7, 7]);
});

test("stratifiedSample ไม่สุ่มซ้ำ และสุ่มจากชั้นของตัวเอง", () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: i, icd: i < 10 ? "Z00" : "J06" }));
  const got = stratifiedSample(items, 10, (x) => stratumOf(x.icd));
  assert.equal(new Set(got.map((x) => x.id)).size, 10);
  // มีแค่ Z (20) กับ J (4) → Z 8.33 · J 1.67 → ปัดเศษได้ Z 8 · J 2
  assert.equal(got.filter((x) => x.icd === "Z00").length, 8);
  assert.equal(got.filter((x) => x.icd === "J06").length, 2);
});

test("สรุปการแบ่งชั้น: เป้าตามสัดส่วนของจำนวนที่สุ่ม · มีจริง · สุ่มได้", () => {
  const pool = [...Array(10)].map((_, i) => ({ icd: i < 1 ? "A09" : i < 4 ? "J06" : "Z00" }));
  const picked = pool.slice(0, 5); // A 1 · J 3 · Z 1
  const rows = strataSummary(pool, picked, (x) => stratumOf(x.icd));
  const row = (k: string) => rows.find((r) => r.key === k)!;
  assert.equal(rows.length, 12);
  assert.deepEqual(row("AB"), { key: "AB", label: "A,B", percent: 8, target: 0.4, available: 1, picked: 1 });
  assert.equal(row("J").picked, 3);
  assert.equal(row("Z").available, 6);
  assert.equal(row("Z").target, 1);
});

console.log("\n── จำนวนตัวอย่างตามแนวทาง (5% ไม่ต่ำกว่า 40) ──");

test("maxVisits -1 = ตามแนวทาง และเป็นค่าตั้งต้น", () => {
  assert.equal(visitLimitOf(GUIDELINE_VISITS), "guideline");
  assert.equal(DEFAULT_SETTINGS.maxVisits, GUIDELINE_VISITS);
  assert.equal(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxVisits: GUIDELINE_VISITS }).success, true);
});

test("ร้อยละ 5 ปัดขึ้น ไม่ต่ำกว่า 40 ไม่เกินจำนวนผู้ป่วย", () => {
  assert.equal(guidelineSampleSize(300), 40); // 15 → ขั้นต่ำ 40
  assert.equal(guidelineSampleSize(800), 40);
  assert.equal(guidelineSampleSize(801), 41); // 40.05 → 41
  assert.equal(guidelineSampleSize(1200), 60);
  assert.equal(guidelineSampleSize(25), 25); // มีไม่ถึง 40 → ทุกคน
  assert.equal(guidelineSampleSize(20), 20);
  assert.equal(guidelineSampleSize(0), 0);
});

console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
process.exit(failed === 0 ? 0 : 1);
