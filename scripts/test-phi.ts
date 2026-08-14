// scripts/test-phi.ts
// ทดสอบ PHI sanitizer — สองด้านพร้อมกัน:
//   1. PHI ต้องหายจริง
//   2. ข้อความคลินิกต้องไม่ถูกทำลาย (สเปกข้อ 2.3 — evidence ต้องเป็นข้อความจริง ไม่ใช่ [MASKED])
//   npm run test:phi

import assert from "node:assert/strict";
import { sanitizePHI, isUsableEvidence, MASK } from "@/lib/phi/sanitize";

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

console.log("\n── ต้องถูก mask ──");

const mustMask: [string, string, string][] = [
  ["ชื่อ-สกุล ที่มี label", "ชื่อ-สกุล: สมชาย ใจดี", "สมชาย"],
  ["คำนำหน้าชื่อไทย", "ผู้ป่วย นางสาว สมหญิง รักดี มาด้วยอาการไข้", "สมหญิง"],
  ["ชื่อแพทย์ผู้บันทึก", "ผู้บันทึก นพ.กฤชปภพ เรืองสุวรรณ", "กฤชปภพ"],
  ["HN", "HN: 0012345", "0012345"],
  ["VN", "VN 680814001", "680814001"],
  ["เลขบัตรประชาชน 13 หลัก", "เลขบัตรประชาชน 3-1234-56789-01-2", "1234"],
  ["เบอร์โทร", "โทร. 081-234-5678", "081"],
  ["ที่อยู่มี label", "ที่อยู่: 99/1 หมู่ 5 ต.ประโคนชัย อ.เมือง จ.บุรีรัมย์", "ประโคนชัย"],
  ["ที่อยู่ไม่มี label", "อาศัยอยู่ ต.หนองแวง อ.ลำปลายมาศ จ.บุรีรัมย์", "หนองแวง"],
];

for (const [name, input, leak] of mustMask) {
  test(name, () => {
    const { text } = sanitizePHI(input);
    assert.ok(!text.includes(leak), `ยังหลุด "${leak}" อยู่ใน: ${text}`);
  });
}

test("นับจำนวน mask ได้ถูกประเภท", () => {
  const { counts } = sanitizePHI("HN: 0012345\nโทร 081-234-5678\nชื่อผู้ป่วย: สมชาย ใจดี");
  assert.ok(counts.HN >= 1, "ควรนับ HN");
  assert.ok(counts.PHONE >= 1, "ควรนับ PHONE");
  assert.ok(counts.NAME >= 1, "ควรนับ NAME");
});

console.log("\n── ห้ามถูกทำลาย (ข้อมูลคลินิก) ──");

const mustKeep: [string, string, string[]][] = [
  ["อายุและเพศ", "ผู้ป่วยหญิง อายุ 45 ปี", ["อายุ 45 ปี", "หญิง"]],
  ["โรคประจำตัว", "PH: DM type 2, HT มา 10 ปี", ["DM type 2", "HT"]],
  ["อาการสำคัญ", "CC: ปวดท้อง 2 วัน", ["ปวดท้อง 2 วัน"]],
  ["คำวินิจฉัยคำย่อ", "Dx: URI", ["URI"]],
  ["สัญญาณชีพ", "V/S T 38.5 BP 120/80 P 88 RR 20", ["38.5", "120/80"]],
  ["ผลแล็บ", "CBC: WBC 11,200 Hb 12.5", ["11,200", "12.5"]],
  [
    "ชื่อยาและวิธีใช้",
    "Amoxicillin 500 mg cap 1x3 pc, Paracetamol 500 mg 1 prn q6h",
    ["Amoxicillin 500 mg", "1x3 pc", "Paracetamol"],
  ],
  ["ปัจจัยเสี่ยง", "สูบบุหรี่วันละ 5 มวน ดื่มสุราสัปดาห์ละ 2 ครั้ง", ["สูบบุหรี่", "ดื่มสุรา"]],
];

for (const [name, input, keeps] of mustKeep) {
  test(name, () => {
    const { text } = sanitizePHI(input);
    for (const k of keeps) {
      assert.ok(text.includes(k), `"${k}" หายไปจากผลลัพธ์: ${text}`);
    }
  });
}

console.log("\n── เอกสารรวม ──");

const SAMPLE = `แบบบันทึกการตรวจผู้ป่วยนอก โรงพยาบาลพลับพลาชัย
ชื่อ-สกุล: นายสมชาย ใจดี   HN: 0012345   VN: 680814001
เลขบัตรประชาชน 3-1234-56789-01-2
ที่อยู่: 99/1 หมู่ 5 ต.ประโคนชัย อ.ประโคนชัย จ.บุรีรัมย์  โทร. 081-234-5678
เพศ ชาย อายุ 52 ปี
วันที่มารับบริการ 14 สิงหาคม 2569 เวลา 09:15 น.
CC: ไข้ ไอ เจ็บคอ 2 วัน
PI: ไข้สูงลอย 2 วัน ไอมีเสมหะสีเหลือง
PH: DM type 2 มา 8 ปี, HT
SH: สูบบุหรี่วันละ 10 มวน
V/S: T 38.5 BP 130/85 P 96 RR 22
PE: HEENT pharyngeal injection, Lungs clear, Heart normal S1S2
Lab: CBC WBC 11,200
Dx: Acute pharyngitis
Rx: Amoxicillin 500 mg cap 1x3 pc x 7 days
ผู้บันทึก นพ.กฤชปภพ เรืองสุวรรณ`;

test("เอกสารตัวอย่าง: PHI หายครบ", () => {
  const { text } = sanitizePHI(SAMPLE);
  for (const leak of ["สมชาย", "0012345", "680814001", "081-234-5678", "99/1", "กฤชปภพ"]) {
    assert.ok(!text.includes(leak), `ยังหลุด "${leak}"`);
  }
});

test("เอกสารตัวอย่าง: ข้อมูลคลินิกอยู่ครบ", () => {
  const { text } = sanitizePHI(SAMPLE);
  for (const keep of [
    "อายุ 52 ปี",
    "ไข้ ไอ เจ็บคอ 2 วัน",
    "DM type 2",
    "สูบบุหรี่",
    "T 38.5",
    "WBC 11,200",
    "Acute pharyngitis",
    "Amoxicillin 500 mg",
    "14 สิงหาคม 2569",
    "09:15",
  ]) {
    assert.ok(text.includes(keep), `"${keep}" หายไป`);
  }
});

test("sanitize สองรอบได้ผลเท่ากัน (idempotent)", () => {
  const once = sanitizePHI(SAMPLE).text;
  const twice = sanitizePHI(once).text;
  assert.equal(once, twice);
});

console.log("\n── isUsableEvidence ──");

test("ข้อความคลินิกใช้เป็น evidence ได้", () => {
  assert.equal(isUsableEvidence("CC: ปวดท้อง 2 วัน"), true);
  assert.equal(isUsableEvidence("URI"), true);
});

test("mask token ล้วนๆ ใช้เป็น evidence ไม่ได้", () => {
  assert.equal(isUsableEvidence(MASK.NAME), false);
  assert.equal(isUsableEvidence(`${MASK.HN} ${MASK.NAME}`), false);
  assert.equal(isUsableEvidence("   "), false);
  assert.equal(isUsableEvidence(""), false);
});

console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
process.exit(failed === 0 ? 0 : 1);
