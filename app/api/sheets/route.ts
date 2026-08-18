// app/api/sheets/route.ts
// GET  — รายการแผ่นงาน (กรองด้วย ?form=A1)
// POST — สร้างแผ่นงานใหม่

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import {
  AuditFormError,
  createAuditSheet,
  listAuditSheets,
} from "@/lib/audit-forms/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const form = req.nextUrl.searchParams.get("form") ?? undefined;
  return NextResponse.json({ sheets: await listAuditSheets(form) });
}

export async function POST(req: NextRequest) {
  let actor: string | null = null;
  try {
    // สร้าง/แก้ฟอร์มตรวจสอบคุณภาพต้องมีสิทธิ์ review ไม่ใช่แค่ดูได้
    actor = (await requireCapability("review")).username;
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const sheet = await createAuditSheet({ ...body, actor });
    return NextResponse.json({ sheet }, { status: 201 });
  } catch (e) {
    if (e instanceof AuditFormError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("สร้างแผ่นงานไม่สำเร็จ:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
