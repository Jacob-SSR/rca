// app/api/sheets/[id]/export/route.ts
// GET — ดาวน์โหลดแผ่นงานเป็น DOCX ตามแบบฟอร์มในคู่มือ สนย.

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import { getAuditSheet } from "@/lib/audit-forms/service";
import { buildAuditSheetDocx } from "@/lib/audit-forms/to-docx";
import { DOCX_MIME } from "@/lib/docx/parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/sheets/[id]/export">) {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;
  const sheet = await getAuditSheet(id);
  if (!sheet) return NextResponse.json({ error: "ไม่พบแผ่นงานนี้" }, { status: 404 });

  const buffer = await buildAuditSheetDocx(sheet.form, {
    title: sheet.title,
    meta: sheet.meta,
    rows: sheet.rows,
  });

  const fileName = `Form${sheet.form.code}-${(sheet.title || id.slice(-6)).replace(/[/\\]/g, "-")}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="form-${sheet.form.code.toLowerCase()}.docx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
