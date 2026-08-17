// scripts/test-auth.ts
// เทสต์ระบบสิทธิ์ + rate limit + การตรวจรหัสผ่าน
// รันได้โดยไม่ต้องต่อฐานข้อมูลผู้ใช้จริง
//   npm run test:auth

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  ROLE_CAPABILITIES,
  canAccessPath,
  canAccessRequest,
  capabilitiesForRole,
  hasCapability,
  isPublicPath,
  requiredCapability,
} from "@/lib/auth/permissions";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { verifyPassword } from "@/lib/auth/password";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  const run = () => {
    passed += 1;
    console.log(`  ✅ ${name}`);
  };
  const fail = (e: unknown) => {
    failed += 1;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e instanceof Error ? e.message : String(e)}`);
  };
  try {
    const r = fn();
    if (r instanceof Promise) return r.then(run, fail);
    run();
  } catch (e) {
    fail(e);
  }
  return Promise.resolve();
}

async function main() {
  console.log("\n── deny by default ──");

  await test("role ที่ไม่รู้จัก → ไม่มีสิทธิ์อะไรเลย", () => {
    assert.deepEqual(capabilitiesForRole("PHARMACY"), []);
    assert.deepEqual(capabilitiesForRole("อะไรก็ไม่รู้"), []);
    assert.deepEqual(capabilitiesForRole(null), []);
    assert.deepEqual(capabilitiesForRole(undefined), []);
  });

  await test("USER (ยังไม่ตั้ง role) → ยังไม่มีสิทธิ์", () => {
    assert.deepEqual(capabilitiesForRole("USER"), []);
    assert.equal(canAccessPath("USER", "/"), false);
  });

  await test("path ที่ไม่ตรงกฎไหนเลย ต้องใช้สิทธิ์ view เป็นอย่างน้อย", () => {
    assert.equal(requiredCapability("/route/ที่/เพิ่ง/สร้าง"), "view");
    assert.equal(canAccessPath(null, "/route/ที่/เพิ่ง/สร้าง"), false);
  });

  console.log("\n── public paths ──");

  await test("หน้า login และ API auth เข้าได้โดยไม่ล็อกอิน", () => {
    for (const p of ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/me"]) {
      assert.equal(isPublicPath(p), true, p);
    }
  });

  await test("path อื่นไม่ public", () => {
    for (const p of ["/", "/api/review", "/api/cases", "/cases/abc", "/loginx"]) {
      assert.equal(isPublicPath(p), false, p);
    }
  });

  await test("prefix ต้องเทียบเต็ม segment กัน /api/auth/loginx หลุด", () => {
    assert.equal(isPublicPath("/api/auth/loginx"), false);
    assert.equal(isPublicPath("/api/auth/login/extra"), true);
  });

  console.log("\n── สิทธิ์ตาม role ──");

  await test("ADMIN / DIRECTOR / DOCTOR / IT / FINANCE ทำได้ทุกอย่าง", () => {
    for (const r of ["ADMIN", "DIRECTOR", "DOCTOR", "IT", "FINANCE"]) {
      for (const c of ["view", "review", "manage"] as const) {
        assert.equal(hasCapability(r, c), true, `${r} ควรมี ${c}`);
      }
    }
  });

  await test("NURSE ตรวจได้แต่ลบไม่ได้", () => {
    assert.equal(hasCapability("NURSE", "view"), true);
    assert.equal(hasCapability("NURSE", "review"), true);
    assert.equal(hasCapability("NURSE", "manage"), false);
  });

  await test("พยาบาลรายหน่วย ดูได้อย่างเดียว", () => {
    for (const r of ["NURSE_OPD", "NURSE_IPD", "NURSE_ER", "NURSE_LR", "NURSE_IC"]) {
      assert.equal(hasCapability(r, "view"), true, r);
      assert.equal(hasCapability(r, "review"), false, r);
      assert.equal(hasCapability(r, "manage"), false, r);
    }
  });

  await test("role รับได้ทั้งตัวเล็กตัวใหญ่", () => {
    assert.equal(hasCapability("doctor", "manage"), true);
    assert.equal(hasCapability("Nurse_Opd", "view"), true);
  });

  console.log("\n── สิทธิ์ตาม method ──");

  await test("NURSE_OPD อ่านรายการเคสได้ แต่สั่งตรวจไม่ได้", () => {
    assert.equal(canAccessRequest("NURSE_OPD", "/api/cases", "GET"), true);
    assert.equal(canAccessRequest("NURSE_OPD", "/api/cases", "POST"), false);
    assert.equal(canAccessRequest("NURSE_OPD", "/api/review", "POST"), false);
  });

  await test("NURSE สั่งตรวจได้", () => {
    assert.equal(canAccessRequest("NURSE", "/api/review", "POST"), true);
  });

  await test("คนไม่มีสิทธิ์เลย อ่านก็ไม่ได้", () => {
    assert.equal(canAccessRequest("USER", "/api/cases", "GET"), false);
  });

  await test("/api/admin ต้องมีสิทธิ์ manage", () => {
    assert.equal(requiredCapability("/api/admin/anything"), "manage");
    assert.equal(canAccessRequest("NURSE", "/api/admin/x", "GET"), false);
    assert.equal(canAccessRequest("ADMIN", "/api/admin/x", "GET"), true);
  });

  console.log("\n── ตารางสิทธิ์ ──");

  await test("ทุก role ในตารางใช้ตัวพิมพ์ใหญ่ และ capability ถูกต้อง", () => {
    const valid = new Set(["view", "review", "manage"]);
    for (const [role, caps] of Object.entries(ROLE_CAPABILITIES)) {
      assert.equal(role, role.toUpperCase(), `role ${role} ต้องเป็นตัวพิมพ์ใหญ่`);
      for (const c of caps) assert.ok(valid.has(c), `${role} มี capability แปลก: ${c}`);
    }
  });

  await test("ใครที่ review ได้ ต้อง view ได้ด้วย", () => {
    for (const [role, caps] of Object.entries(ROLE_CAPABILITIES)) {
      if (caps.includes("review")) {
        assert.ok(caps.includes("view"), `${role} review ได้แต่ view ไม่ได้`);
      }
      if (caps.includes("manage")) {
        assert.ok(caps.includes("review"), `${role} manage ได้แต่ review ไม่ได้`);
      }
    }
  });

  console.log("\n── rate limit ──");

  await test("เกิน limit แล้วถูกปฏิเสธ", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i += 1) {
      assert.equal(rateLimit(key, 3, 60_000).ok, true, `ครั้งที่ ${i + 1} ควรผ่าน`);
    }
    const blocked = rateLimit(key, 3, 60_000);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterSec > 0);
  });

  await test("คนละ key ไม่กวนกัน", () => {
    const a = `test:${Math.random()}`;
    const b = `test:${Math.random()}`;
    rateLimit(a, 1, 60_000);
    assert.equal(rateLimit(a, 1, 60_000).ok, false);
    assert.equal(rateLimit(b, 1, 60_000).ok, true);
  });

  await test("reset แล้วนับใหม่", () => {
    const key = `test:${Math.random()}`;
    rateLimit(key, 1, 60_000);
    assert.equal(rateLimit(key, 1, 60_000).ok, false);
    resetRateLimit(key);
    assert.equal(rateLimit(key, 1, 60_000).ok, true);
  });

  await test("หน้าต่างเวลาผ่านไปแล้วนับใหม่", async () => {
    const key = `test:${Math.random()}`;
    assert.equal(rateLimit(key, 1, 30).ok, true);
    assert.equal(rateLimit(key, 1, 30).ok, false);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(rateLimit(key, 1, 30).ok, true);
  });

  console.log("\n── ตรวจรหัสผ่าน ──");

  await test("bcrypt ถูก/ผิด", async () => {
    const hash = await bcrypt.hash("secret123", 10);
    assert.equal(await verifyPassword("secret123", hash), true);
    assert.equal(await verifyPassword("secret124", hash), false);
  });

  await test("md5 แบบเดิมยังใช้ได้ (ตารางมีสองรูปแบบปนกัน)", async () => {
    const hash = createHash("md5").update("legacy-pass", "utf8").digest("hex");
    assert.equal(await verifyPassword("legacy-pass", hash), true);
    assert.equal(await verifyPassword("legacy-pas", hash), false);
  });

  await test("md5 ตัวพิมพ์ใหญ่ในฐานข้อมูลก็ยังตรง", async () => {
    const hash = createHash("md5").update("legacy-pass", "utf8").digest("hex").toUpperCase();
    assert.equal(await verifyPassword("legacy-pass", hash), true);
  });

  await test("hash ว่างหรือรูปแบบแปลก → ปฏิเสธ ไม่เดา", async () => {
    assert.equal(await verifyPassword("anything", ""), false);
    assert.equal(await verifyPassword("anything", "plaintext"), false);
    assert.equal(await verifyPassword("anything", "$9$notbcrypt"), false);
  });

  console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
