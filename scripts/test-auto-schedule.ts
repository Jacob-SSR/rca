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
  sample,
  settingsSchema,
  shiftDate,
  targetDateFor,
} from "@/lib/auto-audit/schedule";
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

console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
process.exit(failed === 0 ? 0 : 1);
