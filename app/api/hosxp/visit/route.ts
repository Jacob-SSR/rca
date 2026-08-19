// app/api/hosxp/visit/route.ts
// GET — ดึงข้อมูล visit มาเติมฟอร์มบันทึกเวชระเบียนอัตโนมัติ
//
//   /api/hosxp/visit?hn=12345678            → visit ล่าสุด
//   /api/hosxp/visit?hn=12345678&date=...   → visit วันนั้น
//
// ⚠️ ผลลัพธ์มีชื่อผู้ป่วยและ HN ซึ่งเป็น PHI — ต้องมีสิทธิ์ review

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { lookupVisit } from "@/lib/hosxp/visit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const q = req.nextUrl.searchParams;
  const hn = (q.get("hn") ?? "").trim();

  if (!/^[A-Za-z0-9-]{1,20}$/.test(hn)) {
    return NextResponse.json({ available: false, reason: "HN ไม่ถูกรูปแบบ" }, { status: 400 });
  }

  return NextResponse.json(await lookupVisit(hn, q.get("date")));
}
