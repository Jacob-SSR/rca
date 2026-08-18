// lib/audit-forms/to-docx.ts
// วาดแผ่นงานของฟอร์มไหนก็ได้เป็น DOCX โดยอ่านโครงจาก registry
//
// ตัวเดียวครอบทั้ง 8 ใบ — เพิ่มฟอร์มใหม่ใน registry แล้วได้ไฟล์ทันที
// ไม่ต้องมาเขียนตัววาดใบละตัวแล้วปล่อยให้มันค่อยๆ ต่างกันไปเรื่อยๆ
//
// ⚠️ แนวนอนเสมอ ฟอร์มพวกนี้ 10-13 คอลัมน์ บนกระดาษแนวตั้งจะบีบจนอ่านไม่ออก

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
import {
  ICD_ERROR_CODES,
  type AuditFormDef,
  type FormColumn,
} from "@/lib/audit-forms/registry";
import {
  computedValue,
  isEmptyRow,
  summarize,
  type SheetRow,
} from "@/lib/audit-forms/compute";
import { formatThaiDate, formatThaiDateShort } from "@/lib/form/thai-date";

const FONT = "TH SarabunPSK";

/** จำนวนบรรทัดในตารางอย่างน้อยเท่านี้ — ต้นฉบับเว้นที่ให้เขียนเพิ่มด้วยมือ */
const MIN_ROWS = 18;

function run(value: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({ text: value, bold: opts.bold, size: opts.size ?? 24, font: FONT });
}

function para(value: string, opts: { bold?: boolean; size?: number; after?: number } = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 60 },
    children: [run(value, opts)],
  });
}

function cell(
  value: string,
  opts: { bold?: boolean; width?: number; center?: boolean } = {},
): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
    children: [
      new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [run(value, { bold: opts.bold, size: 22 })],
      }),
    ],
  });
}

/** คอลัมน์ที่ควรจัดกลางในไฟล์ — ตัวเลขและรหัสสั้นๆ อ่านง่ายกว่าเมื่ออยู่กลางช่อง */
function isCentered(c: FormColumn): boolean {
  return ["date", "time", "int", "score", "select", "computed"].includes(c.kind);
}

/** ค่าที่จะพิมพ์ลงช่อง — ช่องคำนวณคิดสดจากแถว ไม่เชื่อค่าที่เคยเซฟไว้ */
export function cellText(form: AuditFormDef, c: FormColumn, row: SheetRow): string {
  if (c.kind === "computed") {
    const v = computedValue(form, c, row);
    if (v === null) return "";
    return c.compute === "percent" ? v.toFixed(2) : String(v);
  }

  const raw = row[c.key];
  if (raw === null || raw === undefined) return "";

  const s = String(raw).trim();
  if (s === "") return "";

  // วันที่เก็บเป็น ISO ในฐาน แต่ในเอกสารราชการต้องเป็น พ.ศ.
  if (c.kind === "date") return formatThaiDateShort(s);

  return s;
}

function metaLine(form: AuditFormDef, meta: Record<string, unknown>): string {
  return form.meta
    .map((f) => {
      const raw = String(meta[f.key] ?? "").trim();
      const value = raw === "" ? "____________" : f.kind === "date" ? formatThaiDate(raw) : raw;
      return `${f.label} ${value}`;
    })
    .join("   ");
}

export async function buildAuditSheetDocx(
  form: AuditFormDef,
  sheet: { title?: string | null; meta: Record<string, unknown>; rows: SheetRow[] },
): Promise<Buffer> {
  const filled = sheet.rows.filter((r) => !isEmptyRow(form, r));

  const header = new TableRow({
    tableHeader: true,
    children: form.columns.map((c) =>
      cell(c.header, { bold: true, width: c.width, center: true }),
    ),
  });

  const dataRows = filled.map(
    (row) =>
      new TableRow({
        children: form.columns.map((c) =>
          cell(cellText(form, c, row), { center: isCentered(c) }),
        ),
      }),
  );

  const blanks = Array.from(
    { length: Math.max(0, MIN_ROWS - dataRows.length) },
    () => new TableRow({ children: form.columns.map(() => cell("")) }),
  );

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...dataRows, ...blanks],
  });

  const head = [
    para(`Form ${form.code}`, { bold: true, size: 26 }),
    para(form.title, { bold: true, size: 28, after: 120 }),
    para(metaLine(form, sheet.meta), { after: 160 }),
  ];

  const summary = summarize(form, sheet.rows);
  const footer: Paragraph[] = [];

  if (summary.kind === "score") {
    const pct = summary.percentage === null ? "____" : summary.percentage.toFixed(2);
    footer.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [
          run(
            `สรุปผลการตรวจ  คะแนนที่ได้ทั้งหมด ${summary.totalScore}  ` +
              `คะแนนเต็ม ${summary.maxScore}  สัดส่วน ${pct} %`,
            { bold: true, size: 26 },
          ),
        ],
      }),
    );
  }

  if (summary.kind === "icdError") {
    const pct = summary.percentage === null ? "____" : summary.percentage.toFixed(2);
    const errors = ICD_ERROR_CODES.map((c) => `${c} ${summary.errorCounts[c] ?? 0}`).join("  ");
    footer.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [run(`สรุปผลการตรวจ  Error  ${errors}`, { bold: true, size: 26 })],
      }),
      new Paragraph({
        spacing: { after: 60 },
        children: [
          run(
            `จำนวนรหัสที่ผิด ${summary.wrongCount}  รหัสทั้งหมด ${summary.totalCodes}  ` +
              `ผิดพลาด ${pct} %`,
            { bold: true, size: 26 },
          ),
        ],
      }),
    );
  }

  if (form.notes.length > 0) {
    footer.push(
      new Paragraph({ spacing: { before: 160 }, children: [run("หมายเหตุ", { bold: true })] }),
      ...form.notes.map((n) => para(`• ${n}`, { size: 22 })),
    );
  }

  footer.push(para(`อ้างอิง: ${form.sourcePage}`, { size: 20 }));

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 700, bottom: 700, left: 700, right: 700 },
          },
        },
        children: [...head, table, ...footer],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
