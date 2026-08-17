// lib/hosxp/client.ts
// ต่อ HOSxP แบบ "อ่านอย่างเดียว" — ตามสเปก Phase 2 ข้อ 3.8
//
// ความปลอดภัยสามชั้น
//   1. user ใน MySQL ต้องมีสิทธิ์ SELECT เท่านั้น (DBA ตั้งให้ ดู docs/sql/hosxp-readonly-user.sql)
//   2. pool แยกตัวจาก DB ของแอป — คนละ credential คนละ connection limit
//   3. guard ในโค้ดข้างล่าง — throw ถ้า SQL ไม่ใช่ SELECT
//
// ชั้นที่ 3 ไม่ได้แทนชั้นที่ 1 เป็นตัวให้พังตั้งแต่ตอนเขียนโค้ด ไม่ใช่ไปพังตอน production

import mysql from "mysql2/promise";
import { hosxpConfig, isHosxpEnabled } from "@/lib/hosxp/env";

const globalForHosxp = globalThis as unknown as { hosxpPool?: mysql.Pool };

export class HosxpDisabledError extends Error {
  constructor() {
    super("การเชื่อมต่อ HOSxP ปิดอยู่ (HOSXP_ENABLED=false)");
    this.name = "HosxpDisabledError";
  }
}

export class HosxpWriteAttemptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HosxpWriteAttemptError";
  }
}

function pool(): mysql.Pool {
  if (!globalForHosxp.hosxpPool) {
    const cfg = hosxpConfig();
    globalForHosxp.hosxpPool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,

      // HOSxP เก็บภาษาไทยเป็น TIS-620 ไม่ใช่ utf8mb4
      // ต่อผิด charset แล้วชื่อแผนก/สิทธิจะเพี้ยนทั้งหมด
      charset: "tis620",

      // ⚠️ ห้ามตั้งเป็น true — เปิดทาง stacked-query SQL injection
      multipleStatements: false,

      // อย่าไปแย่ง connection ของ HOSxP ซึ่งเป็น production
      connectionLimit: 4,
      connectTimeout: 10_000,
    });
  }
  return globalForHosxp.hosxpPool;
}

/** คำสั่งที่ห้ามหลุดเข้าไปใน SQL ที่ยิงไป HOSxP */
const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|RENAME|LOAD|CALL|SET|LOCK)\b/i;

/**
 * ยิง SELECT ไป HOSxP — ทางเดียวที่โค้ดในระบบนี้คุยกับ HOSxP ได้
 * ค่าจาก request ต้องส่งผ่าน params เสมอ ห้าม concat เข้า sql
 */
export async function hosxpSelect<T extends mysql.RowDataPacket>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  if (!isHosxpEnabled()) throw new HosxpDisabledError();

  if (!/^\s*SELECT\s/i.test(sql)) {
    throw new HosxpWriteAttemptError("HOSxP client รับเฉพาะคำสั่งที่ขึ้นต้นด้วย SELECT");
  }
  if (FORBIDDEN.test(sql)) {
    throw new HosxpWriteAttemptError(
      "พบคำสั่งที่ไม่ใช่การอ่านใน SQL ที่ส่งเข้า HOSxP client — HOSxP เป็น read-only เท่านั้น",
    );
  }
  if (sql.includes(";")) {
    // กัน stacked query ตั้งแต่ชั้นนี้ ไม่รอพึ่ง multipleStatements: false อย่างเดียว
    throw new HosxpWriteAttemptError("SQL ที่ส่งเข้า HOSxP client ห้ามมีเครื่องหมาย ;");
  }

  const [rows] = await pool().query<T[]>(sql, params as unknown[]);
  return rows;
}
