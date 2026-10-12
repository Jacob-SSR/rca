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
  pruneRules,
  quotasOf,
  runFiltersSchema,
  runTarget,
  sample,
  settingsSchema,
  shiftDate,
  targetDateFor,
  visitLimitOf,
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
  assert.equal(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, maxVisits: -1 }).success, false);
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

console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
process.exit(failed === 0 ? 0 : 1);
