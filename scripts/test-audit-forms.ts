// scripts/test-audit-forms.ts
// เทสต์แบบฟอร์มทั้ง 8 ใบ — โครงคอลัมน์ การคิดคะแนน การตรวจค่า และการออกไฟล์
//   npm run test:forms
//
// ตัวเลขที่ใช้เทียบมาจากตัวอย่างที่กรอกแล้วในคู่มือ สนย. โดยตรง
// (A1 หน้า 17, A3 หน้า 27, B1 หน้า 34, B2 หน้า 35)
// ถ้าเทสต์พวกนี้แดง แปลว่าเราคิดคะแนนไม่ตรงกับที่คู่มือกำหนด

import assert from "node:assert/strict";
import { AUDIT_FORMS, getAuditForm } from "@/lib/audit-forms/registry";
import {
  computedValue,
  isEmptyRow,
  rowMaxScore,
  summarize,
  validateRows,
  type SheetRow,
} from "@/lib/audit-forms/compute";
import { buildAuditSheetDocx, cellText } from "@/lib/audit-forms/to-docx";

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

const form = (code: string) => {
  const f = getAuditForm(code);
  if (!f) throw new Error(`ไม่มีฟอร์ม ${code}`);
  return f;
};

async function main() {
  console.log("\nเทสต์แบบฟอร์มตรวจสอบคุณภาพ (ภาคผนวก ข)\n" + "═".repeat(60));

  console.log("\n── โครงของฟอร์ม ──");

  await test("มีครบ 8 ใบตามคู่มือ", () => {
    assert.deepEqual(
      AUDIT_FORMS.map((f) => f.code),
      ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "C1"],
    );
  });

  await test("ความกว้างคอลัมน์ของทุกฟอร์มรวมได้ 100% (ไม่งั้นตารางใน DOCX เพี้ยน)", () => {
    for (const f of AUDIT_FORMS) {
      const sum = f.columns.reduce((s, c) => s + c.width, 0);
      assert.equal(sum, 100, `${f.code} รวมได้ ${sum}%`);
    }
  });

  await test("คีย์คอลัมน์ห้ามซ้ำกันในฟอร์มเดียว", () => {
    for (const f of AUDIT_FORMS) {
      const keys = f.columns.map((c) => c.key);
      assert.equal(new Set(keys).size, keys.length, `${f.code} มีคีย์ซ้ำ`);
    }
  });

  await test("ช่อง computed ต้องอ้างคีย์ที่มีจริง", () => {
    for (const f of AUDIT_FORMS) {
      const keys = new Set(f.columns.map((c) => c.key));
      for (const c of f.columns) {
        if (c.compute !== "percent") continue;
        assert.ok(keys.has(c.numerator ?? ""), `${f.code}.${c.key} numerator ไม่มีจริง`);
        assert.ok(keys.has(c.denominator ?? ""), `${f.code}.${c.key} denominator ไม่มีจริง`);
      }
    }
  });

  await test("A1 คะแนนเต็มรวม 17 ตามคู่มือหน้า 8-9", () => {
    const total = form("A1")
      .columns.filter((c) => c.kind === "score")
      .reduce((s, c) => s + (c.max ?? 0), 0);
    assert.equal(total, 17);
  });

  await test("A3 คะแนนเต็มรวม 31 และ na ได้เฉพาะ Op กับ OB", () => {
    const scores = form("A3").columns.filter((c) => c.kind === "score");
    assert.equal(
      scores.reduce((s, c) => s + (c.max ?? 0), 0),
      31,
    );
    assert.deepEqual(
      scores.filter((c) => c.allowNA).map((c) => c.key),
      ["op", "ob"],
    );
  });

  await test("A2 (OPD) ไม่มีประเภทโรคร่วม/โรคแทรก แต่ A4 (IPD) มี", () => {
    const opd = form("A2").columns.find((c) => c.key === "icdType");
    const ipd = form("A4").columns.find((c) => c.key === "icdType");
    assert.deepEqual(opd?.options?.map((o) => o.code), ["1", "4", "5", "P"]);
    assert.deepEqual(ipd?.options?.map((o) => o.code), ["1", "2", "3", "4", "5", "P"]);
  });

  console.log("\n── คะแนนต่อแถว (กติกา na จากคู่มือหน้า 16/26) ──");

  await test("A1 แถวตัวอย่างจากคู่มือ: 1,2,1,1,2,2 → เต็ม 17 ได้ 9", () => {
    const f = form("A1");
    const row: SheetRow = {
      serviceDatetime: "1",
      cc: "2",
      history: "1",
      physicalExam: "1",
      diagnosis: "2",
      treatment: "2",
    };
    assert.equal(rowMaxScore(f, row), 17);
    assert.equal(computedValue(f, f.columns.find((c) => c.key === "gotScore")!, row), 9);
  });

  await test("A3 แถวตัวอย่างจากคู่มือ: OB เป็น na → เต็ม 27 ได้ 15", () => {
    const f = form("A3");
    const row: SheetRow = {
      ds1: "2",
      ds2: "3",
      hx: "3",
      pe: "2",
      progress: "1",
      op: "1",
      ob: "na",
      nurse: "3",
    };
    assert.equal(rowMaxScore(f, row), 27, "31 − 4 (OB) = 27");
    assert.equal(computedValue(f, f.columns.find((c) => c.key === "gotScore")!, row), 15);
  });

  await test("A3 อีกแถว: Op เป็น na → เต็ม 27 ได้ 16", () => {
    const f = form("A3");
    const row: SheetRow = {
      ds1: "3",
      ds2: "3",
      hx: "2",
      pe: "1",
      progress: "2",
      op: "na",
      ob: "2",
      nurse: "3",
    };
    assert.equal(rowMaxScore(f, row), 27);
    assert.equal(computedValue(f, f.columns.find((c) => c.key === "gotScore")!, row), 16);
  });

  await test("ช่องที่ยังไม่กรอกต่างจาก na — ยังนับคะแนนเต็มไว้", () => {
    const f = form("A1");
    // กรอกแค่ช่องเดียว ที่เหลือว่าง → คะแนนเต็มยังเป็น 17 ไม่ใช่ 1
    assert.equal(rowMaxScore(f, { serviceDatetime: "1" }), 17);
    // ตั้ง na ให้สองข้อที่ na ได้ → 17 − 4 − 3 = 10
    assert.equal(rowMaxScore(f, { diagnosis: "na", treatment: "na" }), 10);
  });

  console.log("\n── ช่องสัดส่วน % (B1/B2/B3/C1) ──");

  await test("B1 ตัวอย่างคู่มือ: พบ 25 จาก 1000 → 2.50 %", () => {
    const f = form("B1");
    const col = f.columns.find((c) => c.key === "percent")!;
    assert.equal(computedValue(f, col, { found: "25", total: "1000" }), 2.5);
  });

  await test("B2 ตัวอย่างคู่มือ: ผิด 576 จาก 1000 → 57.60 %", () => {
    const f = form("B2");
    const col = f.columns.find((c) => c.key === "percent")!;
    assert.equal(computedValue(f, col, { wrong: "576", total: "1000" }), 57.6);
  });

  await test("ตัวหารเป็น 0 หรือว่าง → คืน null ไม่ใช่ NaN/Infinity", () => {
    const f = form("B2");
    const col = f.columns.find((c) => c.key === "percent")!;
    assert.equal(computedValue(f, col, { wrong: "5", total: "0" }), null);
    assert.equal(computedValue(f, col, { wrong: "5", total: "" }), null);
    assert.equal(computedValue(f, col, {}), null);
  });

  console.log("\n── บรรทัดสรุปท้ายฟอร์ม ──");

  await test("A1 สรุปคะแนนรวมข้ามแถว และแถวว่างไม่ถูกนับ", () => {
    const f = form("A1");
    const rows: SheetRow[] = [
      { serviceDatetime: "1", cc: "2", history: "1", physicalExam: "1", diagnosis: "2", treatment: "2" },
      { serviceDatetime: "1", cc: "2", history: "2", physicalExam: "2", diagnosis: "na", treatment: "3" },
      {}, // แถวว่าง
    ];
    const s = summarize(f, rows);
    assert.equal(s.kind, "score");
    if (s.kind !== "score") return;
    assert.equal(s.rows, 2, "แถวว่างต้องไม่ถูกนับ");
    assert.equal(s.maxScore, 17 + 13);
    assert.equal(s.totalScore, 9 + 10);
    assert.equal(s.percentage, 63.33);
  });

  await test("A2 นับสัญลักษณ์ผิดแยกตัว และ Y ไม่นับว่าผิด", () => {
    const f = form("A2");
    const rows: SheetRow[] = [
      { hn: "1", result: "Y" },
      { hn: "2", result: "A" },
      { hn: "3", result: "A" },
      { hn: "4", result: "C" },
      { hn: "5", result: "" }, // ยังไม่ตัดสิน ไม่นับเป็นรหัสที่ตรวจแล้ว
    ];
    const s = summarize(f, rows);
    assert.equal(s.kind, "icdError");
    if (s.kind !== "icdError") return;
    assert.equal(s.errorCounts.A, 2);
    assert.equal(s.errorCounts.C, 1);
    assert.equal(s.errorCounts.B, 0);
    assert.equal(s.wrongCount, 3);
    assert.equal(s.totalCodes, 4, "แถวที่ยังไม่ตัดสินไม่นับเป็นรหัสทั้งหมด");
    assert.equal(s.percentage, 75);
  });

  await test("ตัวพิมพ์เล็กก็นับได้ (คนพิมพ์ a แทน A)", () => {
    const s = summarize(form("A4"), [{ an: "1", result: "a" }]);
    if (s.kind !== "icdError") throw new Error("ควรเป็น icdError");
    assert.equal(s.errorCounts.A, 1);
  });

  await test("B/C ไม่มีบรรทัดสรุปตามต้นฉบับ", () => {
    for (const code of ["B1", "B2", "B3", "C1"]) {
      assert.equal(summarize(form(code), [{}]).kind, "none", code);
    }
  });

  console.log("\n── ตรวจค่าก่อนบันทึก ──");

  await test("คะแนนเกินเต็มของหัวข้อนั้นต้องไม่ผ่าน", () => {
    const errs = validateRows(form("A1"), [{ hn: "1", cc: "3" }]);
    assert.equal(errs.length, 1);
    assert.match(errs[0], /CC ต้องอยู่ระหว่าง 0 ถึง 2/);
  });

  await test("เลือก na ในหัวข้อที่คู่มือไม่ให้ na ต้องไม่ผ่าน", () => {
    const errs = validateRows(form("A1"), [{ hn: "1", history: "na" }]);
    assert.match(errs[0], /ประวัติ เลือก na ไม่ได้/);
    // แต่คำวินิจฉัยเลือกได้
    assert.deepEqual(validateRows(form("A1"), [{ hn: "1", diagnosis: "na" }]), []);
  });

  await test("สัญลักษณ์ผลการตรวจที่ไม่มีในคู่มือต้องไม่ผ่าน", () => {
    const errs = validateRows(form("A2"), [{ hn: "1", result: "Z" }]);
    assert.match(errs[0], /ผลการตรวจ ไม่มีตัวเลือก/);
  });

  await test("ประเภทรหัส 2 ใช้ใน A4 ได้ แต่ใน A2 ไม่ได้", () => {
    assert.deepEqual(validateRows(form("A4"), [{ an: "1", icdType: "2" }]), []);
    assert.equal(validateRows(form("A2"), [{ hn: "1", icdType: "2" }]).length, 1);
  });

  await test("จำนวน case ติดลบต้องไม่ผ่าน", () => {
    const errs = validateRows(form("B1"), [{ hospitalCode: "10667", total: "-5" }]);
    assert.match(errs[0], /ต้องเป็นจำนวนเต็มไม่ติดลบ/);
  });

  await test("กรอกตัวเศษแล้วลืมตัวส่วน → เตือน", () => {
    const errs = validateRows(form("B2"), [{ hospitalCode: "10667", wrong: "5" }]);
    assert.equal(errs.length, 1);
    assert.match(errs[0], /total ยังว่าง/);
  });

  await test("แถวว่างทั้งแถวไม่ถูกตรวจ (กรอกค้างไว้แล้วเซฟได้)", () => {
    assert.deepEqual(validateRows(form("A1"), [{}, { hn: "", cc: "" }]), []);
    assert.ok(isEmptyRow(form("A1"), { hn: "", cc: null }));
    assert.ok(!isEmptyRow(form("A1"), { hn: "123" }));
  });

  await test("กรอกไม่ครบแต่ค่าถูกต้อง → ผ่าน (เซฟค้างระหว่างตรวจได้)", () => {
    assert.deepEqual(validateRows(form("A3"), [{ an: "58000015", ds1: "3" }]), []);
  });

  console.log("\n── ค่าที่จะลงไฟล์ ──");

  await test("วันที่ในช่องตารางเป็น dd/mm/yyyy พ.ศ. (ช่องแคบ ใช้ชื่อเดือนเต็มแล้วตัดบรรทัด)", () => {
    const f = form("A1");
    const col = f.columns.find((c) => c.key === "date")!;
    assert.equal(cellText(f, col, { date: "2026-08-18" }), "18/08/2569");
    // ค่าที่พิมพ์มือไว้ไม่ถูกแปลงทิ้ง
    assert.equal(cellText(f, col, { date: "20 ม.ค. 58" }), "20 ม.ค. 58");
  });

  await test("ช่องคำนวณคิดสดจากแถว ไม่เชื่อค่าที่ส่งมาในแถว", () => {
    const f = form("A1");
    const col = f.columns.find((c) => c.key === "gotScore")!;
    // ใส่ gotScore ปลอมมาใน row — ต้องถูกมองข้าม
    const row: SheetRow = { cc: "2", gotScore: "999" };
    assert.equal(cellText(f, col, row), "2");
  });

  console.log("\n── สร้างไฟล์ DOCX ได้ทุกใบ ──");

  for (const f of AUDIT_FORMS) {
    await test(`Form ${f.code} ออกไฟล์ได้`, async () => {
      const buf = await buildAuditSheetDocx(f, {
        title: `ทดสอบ ${f.code}`,
        meta: Object.fromEntries(f.meta.map((m) => [m.key, "ทดสอบ"])),
        rows: [Object.fromEntries(f.columns.map((c) => [c.key, "1"]))],
      });
      assert.ok(buf.byteLength > 1000, `ไฟล์เล็กผิดปกติ: ${buf.byteLength}`);
      assert.equal(buf[0], 0x50);
      assert.equal(buf[1], 0x4b);
    });
  }

  await test("ฟอร์มเปล่า (ไม่มีแถวเลย) ก็ออกไฟล์ได้ ไว้พิมพ์ไปเขียนมือ", async () => {
    const buf = await buildAuditSheetDocx(form("A3"), { meta: {}, rows: [] });
    assert.ok(buf.byteLength > 1000);
  });

  console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
