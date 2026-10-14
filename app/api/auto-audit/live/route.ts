// app/api/auto-audit/live/route.ts
// GET — สถานะแบบเบาของรอบตรวจอัตโนมัติ สำหรับวิดเจ็ตมุมจอที่อยู่ทุกหน้า
// ไม่ดึงค่าตั้งค่า/ประวัติ 30 รอบแบบ GET /api/auto-audit — วิดเจ็ต poll บ่อย ต้องถูก
//
// { running: null } = ไม่มีรอบกำลังรัน (น้องนั่งพักจิบกาแฟ)
// { running: { id, targetDate, reviewed, failed, target, live } } — live ดู lib/auto-audit/progress.ts

import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { quotasOf, runFiltersSchema, runTarget } from "@/lib/auto-audit/schedule";
import { runningRun } from "@/lib/auto-audit/runner";
import { liveProgress } from "@/lib/auto-audit/progress";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const run = await runningRun();
  if (!run) return NextResponse.json({ running: null });

  const filters = runFiltersSchema.safeParse(run.filters ?? {});
  const target = runTarget(
    { departments: filters.success ? filters.data.departments : [], quotas: quotasOf(filters.success ? filters.data.rules : {}) },
    run.visitLimit,
  );
  return NextResponse.json({
    running: {
      id: run.id,
      targetDate: run.targetDate,
      reviewed: run.reviewed,
      failed: run.failed,
      target,
      live: liveProgress(run.id),
    },
  });
}
