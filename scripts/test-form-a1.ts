// scripts/test-form-a1.ts
// เทสต์ตัวประกอบ Form A1 — รันได้โดยไม่ต่อฐานข้อมูล
//   npm run test:a1
//
// จุดที่ต้องไม่พลาดคือกติกาในคู่มือ สนย. หน้า 11
//   "คะแนนเต็ม คือ การรวมคะแนนสูงสุดที่เป็นไปได้
//    ถ้ารายการใดผลการประเมินเป็น na ไม่ต้องนำคะแนนเต็มของรายการนั้นมารวม"

import assert from "node:assert/strict";
import { A1_SCORE_COLUMNS, a1Date, a1Note, a1Time } from "@/lib/report/form-a1";
import { buildFormA1Docx } from "@/lib/report/form-a1-docx";
import type { A1Report } from "@/lib/report/form-a1";

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

const item = (
  code: string,
  maxScore: number,
  score: number | null,
  isNA = false,
  reason: string | null = null,
) => ({ score, isNA, reason, criterion: { code, maxScore } });

async function main() {
  console.log("\nเทสต์ Form A1\n" + "═".repeat(60));

  console.log("\n── คอลัมน์ต้องตรงกับต้นฉบับ สนย. ──");

  await test("มี 6 คอลัมน์คะแนน เรียงตามคู่มือ", () => {
    assert.deepEqual(
      A1_SCORE_COLUMNS.map((c) => c.code),
      ["SERVICE_DATETIME", "CC", "HISTORY", "PHYSICAL_EXAM", "DIAGNOSIS", "TREATMENT"],
    );
    assert.deepEqual(
      A1_SCORE_COLUMNS.map((c) => c.header),
      ["วัน/เวลา", "CC", "ประวัติ", "ตรวจร่างกาย", "คำวินิจฉัย", "การรักษา"],
    );
  });

  console.log("\n── วันที่ / เวลา ──");

  await test("ISO → dd/mm/yyyy พ.ศ.", () => {
    assert.equal(a1Date("2015-01-20"), "20/01/2558");
    assert.equal(a1Date("2026-08-18"), "18/08/2569");
  });

  await test("ค่าที่ไม่ใช่ ISO ส่งผ่านเหมือนเดิม ไม่ทิ้งของที่คนพิมพ์ไว้", () => {
    assert.equal(a1Date("20 ม.ค. 58"), "20 ม.ค. 58");
    assert.equal(a1Date("2026-13-45"), "2026-13-45");
  });

  await test("ค่าว่างคืนสตริงว่าง (ช่องในฟอร์มต้องว่าง ไม่ใช่ NaN)", () => {
    assert.equal(a1Date(null), "");
    assert.equal(a1Date(undefined), "");
    assert.equal(a1Date("  "), "");
  });

  await test("เวลา normalize เป็น HH:mm", () => {
    assert.equal(a1Time("8:30"), "08:30");
    assert.equal(a1Time("08:30:45"), "08:30");
    assert.equal(a1Time("23:59"), "23:59");
    assert.equal(a1Time(null), "");
  });

  console.log("\n── ช่องหมายเหตุ ──");

  await test("ได้เต็มทุกข้อ → หมายเหตุว่าง", () => {
    assert.equal(
      a1Note([item("CC", 2, 2), item("HISTORY", 3, 3), item("DIAGNOSIS", 4, 4)]),
      "",
    );
  });

  await test("ข้อที่ไม่เต็มขึ้นหมายเหตุพร้อมเหตุผลจาก Rule Engine", () => {
    const note = a1Note([
      item("CC", 2, 2),
      item("DIAGNOSIS", 4, 2, false, "มีบางคำกำกวม ขาดรายละเอียดตำแหน่งโรค"),
    ]);
    assert.equal(note, "คำวินิจฉัย: มีบางคำกำกวม ขาดรายละเอียดตำแหน่งโรค");
  });

  await test("หลายข้อคั่นด้วย · และเรียงตามที่ส่งเข้ามา", () => {
    const note = a1Note([
      item("CC", 2, 1, false, "ไม่ระบุระยะเวลา"),
      item("TREATMENT", 3, 1, false, "ไม่ระบุวิธีใช้ยา"),
    ]);
    assert.equal(note, "CC: ไม่ระบุระยะเวลา · การรักษา: ไม่ระบุวิธีใช้ยา");
  });

  await test("ข้อที่เป็น na ไม่ถือว่าเสียคะแนน จึงไม่ขึ้นหมายเหตุ", () => {
    assert.equal(a1Note([item("TREATMENT", 3, null, true), item("DIAGNOSIS", 4, 4)]), "");
  });

  await test("ไม่มี reason → ขึ้นแค่ชื่อหัวข้อ ไม่ทิ้งบรรทัดว่าง", () => {
    assert.equal(a1Note([item("HISTORY", 3, 1)]), "ประวัติ");
  });

  console.log("\n── สร้างไฟล์ DOCX ──");

  const report: A1Report = {
    // ตัวอย่างสองแถวจากคู่มือหน้า 12 (คะแนนเต็ม 17 ได้ 9 และ 14)
    rows: [
      {
        reviewId: "r1",
        hn: "12345678",
        date: "20/01/2558",
        time: "08:30",
        scores: [1, 2, 1, 1, 2, 2],
        maxScore: 17,
        totalScore: 9,
        note: "คำวินิจฉัย: Myalgia ไม่บอกตำแหน่ง",
      },
      {
        reviewId: "r2",
        hn: "15789678",
        date: "20/01/2558",
        time: "08:50",
        scores: [1, 2, 2, 2, "na", 3],
        maxScore: 13,
        totalScore: 10,
        note: "",
      },
    ],
    from: null,
    to: null,
    sumTotal: 19,
    sumMax: 30,
    percentage: 63.33,
  };

  await test("แถวตัวอย่างจากคู่มือรวมคะแนนได้ตรง", () => {
    const row = report.rows[0];
    const sum = row.scores.reduce<number>((s, v) => s + (typeof v === "number" ? v : 0), 0);
    assert.equal(sum, row.totalScore, "ผลรวมคะแนนรายข้อต้องเท่ากับคะแนนที่ได้");
  });

  await test("แถวที่มี na ต้องมีคะแนนเต็มน้อยกว่า 17", () => {
    const row = report.rows[1];
    assert.ok(row.scores.includes("na"));
    // 17 − 4 (คำวินิจฉัย) = 13 ตามกติกาในคู่มือหน้า 11
    assert.equal(row.maxScore, 13);
  });

  await test("สร้าง DOCX ได้และเป็นไฟล์ zip จริง (docx = zip)", async () => {
    const buf = await buildFormA1Docx(report, {
      hospitalName: "โรงพยาบาลพลับพลาชัย",
      hospitalCode: "10667",
      reviewer: "ผู้ตรวจสอบ",
    });
    assert.ok(buf.byteLength > 1000, `ไฟล์เล็กผิดปกติ: ${buf.byteLength} bytes`);
    assert.equal(buf[0], 0x50, "byte แรกต้องเป็น 'P' ของ PK zip header");
    assert.equal(buf[1], 0x4b, "byte ที่สองต้องเป็น 'K' ของ PK zip header");
  });

  await test("ไม่มีข้อมูลเลยก็ต้องออกฟอร์มเปล่าได้ (ไว้เขียนมือ)", async () => {
    const empty: A1Report = {
      rows: [],
      from: null,
      to: null,
      sumTotal: 0,
      sumMax: 0,
      percentage: null,
    };
    const buf = await buildFormA1Docx(empty);
    assert.ok(buf.byteLength > 1000);
  });

  console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
