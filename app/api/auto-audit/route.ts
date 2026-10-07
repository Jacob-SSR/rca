// app/api/auto-audit/route.ts
// GET — ค่าตั้งค่าตรวจอัตโนมัติ + ประวัติรอบล่าสุด (ทุกคนที่ล็อกอินดูได้)
// PUT — บันทึกตารางเวลาของทั้งระบบ (เปิด/ปิด เวลา วัน จำนวน แผนก) — เฉพาะสิทธิ์ manage
//
// ทุกคนกด "ตรวจเดี๋ยวนี้" ของแผนกตัวเองได้ (ดู ./run) แต่ตารางเวลามีชุดเดียวทั้งโรงพยาบาล
// ถ้าใครก็แก้ได้ คนหนึ่งเปลี่ยนแผนก/เวลาแล้วรอบของอีกหน่วยจะหายไปเงียบ ๆ

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/auth/session";
import { hasCapability } from "@/lib/auth/permissions";
import { authErrorResponse } from "@/lib/auth/api";
import { isHosxpEnabled } from "@/lib/hosxp/env";
import { autoRunKey, bangkokParts, nextRun, settingsSchema } from "@/lib/auto-audit/schedule";
import { loadSettings, runningRun, saveSettings } from "@/lib/auto-audit/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let session;
  try {
    session = await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const settings = await loadSettings();
  const now = new Date();
  const today = bangkokParts(now).date;
  const [runs, ranToday, running] = await Promise.all([
    prisma.autoAuditRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.autoAuditRun.findUnique({ where: { runKey: autoRunKey(today) }, select: { id: true } }),
    runningRun(),
  ]);

  return NextResponse.json({
    canManage: hasCapability(session.role, "manage"),
    settings,
    nextRun: nextRun(settings, now, !!ranToday),
    hosxpEnabled: isHosxpEnabled(),
    running: running ? { id: running.id, targetDate: running.targetDate } : null,
    runs,
  });
}

export async function PUT(req: NextRequest) {
  let session;
  try {
    session = await requireCapability("manage");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "ค่าตั้งค่าไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  await saveSettings(parsed.data, session.username);
  return NextResponse.json({ ok: true });
}
