// scripts/test-auto-audit.ts
// เทสต์ตรวจอัตโนมัติ (OPD) + validate ฟอร์ม + ตัวช่วยวันที่/diag_text ของ HOSxP
//   npm run test:auto

import assert from "node:assert/strict";
import { autoAuditOpd, countExamSystems, diagnosisFacts } from "@/lib/review/auto-audit";
import { validateRecordForm } from "@/lib/form/validate";
import { blankFormValues } from "@/lib/form/schema";
import { mergeDiagText, normalizeVisitDate } from "@/lib/hosxp/visit";
import { formatDuration } from "@/app/components/TimelineChart";

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

const score = (values: Record<string, string>, code: string) =>
  autoAuditOpd(blankFormValues(values)).items.find((i) => i.criterionCode === code)?.score;

console.log("\n── ตรวจอัตโนมัติ (OPD) ──");

test("ฟอร์มว่างได้ 0/17 (ช่องว่างไม่ถือเป็น N/A)", () => {
  const r = autoAuditOpd(blankFormValues());
  assert.equal(r.totalScore, 0);
  assert.equal(r.maxScore, 17);
});

test("CC ไม่มีระยะเวลา = 1, มีระยะเวลา = 2, มาตามนัด = 1", () => {
  assert.equal(score({ chiefComplaint: "ไข้ ไอ เจ็บคอ" }, "CC"), 1);
  assert.equal(score({ chiefComplaint: "ไข้ ไอ เจ็บคอ 2 วัน" }, "CC"), 2);
  assert.equal(score({ chiefComplaint: "มาตามนัด" }, "CC"), 1);
});

test("ประวัติครบสามส่วน = 3", () => {
  assert.equal(
    score({ presentIllness: "ไข้มา 2 วัน", pastHistory: "DM", personalHistory: "สูบบุหรี่" }, "HISTORY"),
    3,
  );
});

test("PE นับระบบจากคำ ไม่ใช่จากบรรทัด", () => {
  assert.equal(countExamSystems("HEENT: injected pharynx, Lung: clear, Heart: regular"), 3);
  assert.equal(countExamSystems("ปกติ"), 1);
  assert.equal(countExamSystems(""), 0);
});

test("PE > 2 ระบบ + แล็บยังไม่มีผล = 3", () => {
  assert.equal(
    score(
      { physicalExam: "HEENT normal\nLung clear\nHeart regular", labResult: "X-ray: CXR\n— ยังไม่มีผลอ่านฟิล์มในระบบ —" },
      "PHYSICAL_EXAM",
    ),
    3,
  );
});

test("คำวินิจฉัย: รหัสล้วน = 0, คำย่อ = 3, คำเต็ม = 4, กำกวม = 2", () => {
  assert.equal(score({ diagnosis: "J00" }, "DIAGNOSIS"), 0);
  assert.equal(score({ diagnosis: "DM" }, "DIAGNOSIS"), 3);
  assert.equal(score({ diagnosis: "Acute pharyngitis (J02.9)" }, "DIAGNOSIS"), 4);
  assert.equal(score({ diagnosis: "ไข้" }, "DIAGNOSIS"), 2);
  assert.equal(diagnosisFacts("J00\nAcute pharyngitis").length, 1);
});

test("การรักษา: ยาจาก HOSxP ครบ = 3, RM = 0, ชื่อยาอย่างเดียว = 1", () => {
  assert.equal(
    score({ treatment: "Paracetamol 500 mg · จำนวน 20 เม็ด · รับประทานครั้งละ 1 เม็ด ทุก 6 ชม." }, "TREATMENT"),
    3,
  );
  assert.equal(score({ treatment: "RM" }, "TREATMENT"), 0);
  assert.equal(score({ treatment: "Paracetamol" }, "TREATMENT"), 1);
});

console.log("\n── validate ฟอร์ม ──");

test("HN ผิดรูปแบบ / เวลาไม่ใช่ HH:mm / วันที่อนาคต = error", () => {
  const issues = validateRecordForm(
    blankFormValues({ hn: "12 34", serviceTime: "25:00", serviceDate: "2999-01-01" }),
  );
  const fields = issues.filter((i) => i.level === "error").map((i) => i.field);
  assert.ok(fields.includes("hn"));
  assert.ok(fields.includes("serviceTime"));
  assert.ok(fields.includes("serviceDate"));
});

test("ฟอร์มว่างไม่มี error (ทุกช่อง optional)", () => {
  assert.equal(validateRecordForm(blankFormValues()).length, 0);
});

test("คำวินิจฉัยเป็นรหัสล้วน = warning", () => {
  const issues = validateRecordForm(blankFormValues({ diagnosis: "J00\nE11.9" }));
  assert.equal(issues[0]?.level, "warning");
});

console.log("\n── HOSxP: วันที่ / diag_text ──");

test("ปี พ.ศ. แปลงเป็น ค.ศ., วันที่ไม่มีจริง = null", () => {
  assert.equal(normalizeVisitDate("2569-10-05"), "2026-10-05");
  assert.equal(normalizeVisitDate("2026-10-05"), "2026-10-05");
  assert.equal(normalizeVisitDate("2026-02-30"), null);
  assert.equal(normalizeVisitDate("05/10/2026"), null);
});

test("รวม diag_text สองที่ ตัดบรรทัดซ้ำ/ค่าว่าง", () => {
  assert.equal(mergeDiagText("Acute pharyngitis", "acute  pharyngitis\nFever", null, "NULL"), "Acute pharyngitis\nFever");
});

test("ระยะเวลาภาษาไทย", () => {
  assert.equal(formatDuration(12 * 60000), "12 นาที");
  assert.equal(formatDuration(121 * 60000), "2 ชม. 1 นาที");
  assert.equal(formatDuration(120 * 60000), "2 ชม.");
});

console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
process.exit(failed === 0 ? 0 : 1);
