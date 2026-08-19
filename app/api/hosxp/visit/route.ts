// app/api/hosxp/visit/route.ts
// GET — ข้อมูล visit จาก HOSxP สำหรับเติมฟอร์มบันทึกเวชระเบียน
//
//   ?hn=12345678&list=1     → รายการ visit ทั้งหมดของ HN นั้น (ไว้ให้กดเลือก)
//   ?vn=330000001           → เติมฟอร์มจาก visit ที่เลือก
//   ?hn=12345678            → เติมจาก visit ล่าสุด
//   ?hn=12345678&date=...   → เติมจาก visit วันนั้น
//
// ⚠️ ผลลัพธ์มีชื่อผู้ป่วยและ HN ซึ่งเป็น PHI — ต้องมีสิทธิ์ review

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { isHosxpEnabled } from "@/lib/hosxp/env";
import { listVisits, lookupVisit } from "@/lib/hosxp/visit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** HN/VN ของ HOSxP เป็นตัวเลข/ตัวอักษรล้วน — จำกัดรูปแบบก่อนส่งลง query */
const ID = /^[A-Za-z0-9-]{1,20}$/;

export async function GET(req: NextRequest) {
  try {
    await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const q = req.nextUrl.searchParams;
  const hn = (q.get("hn") ?? "").trim();
  const vn = (q.get("vn") ?? "").trim();

  // ── รายการ visit ให้กดเลือก ────────────────────────────────────────────────
  if (q.get("list") === "1") {
    if (!ID.test(hn)) {
      return NextResponse.json({ available: false, reason: "HN ไม่ถูกรูปแบบ" }, { status: 400 });
    }

    if (!isHosxpEnabled()) {
      return NextResponse.json({
        available: false,
        reason: "ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP — เลือกวันที่เองได้ตามปกติ",
      });
    }

    try {
      const visits = await listVisits(hn);
      return NextResponse.json({
        available: true,
        visits,
        ...(visits.length === 0 ? { reason: `ไม่พบ visit ของ HN ${hn}` } : {}),
      });
    } catch (e) {
      console.error("hosxp: ดึงรายการ visit ไม่สำเร็จ:", e);
      return NextResponse.json({
        available: false,
        reason: "ต่อ HOSxP ไม่ได้ในขณะนี้ — เลือกวันที่เองได้ตามปกติ",
      });
    }
  }

  // ── เติมฟอร์ม ──────────────────────────────────────────────────────────────
  if (vn !== "" && !ID.test(vn)) {
    return NextResponse.json({ available: false, reason: "VN ไม่ถูกรูปแบบ" }, { status: 400 });
  }
  if (vn === "" && !ID.test(hn)) {
    return NextResponse.json({ available: false, reason: "HN ไม่ถูกรูปแบบ" }, { status: 400 });
  }

  return NextResponse.json(await lookupVisit({ hn, vn, date: q.get("date") }));
}
