// lib/auth/jwt.ts
// เซ็น/ตรวจ JWT ด้วย jose ตัวเดียวทั้งระบบ
//
// ppc-hos-10667 ใช้ jose ใน proxy และ jsonwebtoken ใน route handler
// ที่นี่ใช้ jose อย่างเดียว เพราะทำงานได้ทั้ง Node runtime และ Edge
// → ไม่ต้องมีสอง library ที่ต้องคอยดูให้ payload ตรงกัน

import { SignJWT, jwtVerify } from "jose";
import { SESSION_MAX_AGE, jwtSecret } from "@/lib/auth/env";

export type SessionPayload = {
  username: string;
  role: string;
  name: string;
};

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(jwtSecret());
}

/** คืน null ถ้า token ไม่มี / เสีย / หมดอายุ — ผู้เรียกตัดสินใจเองว่าจะทำอะไรต่อ */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, jwtSecret());

    const username = typeof payload.username === "string" ? payload.username : "";
    if (!username) return null;

    return {
      username,
      // normalize เป็นตัวใหญ่เสมอ — ทั้งระบบเทียบ role ด้วยตัวใหญ่
      role: (typeof payload.role === "string" ? payload.role : "USER").toUpperCase(),
      name: typeof payload.name === "string" ? payload.name : username,
    };
  } catch {
    return null;
  }
}
