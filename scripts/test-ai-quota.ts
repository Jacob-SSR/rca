// scripts/test-ai-quota.ts
// เทสต์การตรวจจับ "โควตา AI หมด" + คำนวณเวลารีเซ็ต
//   npm run test:quota

import assert from "node:assert/strict";
import {
  clearQuotaBlock,
  currentQuotaBlock,
  detectQuotaError,
  formatRemainingThai,
  nextPacificMidnight,
  rememberQuotaBlock,
} from "@/lib/ai/quota";

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

/** จำลอง ApiError ของ @google/genai — status + message ที่มี JSON ของ Google ฝังอยู่ */
function apiError(quotaId: string, retryDelay: string) {
  const body = {
    error: {
      code: 429,
      message: "You exceeded your current quota, please check your plan and billing details.",
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId }],
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
      ],
    },
  };
  return Object.assign(new Error(JSON.stringify(body)), { status: 429 });
}

const now = new Date("2026-10-06T03:00:00Z"); // 10:00 เวลาไทย · 20:00 PDT วันก่อน

test("เที่ยงคืนแปซิฟิก ช่วง PDT (UTC-7) → 07:00Z", () => {
  assert.equal(nextPacificMidnight(now).toISOString(), "2026-10-06T07:00:00.000Z");
});

test("เที่ยงคืนแปซิฟิก ช่วง PST (UTC-8) → 08:00Z ข้ามเดือน", () => {
  assert.equal(nextPacificMidnight(new Date("2026-12-31T20:00:00Z")).toISOString(), "2027-01-01T08:00:00.000Z");
});

test("โควตารายวัน → รีเซ็ตเที่ยงคืนแปซิฟิก", () => {
  const q = detectQuotaError(apiError("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "40s"), now);
  assert.ok(q);
  assert.equal(q.scope, "day");
  assert.equal(q.resetAt, "2026-10-06T07:00:00.000Z");
});

test("โควตาต่อนาที → รอตาม retryDelay", () => {
  const q = detectQuotaError(apiError("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "37s"), now);
  assert.ok(q);
  assert.equal(q.scope, "minute");
  assert.equal(new Date(q.resetAt).getTime() - now.getTime(), 39_000);
});

test("error อื่นที่ไม่ใช่โควตา → null", () => {
  assert.equal(detectQuotaError(Object.assign(new Error("API key not valid"), { status: 400 }), now), null);
  assert.equal(detectQuotaError(new Error("fetch failed"), now), null);
});

test("429 ที่ไม่มีรายละเอียด → ถือเป็นรายวันไว้ก่อน", () => {
  const q = detectQuotaError(Object.assign(new Error("Too Many Requests"), { status: 429 }), now);
  assert.equal(q?.scope, "day");
});

test("จำสถานะไว้ และล้างเองเมื่อถึงเวลารีเซ็ต", () => {
  clearQuotaBlock();
  rememberQuotaBlock({ scope: "minute", resetAt: "2026-10-06T03:01:00.000Z", detail: "" }, now);
  assert.ok(currentQuotaBlock(now));
  assert.equal(currentQuotaBlock(new Date("2026-10-06T03:01:00Z")), null);
});

test("แสดงเวลาที่เหลือเป็นภาษาไทย", () => {
  assert.equal(formatRemainingThai((2 * 1440 + 3 * 60 + 15) * 60_000), "2 วัน 3 ชั่วโมง 15 นาที");
  assert.equal(formatRemainingThai(4 * 3600_000), "4 ชั่วโมง");
  assert.equal(formatRemainingThai(30_000), "1 นาที");
});

console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ${passed + failed} เทสต์\n`);
process.exit(failed === 0 ? 0 : 1);
