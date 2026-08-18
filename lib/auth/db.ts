// lib/auth/db.ts
// ต่อไปยังตาราง `ppchos.users` ตัวเดียวกับที่ ppc-hos-10667 ใช้
// → บุคลากรใช้ user/รหัสเดิม ไม่ต้องสร้างบัญชีใหม่ และ role ที่ตั้งไว้แล้วใช้ต่อได้ทันที
//
// ⚠️ RCA ต่อฐานนี้แบบ "อ่านอย่างเดียว"
//    ppc-hos-10667 มีโค้ดอัปเกรดรหัสจาก md5 → bcrypt แล้ว UPDATE กลับ
//    RCA จะไม่ทำ — ตรวจรหัสได้ทั้งสองรูปแบบแต่ไม่เขียนอะไรกลับ
//    เพราะระบบที่เป็นเจ้าของตารางควรมีระบบเดียว ลดโอกาสสองระบบเขียนชนกัน
//
// config แยกจาก DATABASE_URL ของแอป เพราะคนละเซิร์ฟเวอร์กัน

import mysql from "mysql2/promise";
import { authEnv } from "@/lib/auth/env";

const globalForAuthDb = globalThis as unknown as {
  authDb?: mysql.Pool;
};

function createPool(): mysql.Pool {
  const cfg = authEnv();
  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,

    // เซิร์ฟเวอร์ฝั่งนั้นเก็บภาษาไทยเป็น TIS-620 (เหมือน HOSxP)
    // ต่อผิด charset แล้วชื่อคนจะเพี้ยนทั้งหมด
    charset: "tis620",

    // ⚠️ ห้ามตั้งเป็น true — เปิดทาง stacked-query SQL injection
    // (default ของ mysql2 คือ false อยู่แล้ว เขียนไว้ชัดเพื่อกันคนเผลอเปิดทีหลัง)
    multipleStatements: false,

    connectionLimit: 4,
    connectTimeout: 10_000,
  });
}

export function authDb(): mysql.Pool {
  if (!globalForAuthDb.authDb) {
    globalForAuthDb.authDb = createPool();
  }
  return globalForAuthDb.authDb;
}

export type UserRecord = {
  username: string;
  displayName: string;
  role: string;
  passwordHash: string;
};

/**
 * ดึงผู้ใช้ตาม username — SELECT อย่างเดียว
 * คืน null ถ้าไม่พบ (ผู้เรียกต้องไม่บอก client ว่า "ไม่มี user นี้"
 * เพราะจะกลายเป็นช่องให้ไล่เดาว่ามีใครในระบบบ้าง)
 */
export async function findUser(username: string): Promise<UserRecord | null> {
  let rows: mysql.RowDataPacket[];

  try {
    [rows] = await authDb().query<mysql.RowDataPacket[]>(
      "SELECT `user`, `name`, `role`, `passweb` FROM `users` WHERE `user` = ? LIMIT 1",
      [username],
    );
  } catch (e) {
    // ความผิดพลาดที่พบบ่อยที่สุดคือตั้ง AUTH_DB_NAME เป็น hos
    // ทั้งที่ตาราง users อยู่ในฐาน ppchos (คนละ database บนเครื่องเดียวกัน)
    const err = e as { code?: string };
    if (err.code === "ER_NO_SUCH_TABLE") {
      const cfg = authEnv();
      throw new Error(
        `ไม่พบตาราง users ในฐาน "${cfg.database}" ที่ ${cfg.host} — ` +
          `ตาราง users อยู่ในฐาน ppchos ไม่ใช่ hos ` +
          `(ตรวจด้วย npm run check:conn)`,
      );
    }
    throw e;
  }

  const row = rows[0];
  if (!row) return null;

  return {
    username: String(row.user ?? ""),
    displayName: String(row.name ?? row.user ?? "").trim(),
    // คนที่ยังไม่ถูกตั้ง role (คอลัมน์เพิ่งเพิ่มฝั่ง ppc-hos) → USER
    // ต้อง fallback เสมอ ไม่งั้น role เป็น undefined แล้ว proxy จะปฏิเสธทุกอย่าง
    role: String(row.role ?? "USER").toUpperCase(),
    passwordHash: String(row.passweb ?? ""),
  };
}
