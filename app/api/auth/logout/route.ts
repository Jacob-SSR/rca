// app/api/auth/logout/route.ts

import { NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/auth/env";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ message: "ออกจากระบบแล้ว" });
  res.cookies.set(TOKEN_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
  return res;
}
