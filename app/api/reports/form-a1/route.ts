// app/api/reports/form-a1/route.ts
// GET — ดาวน์โหลด Form A1 (ตารางสรุปผลการตรวจหลายรายในไฟล์เดียว)
//
//   /api/reports/form-a1?from=2026-08-01&to=2026-08-31
//
// ต่างจาก /api/reviews/[id]/export ที่เป็นรายงานละเอียด "รายเคส"
// อันนี้คือแบบฟอร์มราชการที่รวมหลายเคสไว้ในตารางเดียวเพื่อส่ง สสจ.

import { NextResponse, type NextRequest } from "next/server";
import { buildFormA1 } from "@/lib/report/form-a1-query";
import { buildFormA1Docx } from "@/lib/report/form-a1-docx";
import { DOCX_MIME } from "@/lib/docx/parse";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * แปลง yyyy-mm-dd เป็นช่วงเวลาจริง
 *
 * ⚠️ ต้องกำหนด end เป็นสิ้นวัน ไม่ใช่เที่ยงคืนต้นวัน
 *    ไม่งั้นเลือก "ถึง 31 ส.ค." แล้วผลของวันที่ 31 หายไปทั้งวัน
 */
function parseDay(value: string | null, endOfDay: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const q = req.nextUrl.searchParams;
  const from = parseDay(q.get("from"), false);
  const to = parseDay(q.get("to"), true);

  if (from && to && from > to) {
    return NextResponse.json({ error: "วันที่เริ่มต้นอยู่หลังวันที่สิ้นสุด" }, { status: 400 });
  }

  const report = await buildFormA1({ from, to });

  const buffer = await buildFormA1Docx(report, {
    hospitalName: process.env.HOSPITAL_NAME,
    hospitalCode: process.env.HOSPITAL_CODE,
    reviewer: q.get("reviewer") ?? undefined,
  });

  const stamp = [q.get("from"), q.get("to")].filter(Boolean).join("_") || "ทั้งหมด";
  const fileName = `FormA1-${stamp}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="form-a1.docx"; filename*=UTF-8''${encodeURIComponent(
        fileName,
      )}`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
