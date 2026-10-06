// app/api/admin/auto-audit/run/route.ts
// POST — สั่งรันตรวจอัตโนมัติเดี๋ยวนี้ (ไม่ต้องรอเวลา) เลือกวันที่ของ visit ได้
//
// รอบหนึ่งอาจใช้หลายนาที (AI ทีละราย) — ตอบกลับทันทีแล้วรันต่อเบื้องหลัง
// หน้าตั้งค่าจะ poll GET /api/admin/auto-audit ดูความคืบหน้าเอง

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { isHosxpEnabled } from "@/lib/hosxp/env";
import { normalizeVisitDate } from "@/lib/hosxp/visit";
import { bangkokParts } from "@/lib/auto-audit/schedule";
import { runAutoAudit, runningRun } from "@/lib/auto-audit/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireCapability("manage");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  if (!isHosxpEnabled()) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { targetDate?: unknown };
  let targetDate: string | undefined;
  if (body.targetDate) {
    const d = normalizeVisitDate(body.targetDate);
    if (!d) return NextResponse.json({ error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    if (d > bangkokParts(new Date()).date) {
      return NextResponse.json({ error: "วันที่อยู่ในอนาคต" }, { status: 400 });
    }
    targetDate = d;
  }

  if (await runningRun()) {
    return NextResponse.json({ error: "มีรอบตรวจที่กำลังทำงานอยู่ — รอให้เสร็จก่อน" }, { status: 409 });
  }

  // ไม่ await — ปล่อยรันเบื้องหลัง ข้อผิดพลาดถูกบันทึกลงแถวของรอบนั้นเอง
  void runAutoAudit({ trigger: "manual", targetDate, startedBy: session.username }).catch((e) =>
    console.error("auto-audit: รันเองไม่สำเร็จ:", e),
  );

  return NextResponse.json({ ok: true }, { status: 202 });
}
