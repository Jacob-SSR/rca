// lib/hosxp/visit.ts
// ดึงข้อมูล visit ของผู้ป่วยมาเติมฟอร์มบันทึกเวชระเบียนให้อัตโนมัติ
// กรอกแค่ HN แล้วช่องที่ HOSxP มีอยู่แล้วจะเด้งขึ้นมาให้ แก้ต่อได้ทุกช่อง
//
// ⚠️ สิ่งที่เติมให้คือ "ข้อมูลดิบที่ HOSxP มี" ไม่ใช่ "บันทึกที่สมบูรณ์"
//    ฟอร์มนี้ยังต้องให้คนอ่านและแก้ก่อนสร้างเอกสาร เพราะคะแนนตามเกณฑ์ สนย.
//    ตัดสินที่รายละเอียดของข้อความ ไม่ใช่แค่มีข้อความ
//
// ⚠️ อ่านอย่างเดียวเสมอ ผ่าน hosxpSelect ที่ปฏิเสธทุกอย่างที่ไม่ใช่ SELECT
//
// ── ทำไมแต่ละส่วนต้องล้มแยกกัน ──────────────────────────────────────────────
// แต่ละโรงพยาบาลเปิดสิทธิ์ให้ user อ่านตารางไม่เท่ากัน และ HOSxP แต่ละเวอร์ชัน
// มีตารางไม่ครบเหมือนกัน ถ้ารวบทุกตารางไว้ใน query เดียว พอมีตารางเดียวอ่านไม่ได้
// จะกลายเป็นเติมไม่ได้เลยสักช่อง — แยกทีละส่วนแล้วส่วนที่อ่านได้ก็ยังได้ใช้
//
// ── โครงตารางยืนยันจากไฟล์จริงของโรงพยาบาลแล้ว ─────────────────────────────
// ovst        vn hn vstdate vsttime pttype main_dep diag_text
//             ⚠️ ไม่มี age_y/age_m — ต้องคิดอายุจาก patient.birthday
// opdscreen   cc cc_duration hpi pmh fh sh ros found_allergy pe pe_*_text
//             bps bpd pulse rr temperature bw height
// opitemrece  vn icode qty drugusage sp_use
// lab_head    lab_order_number vn hn result_note
// lab_order   lab_order_number lab_items_code lab_order_result
//             lab_items_name_ref lab_items_normal_value_ref abnormal_result
// lab_items   lab_items_code lab_items_name lab_items_unit
// xray_head   vn xray_list result_note reporter_name order_date

import type { RowDataPacket } from "mysql2";
import { hosxpSelect } from "@/lib/hosxp/client";
import { isHosxpEnabled } from "@/lib/hosxp/env";
import { columnsOf, pickColumn, qualify } from "@/lib/hosxp/queries";

type Row = RowDataPacket & Record<string, unknown>;

const str = (v: unknown) => String(v ?? "").trim();

/** ค่าที่แปลว่า "ไม่มีข้อมูล" — ไฟล์จริงมีทั้ง NULL ตัวหนังสือและค่าว่าง */
function clean(v: unknown): string {
  const s = str(v);
  return s === "NULL" || s === "null" ? "" : s;
}

function isoDate(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(v);
  }
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

function hhmm(v: unknown): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(str(v));
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

/**
 * ทำงานให้ได้เท่าที่ได้ — ส่วนที่พังคืนค่าว่างแทนที่จะล้มทั้งคำขอ
 *
 * ⚠️ ต้องเก็บไว้ด้วยว่าพังเพราะอะไร แล้วส่งกลับไปให้ผู้ใช้เห็น
 *    ก่อนหน้านี้กลืน error ลง log อย่างเดียว ผู้ใช้เห็นแค่ช่องว่าง
 *    แล้วไม่มีทางรู้ว่าต้องไปขอสิทธิ์ตารางไหน
 */
async function soft<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  issues?: string[],
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`hosxp: ดึง ${label} ไม่สำเร็จ:`, e);
    if (issues) {
      const code = (e as { code?: string }).code;
      const why =
        code === "ER_ACCESS_DENIED_ERROR" || code === "ER_DBACCESS_DENIED_ERROR"
          ? "ไม่มีสิทธิ์อ่านตาราง"
          : e instanceof Error && !code
            ? e.message
            : "อ่านตารางไม่สำเร็จ";
      issues.push(`${label}: ${why}`);
    }
    return fallback;
  }
}

export type VisitPrefill = {
  /** ช่องที่เติมได้ — คีย์ตรงกับ field.name ใน lib/form/schema.ts */
  values: Record<string, string>;
  /** ส่วนที่ไม่มีข้อมูลใน HOSxP ไว้บอกผู้ใช้ว่าต้องกรอกเองส่วนไหน */
  missing: string[];
  /** ส่วนที่ "อ่านไม่ได้" พร้อมชื่อตารางและเหตุผล — ต่างจาก missing ที่แปลว่าไม่มีข้อมูล */
  issues: string[];
  vn: string;
};

// ═══ ตัวประกอบข้อความ (บริสุทธิ์ เทสต์ได้โดยไม่ต้องมีฐานข้อมูล) ═══════════════

/**
 * สัญญาณชีพเป็นบรรทัดเดียวแบบที่คนเขียนในเวชระเบียนจริง
 *
 * ⚠️ HOSxP เก็บค่าที่ไม่ได้วัดเป็น 0.000 ไม่ใช่ NULL — ต้องตัดศูนย์ทิ้งด้วย
 *    ไม่งั้นจะได้ "PR 0 /min" ซึ่งไม่ใช่แค่รก แต่เป็นข้อมูลผิด
 *    (ยืนยันจากไฟล์จริง: มีแถวที่ pulse = 0.000 เพราะไม่ได้วัด)
 */
export function formatVitalSigns(v: Record<string, unknown>): string {
  const n = (key: string): string => {
    const raw = clean(v[key]);
    if (raw === "") return "";
    const num = Number(raw);
    if (!Number.isFinite(num) || num === 0) return "";
    // 124.000 → 124 แต่ 36.8 ต้องคงทศนิยมไว้
    return String(Number(num.toFixed(2)));
  };

  const parts: string[] = [];
  const bps = n("bps");
  const bpd = n("bpd");
  // ความดันต้องมีครบทั้งบน-ล่าง มีแค่ตัวเดียวแล้วเขียน "BP 120/" คือข้อมูลผิด
  if (bps && bpd) parts.push(`BP ${bps}/${bpd} mmHg`);
  if (n("pulse")) parts.push(`PR ${n("pulse")} /min`);
  if (n("rr")) parts.push(`RR ${n("rr")} /min`);
  if (n("temperature")) parts.push(`BT ${n("temperature")} °C`);
  const o2 = n("o2sat") || n("spo2");
  if (o2) parts.push(`O2sat ${o2} %`);
  if (n("bw")) parts.push(`BW ${n("bw")} kg`);
  if (n("height")) parts.push(`Ht ${n("height")} cm`);

  return parts.join("  ");
}

/**
 * อาการสำคัญ + ระยะเวลา
 *
 * ⚠️ เกณฑ์ CC ให้ 2 คะแนนเมื่อ "บันทึกอาการสำคัญและระบุระยะเวลา" และให้ 1
 *    ถ้าไม่ระบุระยะเวลา — ระยะเวลาจึงเป็นตัวชี้ขาดคะแนนข้อนี้
 *
 * HOSxP เก็บ cc_duration เป็น "จำนวน:หน่วย" เช่น "2:วัน" และใส่ "0:วัน" เมื่อ
 * ไม่ได้ระบุ (ในไฟล์จริงส่วนใหญ่เป็น 0 คนมักเขียนระยะเวลาไว้ในตัว cc เองแล้ว
 * เช่น "เจ็บหน้าอก เป็นก่อนมา รพ. 4 วัน") — ศูนย์ต้องไม่ถูกเขียนเป็น "0 วัน"
 */
export function formatChiefComplaint(cc: unknown, duration: unknown): string {
  const text = clean(cc);
  if (text === "") return "";

  const m = /^([\d.]+)\s*:\s*(.+)$/.exec(clean(duration));
  if (!m) return text;

  const qty = Number(m[1]);
  if (!Number.isFinite(qty) || qty === 0) return text;

  const tail = `${Number(qty)} ${m[2].trim()}`;
  // เขียนระยะเวลาไว้ใน cc แล้วก็ไม่ต้องต่อท้ายซ้ำ
  return text.includes(tail) ? text : `${text} (${tail})`;
}

/** ระบบร่างกายที่ HOSxP แยกช่องไว้ — ป้ายไทยไว้ให้คนอ่านและ AI จับได้ว่าคนละระบบ */
const PE_SYSTEMS: [string, string][] = [
  ["pe_ga_text", "ลักษณะทั่วไป (GA)"],
  ["pe_head_text", "ศีรษะ"],
  ["pe_heent_text", "HEENT"],
  ["pe_chest_text", "ทรวงอก"],
  ["pe_heart_text", "หัวใจ"],
  ["pe_lung_text", "ปอด"],
  ["pe_ab_text", "ช่องท้อง"],
  ["pe_gi_text", "ทางเดินอาหาร"],
  ["pe_gu_text", "ทางเดินปัสสาวะ"],
  ["pe_gy_text", "นรีเวช"],
  ["pe_pv_text", "PV"],
  ["pe_pr_text", "PR"],
  ["pe_gen_text", "อวัยวะเพศ"],
  ["pe_ext_text", "แขนขา"],
  ["pe_neuro_text", "ระบบประสาท"],
  ["pe_skin_text", "ผิวหนัง"],
];

/**
 * ผลตรวจร่างกาย — บรรทัดละระบบ
 *
 * ⚠️ เกณฑ์ PHYSICAL_EXAM นับ "จำนวนระบบที่บันทึก" (1 ระบบ = 1, 2 ระบบ = 2,
 *    มากกว่าสองระบบ = 3/4) การแยกบรรทัดจึงไม่ใช่แค่ความสวยงาม
 *    แต่คือสิ่งที่ทำให้นับระบบได้ถูก
 *
 * ในไฟล์จริงคนส่วนใหญ่เขียนรวมในช่อง pe ช่องเดียว (57%) ส่วนช่องแยกระบบ
 * ใช้กันน้อยมาก (1-3%) จึงต้องเอามาทั้งสองทาง ไม่ใช่เลือกอย่างใดอย่างหนึ่ง
 */
export function formatPhysicalExam(r: Record<string, unknown>): string {
  const lines: string[] = [];

  const free = clean(r.pe);
  if (free !== "") lines.push(free);

  for (const [key, label] of PE_SYSTEMS) {
    const v = clean(r[key]);
    if (v !== "") lines.push(`${label}: ${v}`);
  }

  return lines.join("\n");
}

/**
 * ประวัติส่วนตัว / ครอบครัว / ปัจจัยเสี่ยง
 *
 * เกณฑ์ HISTORY ให้ 3 คะแนน (เต็ม) เมื่อมีครบทั้งประวัติปัจจุบัน + อดีต +
 * "ประวัติส่วนตัว ปัจจัยเสี่ยงต่างๆ" — ช่องนี้คือส่วนที่สาม
 * ติดป้ายกำกับไว้เพื่อให้เห็นชัดว่าแต่ละท่อนคือประวัติด้านไหน
 */
export function formatPersonalHistory(r: Record<string, unknown>): string {
  const parts: string[] = [];

  const sh = clean(r.sh);
  if (sh !== "") parts.push(`ประวัติส่วนตัว/สังคม: ${sh}`);

  const fh = clean(r.fh);
  if (fh !== "") parts.push(`ประวัติครอบครัว: ${fh}`);

  const ros = clean(r.ros);
  if (ros !== "") parts.push(`ทบทวนตามระบบ (ROS): ${ros}`);

  // แพ้ยาเป็นข้อมูลที่คู่มือระบุตรงๆ ว่าต้องบันทึก (หน้า 3 ข้อ ข.)
  // ⚠️ ธงเป็น Y เท่านั้นที่แปลว่าพบการแพ้ — ในไฟล์จริงมีทั้ง N, V, U ปนมาด้วย
  if (clean(r.found_allergy).toUpperCase() === "Y") {
    parts.push("⚠️ ระบบแจ้งว่าผู้ป่วยรายนี้มีประวัติแพ้ — ตรวจสอบและระบุรายละเอียดการแพ้");
  }

  return parts.join("\n");
}

/**
 * บรรทัดคำวินิจฉัย — ชื่อโรคขึ้นก่อน รหัสอยู่ในวงเล็บเสมอ
 *
 * ⚠️ คู่มือ สนย. หน้า 5 เตือนตรงๆ ว่าห้ามใช้รหัส ICD แทนคำวินิจฉัย
 *    และเกณฑ์ DIAGNOSIS ให้ 0 คะแนนถ้าใช้รหัสแทนคำวินิจฉัย
 *    ถ้าเติมมาเป็นรหัสล้วน ฟอร์มจะถูกตัดคะแนนทันทีทั้งที่ยังไม่ได้ตรวจ
 */
export function formatDiagnosisLine(name: unknown, code: unknown): string {
  const n = clean(name);
  const c = clean(code);
  if (!n) return c ? `(${c})` : "";
  return c ? `${n} (${c})` : n;
}

/**
 * บรรทัดรายการยา
 * เกณฑ์ TREATMENT ให้คะแนนเต็มเมื่อมี ชื่อยา + ขนาด + รูปแบบ + วิธีใช้ + ปริมาณ
 * ดึงมาให้ครบเท่าที่ HOSxP มี ส่วนที่ขาดคนกรอกต้องเติมเอง
 */
export function formatDrugLine(r: Record<string, unknown>): string {
  const name = clean(r.drug);
  if (name === "") return "";

  const bits = [name];

  const strength = clean(r.strength);
  if (strength !== "") bits.push(strength);

  const qty = clean(r.qty);
  if (qty !== "" && Number(qty) !== 0) {
    const unit = clean(r.unit);
    bits.push(`จำนวน ${Number(qty)}${unit ? ` ${unit}` : ""}`);
  }

  const usage = [clean(r.usage1), clean(r.usage2), clean(r.usage3), clean(r.spUse)]
    .filter((s) => s !== "")
    .join(" ");
  if (usage !== "") bits.push(usage);

  return bits.join(" · ");
}

/**
 * บรรทัดหัตถการ/ผ่าตัด
 *
 * ⚠️ เกณฑ์ TREATMENT นับ "การผ่าตัด การทำหัตถการ การให้ยาทุกขนานพร้อมขนาดยา"
 *    ดึงแต่ยาอย่างเดียวจึงไม่ครบเกณฑ์ — หัตถการที่ทำแล้วแต่ไม่ได้บันทึกคือคะแนนที่หาย
 *
 * บันทึกไว้แต่รหัสโดยไม่มีชื่อก็ยังต้องขึ้นบรรทัดให้เห็น เพราะคนตรวจต้องรู้ว่า
 * มีหัตถการเกิดขึ้นจริง แล้วไปเติมชื่อเอง — ไม่ใช่เงียบไปเหมือนไม่มีอะไรเกิดขึ้น
 */
export function formatProcedureLine(name: unknown, code: unknown): string {
  const n = clean(name);
  const c = clean(code);
  if (n === "" && c === "") return "";
  return `หัตถการ: ${n || "(ไม่ระบุชื่อ)"}${c ? ` (${c})` : ""}`;
}

/**
 * บรรทัดผลแล็บ
 * ⚠️ ติดธง "ผิดปกติ" ให้เห็น — ผลที่ผิดปกติคือสิ่งที่ต้องมีการแปลผลและการรักษาต่อ
 *    ถ้าคนกรอกมองข้ามจะเสียคะแนนทั้งข้อชันสูตรและข้อการรักษา
 */
export function formatLabLine(r: Record<string, unknown>): string {
  const name = clean(r.name) || clean(r.nameRef);
  const result = clean(r.result);
  if (name === "" || result === "") return "";

  const unit = clean(r.unit);
  const ref = clean(r.ref);
  const abnormal = clean(r.abnormal).toUpperCase() === "Y";

  return (
    `${name} ${result}${unit ? ` ${unit}` : ""}` +
    `${ref ? ` (ค่าปกติ ${ref})` : ""}${abnormal ? "  ← ผิดปกติ" : ""}`
  );
}

/**
 * บล็อกผลเอกซเรย์หนึ่งรายการ
 *
 * ⚠️ ไม่มีผลอ่าน = ยังไม่ได้บันทึกผล ต้องเขียนให้ชัด ไม่ใช่ปล่อยว่าง
 *    เกณฑ์ "ผลการตรวจร่างกาย และผลการตรวจชันสูตร" ให้ 3 คะแนน (ไม่ใช่ 4)
 *    เมื่อมีผลการตรวจชันสูตรแต่ไม่บันทึกผล — คนกรอกต้องเห็นว่ามีรายการค้างอยู่
 */
export function formatXrayBlock(items: unknown, note: unknown, reporter: unknown): string {
  const list = clean(items);
  if (!list) return "";
  const body = clean(note) !== "" ? clean(note) : "— ยังไม่มีผลอ่านฟิล์มในระบบ —";
  const who = clean(reporter);
  return `X-ray: ${list}\n${body}${who ? ` (ผู้รายงาน: ${who})` : ""}`;
}

/** อายุ ณ วันที่มารับบริการ — "52 ปี" หรือ "1 ปี 6 เดือน" ตาม hint ของช่องอายุ */
export function formatAge(years: unknown, months: unknown): string {
  const y = Number(clean(years));
  const m = Number(clean(months));
  if (!Number.isFinite(y) || y < 0) return "";
  if (y === 0) return Number.isFinite(m) && m > 0 ? `${m} เดือน` : "";
  return Number.isFinite(m) && m > 0 ? `${y} ปี ${m} เดือน` : `${y} ปี`;
}

// ═══ ส่วนที่คุยกับฐานข้อมูล ══════════════════════════════════════════════════

export type VisitCore = {
  vn: string;
  date: string;
  time: string;
  department: string;
  pttype: string;
  diagText: string;
};

const VISIT_SELECT = `o.vn, o.vstdate AS date, o.vsttime AS time, o.diag_text AS diagText,
            k.department AS department, p.name AS pttype`;

function toVisitCore(r: Row): VisitCore {
  return {
    vn: str(r.vn),
    date: isoDate(r.date),
    time: hhmm(r.time),
    department: clean(r.department),
    pttype: clean(r.pttype),
    diagText: clean(r.diagText),
  };
}

async function visitTables() {
  return Promise.all([qualify("ovst"), qualify("kskdepartment"), qualify("pttype")]);
}

/**
 * รายการ visit ของผู้ป่วยรายนี้ — ไล่จากใหม่ไปเก่า
 *
 * มีไว้ให้กดเลือกวันที่มาจริงจาก HOSxP แทนการนั่งพิมพ์วันที่เอง
 * ⚠️ ผู้ป่วยคนเดียวกันมาหลายครั้งในวันเดียวได้ (เห็นได้จากหน้าจอ Visit List
 *    ของ HOSxP เอง) การเลือกด้วย "วันที่" อย่างเดียวจึงกำกวม
 *    ต้องให้เลือกถึงระดับ VN — เวลาที่ต่างกันคือคนละครั้งที่มา
 */
export async function listVisits(hn: string, limit = 30): Promise<VisitCore[]> {
  const [ovst, ksk, ptt] = await visitTables();

  const rows = await hosxpSelect<Row>(
    `SELECT ${VISIT_SELECT}
       FROM ${ovst} o
       LEFT JOIN ${ksk} k ON k.depcode = o.main_dep
       LEFT JOIN ${ptt} p ON p.pttype = o.pttype
      WHERE o.hn = ?
      ORDER BY o.vstdate DESC, o.vsttime DESC
      LIMIT ${Math.max(1, Math.min(100, Math.trunc(limit)))}`,
    [hn],
  );

  return rows.map(toVisitCore);
}

/** visit เดียวตาม VN — แม่นกว่าเลือกด้วยวันที่เพราะวันเดียวมีได้หลาย visit */
async function findVisitByVn(vn: string): Promise<VisitCore | null> {
  const [ovst, ksk, ptt] = await visitTables();

  const rows = await hosxpSelect<Row>(
    `SELECT ${VISIT_SELECT}
       FROM ${ovst} o
       LEFT JOIN ${ksk} k ON k.depcode = o.main_dep
       LEFT JOIN ${ptt} p ON p.pttype = o.pttype
      WHERE o.vn = ?
      LIMIT 1`,
    [vn],
  );

  return rows[0] ? toVisitCore(rows[0]) : null;
}

async function findVisit(hn: string, date?: string | null): Promise<VisitCore | null> {
  const [ovst, ksk, ptt] = await visitTables();

  const hasDate = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const rows = await hosxpSelect<Row>(
    `SELECT ${VISIT_SELECT}
       FROM ${ovst} o
       LEFT JOIN ${ksk} k ON k.depcode = o.main_dep
       LEFT JOIN ${ptt} p ON p.pttype = o.pttype
      WHERE o.hn = ?
        ${hasDate ? "AND o.vstdate = ?" : ""}
      ORDER BY o.vstdate DESC, o.vsttime DESC
      LIMIT 1`,
    hasDate ? [hn, date] : [hn],
  );

  return rows[0] ? toVisitCore(rows[0]) : null;
}

/**
 * ข้อมูลผู้ป่วย + อายุ ณ วันที่มารับบริการ
 *
 * ⚠️ ovst ไม่มีคอลัมน์อายุ (ยืนยันจากโครงจริง 53 คอลัมน์) ต้องคิดจากวันเกิด
 *    เทียบกับวันที่ visit — คิดจากวันนี้แทนจะผิดทันทีเมื่อย้อนไปตรวจ visit เก่า
 */
async function findPatient(
  hn: string,
  visitDate: string,
): Promise<{ name: string; gender: string; age: string }> {
  const patient = await qualify("patient");
  const useDate = /^\d{4}-\d{2}-\d{2}$/.test(visitDate);
  const at = useDate ? "?" : "CURDATE()";

  const rows = await hosxpSelect<Row>(
    `SELECT CONCAT_WS(' ', pname, fname, lname) AS name, sex,
            TIMESTAMPDIFF(YEAR, birthday, ${at}) AS ageY,
            TIMESTAMPDIFF(MONTH, birthday, ${at}) % 12 AS ageM
       FROM ${patient} WHERE hn = ? LIMIT 1`,
    useDate ? [visitDate, visitDate, hn] : [hn],
  );

  const r = rows[0];
  if (!r) return { name: "", gender: "", age: "" };

  // HOSxP: sex 1 = ชาย, 2 = หญิง
  const sex = clean(r.sex);

  return {
    name: clean(r.name),
    gender: sex === "1" ? "ชาย" : sex === "2" ? "หญิง" : "",
    age: formatAge(r.ageY, r.ageM),
  };
}

type ScreenData = {
  chiefComplaint: string;
  vitalSigns: string;
  presentIllness: string;
  pastHistory: string;
  personalHistory: string;
  physicalExam: string;
};

const EMPTY_SCREEN: ScreenData = {
  chiefComplaint: "",
  vitalSigns: "",
  presentIllness: "",
  pastHistory: "",
  personalHistory: "",
  physicalExam: "",
};

async function findScreen(vn: string): Promise<ScreenData> {
  const opdscreen = await qualify("opdscreen");

  const cols = [
    "cc",
    "cc_duration",
    "hpi",
    "pmh",
    "fh",
    "sh",
    "ros",
    "found_allergy",
    "pe",
    ...PE_SYSTEMS.map(([k]) => k),
    "bps",
    "bpd",
    "pulse",
    "rr",
    "temperature",
    "bw",
    "height",
    "o2sat",
  ].join(", ");

  const rows = await hosxpSelect<Row>(`SELECT ${cols} FROM ${opdscreen} WHERE vn = ? LIMIT 1`, [
    vn,
  ]);

  const r = rows[0];
  if (!r) return EMPTY_SCREEN;

  return {
    chiefComplaint: formatChiefComplaint(r.cc, r.cc_duration),
    vitalSigns: formatVitalSigns(r),
    presentIllness: clean(r.hpi),
    pastHistory: clean(r.pmh),
    personalHistory: formatPersonalHistory(r),
    physicalExam: formatPhysicalExam(r),
  };
}

async function findDiagnosis(vn: string): Promise<string> {
  const [ovstdiag, icd101] = await Promise.all([qualify("ovstdiag"), qualify("icd101")]);
  const rows = await hosxpSelect<Row>(
    `SELECT d.icd10, i.name
       FROM ${ovstdiag} d
       LEFT JOIN ${icd101} i ON i.code = d.icd10
      WHERE d.vn = ?
      ORDER BY d.diagtype, d.icd10
      LIMIT 30`,
    [vn],
  );

  return rows
    .map((r) => formatDiagnosisLine(r.name, r.icd10))
    .filter(Boolean)
    .join("\n");
}

/**
 * การรักษา = ยาที่สั่ง + หัตถการ/ผ่าตัด
 *
 * เกณฑ์ TREATMENT ของ สนย. นับ "การผ่าตัด การทำหัตถการ การให้ยาทุกขนาน
 * พร้อมขนาดยา" — ดึงแค่ยาอย่างเดียวจึงไม่ครบ
 *
 * ⚠️ ไม่ hardcode ชื่อคอลัมน์ — HOSxP แต่ละเวอร์ชันตั้งไม่เหมือนกัน
 *    (units / unit, name / drugname) เดาผิดทีเดียว query ล้มทั้งก้อน
 *    แล้วผู้ใช้เห็นแค่ช่องว่างโดยไม่รู้ว่าพังตรงไหน → ถามชื่อคอลัมน์จริงก่อน
 */
async function findDrugs(vn: string): Promise<string> {
  const [opitemrece, drugitems] = await Promise.all([
    qualify("opitemrece"),
    qualify("drugitems"),
  ]);

  const dCols = await columnsOf("drugitems");
  const oCols = await columnsOf("opitemrece");

  const nameCol = pickColumn(dCols, ["name", "drugname", "generic_name"]);
  if (!nameCol) throw new Error("ตาราง drugitems ไม่มีคอลัมน์ชื่อยาที่รู้จัก");

  const strengthCol = pickColumn(dCols, ["strength", "dose", "drug_strength"]);
  const unitCol = pickColumn(dCols, ["units", "unit", "packqty_unit"]);
  const qtyCol = pickColumn(oCols, ["qty", "quantity"]);
  const spUseCol = pickColumn(oCols, ["sp_use", "spuse"]);
  const usageCodeCol = pickColumn(oCols, ["drugusage", "drug_usage"]);

  // drugusage เป็นตารางแปลรหัสวิธีใช้ยา ("0157" → "รับประทานครั้งละ 1 เม็ด")
  // อ่านไม่ได้ก็ยังได้ชื่อยากับจำนวน ไม่ต้องล้มทั้งส่วน
  let usageJoin = "";
  let usageSelect = ", '' AS usage1, '' AS usage2, '' AS usage3";

  if (usageCodeCol) {
    const usageTable = await soft("ตารางวิธีใช้ยา", () => qualify("drugusage"), "");
    if (usageTable) {
      const uCols = await columnsOf("drugusage");
      const u1 = pickColumn(uCols, ["name", "usageline1"]);
      const u2 = pickColumn(uCols, ["usageline1", "usage_line1"]);
      const u3 = pickColumn(uCols, ["usageline2", "usage_line2"]);
      const key = pickColumn(uCols, ["drugusage", "code"]);

      if (u1 && key) {
        usageJoin = ` LEFT JOIN ${usageTable} u ON u.${key} = o.${usageCodeCol}`;
        usageSelect =
          `, u.${u1} AS usage1` +
          (u2 && u2 !== u1 ? `, u.${u2} AS usage2` : ", '' AS usage2") +
          (u3 ? `, u.${u3} AS usage3` : ", '' AS usage3");
      }
    }
  }

  const rows = await hosxpSelect<Row>(
    `SELECT d.${nameCol} AS drug` +
      (strengthCol ? `, d.${strengthCol} AS strength` : ", '' AS strength") +
      (unitCol ? `, d.${unitCol} AS unit` : ", '' AS unit") +
      (qtyCol ? `, o.${qtyCol} AS qty` : ", '' AS qty") +
      (spUseCol ? `, o.${spUseCol} AS spUse` : ", '' AS spUse") +
      usageSelect +
      ` FROM ${opitemrece} o
        JOIN ${drugitems} d ON d.icode = o.icode` +
      usageJoin +
      ` WHERE o.vn = ?
        ORDER BY d.${nameCol}
        LIMIT 50`,
    [vn],
  );

  return rows
    .map((r) => formatDrugLine(r))
    .filter(Boolean)
    .join("\n");
}

/** หัตถการ/ผ่าตัดที่ทำในวันนั้น — doctor_operation ของ HOSxP */
async function findProcedures(vn: string): Promise<string> {
  const table = await qualify("doctor_operation");
  const cols = await columnsOf("doctor_operation");

  const nameCol = pickColumn(cols, ["operation_name", "name", "oper_name"]);
  const codeCol = pickColumn(cols, ["icd9", "icd9cm", "er_oper_code"]);
  if (!nameCol && !codeCol) return "";

  const rows = await hosxpSelect<Row>(
    `SELECT ${nameCol ? `${nameCol} AS name` : "'' AS name"},` +
      ` ${codeCol ? `${codeCol} AS code` : "'' AS code"}` +
      ` FROM ${table} WHERE vn = ? LIMIT 30`,
    [vn],
  );

  return rows
    .map((r) => formatProcedureLine(r.name, r.code))
    .filter(Boolean)
    .join("\n");
}

async function findLab(vn: string): Promise<string> {
  const [labHead, labOrder, labItems] = await Promise.all([
    qualify("lab_head"),
    qualify("lab_order"),
    qualify("lab_items"),
  ]);

  const rows = await hosxpSelect<Row>(
    `SELECT i.lab_items_name AS name, o.lab_items_name_ref AS nameRef,
            o.lab_order_result AS result, o.lab_items_normal_value_ref AS ref,
            i.lab_items_unit AS unit, o.abnormal_result AS abnormal
       FROM ${labHead} h
       JOIN ${labOrder} o ON o.lab_order_number = h.lab_order_number
       LEFT JOIN ${labItems} i ON i.lab_items_code = o.lab_items_code
      WHERE h.vn = ?
      ORDER BY i.lab_items_name
      LIMIT 100`,
    [vn],
  );

  return rows
    .map((r) => formatLabLine(r))
    .filter(Boolean)
    .join("\n");
}

async function findXray(vn: string): Promise<string> {
  const xrayHead = await qualify("xray_head");
  const rows = await hosxpSelect<Row>(
    `SELECT xray_list, result_note, reporter_name
       FROM ${xrayHead} WHERE vn = ? ORDER BY order_date DESC LIMIT 20`,
    [vn],
  );

  return rows
    .map((r) => formatXrayBlock(r.xray_list, r.result_note, r.reporter_name))
    .filter(Boolean)
    .join("\n\n");
}

// ═══ รวมทุกส่วน ══════════════════════════════════════════════════════════════

export type VisitLookup =
  | { available: true; prefill: VisitPrefill }
  | { available: false; reason: string };

export async function lookupVisit(opts: {
  hn: string;
  date?: string | null;
  /** เลือก visit เจาะจงจากรายการ — แม่นกว่าวันที่ เพราะวันเดียวมีได้หลาย visit */
  vn?: string | null;
}): Promise<VisitLookup> {
  if (!isHosxpEnabled()) {
    return { available: false, reason: "ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP — กรอกเองได้ตามปกติ" };
  }

  const id = opts.hn.trim();
  const vn = (opts.vn ?? "").trim();
  if (id === "" && vn === "") return { available: false, reason: "ยังไม่ได้ใส่ HN" };

  let visit: VisitCore | null;
  try {
    visit = vn !== "" ? await findVisitByVn(vn) : await findVisit(id, opts.date);
  } catch (e) {
    console.error("hosxp: หา visit ไม่สำเร็จ:", e);
    const code = (e as { code?: string }).code;
    return {
      available: false,
      reason:
        code === "ER_ACCESS_DENIED_ERROR" || code === "ER_DBACCESS_DENIED_ERROR"
          ? "user ที่ใช้ต่อ HOSxP ไม่มีสิทธิ์อ่านตาราง visit — แจ้งผู้ดูแลระบบ"
          : e instanceof Error && !code
            ? e.message
            : "ต่อ HOSxP ไม่ได้ในขณะนี้ — กรอกเองได้ตามปกติ",
    };
  }

  if (!visit) {
    return {
      available: false,
      reason:
        vn !== ""
          ? `ไม่พบ visit เลขที่ ${vn}`
          : opts.date
            ? `ไม่พบ visit ของ HN ${id} วันที่ ${opts.date}`
            : `ไม่พบ visit ของ HN ${id} ในระบบ`,
    };
  }

  const found = visit;

  /** ส่วนที่ดึงไม่สำเร็จ พร้อมเหตุผล — ส่งกลับให้ผู้ใช้รู้ว่าต้องแก้อะไร */
  const issues: string[] = [];
  // เลือกด้วย VN จะยังไม่รู้ HN จนกว่าจะอ่าน visit มาได้ — ใช้ที่ผู้ใช้กรอกก่อน
  const patientHn = id !== "" ? id : "";

  const [patient, screen, diagnosis, drugs, lab, xray, procedures] = await Promise.all([
    soft(
      "ข้อมูลผู้ป่วย (patient)",
      () => findPatient(patientHn, found.date),
      { name: "", gender: "", age: "" },
      issues,
    ),
    soft("ประวัติ/ตรวจร่างกาย (opdscreen)", () => findScreen(found.vn), EMPTY_SCREEN, issues),
    soft("การวินิจฉัย (ovstdiag/icd101)", () => findDiagnosis(found.vn), "", issues),
    soft("รายการยา (opitemrece/drugitems)", () => findDrugs(found.vn), "", issues),
    soft("ผลแล็บ (lab_head/lab_order/lab_items)", () => findLab(found.vn), "", issues),
    soft("ผลเอกซเรย์ (xray_head)", () => findXray(found.vn), "", issues),
    // หัตถการไม่ใช่ทุกโรงพยาบาลที่บันทึก ไม่พบก็ไม่ต้องรายงานว่าพัง
    soft("หัตถการ (doctor_operation)", () => findProcedures(found.vn), ""),
  ]);

  // ผลชันสูตรรวมแล็บกับเอกซเรย์ไว้ช่องเดียว ตามที่เกณฑ์ สนย. นับรวมกัน
  const labResult = [lab, xray].filter((s) => s !== "").join("\n\n");

  // การรักษา = ยา + หัตถการ ตามที่เกณฑ์ TREATMENT ระบุไว้
  const treatment = [drugs, procedures].filter((s) => s !== "").join("\n");

  // diag_text ที่หมอพิมพ์เองมาก่อนรหัส ICD เพราะเป็น "คำวินิจฉัย" ตัวจริง
  // มีทั้งคู่ก็เอามาทั้งคู่ ให้คนตรวจเห็นว่าตรงกันหรือไม่
  const diagnosisText = [found.diagText, diagnosis].filter((s) => s !== "").join("\n");

  const values: Record<string, string> = {
    hn: patientHn,
    patientName: patient.name,
    age: patient.age,
    gender: patient.gender,
    department: found.department,
    pttype: found.pttype,
    serviceDate: found.date,
    serviceTime: found.time,
    chiefComplaint: screen.chiefComplaint,
    presentIllness: screen.presentIllness,
    pastHistory: screen.pastHistory,
    personalHistory: screen.personalHistory,
    vitalSigns: screen.vitalSigns,
    physicalExam: screen.physicalExam,
    labResult,
    diagnosis: diagnosisText,
    treatment,
  };

  const missing = Object.entries({
    "ชื่อผู้ป่วย": patient.name,
    "อาการสำคัญ": screen.chiefComplaint,
    "ประวัติปัจจุบัน": screen.presentIllness,
    "ประวัติอดีต": screen.pastHistory,
    "ประวัติส่วนตัว": screen.personalHistory,
    "สัญญาณชีพ": screen.vitalSigns,
    "ตรวจร่างกาย": screen.physicalExam,
    "การวินิจฉัย": diagnosisText,
    "การรักษา": treatment,
    "ผลชันสูตร/เอกซเรย์": labResult,
  })
    .filter(([, v]) => v === "")
    .map(([k]) => k);

  return {
    available: true,
    prefill: {
      values: Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "")),
      missing,
      issues,
      vn: found.vn,
    },
  };
}
