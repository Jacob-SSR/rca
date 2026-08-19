// scripts/test-form-docx.ts
// เทสต์: ฟอร์ม → DOCX → mammoth → ข้อความ
// ต้องได้ข้อความครบทุกหัวข้อที่เกณฑ์ต้องใช้ และช่องว่างต้องไม่โผล่มาเป็นข้อความหลอก
//   npm run test:form
//
// ไม่ต้องมี DB ไม่เรียก AI

import assert from "node:assert/strict";
import { buildRecordDocx, recordDocxFileName } from "@/lib/form/to-docx";
import { parseDocx } from "@/lib/docx/parse";
import { sanitizePHI } from "@/lib/phi/sanitize";
import {
  FORM_FIELD_NAMES,
  FORM_SECTIONS,
  blankFormValues,
  recordFormSchema,
  type RecordFormInput,
} from "@/lib/form/schema";

const HOSPITAL = { name: "โรงพยาบาลพลับพลาชัย", code: "10667" };

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e instanceof Error ? e.message : String(e)}`);
  }
}

const FULL: RecordFormInput = {
  hn: "0056321",
  patientName: "นายสมชาย ใจดี",
  age: "52 ปี",
  gender: "ชาย",
  department: "อายุรกรรม",
  pttype: "บัตรทอง (UC)",
  serviceDate: "14 สิงหาคม 2569",
  serviceTime: "09:15",
  chiefComplaint: "ไข้สูง ไอมีเสมหะ เจ็บคอ 3 วันก่อนมาโรงพยาบาล",
  presentIllness: "3 วันก่อนมา มีไข้สูงลอย ไอมีเสมหะสีเหลือง เจ็บคอมากเวลากลืน",
  pastHistory: "เบาหวานชนิดที่ 2 มา 8 ปี ความดันโลหิตสูง 5 ปี",
  personalHistory: "อาชีพเกษตรกร สูบบุหรี่วันละ 10 มวน ปฏิเสธการแพ้ยา",
  vitalSigns: "T 38.7 °C, BP 138/86 mmHg, PR 98 /min, RR 22 /min",
  physicalExam:
    "HEENT: pharyngeal injection\nLungs: coarse crepitation ปอดขวาล่าง\nHeart: normal S1 S2\nAbdomen: soft, not tender",
  labResult: "CBC: WBC 13,400 /µL (Neutrophil 78%)\nCXR: infiltration ที่ right lower lobe",
  diagnosis:
    "Community acquired pneumonia, right lower lobe\nType 2 diabetes mellitus without complication",
  treatment:
    "Amoxicillin/Clavulanic acid 1 g tablet รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร นาน 7 วัน\nParacetamol 500 mg tablet ครั้งละ 1 เม็ด ทุก 6 ชั่วโมง เวลามีไข้",
  note: "นัดติดตามอาการ 3 วัน",
  recorder: "นพ.กิตติภัทร์ คันธะมาลย์",
};

const EMPTY: RecordFormInput = Object.fromEntries(
  Object.keys(FULL).map((k) => [k, null]),
) as RecordFormInput;

async function textOf(form: RecordFormInput): Promise<string> {
  const buffer = await buildRecordDocx(form, HOSPITAL);
  const parsed = await parseDocx(buffer);
  return parsed.text;
}

async function main() {
  console.log("\n── ฟอร์มกรอกครบ → เอกสารมีข้อมูลครบ ──");

  const fullText = await textOf(FULL);

  await test("ข้อมูลผู้ป่วยอยู่ครบ", () => {
    for (const v of ["นายสมชาย ใจดี", "0056321", "52 ปี", "ชาย", "อายุรกรรม"]) {
      assert.ok(fullText.includes(v), `ไม่พบ "${v}"`);
    }
  });

  await test("วันเวลาที่มารับบริการอยู่ครบ (SERVICE_DATETIME)", () => {
    assert.ok(fullText.includes("14 สิงหาคม 2569"));
    assert.ok(fullText.includes("09:15"));
  });

  await test("อาการสำคัญพร้อมระยะเวลา (CC)", () => {
    assert.ok(fullText.includes("ไข้สูง ไอมีเสมหะ เจ็บคอ 3 วัน"));
  });

  await test("ประวัติครบสามชั้น (HISTORY)", () => {
    assert.ok(fullText.includes("ไข้สูงลอย"), "ประวัติปัจจุบัน");
    assert.ok(fullText.includes("เบาหวานชนิดที่ 2"), "โรคประจำตัว");
    assert.ok(fullText.includes("สูบบุหรี่วันละ 10 มวน"), "ปัจจัยเสี่ยง");
  });

  await test("ตรวจร่างกายครบทุกระบบที่กรอก + ผลแล็บ (PHYSICAL_EXAM)", () => {
    for (const v of ["HEENT", "Lungs", "Heart", "Abdomen", "WBC 13,400", "T 38.7"]) {
      assert.ok(fullText.includes(v), `ไม่พบ "${v}"`);
    }
  });

  await test("คำวินิจฉัยครบทุกบรรทัด (DIAGNOSIS)", () => {
    assert.ok(fullText.includes("Community acquired pneumonia, right lower lobe"));
    assert.ok(fullText.includes("Type 2 diabetes mellitus"));
  });

  await test("การรักษาพร้อมขนาดและวิธีใช้ (TREATMENT)", () => {
    assert.ok(fullText.includes("Amoxicillin/Clavulanic acid 1 g"));
    assert.ok(fullText.includes("วันละ 2 ครั้ง หลังอาหาร นาน 7 วัน"));
    assert.ok(fullText.includes("Paracetamol 500 mg"));
  });

  await test("หัวข้อของทุก section ที่ถูกให้คะแนน ปรากฏในเอกสาร", () => {
    for (const s of FORM_SECTIONS) {
      if (!s.criterion || s.key === "service") continue;
      assert.ok(fullText.includes(s.title), `ไม่พบหัวข้อ "${s.title}"`);
    }
  });

  await test("ขึ้นบรรทัดใหม่ในช่องเดียว กลายเป็นหลายบรรทัดจริง ไม่ใช่ \\n ติดกัน", () => {
    assert.ok(!fullText.includes("\\n"));
    const lungsIdx = fullText.indexOf("Lungs:");
    const heartIdx = fullText.indexOf("Heart:");
    assert.ok(lungsIdx > 0 && heartIdx > lungsIdx, "ลำดับบรรทัดเพี้ยน");
  });

  console.log("\n── ฟอร์มว่าง → ไม่มีข้อความหลอก ──");

  const emptyText = await textOf(EMPTY);

  await test("เอกสารยังสร้างได้ (ไม่ throw)", () => {
    assert.ok(emptyText.length > 0);
  });

  await test("ไม่มีหัวข้อของ section ที่ไม่ได้กรอกเลย", () => {
    for (const s of FORM_SECTIONS) {
      if (!s.criterion || s.key === "service") continue;
      assert.ok(!emptyText.includes(s.title), `หัวข้อ "${s.title}" ไม่ควรอยู่ในเอกสารว่าง`);
    }
  });

  await test('ไม่เติม "-" หรือ "ไม่มี" แทนช่องว่าง', () => {
    assert.ok(!emptyText.includes("ไม่มี"), "ห้ามเติมคำว่า 'ไม่มี' ให้เอง");
    assert.ok(!/^\s*-\s*$/m.test(emptyText), "ห้ามเติม '-' ให้เอง");
  });

  console.log("\n── กรอกบางส่วน ──");

  await test("กรอกแค่ CC → มีหัวข้อ CC หัวข้ออื่นหายไป", async () => {
    const partial: RecordFormInput = { ...EMPTY, chiefComplaint: "ปวดท้อง 2 วัน" };
    const t = await textOf(partial);
    assert.ok(t.includes("ปวดท้อง 2 วัน"));
    assert.ok(t.includes("อาการสำคัญ / เหตุผลที่มา"));
    assert.ok(!t.includes("คำวินิจฉัยโรค"));
    assert.ok(!t.includes("การรักษา"));
  });

  await test("มีวันที่แต่ไม่มีเวลา → เอกสารมีแค่วันที่", async () => {
    const partial: RecordFormInput = { ...EMPTY, serviceDate: "14 สิงหาคม 2569" };
    const t = await textOf(partial);
    assert.ok(t.includes("วันที่มารับบริการ 14 สิงหาคม 2569"));
    assert.ok(!t.includes("เวลา"));
  });

  console.log("\n── PHI ──");

  await test("PHI ในเอกสารที่ generate ถูก mask ครบ", () => {
    const { text, counts } = sanitizePHI(fullText);
    assert.ok(!text.includes("สมชาย"), "ชื่อผู้ป่วยหลุด");
    assert.ok(!text.includes("0056321"), "HN หลุด");
    assert.ok(!text.includes("กิตติภัทร์"), "ชื่อผู้บันทึกหลุด");
    assert.ok(counts.NAME >= 1 && counts.HN >= 1);
  });

  await test("ข้อความคลินิกไม่ถูก mask ทำลาย", () => {
    const { text } = sanitizePHI(fullText);
    for (const keep of [
      "อายุ: 52 ปี",
      "ไข้สูง ไอมีเสมหะ",
      "เบาหวานชนิดที่ 2",
      "WBC 13,400",
      "Amoxicillin/Clavulanic acid 1 g",
      "Community acquired pneumonia",
    ]) {
      assert.ok(text.includes(keep), `"${keep}" หายไป`);
    }
  });

  console.log("\n── schema ──");

  await test("สตริงว่างถูกแปลงเป็น null (DB เก็บ NULL ไม่ใช่ \"\")", () => {
    const parsed = recordFormSchema.parse({ hn: "  ", chiefComplaint: "  ปวดหัว  " });
    assert.equal(parsed.hn, null);
    assert.equal(parsed.chiefComplaint, "ปวดหัว");
  });

  await test("ทุกช่องเป็น optional — บันทึกฟอร์มเปล่าได้", () => {
    const parsed = recordFormSchema.parse({});
    assert.ok(parsed);
  });

  await test("ข้อความยาวเกินขีดจำกัด → ปฏิเสธ", () => {
    assert.throws(() => recordFormSchema.parse({ hn: "x".repeat(50) }));
  });

  await test("ชื่อไฟล์ไม่มีชื่อผู้ป่วยปนอยู่", () => {
    const name = recordDocxFileName(FULL, "RCA-20260814-001");
    assert.ok(!name.includes("สมชาย"));
    assert.ok(name.includes("RCA-20260814-001"));
    assert.ok(name.endsWith(".docx"));
  });

  console.log("\n── ล้างข้อมูลในฟอร์ม (เปลี่ยน HN ในหน้าเดิม) ──");

  await test("ล้างแล้วต้องมีคีย์ครบทุกช่อง และว่างทุกช่อง", () => {
    // ⚠️ ถ้าล้างด้วย {} ค่าเดิมของช่องที่ไม่ได้ระบุจะค้างใน state ของหน้า
    //    แล้วคนไข้รายใหม่จะได้ข้อมูลของรายก่อนติดไปโดยไม่มีใครเห็น
    const blank = blankFormValues();
    assert.equal(Object.keys(blank).length, FORM_FIELD_NAMES.length);
    for (const name of FORM_FIELD_NAMES) {
      assert.equal(blank[name], "", `ช่อง ${name} ไม่ถูกล้าง`);
    }
  });

  await test("ค่าที่ล้างแล้วทับของเดิมได้จริงเมื่อ spread ทับ state เดิม", () => {
    const dirty = { ...blankFormValues(), patientName: "นายสมชาย ใจดี", hn: "0056321" };
    const cleared = { ...dirty, ...blankFormValues() };
    assert.equal(cleared.patientName, "");
    assert.equal(cleared.hn, "");
  });

  await test("ค่าเริ่มต้นที่ส่งเข้ามาไม่ถูกทิ้ง และค่าที่ไม่ใช่ string กลายเป็นว่าง", () => {
    const v = blankFormValues({ hn: "0056321", age: 52, patientName: null });
    assert.equal(v.hn, "0056321");
    assert.equal(v.age, "");
    assert.equal(v.patientName, "");
  });

  console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
