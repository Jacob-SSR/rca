// lib/auth/rate-limit.ts
// Rate limiter แบบ sliding window เก็บใน memory ของ process
//
// ppc-hos-10667 ใช้ Redis เพราะรันหลาย instance และมี rate limit หลายจุด
// RCA รัน container เดียว ไม่มี Redis ในระบบ — เก็บใน memory จึงพอ
// และไม่ต้องเพิ่ม service ใหม่มาให้ดูแล
//
// ข้อจำกัดที่ยอมรับ: รีสตาร์ต container แล้วตัวนับหาย
// (ถ้าวันหนึ่งรันหลาย replica ต้องย้ายไป Redis — จุดที่ต้องแก้อยู่ในไฟล์นี้ไฟล์เดียว)

const globalForRateLimit = globalThis as unknown as {
  rlBuckets?: Map<string, number[]>;
};

const buckets: Map<string, number[]> =
  globalForRateLimit.rlBuckets ?? (globalForRateLimit.rlBuckets = new Map());

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
  limit: number;
};

/** ป้องกัน map โตไม่จำกัดเมื่อมีคนยิงด้วย key สุ่มไปเรื่อยๆ */
const MAX_KEYS = 10_000;

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    const oldest = hits[0];
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    buckets.set(key, hits);
    return { ok: false, remaining: 0, retryAfterSec, limit };
  }

  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > MAX_KEYS) {
    for (const [k, v] of buckets) {
      if (v.length === 0 || v[v.length - 1] <= cutoff) buckets.delete(k);
      if (buckets.size <= MAX_KEYS) break;
    }
  }

  return { ok: true, remaining: limit - hits.length, retryAfterSec: 0, limit };
}

/** ล้างตัวนับของ key นั้น — ใช้ตอนล็อกอินสำเร็จ จะได้ไม่ค้าง limit ไว้ */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * IP ของ client — อยู่หลัง reverse proxy จึงต้องอ่านจาก header
 * ⚠️ header พวกนี้ปลอมได้ ใช้เป็น "ตัวแบ่งกลุ่ม" ของ rate limit เท่านั้น
 *    ห้ามเอาไปใช้ตัดสินสิทธิ์
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
