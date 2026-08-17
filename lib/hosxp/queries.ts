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
import { hosxpCacheTtlSec, isHosxpEnabled } from "@/lib/hosxp/env";

export type OptionItem = { code: string; label: string };

type Row = RowDataPacket & { code: unknown; label: unknown };

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
    const rows = await hosxpSelect<Row>(
      `SELECT depcode AS code, department AS label
         FROM kskdepartment
        WHERE department IS NOT NULL AND department <> ''
        ORDER BY department`,
    );
    return toOptions(rows);
  });
}

/** สิทธิการรักษา — จาก pttype */
export async function listPttypes(): Promise<OptionItem[]> {
  return cached("pttypes", async () => {
    const rows = await hosxpSelect<Row>(
      `SELECT pttype AS code, name AS label
         FROM pttype
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
    return { items: [], available: false, reason: "ยังไม่ได้เปิดการเชื่อมต่อ HOSxP" };
  }

  try {
    return { items: await LOADERS[kind](), available: true };
  } catch (e) {
    console.error(`hosxp: โหลด ${kind} ไม่สำเร็จ:`, e);
    return {
      items: [],
      available: false,
      reason: "ต่อ HOSxP ไม่ได้ในขณะนี้",
    };
  }
}
