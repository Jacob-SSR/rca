// scripts/test-hosxp.ts
// เทสต์ตัวกันเขียนของ HOSxP client + การแปลงวันที่ไทย
// รันได้โดยไม่ต่อ HOSxP จริง
//   npm run test:hosxp

import assert from "node:assert/strict";
import {
  HosxpDisabledError,
  HosxpWriteAttemptError,
  hosxpSelect,
} from "@/lib/hosxp/client";
import { hosxpConfig, isHosxpEnabled } from "@/lib/hosxp/env";
import { isOptionKind, loadOptions } from "@/lib/hosxp/queries";
import { formatThaiDate, formatTime, isIsoDate } from "@/lib/form/thai-date";
import {
  formatDiagnosisLine,
  formatVitalSigns,
  formatXrayBlock,
} from "@/lib/hosxp/visit";

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

async function expectReject(sql: string, kind: "write" | "disabled") {
  try {
    await hosxpSelect(sql);
    throw new Error(`ควร throw แต่ผ่านไปได้: ${sql.slice(0, 60)}`);
  } catch (e) {
    if (kind === "write") {
      assert.ok(
        e instanceof HosxpWriteAttemptError,
        `ควรเป็น HosxpWriteAttemptError แต่ได้ ${(e as Error).name}: ${(e as Error).message}`,
      );
    } else {
      assert.ok(e instanceof HosxpDisabledError, `ควรเป็น HosxpDisabledError`);
    }
  }
}

async function main() {
  console.log("\n── HOSxP ปิดอยู่ (default) ──");

  await test("HOSXP_ENABLED ไม่ได้ตั้ง → ถือว่าปิด", () => {
    delete process.env.HOSXP_ENABLED;
    assert.equal(isHosxpEnabled(), false);
  });

  await test("ปิดอยู่แล้วยิง SELECT → HosxpDisabledError", async () => {
    delete process.env.HOSXP_ENABLED;
    await expectReject("SELECT 1", "disabled");
  });

  await test("ปิดอยู่ → loadOptions คืนลิสต์ว่าง ไม่ throw (ฟอร์มต้องยังกรอกได้)", async () => {
    delete process.env.HOSXP_ENABLED;
    const r = await loadOptions("departments");
    assert.deepEqual(r.items, []);
    assert.equal(r.available, false);
    assert.ok(r.reason && r.reason.length > 0);
  });

  console.log("\n── guard: ห้ามเขียน HOSxP ──");

  // เปิด flag เพื่อให้ guard ทำงานถึงชั้นตรวจ SQL (ยังไม่ได้ต่อ DB จริง)
  process.env.HOSXP_ENABLED = "true";
  process.env.HOSXP_DB_HOST = "127.0.0.1";
  process.env.HOSXP_DB_USER = "readonly";
  process.env.HOSXP_DB_PASS = "x";

  const writes = [
    "INSERT INTO ovst (vn) VALUES ('x')",
    "UPDATE patient SET fname = 'x'",
    "DELETE FROM ovst",
    "DROP TABLE ovst",
    "TRUNCATE TABLE ovst",
    "ALTER TABLE ovst ADD COLUMN x INT",
    "CREATE TABLE t (id INT)",
    "GRANT ALL ON hos.* TO 'x'",
    "REPLACE INTO ovst VALUES (1)",
    "  update patient set fname='x'  ",
  ];

  for (const sql of writes) {
    await test(`ปฏิเสธ: ${sql.trim().slice(0, 42)}`, async () => {
      await expectReject(sql, "write");
    });
  }

  await test("ปฏิเสธ stacked query แม้ขึ้นต้นด้วย SELECT", async () => {
    await expectReject("SELECT 1; DROP TABLE ovst", "write");
  });

  await test("ปฏิเสธคำสั่งที่ซ่อนคำเขียนไว้กลาง SQL", async () => {
    await expectReject(
      "SELECT * FROM (SELECT 1) x UNION SELECT 1 FROM ovst WHERE 1=1 AND (SET @a=1)",
      "write",
    );
  });

  await test("ปฏิเสธ SQL ที่ไม่ขึ้นต้นด้วย SELECT (เช่น WITH)", async () => {
    await expectReject("WITH t AS (SELECT 1) SELECT * FROM t", "write");
  });

  console.log("\n── สืบค่าจาก AUTH_DB_* (เครื่องเดียวกัน) ──");

  /** ตั้ง env ชั่วคราวแล้วคืนค่าเดิมเสมอ ไม่ให้เทสต์ก่อนหน้ารั่วไปข้อถัดไป */
  function withEnv(patch: Record<string, string | undefined>, fn: () => void) {
    const keys = Object.keys(patch);
    const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      for (const k of keys) {
        if (patch[k] === undefined) delete process.env[k];
        else process.env[k] = patch[k];
      }
      fn();
    } finally {
      for (const k of keys) {
        if (before[k] === undefined) delete process.env[k];
        else process.env[k] = before[k];
      }
    }
  }

  const AUTH_ONLY = {
    HOSXP_ENABLED: undefined,
    HOSXP_DB_HOST: undefined,
    HOSXP_DB_PORT: undefined,
    HOSXP_DB_USER: undefined,
    HOSXP_DB_PASS: undefined,
    HOSXP_DB_NAME: undefined,
    AUTH_DB_HOST: "10.0.0.9",
    AUTH_DB_PORT: "3306",
    AUTH_DB_USER: "hosuser",
    AUTH_DB_PASS: "hospass",
    AUTH_DB_NAME: "ppchos",
  };

  await test("ตั้งแค่ AUTH_DB_* ก็เปิด HOSxP ให้เอง ไม่ต้องใส่ HOSXP_ENABLED=true", () => {
    withEnv(AUTH_ONLY, () => {
      assert.equal(isHosxpEnabled(), true);
      const cfg = hosxpConfig();
      assert.equal(cfg.host, "10.0.0.9");
      assert.equal(cfg.user, "hosuser");
      assert.equal(cfg.password, "hospass");
    });
  });

  await test("ไม่สืบทอดชื่อฐานจาก AUTH_DB_NAME — ฐานผู้ใช้กับฐาน HOSxP คนละฐานได้", () => {
    withEnv(AUTH_ONLY, () => {
      // ปล่อยว่างไว้ แล้วให้ queries.ts ไปหาเองว่าตารางอยู่ฐานไหน
      assert.equal(hosxpConfig().database, undefined);
    });
  });

  await test("HOSXP_DB_* ที่ตั้งไว้เองต้องชนะค่าที่สืบมา", () => {
    withEnv({ ...AUTH_ONLY, HOSXP_DB_HOST: "10.0.0.20", HOSXP_DB_NAME: "hos" }, () => {
      const cfg = hosxpConfig();
      assert.equal(cfg.host, "10.0.0.20");
      assert.equal(cfg.database, "hos");
      // ที่ไม่ได้ตั้งยังสืบจาก AUTH_DB_* ต่อ
      assert.equal(cfg.user, "hosuser");
    });
  });

  await test("HOSXP_ENABLED=false สั่งปิดได้เสมอ แม้ค่าจะครบ", () => {
    withEnv({ ...AUTH_ONLY, HOSXP_ENABLED: "false" }, () => {
      assert.equal(isHosxpEnabled(), false);
    });
  });

  await test("ไม่มีค่าให้ต่อเลย = ปิด และ hosxpConfig ต้อง throw ไม่ใช่ต่อมั่ว", () => {
    withEnv({ ...AUTH_ONLY, AUTH_DB_HOST: undefined, AUTH_DB_USER: undefined }, () => {
      assert.equal(isHosxpEnabled(), false);
      assert.throws(() => hosxpConfig(), /ไม่ครบ/);
    });
  });

  await test("ค่าว่างถือว่าไม่ได้ตั้ง (ไม่ใช่ host ชื่อ \"\")", () => {
    withEnv({ ...AUTH_ONLY, HOSXP_DB_HOST: "" }, () => {
      assert.equal(hosxpConfig().host, "10.0.0.9");
    });
  });

  console.log("\n── option kind ──");

  await test("รับเฉพาะ kind ที่รู้จัก", () => {
    assert.equal(isOptionKind("departments"), true);
    assert.equal(isOptionKind("pttypes"), true);
    assert.equal(isOptionKind("patients"), false);
    assert.equal(isOptionKind(""), false);
  });

  console.log("\n── วันที่ไทย ──");

  await test("ISO → วันที่ไทย พ.ศ.", () => {
    assert.equal(formatThaiDate("2026-08-14"), "14 สิงหาคม 2569");
    assert.equal(formatThaiDate("2025-01-01"), "1 มกราคม 2568");
    assert.equal(formatThaiDate("2026-12-31"), "31 ธันวาคม 2569");
  });

  await test("ข้อความอิสระส่งผ่านเหมือนเดิม (ฟอร์มเก่าที่พิมพ์ไว้)", () => {
    assert.equal(formatThaiDate("14 สิงหาคม 2569"), "14 สิงหาคม 2569");
    assert.equal(formatThaiDate("วันนี้"), "วันนี้");
  });

  await test("ค่าว่างคืนสตริงว่าง", () => {
    assert.equal(formatThaiDate(null), "");
    assert.equal(formatThaiDate(undefined), "");
    assert.equal(formatThaiDate("   "), "");
  });

  await test("วันที่ที่ไม่มีในปฏิทินไม่ถือเป็น ISO", () => {
    assert.equal(isIsoDate("2026-02-30"), false);
    assert.equal(isIsoDate("2026-13-01"), false);
    assert.equal(isIsoDate("2026-8-14"), false);
    assert.equal(isIsoDate("2026-02-28"), true);
    // ปีอธิกสุรทิน
    assert.equal(isIsoDate("2028-02-29"), true);
    assert.equal(isIsoDate("2027-02-29"), false);
  });

  console.log("\n── เวลา ──");

  await test("normalize เป็น HH:mm", () => {
    assert.equal(formatTime("09:15"), "09:15");
    assert.equal(formatTime("9:15"), "09:15");
    assert.equal(formatTime("09:15:30"), "09:15");
    assert.equal(formatTime("23:59"), "23:59");
  });

  await test("เวลาที่ไม่เข้ารูปแบบส่งผ่านเหมือนเดิม", () => {
    assert.equal(formatTime("เช้า"), "เช้า");
    assert.equal(formatTime("25:00"), "25:00");
    assert.equal(formatTime("09:99"), "09:99");
    assert.equal(formatTime(null), "");
  });

  console.log("\n── ข้อความที่เติมให้จาก HOSxP ──");

  await test("สัญญาณชีพ: ข้ามค่าที่ไม่มี ไม่เขียน BP: - ให้รก", () => {
    assert.equal(
      formatVitalSigns({ bps: 120, bpd: 80, pulse: 72, temperature: "36.8" }),
      "BP 120/80 mmHg  PR 72 /min  BT 36.8 °C",
    );
    assert.equal(formatVitalSigns({ pulse: 88 }), "PR 88 /min");
    assert.equal(formatVitalSigns({}), "");
  });

  await test("ความดันต้องมีครบทั้งบน-ล่างจึงเขียน", () => {
    // มีแค่ตัวบนแล้วเขียน "BP 120/" ออกไปคือข้อมูลผิด
    assert.equal(formatVitalSigns({ bps: 120 }), "");
    assert.equal(formatVitalSigns({ bpd: 80 }), "");
  });

  await test("คำวินิจฉัย: ชื่อโรคขึ้นก่อนเสมอ รหัสอยู่ในวงเล็บ", () => {
    // คู่มือ สนย. หน้า 5 ห้ามใช้รหัส ICD แทนคำวินิจฉัย
    // เกณฑ์ DIAGNOSIS ให้ 0 คะแนนถ้าเจอรหัสแทนคำวินิจฉัย
    assert.equal(
      formatDiagnosisLine("Acute pharyngitis", "J029"),
      "Acute pharyngitis (J029)",
    );
    assert.equal(formatDiagnosisLine("Acute pharyngitis", ""), "Acute pharyngitis");
  });

  await test("ไม่มีชื่อโรคก็ต้องไม่ออกมาเป็นรหัสเปล่าๆ", () => {
    // ใส่วงเล็บไว้ให้เห็นชัดว่าเป็นรหัส ไม่ใช่คำวินิจฉัย คนกรอกจะได้รู้ว่าต้องเติม
    assert.equal(formatDiagnosisLine("", "J029"), "(J029)");
    assert.equal(formatDiagnosisLine(null, null), "");
  });

  await test("เอกซเรย์ที่ยังไม่มีผลอ่าน ต้องเขียนบอก ไม่ใช่ปล่อยว่าง", () => {
    const block = formatXrayBlock("Chest X-ray(Pacs)", "", "");
    assert.match(block, /X-ray: Chest X-ray\(Pacs\)/);
    assert.match(block, /ยังไม่มีผลอ่านฟิล์มในระบบ/);
  });

  await test("เอกซเรย์ที่มีผลอ่าน ใส่ผลและชื่อผู้รายงาน", () => {
    const block = formatXrayBlock("Chest X-ray(Pacs)", "No active lung lesion.", "รังสีแพทย์");
    assert.equal(block, "X-ray: Chest X-ray(Pacs)\nNo active lung lesion. (ผู้รายงาน: รังสีแพทย์)");
  });

  await test("ไม่มีรายการเอกซเรย์เลย → คืนค่าว่าง ไม่ใช่หัวข้อลอยๆ", () => {
    assert.equal(formatXrayBlock("", "อะไรก็ตาม", "ใครก็ตาม"), "");
    assert.equal(formatXrayBlock(null, null, null), "");
  });

  console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
