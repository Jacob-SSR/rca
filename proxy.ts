// proxy.ts
// Next.js 16 เปลี่ยนชื่อ middleware เป็น proxy — พฤติกรรมเหมือนเดิม
//
// ─────────────────────────────────────────────────────────────────────────────
// หลักการ: DENY BY DEFAULT
// ทุก path ต้องล็อกอิน ยกเว้นที่อยู่ใน PUBLIC_PATHS เท่านั้น
// → สร้าง route ใหม่ไม่ต้องมาแก้ไฟล์นี้ มันถูกล็อกให้อัตโนมัติ
//
// RCA ไม่มีโซน guest แบบ ppc-hos-10667 (ที่เปิด dashboard กลางให้จอแขวนทีวีดู)
// เพราะทุกหน้าในระบบนี้มีข้อมูลผู้ป่วย
//
// ⚠️ ชั้นนี้เป็นด่านแรกเท่านั้น ไม่ใช่ด่านเดียว
//    route ที่แตะข้อมูลผู้ป่วยต้องเรียก requireSession() / requireCapability() ซ้ำ
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { TOKEN_COOKIE } from "@/lib/auth/env";
import { verifySession } from "@/lib/auth/jwt";
import { canAccessRequest, isPublicPath } from "@/lib/auth/permissions";

function clearTokenCookie(res: NextResponse): NextResponse {
  res.cookies.set(TOKEN_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
  return res;
}

/** API ตอบ JSON, หน้าเว็บ redirect ไปหน้า login พร้อมจำปลายทางไว้ */
function deny(request: NextRequest, hadBadToken: boolean): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api")) {
    const res = NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    return hadBadToken ? clearTokenCookie(res) : res;
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("next", pathname + search);
  const res = NextResponse.redirect(url);
  return hadBadToken ? clearTokenCookie(res) : res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) return deny(request, false);

  const session = await verifySession(token);
  if (!session) return deny(request, true); // token เสีย/หมดอายุ → เคลียร์ cookie

  if (!canAccessRequest(session.role, pathname, request.method)) {
    return pathname.startsWith("/api")
      ? NextResponse.json(
          { error: "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบเพื่อตั้งสิทธิ์" },
          { status: 403 },
        )
      : NextResponse.redirect(new URL("/no-access", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // ครอบทุกอย่าง ยกเว้นไฟล์ static และ favicon
  // ข้อยกเว้นเชิงสิทธิ์จัดการในโค้ดข้างบน ไม่ใช่ใน matcher
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
