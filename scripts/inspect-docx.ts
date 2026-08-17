// scripts/inspect-docx.ts
// ดูว่าเอกสารหนึ่งไฟล์ ผ่าน parse + PHI masking แล้วเหลือข้อความอะไร
// = "สิ่งที่จะถูกส่งเข้า AI จริง" — ตรวจก่อนได้โดยไม่ต้องยิง API และไม่ต้องมี DB
//
//   npm run inspect -- data/samples/opd-01-complete.docx
//
// ใช้ตรวจสองอย่าง (สเปกข้อ 2.3)
//   1. PHI หลุดไหม — ชื่อ/HN/เลขบัตร/ที่อยู่/เบอร์โทร ต้องไม่เหลือ
//   2. ข้อความคลินิกถูกทำลายไหม — อาการ/ค่าตรวจ/ชื่อยา/คำวินิจฉัย ต้องอยู่ครบ

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocx } from "@/lib/docx/parse";
import { sanitizePHI, totalMasked } from "@/lib/phi/sanitize";

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("ใช้: npm run inspect -- <path ของไฟล์ .docx>");
    process.exit(1);
  }

  const buffer = await readFile(path.resolve(target));
  const parsed = await parseDocx(buffer);
  const sanitized = sanitizePHI(parsed.text);

  console.log(`\n${"═".repeat(78)}`);
  console.log(`ไฟล์: ${target}`);
  console.log(`${"═".repeat(78)}`);

  console.log(`\nข้อความที่อ่านได้: ${parsed.text.length} ตัวอักษร`);
  if (parsed.warnings.length > 0) {
    console.log(`คำเตือนจาก mammoth: ${parsed.warnings.length} รายการ`);
    for (const w of parsed.warnings.slice(0, 5)) console.log(`  - ${w}`);
  }

  console.log(`\nปิดบัง PHI ทั้งหมด ${totalMasked(sanitized.counts)} จุด:`);
  for (const [kind, n] of Object.entries(sanitized.counts)) {
    if (n > 0) console.log(`  ${kind.padEnd(8)} ${n}`);
  }

  console.log(`\n${"─".repeat(78)}`);
  console.log("ข้อความที่จะถูกส่งเข้า AI");
  console.log(`${"─".repeat(78)}\n`);
  console.log(sanitized.text);
  console.log(`\n${"─".repeat(78)}`);

  // ── เตือนถ้ายังเห็นรูปแบบที่น่าจะเป็น PHI หลงเหลือ ──────────────────────────
  const suspects: [string, RegExp][] = [
    ["เลข 13 หลักติดกัน (อาจเป็นเลขบัตรประชาชน)", /\b\d{13}\b/],
    ["เลขขึ้นต้น 0 ยาว 9-10 หลัก (อาจเป็นเบอร์โทร)", /\b0\d{8,9}\b/],
    ["คำนำหน้าชื่อที่ยังไม่ถูกปิดบัง", /(?:นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.)\s*[ก-๙]{2,}/],
    ["ตำบล/อำเภอ/จังหวัด ที่ยังไม่ถูกปิดบัง", /(?:ต\.|อ\.|จ\.)\s?[ก-๙]{2,}/],
  ];

  const found = suspects.filter(([, re]) => re.test(sanitized.text));
  if (found.length === 0) {
    console.log("✅ ไม่พบรูปแบบที่น่าสงสัยว่าเป็น PHI หลงเหลือ");
  } else {
    console.log("⚠️ พบรูปแบบที่อาจเป็น PHI หลงเหลือ — ตรวจข้อความข้างบนอีกที:");
    for (const [label, re] of found) {
      const m = sanitized.text.match(re);
      console.log(`   - ${label}: "${m?.[0]}"`);
    }
    console.log("   ถ้าใช่ ให้เพิ่ม pattern ใน lib/phi/sanitize.ts แล้วเพิ่มเทสต์ใน scripts/test-phi.ts");
  }
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
