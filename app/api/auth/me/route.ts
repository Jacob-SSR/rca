// app/api/auth/me/route.ts
// GET /api/auth/me — ใครล็อกอินอยู่ และทำอะไรได้บ้าง
//
// ⚠️ role ที่ตอบกลับมาจาก JWT ไม่ใช่จาก DB
//    ppc-hos-10667 ดึง role จาก DB ซ้ำเพื่อให้เห็นการเปลี่ยน role ทันที
//    ที่นี่ไม่ทำ เพราะจะยิง DB ทุกครั้งที่โหลดหน้า
//    ผลที่ตามมา: เปลี่ยน role แล้วผู้ใช้ต้องออกจากระบบและเข้าใหม่ (หรือรอ token หมดอายุ 8 ชม.)

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { capabilitiesForRole } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      username: session.username,
      name: session.name,
      role: session.role,
      capabilities: capabilitiesForRole(session.role),
    },
  });
}
