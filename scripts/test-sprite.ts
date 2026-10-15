// scripts/test-sprite.ts
// เทสต์การคำนวณเฟรมของ sprite sheet (lib/sprite.ts) — npm run test:sprite

import assert from "node:assert/strict";
import { frameAt, framePosition } from "@/lib/sprite";

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

console.log("\n── sprite sheet ──");

test("ตำแหน่งเฟรมแรก/กลาง/สุดท้ายของแถบแนวนอน", () => {
  assert.equal(framePosition(0, 5), "0% 0%");
  assert.equal(framePosition(2, 5), "50% 0%");
  assert.equal(framePosition(4, 5), "100% 0%");
});

test("เฟรมนอกช่วงถูกบีบให้อยู่ในแถบ · แถบเฟรมเดียวไม่หารศูนย์", () => {
  assert.equal(framePosition(9, 5), "100% 0%");
  assert.equal(framePosition(-1, 5), "0% 0%");
  assert.equal(framePosition(3, 1), "0% 0%");
});

test("4 fps = เฟรมละ 250ms และวนกลับเฟรมแรก", () => {
  const o = { fps: 4, frames: 8, loop: true };
  assert.equal(frameAt(0, o).index, 0);
  assert.equal(frameAt(249, o).index, 0);
  assert.equal(frameAt(250, o).index, 1);
  assert.equal(frameAt(1999, o).index, 7);
  assert.equal(frameAt(2000, o).index, 0);
  assert.equal(frameAt(1999, o).next, 0); // เฟรมสุดท้ายต่อด้วยเฟรมแรก
});

test("ไม่วน: ค้างที่เฟรมสุดท้ายและบอกว่าจบ", () => {
  const o = { fps: 2, frames: 5, loop: false };
  assert.deepEqual(frameAt(1999, o), { index: 3, next: 4, blend: 0, done: false });
  const end = frameAt(5000, o);
  assert.equal(end.index, 4);
  assert.equal(end.next, null);
  assert.equal(end.done, true);
});

test("เฟดเฉพาะช่วงท้ายของเฟรม (blendMs)", () => {
  const o = { fps: 2, frames: 5, loop: true, blendMs: 200 }; // เฟรมละ 500ms เฟดช่วง 300–500
  assert.equal(frameAt(100, o).blend, 0);
  assert.equal(frameAt(300, o).blend, 0);
  assert.equal(frameAt(400, o).blend, 0.5);
  assert.equal(frameAt(499.99, o).blend > 0.99, true);
  assert.equal(frameAt(500, o).blend, 0); // เข้าเฟรมใหม่แล้ว
});

test("blendMs เกินเวลาเฟรมถูกบีบ · fps เป็นศูนย์ไม่พัง", () => {
  const f = frameAt(250, { fps: 2, frames: 3, loop: true, blendMs: 9999 });
  assert.equal(f.blend, 0.5);
  assert.equal(frameAt(100, { fps: 0, frames: 3, loop: true }).index, 0);
});

console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
if (failed > 0) process.exit(1);
