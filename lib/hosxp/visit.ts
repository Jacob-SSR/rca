// lib/hosxp/visit.ts
// ดึงข้อมูล visit ของผู้ป่วยมาเติมฟอร์มบันทึกเวชระเบียนให้อัตโนมัติ
// กรอกแค่ HN แล้วช่องที่ HOSxP มีอยู่แล้วจะเด้งขึ้นมาให้ แก้ต่อได้ทุกช่อง
//
// ⚠️ สิ่งที่เติมให้คือ "ข้อมูลดิบที่ HOSxP มี" ไม่ใช่ "บันทึกที่สมบูรณ์"
//    ฟอร์มนี้ยังต้องให้คนอ่านและแก้ก่อนสร้างเอกสาร เพราะคะแนนตามเกณฑ์ สนย.
//    ตัดสินที่รายละเอียดของข้อความ ไม่ใช่แค่มีข้อความ
//    (เช่น CC ต้องระบุระยะเวลาด้วยจึงได้ 2 คะแนน — HOSxP มักเก็บมาแค่อาการ)
//
// ⚠️ อ่านอย่างเดียวเสมอ ผ่าน hosxpSelect ที่ปฏิเสธทุกอย่างที่ไม่ใช่ SELECT
//
// ── ทำไมแต่ละส่วนต้องล้มแยกกัน ──────────────────────────────────────────────
// แต่ละโรงพยาบาลเปิดสิทธิ์ให้ user อ่านตารางไม่เท่ากัน และ HOSxP แต่ละเวอร์ชัน
// มีตารางไม่ครบเหมือนกัน ถ้ารวบทุกตารางไว้ใน query เดียว พอมีตารางเดียวอ่านไม่ได้
// จะกลายเป็นเติมไม่ได้เลยสักช่อง — แยกทีละส่วนแล้วส่วนที่อ่านได้ก็ยังได้ใช้

import type { RowDataPacket } from "mysql2";
import { hosxpSelect } from "@/lib/hosxp/client";
import { isHosxpEnabled } from "@/lib/hosxp/env";
import { qualify } from "@/lib/hosxp/queries";

type Row = RowDataPacket & Record<string, unknown>;

const str = (v: unknown) => String(v ?? "").trim();

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

/** ทำงานให้ได้เท่าที่ได้ — ส่วนที่พังคืนค่าว่างแทนที่จะล้มทั้งคำขอ */
async function soft<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error(`hosxp: ดึง ${label} ไม่สำเร็จ:`, e);
    return fallback;
  }
}

export type VisitPrefill = {
  /** ช่องที่เติมได้ — คีย์ตรงกับ field.name ใน lib/form/schema.ts */
  values: Record<string, string>;
  /** ส่วนที่ดึงไม่ได้ ไว้บอกผู้ใช้ว่าต้องกรอกเองส่วนไหน */
  missing: string[];
  vn: string;
};

// ── visit ล่าสุด / ตามวันที่ ─────────────────────────────────────────────────

type VisitCore = {
  vn: string;
  date: string;
  time: string;
  department: string;
  pttype: string;
  age: string;
};

async function findVisit(hn: string, date?: string | null): Promise<VisitCore | null> {
  const [ovst, ksk, ptt] = await Promise.all([
    qualify("ovst"),
    qualify("kskdepartment"),
    qualify("pttype"),
  ]);

  const hasDate = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const rows = await hosxpSelect<Row>(
    `SELECT o.vn, o.vstdate AS date, o.vsttime AS time,
            k.department AS department, p.name AS pttype, o.age_y AS ageY, o.age_m AS ageM
       FROM ${ovst} o
       LEFT JOIN ${ksk} k ON k.depcode = o.main_dep
       LEFT JOIN ${ptt} p ON p.pttype = o.pttype
      WHERE o.hn = ?
        ${hasDate ? "AND o.vstdate = ?" : ""}
      ORDER BY o.vstdate DESC, o.vsttime DESC
      LIMIT 1`,
    hasDate ? [hn, date] : [hn],
  );

  const r = rows[0];
  if (!r) return null;

  // "52 ปี" หรือ "1 ปี 6 เดือน" ตามที่ hint ของช่องอายุบอกไว้
  const y = Number(r.ageY);
  const m = Number(r.ageM);
  const age =
    Number.isFinite(y) && y > 0
      ? Number.isFinite(m) && m > 0
        ? `${y} ปี ${m} เดือน`
        : `${y} ปี`
      : "";

  return {
    vn: str(r.vn),
    date: isoDate(r.date),
    time: hhmm(r.time),
    department: str(r.department),
    pttype: str(r.pttype),
    age,
  };
}

// ── ข้อมูลผู้ป่วย ────────────────────────────────────────────────────────────

async function findPatient(hn: string): Promise<{ name: string; gender: string }> {
  const patient = await qualify("patient");
  const rows = await hosxpSelect<Row>(
    `SELECT CONCAT_WS(' ', pname, fname, lname) AS name, sex
       FROM ${patient} WHERE hn = ? LIMIT 1`,
    [hn],
  );

  const r = rows[0];
  if (!r) return { name: "", gender: "" };

  // HOSxP: sex 1 = ชาย, 2 = หญิง
  const sex = str(r.sex);
  return {
    name: str(r.name),
    gender: sex === "1" ? "ชาย" : sex === "2" ? "หญิง" : "",
  };
}

// ── CC + สัญญาณชีพ (opdscreen) ───────────────────────────────────────────────

/**
 * ประกอบสัญญาณชีพเป็นบรรทัดเดียวแบบที่คนเขียนในเวชระเบียนจริง
 * ค่าที่ไม่มีให้ข้ามไป ไม่ต้องเขียน "BP: -" ให้รก
 */
export function formatVitalSigns(v: Record<string, unknown>): string {
  const parts: string[] = [];
  const bps = str(v.bps);
  const bpd = str(v.bpd);
  if (bps && bpd) parts.push(`BP ${bps}/${bpd} mmHg`);
  if (str(v.pulse)) parts.push(`PR ${str(v.pulse)} /min`);
  if (str(v.rr)) parts.push(`RR ${str(v.rr)} /min`);
  if (str(v.temperature)) parts.push(`BT ${str(v.temperature)} °C`);
  if (str(v.o2sat)) parts.push(`O2sat ${str(v.o2sat)} %`);
  if (str(v.bw)) parts.push(`BW ${str(v.bw)} kg`);
  if (str(v.height)) parts.push(`Ht ${str(v.height)} cm`);
  return parts.join("  ");
}

/**
 * บรรทัดคำวินิจฉัย — ชื่อโรคขึ้นก่อน รหัสต่อท้ายในวงเล็บเสมอ
 *
 * ⚠️ คู่มือ สนย. หน้า 5 เตือนตรงๆ ว่าห้ามใช้รหัส ICD แทนคำวินิจฉัย
 *    และเกณฑ์ DIAGNOSIS ให้ 0 คะแนนถ้าใช้รหัสแทนคำวินิจฉัย
 *    ถ้าเติมมาเป็นรหัสล้วน ฟอร์มจะถูกตัดคะแนนทันทีทั้งที่ยังไม่ได้ตรวจ
 */
export function formatDiagnosisLine(name: unknown, code: unknown): string {
  const n = str(name);
  const c = str(code);
  if (!n) return c ? `(${c})` : "";
  return c ? `${n} (${c})` : n;
}

/**
 * บล็อกผลเอกซเรย์หนึ่งรายการ
 *
 * ⚠️ ไม่มีผลอ่าน = ยังไม่ได้บันทึกผล ต้องเขียนให้ชัด ไม่ใช่ปล่อยว่าง
 *    เกณฑ์ "ผลการตรวจร่างกาย และผลการตรวจชันสูตร" ให้ 3 คะแนน (ไม่ใช่ 4)
 *    เมื่อมีผลการตรวจชันสูตรแต่ไม่บันทึกผล — คนกรอกต้องเห็นว่ามีรายการค้างอยู่
 */
export function formatXrayBlock(items: unknown, note: unknown, reporter: unknown): string {
  const list = str(items);
  if (!list) return "";
  const body = str(note) !== "" ? str(note) : "— ยังไม่มีผลอ่านฟิล์มในระบบ —";
  const who = str(reporter);
  return `X-ray: ${list}\n${body}${who ? ` (ผู้รายงาน: ${who})` : ""}`;
}

async function findScreen(vn: string): Promise<{ cc: string; vitalSigns: string }> {
  const opdscreen = await qualify("opdscreen");
  const rows = await hosxpSelect<Row>(
    `SELECT cc, bps, bpd, temperature, pulse, rr, bw, height, o2sat
       FROM ${opdscreen} WHERE vn = ? LIMIT 1`,
    [vn],
  );

  const r = rows[0];
  if (!r) return { cc: "", vitalSigns: "" };
  return { cc: str(r.cc), vitalSigns: formatVitalSigns(r) };
}

// ── การวินิจฉัย ──────────────────────────────────────────────────────────────

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

// ── การรักษา (ยาที่สั่ง) ─────────────────────────────────────────────────────

async function findTreatment(vn: string): Promise<string> {
  const [opitemrece, drugitems] = await Promise.all([
    qualify("opitemrece"),
    qualify("drugitems"),
  ]);

  const rows = await hosxpSelect<Row>(
    `SELECT d.name AS drug, o.qty, o.unit_price, d.units AS unit, o.doctor_usage_line1 AS usage1
       FROM ${opitemrece} o
       JOIN ${drugitems} d ON d.icode = o.icode
      WHERE o.vn = ?
      ORDER BY d.name
      LIMIT 50`,
    [vn],
  );

  return rows
    .map((r) => {
      const bits = [str(r.drug)];
      const qty = str(r.qty);
      if (qty) bits.push(`${qty} ${str(r.unit) || ""}`.trim());
      if (str(r.usage1)) bits.push(str(r.usage1));
      return bits.filter(Boolean).join(" — ");
    })
    .filter(Boolean)
    .join("\n");
}

// ── ผลชันสูตร: แล็บ + เอกซเรย์ ──────────────────────────────────────────────

async function findLab(vn: string): Promise<string> {
  const [labHead, labOrder, labItems] = await Promise.all([
    qualify("lab_head"),
    qualify("lab_order"),
    qualify("lab_items"),
  ]);

  const rows = await hosxpSelect<Row>(
    `SELECT i.lab_items_name AS name, o.lab_order_result AS result,
            o.lab_items_normal_value_ref AS ref, i.lab_items_unit AS unit
       FROM ${labHead} h
       JOIN ${labOrder} o ON o.lab_order_number = h.lab_order_number
       LEFT JOIN ${labItems} i ON i.lab_items_code = o.lab_items_code
      WHERE h.vn = ?
      ORDER BY i.lab_items_name
      LIMIT 100`,
    [vn],
  );

  return rows
    .map((r) => {
      const name = str(r.name);
      const result = str(r.result);
      if (!name || result === "") return "";
      const unit = str(r.unit);
      const ref = str(r.ref);
      return `${name} ${result}${unit ? ` ${unit}` : ""}${ref ? ` (ค่าปกติ ${ref})` : ""}`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * เอกซเรย์ — จาก xray_head
 *
 * xray_list คือรายการที่ถ่าย (ข้อความอ่านออกอยู่แล้ว เช่น "Chest X-ray(Pacs)")
 * result_note คือผลอ่านฟิล์ม ซึ่งเป็นตัวที่เกณฑ์ PHYSICAL_EXAM ต้องการ
 *
 * ⚠️ เกณฑ์ข้อ "ผลการตรวจร่างกาย และผลการตรวจชันสูตร" ให้ 3 คะแนน (ไม่ใช่ 4)
 *    เมื่อ "มีผลการตรวจชันสูตร แต่ไม่บันทึกผล" — การส่งเอกซเรย์แล้วไม่บันทึกผล
 *    จึงเสียคะแนน ดึงมาให้เห็นตั้งแต่แรกจะได้รู้ว่ามีอะไรที่ต้องบันทึก
 */
async function findXray(vn: string): Promise<string> {
  const xrayHead = await qualify("xray_head");
  const rows = await hosxpSelect<Row>(
    `SELECT xray_list, result_note, report_date, reporter_name, order_date
       FROM ${xrayHead} WHERE vn = ? ORDER BY order_date DESC LIMIT 20`,
    [vn],
  );

  return rows
    .map((r) => formatXrayBlock(r.xray_list, r.result_note, r.reporter_name))
    .filter(Boolean)
    .join("\n\n");
}

// ── รวมทุกส่วน ───────────────────────────────────────────────────────────────

export type VisitLookup =
  | { available: true; prefill: VisitPrefill }
  | { available: false; reason: string };

export async function lookupVisit(hn: string, date?: string | null): Promise<VisitLookup> {
  if (!isHosxpEnabled()) {
    return { available: false, reason: "ยังไม่ได้ตั้งค่าเชื่อมต่อ HOSxP — กรอกเองได้ตามปกติ" };
  }

  const id = hn.trim();
  if (id === "") return { available: false, reason: "ยังไม่ได้ใส่ HN" };

  let visit: VisitCore | null;
  try {
    visit = await findVisit(id, date);
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
      reason: date
        ? `ไม่พบ visit ของ HN ${id} วันที่ ${date}`
        : `ไม่พบ visit ของ HN ${id} ในระบบ`,
    };
  }

  // ที่เหลือดึงพร้อมกัน ส่วนไหนพังก็ปล่อยว่างไว้ให้กรอกเอง
  const [patient, screen, diagnosis, treatment, lab, xray] = await Promise.all([
    soft("ข้อมูลผู้ป่วย", () => findPatient(id), { name: "", gender: "" }),
    soft("CC/สัญญาณชีพ", () => findScreen(visit.vn), { cc: "", vitalSigns: "" }),
    soft("การวินิจฉัย", () => findDiagnosis(visit.vn), ""),
    soft("รายการยา", () => findTreatment(visit.vn), ""),
    soft("ผลแล็บ", () => findLab(visit.vn), ""),
    soft("ผลเอกซเรย์", () => findXray(visit.vn), ""),
  ]);

  // ผลชันสูตรรวมแล็บกับเอกซเรย์ไว้ช่องเดียว ตามที่เกณฑ์ สนย. นับรวมกัน
  const labResult = [lab, xray].filter((s) => s !== "").join("\n\n");

  const values: Record<string, string> = {
    hn: id,
    patientName: patient.name,
    age: visit.age,
    gender: patient.gender,
    department: visit.department,
    pttype: visit.pttype,
    serviceDate: visit.date,
    serviceTime: visit.time,
    chiefComplaint: screen.cc,
    vitalSigns: screen.vitalSigns,
    labResult,
    diagnosis,
    treatment,
  };

  const missing = Object.entries({
    "ชื่อผู้ป่วย": patient.name,
    "อาการสำคัญ": screen.cc,
    "สัญญาณชีพ": screen.vitalSigns,
    "การวินิจฉัย": diagnosis,
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
      vn: visit.vn,
    },
  };
}
