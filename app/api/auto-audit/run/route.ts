// app/api/auto-audit/run/route.ts
// POST — สั่งรันตรวจเดี๋ยวนี้ (ไม่ต้องรอเวลา) — ทุกคนที่ล็อกอินกดได้
//   { targetDate?, departments?: string[], rules?: { depcode: { quota, icd10 } },
//     shift?: "morning"|"afternoon"|"night", timeFrom?: "HH:mm", timeTo?: "HH:mm" }
// เคสที่รอบนี้สร้าง ผู้สร้าง = คนที่กด → แต่ละหน่วยเห็นได้ว่าเคสไหนเป็นของใคร
//
// รอบหนึ่งอาจใช้หลายนาที (AI ทีละราย) — ตอบกลับทันทีแล้วรันต่อเบื้องหลัง
// หน้าตั้งค่าจะ poll GET /api/auto-audit ดูความคืบหน้าเอง

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { isHosxpEnabled } from "@/lib/hosxp/env";
import { normalizeVisitDate } from "@/lib/hosxp/visit";
import { MAX_VISITS_CAP, bangkokParts, quotasOf, runFiltersSchema } from "@/lib/auto-audit/schedule";
import { runAutoAudit, runningRun } from "@/lib/auto-audit/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  if (!isHosxpEnabled()) {
    return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { targetDate?: unknown } & Record<string, unknown>;

  const filters = runFiltersSchema.safeParse({
    departments: Array.isArray(body.departments) ? body.departments : undefined,
    rules: isObject(body.rules) ? body.rules : undefined,
    shift: body.shift || null,
    timeFrom: body.timeFrom || null,
    timeTo: body.timeTo || null,
  });
  if (!filters.success) {
    return NextResponse.json({ error: filters.error.issues[0]?.message ?? "ตัวกรองไม่ถูกต้อง" }, { status: 400 });
  }
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
  if (Object.values(quotasOf(filters.data.rules)).reduce((a, b) => a + b, 0) > MAX_VISITS_CAP) {
    return NextResponse.json({ error: `จำนวนต่อแผนกรวมกันไม่เกิน ${MAX_VISITS_CAP} ราย` }, { status: 400 });
  }

  // ไม่ส่ง departments/rules มาเลย = ใช้ตามที่ตั้งค่าไว้ · ส่ง departments [] มา = ทุกแผนก
  const { departments, rules, ...time } = filters.data;
  void runAutoAudit({
    trigger: "manual",
    targetDate,
    startedBy: session.username,
    startedByName: session.name,
    filters: {
      ...(Array.isArray(body.departments) ? { departments } : {}),
      ...(isObject(body.rules) ? { rules } : {}),
      ...time,
    },
  }).catch((e) =>
    console.error("auto-audit: รันเองไม่สำเร็จ:", e),
  );

  return NextResponse.json({ ok: true }, { status: 202 });
}
