// lib/form/to-docx.ts
// RecordForm → DOCX เวชระเบียนผู้ป่วยนอก จัดหัวข้อตามเกณฑ์ สนย. (Form A1)
//
// ⚠️ เอกสารที่ออกมาคือ "ของจริงที่จะถูกตรวจ" — โครงสร้างหัวข้อจึงต้องตรงกับเกณฑ์
//    ถ้าเปลี่ยนหัวข้อในนี้ ต้องเช็คว่า AI ยังสกัด facts ได้ครบ (npm run test:form)
//
// สิ่งที่ห้ามทำ: เติมข้อความแทนช่องว่าง เช่น "-" หรือ "ไม่มี"
// ช่องที่ผู้ใช้ไม่ได้กรอก ต้องหายไปจากเอกสารเลย ไม่งั้นคะแนนจะสูงกว่าความจริง

import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { RecordFormInput } from "@/lib/form/schema";
import { FORM_SECTIONS } from "@/lib/form/schema";
import { formatThaiDate, formatTime } from "@/lib/form/thai-date";

const FONT = "TH SarabunPSK";

// A4 (11906 DXA) ลบ margin ซ้าย+ขวาอย่างละ 1 นิ้ว = 9026
const CONTENT_WIDTH = 9026;

export type HospitalInfo = {
  name: string;
  code?: string;
};

function p(text: string, opts: { bold?: boolean; size?: number; center?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: 60 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 28, font: FONT })],
  });
}

function heading(text: string) {
  return new Paragraph({
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ text, bold: true, size: 30, font: FONT })],
  });
}

function cell(text: string, width: number, bold = false) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 28, font: FONT })] })],
  });
}

/**
 * หัวกระดาษข้อมูลผู้ป่วยแบบตาราง — ฟอร์มจริงของโรงพยาบาลวางแบบนี้
 *
 * ⚠️ เก็บ "ป้าย: ค่า" ไว้ในช่องเดียวกัน ไม่แยกเป็นสองคอลัมน์
 *    เพราะ mammoth ดึงข้อความจากตารางออกมาโดยให้แต่ละช่องขึ้นบรรทัดใหม่
 *    ถ้าแยกช่องจะได้ "อายุ\n52 ปี" ซึ่ง AI จับคู่ป้ายกับค่าได้ยากขึ้น
 *    และ PHI sanitizer ก็อาศัย label เป็น anchor เหมือนกัน
 */
function patientHeader(form: RecordFormInput): Table | null {
  const pairs: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value?.trim()) pairs.push(`${label}: ${value.trim()}`);
  };

  push("ชื่อ-สกุล", form.patientName);
  push("HN", form.hn);
  push("เพศ", form.gender);
  push("อายุ", form.age);
  push("แผนก", form.department);
  push("สิทธิการรักษา", form.pttype);

  if (pairs.length === 0) return null;

  const widths = [4513, 4513];
  const rows: TableRow[] = [];

  for (let i = 0; i < pairs.length; i += 2) {
    rows.push(
      new TableRow({
        children: [cell(pairs[i], widths[0]), cell(pairs[i + 1] ?? "", widths[1])],
      }),
    );
  }

  return new Table({
    columnWidths: widths,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    rows,
  });
}

/** ข้อความหลายบรรทัด → หลาย Paragraph (docx ไม่รองรับ \n ใน TextRun) */
function multiline(value: string): Paragraph[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => p(line));
}

export function buildRecordDocx(
  form: RecordFormInput,
  hospital: HospitalInfo,
): Promise<Buffer> {
  const body: (Paragraph | Table)[] = [
    p(hospital.name, { bold: true, size: 32, center: true }),
    p("แบบบันทึกการตรวจรักษาผู้ป่วยนอก (OPD Card)", { bold: true, size: 30, center: true }),
    p(""),
  ];

  const header = patientHeader(form);
  if (header) {
    body.push(header, p(""));
  }

  // ── วันเวลาที่มารับบริการ — รวมเป็นบรรทัดเดียวให้อ่านเป็นประโยค ──────────────
  // ฟอร์มเก็บวันที่เป็น ISO (จาก date picker) แต่เอกสารต้องเป็นวันที่ไทย พ.ศ.
  const thaiDate = formatThaiDate(form.serviceDate);
  const time = formatTime(form.serviceTime);

  const dateTimeParts = [
    thaiDate ? `วันที่มารับบริการ ${thaiDate}` : null,
    time ? `เวลา ${time} น.` : null,
  ].filter(Boolean);

  if (dateTimeParts.length > 0) {
    body.push(p(dateTimeParts.join("        ")));
  }

  // ── หัวข้อที่เหลือ วนตาม FORM_SECTIONS จะได้ไม่ตกหล่นเมื่อเพิ่มช่องใหม่ ──────
  for (const section of FORM_SECTIONS) {
    // สองอันนี้จัดวางเองข้างบนแล้ว
    if (section.key === "patient" || section.key === "service") continue;

    const filled = section.fields.filter((f) => {
      const v = form[f.name];
      return typeof v === "string" && v.trim().length > 0;
    });

    // ช่องว่างทั้งหัวข้อ → ไม่ต้องมีหัวข้อนั้นในเอกสารเลย
    if (filled.length === 0) continue;

    if (section.key === "other") {
      // หมายเหตุ/ผู้บันทึก ไม่ใช่หัวข้อที่ถูกให้คะแนน วางท้ายเอกสารแบบเรียบๆ
      body.push(p(""));
      for (const f of filled) {
        const value = String(form[f.name]).trim();
        if (f.name === "recorder") {
          body.push(p(`ผู้บันทึก ${value}`));
        } else {
          body.push(p(`หมายเหตุ: ${value}`));
        }
      }
      continue;
    }

    body.push(heading(section.title));

    for (const f of filled) {
      const value = String(form[f.name]).trim();
      const lines = multiline(value);

      if (filled.length > 1) {
        // มีหลายช่องในหัวข้อเดียว → ใส่ป้ายกำกับช่องด้วย ไม่งั้นอ่านแยกไม่ออก
        body.push(p(`${f.label}:`, { bold: true }));
      }
      body.push(...lines);
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: body,
      },
    ],
  });

  return Packer.toBuffer(doc).then((b) => Buffer.from(b));
}

/** ชื่อไฟล์ที่อ่านรู้เรื่อง — ไม่ใส่ชื่อผู้ป่วยเพราะชื่อไฟล์ไปโผล่ได้หลายที่ */
export function recordDocxFileName(form: RecordFormInput, caseNumber: string): string {
  // ใช้ ISO ในชื่อไฟล์ (ไม่ใช่วันที่ไทย) เพื่อให้เรียงชื่อไฟล์ตามเวลาได้
  const date = form.serviceDate?.trim().replace(/[^\d-]/g, "") ?? "";
  return `OPD-${caseNumber}${date ? `-${date}` : ""}.docx`;
}
