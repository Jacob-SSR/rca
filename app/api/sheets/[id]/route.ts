// app/api/sheets/[id]/route.ts
// GET / PUT / DELETE แผ่นงานหนึ่งแผ่น

import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api";
import {
  AuditFormError,
  deleteAuditSheet,
  getAuditSheet,
  updateAuditSheet,
} from "@/lib/audit-forms/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/sheets/[id]">) {
  try {
    await requireCapability("view");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;
  const sheet = await getAuditSheet(id);
  if (!sheet) return NextResponse.json({ error: "ไม่พบแผ่นงานนี้" }, { status: 404 });

  return NextResponse.json({ sheet });
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/sheets/[id]">) {
  let actor: string | null = null;
  try {
    actor = (await requireCapability("review")).username;
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const sheet = await updateAuditSheet(id, { ...body, actor });
    return NextResponse.json({ sheet });
  } catch (e) {
    if (e instanceof AuditFormError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("บันทึกแผ่นงานไม่สำเร็จ:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/sheets/[id]">) {
  try {
    await requireCapability("review");
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Internal" }, { status: 500 });
  }

  const { id } = await ctx.params;

  try {
    await deleteAuditSheet(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuditFormError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
