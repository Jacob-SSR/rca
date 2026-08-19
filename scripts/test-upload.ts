// scripts/test-upload.ts
// เทสต์การรับไฟล์ทุกชนิด + กติกาความเป็นเจ้าของ
//   npm run test:upload

import assert from "node:assert/strict";
import { Document, Packer, Paragraph } from "docx";
import { detectKind, extractDocument, normalizeText } from "@/lib/documents/extract";
import { canModify, isOwner } from "@/lib/auth/ownership";
import type { Session } from "@/lib/auth/session";

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

const user = (username: string, role = "NURSE"): Session =>
  ({ username, name: `คุณ${username}`, role }) as Session;

async function makeDocx(text: string): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: [new Paragraph(text)] }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function main() {
  console.log("\nเทสต์การอัปโหลดและสิทธิ์เจ้าของ\n" + "═".repeat(60));

  console.log("\n── เดาชนิดไฟล์ ──");

  await test("เดาจากนามสกุลได้แม้ mimeType ว่าง (เบราว์เซอร์บางตัวไม่ส่ง)", () => {
    assert.equal(detectKind("record.docx", ""), "docx");
    assert.equal(detectKind("scan.PDF", ""), "pdf");
    assert.equal(detectKind("note.txt", ""), "text");
    assert.equal(detectKind("photo.JPG", ""), "image");
    assert.equal(detectKind("archive.zip", ""), "other");
  });

  await test("เดาจาก mimeType ได้เมื่อชื่อไฟล์ไม่มีนามสกุล", () => {
    assert.equal(detectKind("blob", "application/pdf"), "pdf");
    assert.equal(detectKind("blob", "image/png"), "image");
    assert.equal(detectKind("blob", "text/plain"), "text");
  });

  console.log("\n── สกัดข้อความ ──");

  await test("อ่าน .docx ได้", async () => {
    const buf = await makeDocx("อาการสำคัญ ไข้ ไอ เจ็บคอ 2 วัน");
    const r = await extractDocument(buf, "a.docx", "");
    assert.ok(r.reviewable);
    assert.match(r.text, /ไข้ ไอ เจ็บคอ 2 วัน/);
    assert.equal(r.kind, "docx");
  });

  await test("อ่านไฟล์ข้อความธรรมดาได้", async () => {
    const r = await extractDocument(Buffer.from("CC: ปวดหัว 3 วัน", "utf8"), "a.txt", "");
    assert.ok(r.reviewable);
    assert.equal(r.text, "CC: ปวดหัว 3 วัน");
  });

  await test("ไฟล์ข้อความ TIS-620 อ่านออกเป็นภาษาไทย ไม่ใช่ตัวประหลาด", async () => {
    // เอกสารราชการไทยเก่าและ export จาก HOSxP เป็น TIS-620 กันเยอะ
    const tis = Buffer.from([0xbb, 0xc7, 0xb4, 0xcb, 0xd1, 0xc7]); // "ปวดหัว"
    const r = await extractDocument(tis, "old.txt", "");
    assert.equal(r.text, "ปวดหัว");
    assert.ok(r.warnings.some((w) => w.includes("TIS-620")));
  });

  await test("ไฟล์รูป: เก็บได้แต่ตรวจไม่ได้ พร้อมบอกว่าต้องทำอะไรต่อ", async () => {
    const r = await extractDocument(Buffer.from([0x89, 0x50, 0x4e, 0x47]), "scan.png", "");
    assert.equal(r.reviewable, false);
    assert.equal(r.text, "");
    assert.match(r.reason ?? "", /OCR/);
    assert.match(r.reason ?? "", /\.docx|\.pdf/);
  });

  await test("ชนิดที่ไม่รู้จัก: ไม่ throw แต่บอกให้แปลงไฟล์ก่อน", async () => {
    const r = await extractDocument(Buffer.from("PK"), "x.zip", "");
    assert.equal(r.reviewable, false);
    assert.match(r.reason ?? "", /แปลงเป็น/);
  });

  await test("ไฟล์ข้อความว่างเปล่า: ตรวจไม่ได้ ไม่ใช่ข้อความว่างที่ได้ 0 คะแนน", async () => {
    // ⚠️ สำคัญ — ถ้าปล่อยผ่านไปเป็นข้อความว่าง Rule Engine จะให้ 0 ทุกข้อ
    //    แล้วคะแนนนั้นจะดูเหมือนผลตรวจจริงทั้งที่ระบบแค่อ่านไฟล์ไม่ออก
    const r = await extractDocument(Buffer.from("   \n\n  ", "utf8"), "empty.txt", "");
    assert.equal(r.reviewable, false);
    assert.equal(r.text, "");
  });

  await test("normalizeText ตัดบรรทัดว่างซ้อนและ no-break space", () => {
    assert.equal(normalizeText("a\r\n\n\n\nb"), "a\n\nb");
    assert.equal(normalizeText("ก ข"), "ก ข");
  });

  console.log("\n── สิทธิ์เจ้าของ ──");

  const owner = user("somchai");
  const other = user("somsri");
  const admin = user("itadmin", "ADMIN");

  await test("เจ้าของแก้/ลบของตัวเองได้", () => {
    assert.ok(isOwner(owner, { createdBy: "somchai" }));
    assert.ok(canModify(owner, { createdBy: "somchai" }));
  });

  await test("คนอื่นแก้ไม่ได้", () => {
    assert.ok(!isOwner(other, { createdBy: "somchai" }));
    assert.ok(!canModify(other, { createdBy: "somchai" }));
  });

  await test("ตัวพิมพ์ใหญ่เล็กของ username ไม่ทำให้เจ้าของกลายเป็นคนอื่น", () => {
    assert.ok(isOwner(user("SomChai"), { createdBy: "somchai" }));
    assert.ok(isOwner(owner, { createdBy: " SOMCHAI " }));
  });

  await test("ผู้ดูแลระบบ (manage) จัดการของทุกคนได้ แต่ไม่นับเป็นเจ้าของ", () => {
    // ต้องแยกสองเรื่องนี้ ป้ายว่า "ของฉัน" ต้องไม่ขึ้นกับเคสของคนอื่น
    assert.ok(canModify(admin, { createdBy: "somchai" }));
    assert.ok(!isOwner(admin, { createdBy: "somchai" }));
  });

  await test("ของเก่าที่ไม่มีเจ้าของ ต้องมีสิทธิ์ manage เท่านั้นถึงแตะได้", () => {
    // ⚠️ ถ้าปล่อยให้ใครก็ได้แก้ createdBy = null จะกลายเป็นช่องโหว่ทันที
    assert.ok(!canModify(owner, { createdBy: null }));
    assert.ok(!canModify(other, {}));
    assert.ok(canModify(admin, { createdBy: null }));
  });

  await test("ยังไม่ล็อกอินแก้อะไรไม่ได้", () => {
    assert.ok(!canModify(null, { createdBy: "somchai" }));
    assert.ok(!isOwner(null, { createdBy: "somchai" }));
  });

  console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
