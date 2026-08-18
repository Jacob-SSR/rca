// lib/report/form-a1.ts
// ประกอบข้อมูลสำหรับ "Form A1" — ตารางบันทึกผลการตรวจสอบคุณภาพการบันทึกข้อมูลผู้ป่วยนอก
// ตามคู่มือ สนย. มีนาคม 2558 (ตัวอย่างที่กรอกแล้วหน้า 12 / ฟอร์มเปล่าหน้า 50)
//
// คอลัมน์ต้องตรงกับต้นฉบับเป๊ะ เพราะแบบนี้ถูกส่งให้ สสจ. และถูกเทียบกับ
// ผลของโรงพยาบาลอื่น ถ้าเรียงคอลัมน์ใหม่หรือเพิ่มเอง คนอ่านจะเทียบไม่ได้
//   HN | วันที่ | เวลา | วัน/เวลา | CC | ประวัติ | ตรวจร่างกาย | คำวินิจฉัย |
//   การรักษา | คะแนนเต็ม | คะแนนที่ได้ | หมายเหตุ
//
// กติกาจากคู่มือหน้า 11 ที่ต้องรักษาไว้
//   - ข้อมูลผู้ป่วย 1 ราย อยู่ใน 1 บรรทัด
//   - "คะแนนเต็ม คือ การรวมคะแนนสูงสุดที่เป็นไปได้ ถ้ารายการใดผลการประเมินเป็น na
//      ไม่ต้องนำคะแนนเต็มของรายการนั้นมารวม"
//     → maxScore ต่อแถวไม่คงที่ 17 เสมอ (Rule Engine คิดให้แล้ว ดู rule-engine.ts)
//
// ⚠️ ไฟล์นี้ต้องไม่ import prisma — เทสต์และตัววาด DOCX เรียกใช้โดยไม่ต้องมีฐานข้อมูล
//    ส่วนที่ query อยู่ที่ lib/report/form-a1-query.ts

import { isIsoDate } from "@/lib/form/thai-date";

/** ลำดับคอลัมน์คะแนนในฟอร์ม — ห้ามสลับ */
export const A1_SCORE_COLUMNS = [
  { code: "SERVICE_DATETIME", header: "วัน/เวลา" },
  { code: "CC", header: "CC" },
  { code: "HISTORY", header: "ประวัติ" },
  { code: "PHYSICAL_EXAM", header: "ตรวจร่างกาย" },
  { code: "DIAGNOSIS", header: "คำวินิจฉัย" },
  { code: "TREATMENT", header: "การรักษา" },
] as const;

/** ชื่อสั้นไว้เขียนในช่องหมายเหตุ — ช่องแคบ ใช้ชื่อเต็มแล้วตารางแตก */
const SHORT_NAME: Record<string, string> = {
  SERVICE_DATETIME: "วัน/เวลา",
  CC: "CC",
  HISTORY: "ประวัติ",
  PHYSICAL_EXAM: "ตรวจร่างกาย",
  DIAGNOSIS: "คำวินิจฉัย",
  TREATMENT: "การรักษา",
};

export type A1Row = {
  reviewId: string;
  hn: string;
  date: string;
  time: string;
  /** คะแนนรายข้อ เรียงตาม A1_SCORE_COLUMNS — "na" = ไม่ประเมิน */
  scores: (number | "na" | null)[];
  maxScore: number | null;
  totalScore: number | null;
  note: string;
};

export type A1Report = {
  rows: A1Row[];
  /** ช่วงวันที่ที่ขอมา (ไว้พิมพ์บนหัวฟอร์ม) */
  from: Date | null;
  to: Date | null;
  sumTotal: number;
  sumMax: number;
  /** สัดส่วน % — null เมื่อไม่มีอะไรให้คิด */
  percentage: number | null;
};

/**
 * วันที่สำหรับคอลัมน์ "วันที่" — dd/mm/yyyy พ.ศ.
 *
 * ตัวอย่างในคู่มือพิมพ์เป็น ค.ศ. (20/01/2015) แต่ทั้งระบบนี้ใช้ พ.ศ. ทุกที่
 * (เอกสารเวชระเบียนที่ generate ออกไปก็ พ.ศ.) เลือกให้สอดคล้องกันเองสำคัญกว่า
 * แล้วเขียนกำกับไว้ท้ายฟอร์มว่าเป็น พ.ศ. จะได้ไม่มีใครอ่านผิดเป็น ค.ศ.
 *
 * ค่าที่ไม่ใช่ ISO (ฟอร์มเก่าที่พิมพ์มือไว้) ส่งผ่านไปตามเดิม ไม่แปลง ไม่ทิ้ง
 */
export function a1Date(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (raw === "") return "";
  if (!isIsoDate(raw)) return raw;

  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${Number(y) + 543}`;
}

/** เวลา HH:mm — ตัดวินาทีทิ้งถ้ามี */
export function a1Time(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(raw);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : raw;
}

type ItemLike = {
  score: number | null;
  isNA: boolean;
  reason: string | null;
  criterion: { code: string; maxScore: number };
};

/**
 * ช่องหมายเหตุ — เขียนเฉพาะข้อที่ยังไม่ได้คะแนนเต็ม
 *
 * ตัวอย่างในคู่มือเขียนว่า "คำวินิจฉัย Myalgia ไม่บอกตำแหน่ง"
 * คือ ชื่อหัวข้อ + เหตุผลสั้นๆ — ทำแบบเดียวกันโดยดึง reason จาก Rule Engine มาใช้
 * ได้เต็มทุกข้อ → เว้นว่าง (ต้นฉบับใส่ "-")
 */
export function a1Note(items: ItemLike[]): string {
  const parts = items
    .filter((i) => !i.isNA && (i.score ?? 0) < i.criterion.maxScore)
    .map((i) => {
      const name = SHORT_NAME[i.criterion.code] ?? i.criterion.code;
      const reason = (i.reason ?? "").trim();
      return reason === "" ? name : `${name}: ${reason}`;
    });

  return parts.join(" · ");
}
