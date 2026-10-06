// lib/hosxp/patient-search.ts
// ค้นหาผู้ป่วยใน HOSxP ด้วย "เลขบัตรประชาชน" หรือ "ชื่อ-สกุล" → ได้ HN ไปดูรายการ visit ต่อ
//
// ⚠️ อ่านอย่างเดียว ค่าจากผู้ใช้ส่งผ่าน params เสมอ (hosxpSelect ปฏิเสธที่ไม่ใช่ SELECT)
// ⚠️ ผลลัพธ์เป็น PHI — route ที่เรียกต้องเช็คสิทธิ์ review และไม่ log ค่าที่ค้น

import type { RowDataPacket } from "mysql2";
import { hosxpSelect } from "@/lib/hosxp/client";
import { qualify } from "@/lib/hosxp/queries";
import { maskCid, type PatientQuery } from "@/lib/hosxp/search-query";

export { parsePatientQuery } from "@/lib/hosxp/search-query";

type Row = RowDataPacket & Record<string, unknown>;

export type PatientHit = {
  hn: string;
  name: string;
  /** แสดงแบบปิดบางส่วน 1-xxxx-xxxxx-23-4 — คนเลือกแค่ต้องแยกคนชื่อซ้ำได้ */
  cidMasked: string;
  age: string;
  gender: string;
};

export async function searchPatients(q: Exclude<PatientQuery, { kind: "invalid" }>, limit = 30): Promise<PatientHit[]> {
  const patient = await qualify("patient");
  const lim = Math.max(1, Math.min(50, Math.trunc(limit)));

  let where: string;
  let params: string[];
  if (q.kind === "cid") {
    where = "cid = ?";
    params = [q.cid];
  } else if (q.last) {
    // "สมชาย ใจดี" → ชื่อขึ้นต้นด้วย สมชาย และนามสกุลขึ้นต้นด้วย ใจดี
    where = "fname LIKE ? AND lname LIKE ?";
    params = [`${q.first}%`, `${q.last}%`];
  } else {
    // คำเดียว → อาจเป็นชื่อหรือนามสกุลก็ได้
    where = "(fname LIKE ? OR lname LIKE ?)";
    params = [`${q.first}%`, `${q.first}%`];
  }

  const rows = await hosxpSelect<Row>(
    `SELECT hn, CONCAT_WS(' ', pname, fname, lname) AS name, cid, sex,
            TIMESTAMPDIFF(YEAR, birthday, CURDATE()) AS ageY
       FROM ${patient}
      WHERE ${where}
      ORDER BY fname, lname
      LIMIT ${lim}`,
    params,
  );

  return rows.map((r) => {
    const sex = String(r.sex ?? "").trim();
    const age = Number(r.ageY);
    return {
      hn: String(r.hn ?? "").trim(),
      name: String(r.name ?? "").trim(),
      cidMasked: maskCid(String(r.cid ?? "")),
      age: Number.isFinite(age) && age >= 0 ? `${age} ปี` : "",
      gender: sex === "1" ? "ชาย" : sex === "2" ? "หญิง" : "",
    };
  });
}
