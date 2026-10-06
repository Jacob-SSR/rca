// app/api/hosxp/patients/route.ts
// GET ?q=<เลขบัตรประชาชน หรือ ชื่อ-สกุล> → รายชื่อผู้ป่วยที่ตรง (ไว้กดเลือกเพื่อได้ HN)
//
// ⚠️ ผลลัพธ์เป็น PHI — ต้องมีสิทธิ์ review และห้าม log คำค้น

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { isHosxpEnabled } from "@/lib/hosxp/env";
import { parsePatientQuery, searchPatients } from "@/lib/hosxp/patient-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const q = parsePatientQuery(req.nextUrl.searchParams.get("q") ?? "");
  if (q.kind === "invalid") {
    return NextResponse.json({ available: false, reason: q.reason }, { status: 400 });
  }

  if (!isHosxpEnabled()) {
    return NextResponse.json({
      available: false,
      reason: "ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP — กรอกฟอร์มเองได้ตามปกติ",
    });
  }

  try {
    const patients = await searchPatients(q);
    return NextResponse.json({
      available: true,
      patients,
      ...(patients.length === 0
        ? { reason: q.kind === "cid" ? "ไม่พบผู้ป่วยที่มีเลขบัตรนี้" : "ไม่พบผู้ป่วยชื่อนี้" }
        : {}),
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    console.error("hosxp: ค้นหาผู้ป่วยไม่สำเร็จ:", code ?? (e instanceof Error ? e.name : "error"));
    return NextResponse.json({
      available: false,
      reason:
        code === "ER_ACCESS_DENIED_ERROR" || code === "ER_TABLEACCESS_DENIED_ERROR"
          ? "user ที่ใช้ต่อ HOSxP ไม่มีสิทธิ์อ่านตาราง patient — แจ้งผู้ดูแลระบบ"
          : "ต่อ HOSxP ไม่ได้ในขณะนี้",
    });
  }
}
