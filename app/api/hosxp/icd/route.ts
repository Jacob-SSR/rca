// app/api/hosxp/icd/route.ts
// GET — ดึงรหัส ICD ที่มีอยู่แล้วใน HOSxP มาเติมฟอร์ม A2/A4
//
//   /api/hosxp/icd?kind=opd&key=12345678&date=2026-08-18
//   /api/hosxp/icd?kind=ipd&key=58000015
//
// ⚠️ ผลลัพธ์มี HN/AN ซึ่งเป็น PHI — ต้องล็อกอินและมีสิทธิ์ review เท่านั้น
//    (ต่างจาก /api/hosxp/options ที่คืนแค่รายชื่อแผนก ไม่มีข้อมูลผู้ป่วย)

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { lookupIcd } from "@/lib/hosxp/icd";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const q = req.nextUrl.searchParams;
  const kind = q.get("kind") === "ipd" ? "ipd" : "opd";
  const key = (q.get("key") ?? "").trim();
  const date = q.get("date");

  // จำกัดรูปแบบก่อนส่งลง query — HN/AN ของ HOSxP เป็นตัวเลข/ตัวอักษรล้วน
  if (!/^[A-Za-z0-9-]{1,20}$/.test(key)) {
    return NextResponse.json(
      { available: false, reason: kind === "opd" ? "HN ไม่ถูกรูปแบบ" : "AN ไม่ถูกรูปแบบ" },
      { status: 400 },
    );
  }

  return NextResponse.json(await lookupIcd(kind, key, date));
}
