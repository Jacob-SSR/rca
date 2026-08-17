// app/api/hosxp/options/route.ts
// GET /api/hosxp/options?kind=departments|pttypes
// ตัวเลือกสำหรับ dropdown ในฟอร์ม — ดึงจาก HOSxP แบบอ่านอย่างเดียว
//
// ตอบ 200 พร้อม available=false เมื่อ HOSxP ปิด/ต่อไม่ได้ ไม่ตอบ error
// เพราะ "เลือกจากรายการไม่ได้" ไม่ควรทำให้หน้าฟอร์มพัง — UI จะสลับเป็นช่องพิมพ์เอง

import { NextResponse, type NextRequest } from "next/server";
import { isOptionKind, loadOptions } from "@/lib/hosxp/queries";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const kind = new URL(req.url).searchParams.get("kind") ?? "";

  if (!isOptionKind(kind)) {
    return NextResponse.json(
      { error: "kind ต้องเป็น departments หรือ pttypes" },
      { status: 400 },
    );
  }

  const result = await loadOptions(kind);
  return NextResponse.json(result);
}
