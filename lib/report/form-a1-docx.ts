// lib/report/form-a1-docx.ts
// วาด Form A1 เป็น DOCX ให้หน้าตาตรงกับต้นฉบับ สนย. (คู่มือ มีนาคม 2558 หน้า 50)
//
// ต้นฉบับเป็นตาราง 12 คอลัมน์วางแนวนอน มีหัวฟอร์มให้เติมข้อมูลสถานพยาบาล
// และบรรทัดสรุปท้ายฟอร์ม — ทำครบทั้งสามส่วน ไม่งั้นเอาไปยื่นแทนของจริงไม่ได้
//
// ⚠️ ต้องเป็นแนวนอน (landscape) 12 คอลัมน์บนกระดาษแนวตั้งจะบีบจนอ่านไม่ออก

import {
  AlignmentType,
  Document,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { A1_SCORE_COLUMNS, type A1Report } from "@/lib/report/form-a1";

const FONT = "TH SarabunPSK";

/** จำนวนบรรทัดว่างขั้นต่ำในฟอร์ม — ต้นฉบับมีที่ว่างให้เขียนเพิ่มด้วยมือ */
const MIN_ROWS = 20;

function text(value: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({ text: value, bold: opts.bold, size: opts.size ?? 26, font: FONT });
}

function cell(
  value: string,
  opts: { bold?: boolean; width?: number; align?: "left" | "center" } = {},
): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: opts.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [text(value, { bold: opts.bold, size: 24 })],
      }),
    ],
  });
}

/** ความกว้างแต่ละคอลัมน์ (%) — รวมต้องได้ 100 */
const WIDTHS = {
  hn: 9,
  date: 8,
  time: 6,
  score: 6, // × 6 คอลัมน์ = 36
  maxScore: 7,
  totalScore: 7,
  note: 27,
};

function thaiDate(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

/** ช่วงวันที่บนหัวฟอร์ม — ไม่ระบุช่วง = เอาทั้งหมดที่มี */
function rangeLabel(from: Date | null, to: Date | null): string {
  if (from && to) return `${thaiDate(from)} ถึง ${thaiDate(to)}`;
  if (from) return `ตั้งแต่ ${thaiDate(from)}`;
  if (to) return `ถึง ${thaiDate(to)}`;
  return "ทั้งหมดที่บันทึกไว้ในระบบ";
}

export async function buildFormA1Docx(
  report: A1Report,
  meta: { hospitalCode?: string; hospitalName?: string; reviewer?: string } = {},
): Promise<Buffer> {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell("HN", { bold: true, width: WIDTHS.hn, align: "center" }),
      cell("วันที่", { bold: true, width: WIDTHS.date, align: "center" }),
      cell("เวลา", { bold: true, width: WIDTHS.time, align: "center" }),
      ...A1_SCORE_COLUMNS.map((c) =>
        cell(c.header, { bold: true, width: WIDTHS.score, align: "center" }),
      ),
      cell("คะแนนเต็ม", { bold: true, width: WIDTHS.maxScore, align: "center" }),
      cell("คะแนนที่ได้", { bold: true, width: WIDTHS.totalScore, align: "center" }),
      cell("หมายเหตุ", { bold: true, width: WIDTHS.note, align: "center" }),
    ],
  });

  const dataRows = report.rows.map(
    (r) =>
      new TableRow({
        children: [
          cell(r.hn, { align: "center" }),
          cell(r.date, { align: "center" }),
          cell(r.time, { align: "center" }),
          ...r.scores.map((s) =>
            cell(s === null ? "" : s === "na" ? "na" : String(s), { align: "center" }),
          ),
          cell(r.maxScore === null ? "" : String(r.maxScore), { align: "center" }),
          cell(r.totalScore === null ? "" : String(r.totalScore), { align: "center" }),
          // ต้นฉบับใส่ "-" เมื่อไม่มีอะไรต้องหมายเหตุ
          cell(r.note === "" ? "-" : r.note),
        ],
      }),
  );

  // เติมบรรทัดว่างให้ฟอร์มดูเหมือนต้นฉบับ และมีที่ให้เขียนเพิ่มด้วยมือ
  const blanks = Array.from({ length: Math.max(0, MIN_ROWS - dataRows.length) }, () => {
    return new TableRow({
      children: Array.from({ length: 12 }, () => cell("")),
    });
  });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...dataRows, ...blanks],
  });

  const titleBlock = [
    new Paragraph({ children: [text("Form A1", { bold: true, size: 28 })] }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        text("ตารางบันทึกผลการตรวจสอบคุณภาพการบันทึกข้อมูลผู้ป่วยนอก", {
          bold: true,
          size: 30,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        text(
          `รหัสสถานพยาบาล ${meta.hospitalCode || "____________"}  ` +
            `ชื่อ ${meta.hospitalName || "____________________________"}  ` +
            `วันที่ ${thaiDate(new Date())}  ` +
            `ตรวจโดย ${meta.reviewer || "____________________"}`,
        ),
      ],
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [text(`ช่วงข้อมูลที่นำมาสรุป: ${rangeLabel(report.from, report.to)}`)],
    }),
  ];

  const pct = report.percentage === null ? "____" : report.percentage.toFixed(2);

  const footer = [
    new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [
        text(
          `สรุปผลการตรวจ  คะแนนที่ได้ทั้งหมด ${report.sumTotal}  ` +
            `คะแนนเต็ม ${report.sumMax}  สัดส่วน ${pct} %`,
          { bold: true, size: 28 },
        ),
      ],
    }),
    new Paragraph({
      spacing: { before: 160 },
      children: [text("หมายเหตุประกอบฟอร์ม", { bold: true })],
    }),
    new Paragraph({
      children: [text("• ข้อมูลผู้ป่วย 1 ราย อยู่ใน 1 บรรทัด ตามคู่มือ สนย. มีนาคม 2558", { size: 24 })],
    }),
    new Paragraph({
      children: [
        text(
          "• “na” = ไม่ประเมินหัวข้อนั้น และไม่นำคะแนนเต็มของหัวข้อนั้นมารวม " +
            "คะแนนเต็มต่อรายจึงไม่เท่ากับ 17 เสมอไป",
          { size: 24 },
        ),
      ],
    }),
    new Paragraph({
      children: [text("• วันที่ในตารางเป็น วัน/เดือน/ปี พุทธศักราช", { size: 24 })],
    }),
    new Paragraph({
      children: [
        text(
          "• คะแนนตัดสินโดย Rule Engine ตามเกณฑ์ในคู่มือ ไม่ใช่ดุลยพินิจของ AI " +
            "(AI สกัดข้อความจากเอกสารเท่านั้น)",
          { size: 24 },
        ),
      ],
    }),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            // 12 คอลัมน์ต้องใช้แนวนอน
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [...titleBlock, table, ...footer],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
