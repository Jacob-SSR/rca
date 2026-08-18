// lib/hosxp/queries.ts
// SELECT ทั้งหมดที่ยิงไป HOSxP อยู่ที่ไฟล์นี้ที่เดียว — ตรวจง่ายว่าระบบอ่านอะไรบ้าง
//
// รอบนี้ดึงแค่ตาราง master สองตัว (แผนก / สิทธิการรักษา)
//   - ยืนยันแล้วว่ามีใช้จริงใน ppc-hos-10667: kskdepartment(depcode, department), pttype(pttype, name)
//   - ไม่มี PHI เลย จึงเป็นจุดเริ่มที่ความเสี่ยงต่ำสุดของการต่อ HOSxP
//
// ตารางที่มีข้อมูลผู้ป่วย (ovst, opdscreen, ovst_doctor_diag ฯลฯ) ยังไม่แตะ
// ต้อง DESCRIBE schema จริงก่อนตามสเปก Phase 2 ข้อ 7

import type { RowDataPacket } from "mysql2";
import { hosxpSelect } from "@/lib/hosxp/client";
import { hosxpCacheTtlSec, hosxpConfig, isHosxpEnabled } from "@/lib/hosxp/env";

export type OptionItem = { code: string; label: string };

type Row = RowDataPacket & { code: unknown; label: unknown };

// ── หาว่าตาราง master อยู่ฐานไหน ──────────────────────────────────────────────
// แต่ละโรงพยาบาลวางไม่เหมือนกัน — บางที่ users กับ kskdepartment อยู่ฐานเดียวกัน
// บางที่แยกเป็น ppchos กับ hos บนเครื่องเดียวกัน
// แทนที่จะให้คนมานั่งเดา HOSXP_DB_NAME แล้วเจอ "ต่อ HOSxP ไม่ได้" ลอยๆ
// ก็ถาม information_schema เอาว่าตารางนี้อยู่ฐานไหนจริงๆ แล้วอ้างชื่อฐานนำหน้าไปเลย

const schemaOf = new Map<string, string>();

/** ชื่อ database/table ที่ปลอดภัยพอจะเอาไปต่อใน SQL ได้ (พารามิเตอร์ผูกชื่อตารางไม่ได้) */
const SAFE_IDENT = /^[A-Za-z0-9_$]+$/;

/**
 * คืนชื่อตารางแบบเต็ม เช่น `hos`.`kskdepartment`
 * เลือกฐานที่ตั้งไว้ใน HOSXP_DB_NAME ก่อน ถ้าตารางไม่ได้อยู่ที่นั่นก็เอาฐานแรกที่เจอ
 */
async function qualify(table: string): Promise<string> {
  if (!SAFE_IDENT.test(table)) {
    throw new Error(`ชื่อตารางไม่ถูกต้อง: ${table}`);
  }

  const cachedSchema = schemaOf.get(table);
  if (cachedSchema) return `\`${cachedSchema}\`.\`${table}\``;

  const preferred = hosxpConfig().database ?? "";
  const rows = await hosxpSelect<RowDataPacket & { db: unknown }>(
    `SELECT table_schema AS db
       FROM information_schema.tables
      WHERE table_name = ?
      ORDER BY (table_schema = ?) DESC, table_schema
      LIMIT 1`,
    [table, preferred],
  );

  const found = String(rows[0]?.db ?? "");
  if (!found) {
    throw new Error(
      `ไม่พบตาราง ${table} ในฐานไหนเลยบนเครื่อง HOSxP — ` +
        `user ที่ใช้ต่ออาจไม่มีสิทธิ์อ่านฐานนั้น (ตรวจด้วย npm run check:conn)`,
    );
  }
  if (!SAFE_IDENT.test(found)) {
    throw new Error(`ชื่อฐานข้อมูลไม่ถูกต้อง: ${found}`);
  }

  schemaOf.set(table, found);
  return `\`${found}\`.\`${table}\``;
}

/** cache ใน memory — ตาราง master แทบไม่เปลี่ยน ไม่ควรยิง HOSxP ทุกครั้งที่เปิดฟอร์ม */
const cache = new Map<string, { at: number; items: OptionItem[] }>();

async function cached(key: string, load: () => Promise<OptionItem[]>): Promise<OptionItem[]> {
  const ttlMs = hosxpCacheTtlSec() * 1000;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.items;

  const items = await load();
  cache.set(key, { at: Date.now(), items });
  return items;
}

/** cast ทุกค่าที่ออกจาก DB — HOSxP คืน string/number ปนกัน (แนวเดียวกับ ppc-hos-10667) */
function toOptions(rows: Row[]): OptionItem[] {
  return rows
    .map((r) => ({
      code: String(r.code ?? "").trim(),
      label: String(r.label ?? "").trim(),
    }))
    .filter((o) => o.label.length > 0);
}

/** แผนก / คลินิก — จาก kskdepartment */
export async function listDepartments(): Promise<OptionItem[]> {
  return cached("departments", async () => {
    const table = await qualify("kskdepartment");
    const rows = await hosxpSelect<Row>(
      `SELECT depcode AS code, department AS label
         FROM ${table}
        WHERE department IS NOT NULL AND department <> ''
        ORDER BY department`,
    );
    return toOptions(rows);
  });
}

/** สิทธิการรักษา — จาก pttype */
export async function listPttypes(): Promise<OptionItem[]> {
  return cached("pttypes", async () => {
    const table = await qualify("pttype");
    const rows = await hosxpSelect<Row>(
      `SELECT pttype AS code, name AS label
         FROM ${table}
        WHERE name IS NOT NULL AND name <> ''
        ORDER BY name`,
    );
    return toOptions(rows);
  });
}

export type OptionKind = "departments" | "pttypes";

const LOADERS: Record<OptionKind, () => Promise<OptionItem[]>> = {
  departments: listDepartments,
  pttypes: listPttypes,
};

export function isOptionKind(value: string): value is OptionKind {
  return value in LOADERS;
}

/**
 * ดึงตัวเลือกตามชนิด
 * คืนลิสต์ว่างถ้า HOSxP ปิดอยู่หรือต่อไม่ได้ — ฝั่ง UI จะ fallback เป็นช่องพิมพ์เอง
 * ไม่ throw เพราะ "เลือกจากรายการไม่ได้" ไม่ควรทำให้กรอกฟอร์มไม่ได้
 */
export async function loadOptions(
  kind: OptionKind,
): Promise<{ items: OptionItem[]; available: boolean; reason?: string }> {
  if (!isHosxpEnabled()) {
    return {
      items: [],
      available: false,
      reason:
        process.env.HOSXP_ENABLED === "false"
          ? "ปิดการเชื่อมต่อ HOSxP ไว้ (HOSXP_ENABLED=false) — พิมพ์เองได้ตามปกติ"
          : "ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP — พิมพ์เองได้ตามปกติ",
    };
  }

  try {
    return { items: await LOADERS[kind](), available: true };
  } catch (e) {
    console.error(`hosxp: โหลด ${kind} ไม่สำเร็จ:`, e);
    return { items: [], available: false, reason: hintFor(e) };
  }
}

/**
 * แปลง error เป็นคำใบ้ที่ผู้ใช้เอาไปบอกคนดูแลระบบได้
 * ⚠️ ห้ามคืนข้อความ error ดิบ — ของ mysql มีชื่อ user/host ติดมาด้วย
 */
function hintFor(e: unknown): string {
  const code = (e as { code?: string }).code;

  switch (code) {
    case "ER_ACCESS_DENIED_ERROR":
    case "ER_DBACCESS_DENIED_ERROR":
      return "user ที่ใช้ต่อ HOSxP ไม่มีสิทธิ์อ่านตารางนี้ — แจ้งผู้ดูแลระบบ";
    case "ER_BAD_DB_ERROR":
      return "ไม่พบฐานข้อมูลที่ตั้งไว้ใน HOSXP_DB_NAME — แจ้งผู้ดูแลระบบ";
    case "ECONNREFUSED":
    case "ETIMEDOUT":
    case "ENOTFOUND":
      return "ต่อเซิร์ฟเวอร์ HOSxP ไม่ได้ในขณะนี้ — พิมพ์เองไปก่อนได้";
    default:
      // ข้อความที่โค้ดเราโยนเองปลอดภัยพอจะแสดงได้ (ไม่มี credential)
      return e instanceof Error && !code ? e.message : "อ่านข้อมูลจาก HOSxP ไม่สำเร็จ";
  }
}
