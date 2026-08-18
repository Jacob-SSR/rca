// lib/hosxp/icd.ts
// ดึง "รหัส ICD ที่มีอยู่แล้วในระบบ" มาเติมให้ฟอร์ม A2/A4
//
// เหตุผล: ผู้ตรวจสอบไม่ได้เป็นคนคิดรหัสพวกนี้ขึ้นมา เขามาตรวจว่ารหัสที่คนอื่น
// ให้ไว้ถูกหรือไม่ ตัวรหัสจึงมีอยู่ใน HOSxP อยู่แล้ว การให้นั่งพิมพ์ใหม่ทีละตัว
// คือการให้ทำงานซ้ำ และเสี่ยงพิมพ์ผิดจนตรวจผิดตัว
//
// คู่มือหน้า 16/26 กำหนดว่า "รหัส ICD 1 รหัส อยู่ใน 1 บรรทัดเท่านั้น"
// ตัวนี้จึงคืนมาเป็นรายรหัส ไม่ใช่รวมเป็นก้อนเดียว → เอาไปสร้างแถวได้ตรงๆ
//
// ⚠️ อ่านอย่างเดียวเสมอ ผ่าน hosxpSelect ที่ปฏิเสธทุกอย่างที่ไม่ใช่ SELECT
//
// ชื่อตาราง/คอลัมน์ยืนยันจากระบบ ppc-hos-10667 ที่ต่อ HOSxP ตัวเดียวกันนี้อยู่แล้ว
//   OPD: ovst(vn, hn, vstdate) + ovstdiag(vn, icd10, diagtype)
//   IPD: ipt(an, hn, dchdate)  + iptdiag(an, icd10, diagtype)
//   ชื่อโรค: icd101(code, name)

import type { RowDataPacket } from "mysql2";
import { hosxpSelect } from "@/lib/hosxp/client";
import { isHosxpEnabled } from "@/lib/hosxp/env";
import { qualify } from "@/lib/hosxp/queries";

export type IcdRow = {
  /** เลขที่ visit/admission ที่รหัสนี้ผูกอยู่ */
  ref: string;
  hn: string;
  /** วันที่มารับบริการ (OPD) หรือวันจำหน่าย (IPD) — รูปแบบ ISO */
  date: string;
  /** เวลา (OPD เท่านั้น) */
  time: string;
  icd: string;
  /** ประเภทตาม diagtype ของ HOSxP — ตรงกับคอลัมน์ "ประเภท" ในฟอร์ม */
  icdType: string;
  /** ชื่อโรคจาก icd101 — เอาไปเติมช่อง "การวินิจฉัย" ให้ */
  diagnosis: string;
};

type Row = RowDataPacket & Record<string, unknown>;

const str = (v: unknown) => String(v ?? "").trim();

/** DATE ของ MySQL กลับมาเป็น Date object — ต้องแปลงเป็น yyyy-mm-dd ตามเวลาไทย */
function isoDate(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(v);
  }
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

/** เวลา HH:mm — HOSxP เก็บเป็น TIME (HH:mm:ss) */
function hhmm(v: unknown): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(str(v));
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function toRows(rows: Row[]): IcdRow[] {
  return rows
    .map((r) => ({
      ref: str(r.ref),
      hn: str(r.hn),
      date: isoDate(r.date),
      time: hhmm(r.time),
      icd: str(r.icd),
      icdType: str(r.icdType),
      diagnosis: str(r.diagnosis),
    }))
    .filter((r) => r.icd !== "");
}

/**
 * รหัส ICD ของผู้ป่วยนอกตาม HN
 * ระบุวันที่ = เอาเฉพาะ visit วันนั้น ไม่ระบุ = เอา visit ล่าสุดย้อนหลัง
 */
export async function listOpdIcd(hn: string, date?: string | null): Promise<IcdRow[]> {
  const [ovst, ovstdiag, icd101] = await Promise.all([
    qualify("ovst"),
    qualify("ovstdiag"),
    qualify("icd101"),
  ]);

  const hasDate = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const rows = await hosxpSelect<Row>(
    `SELECT o.vn AS ref, o.hn AS hn, o.vstdate AS date, o.vsttime AS time,
            d.icd10 AS icd, d.diagtype AS icdType, i.name AS diagnosis
       FROM ${ovst} o
       JOIN ${ovstdiag} d ON d.vn = o.vn
       LEFT JOIN ${icd101} i ON i.code = d.icd10
      WHERE o.hn = ?
        ${hasDate ? "AND o.vstdate = ?" : ""}
      ORDER BY o.vstdate DESC, o.vsttime DESC, d.diagtype, d.icd10
      LIMIT 200`,
    hasDate ? [hn, date] : [hn],
  );

  return toRows(rows);
}

/** รหัส ICD ของผู้ป่วยในตาม AN */
export async function listIpdIcd(an: string): Promise<IcdRow[]> {
  const [ipt, iptdiag, icd101] = await Promise.all([
    qualify("ipt"),
    qualify("iptdiag"),
    qualify("icd101"),
  ]);

  const rows = await hosxpSelect<Row>(
    `SELECT p.an AS ref, p.hn AS hn, p.dchdate AS date, '' AS time,
            d.icd10 AS icd, d.diagtype AS icdType, i.name AS diagnosis
       FROM ${ipt} p
       JOIN ${iptdiag} d ON d.an = p.an
       LEFT JOIN ${icd101} i ON i.code = d.icd10
      WHERE p.an = ?
      ORDER BY d.diagtype, d.icd10
      LIMIT 200`,
    [an],
  );

  return toRows(rows);
}

export type IcdLookup =
  | { available: true; rows: IcdRow[] }
  | { available: false; reason: string };

/**
 * ดึงรหัสมาให้ — ไม่ throw
 * ต่อ HOSxP ไม่ได้ก็ยังต้องกรอกฟอร์มเองได้ตามปกติ ห้ามให้ของเสริมมาขวางงานหลัก
 */
export async function lookupIcd(
  kind: "opd" | "ipd",
  key: string,
  date?: string | null,
): Promise<IcdLookup> {
  if (!isHosxpEnabled()) {
    return { available: false, reason: "ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP — พิมพ์รหัสเองได้ตามปกติ" };
  }

  const id = key.trim();
  if (id === "") {
    return { available: false, reason: kind === "opd" ? "ยังไม่ได้ใส่ HN" : "ยังไม่ได้ใส่ AN" };
  }

  try {
    const rows = kind === "opd" ? await listOpdIcd(id, date) : await listIpdIcd(id);
    return { available: true, rows };
  } catch (e) {
    console.error(`hosxp: ดึงรหัส ICD (${kind}) ไม่สำเร็จ:`, e);
    const code = (e as { code?: string }).code;
    return {
      available: false,
      reason:
        code === "ER_ACCESS_DENIED_ERROR" || code === "ER_DBACCESS_DENIED_ERROR"
          ? "user ที่ใช้ต่อ HOSxP ไม่มีสิทธิ์อ่านตารางวินิจฉัย — แจ้งผู้ดูแลระบบ"
          : e instanceof Error && !code
            ? e.message
            : "ต่อ HOSxP ไม่ได้ในขณะนี้ — พิมพ์รหัสเองได้ตามปกติ",
    };
  }
}
