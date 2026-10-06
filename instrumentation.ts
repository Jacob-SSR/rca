// instrumentation.ts
// Next.js เรียก register() ครั้งเดียวตอน server บูต — ใช้เริ่มตัวตั้งเวลาตรวจอัตโนมัติ
// import แบบ dynamic และเฉพาะ runtime nodejs เพราะตัวรันใช้ Prisma/mysql2 ที่ไม่มีบน edge

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoAuditScheduler } = await import("@/lib/auto-audit/scheduler");
    startAutoAuditScheduler();
  }
}
