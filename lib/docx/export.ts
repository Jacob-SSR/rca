// lib/docx/export.ts
// สร้าง DOCX สรุปผลการตรวจ (สเปกข้อ 9 / 10.13) ด้วย package `docx`
//
// เนื้อหาต้องพอให้เอาไปแนบแฟ้มคุณภาพได้: คะแนนต่อหัวข้อ + เหตุผล + evidence จริง
// และต้องระบุ CriteriaSet เวอร์ชันที่ใช้ตอนตรวจ เพื่อ audit ย้อนหลัง

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ReviewDetail } from "@/lib/review/queries";

// ฟอนต์ราชการที่โรงพยาบาลใช้อยู่ — ถ้าเครื่องปลายทางไม่มี Word จะ fallback ให้เอง
const FONT = "TH SarabunPSK";

type TimelineRow = { eventTime: Date | null; title: string; source: string };

function p(text: string, opts: { bold?: boolean; size?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 28, font: FONT })],
  });
}

function cell(
  text: string,
  opts: { bold?: boolean; width?: number; center?: boolean } = {},
): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: text.split("\n").map(
      (line) =>
        new Paragraph({
          alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text: line, bold: opts.bold, size: 26, font: FONT })],
        }),
    ),
  });
}

function thaiDateTime(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(d);
}

export async function buildReviewDocx(
  review: ReviewDetail,
  timeline: TimelineRow[] = [],
): Promise<Buffer> {
  const scoreLine =
    review.totalScore === null || review.maxScore === null
      ? "ยังไม่มีผลคะแนน"
      : `${review.totalScore} / ${review.maxScore} คะแนน` +
        (review.percentage ? ` (${Number(review.percentage).toFixed(2)}%)` : "");

  const header: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "สรุปผลการตรวจสอบคุณภาพการบันทึกข้อมูลผู้ป่วยนอก",
          bold: true,
          size: 36,
          font: FONT,
        }),
      ],
    }),
    p(review.criteriaSet.name, { bold: true }),
    p(`เกณฑ์ที่ใช้: ${review.criteriaSet.code} (เวอร์ชัน ${review.criteriaSet.version})`),
  ];

  if (review.criteriaSet.source) {
    header.push(p(`อ้างอิง: ${review.criteriaSet.source}`));
  }

  header.push(
    p(""),
    p(`เลขที่เคส: ${review.case.caseNumber}`),
    ...(review.case.title ? [p(`เรื่อง: ${review.case.title}`)] : []),
    p(`เอกสารที่ตรวจ: ${review.document.fileName}`),
    p(`วันที่ตรวจ: ${thaiDateTime(review.createdAt)}`),
    p(`ผู้ช่วยสกัดข้อมูล: ${review.provider}${review.model ? ` (${review.model})` : ""}`),
    p(""),
    p(`คะแนนรวม: ${scoreLine}`, { bold: true, size: 32 }),
    p(""),
  );

  const scoreTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell("หัวข้อ", { bold: true, width: 22 }),
          cell("คะแนน", { bold: true, width: 10, center: true }),
          cell("เหตุผล", { bold: true, width: 34 }),
          cell("หลักฐานจากเอกสาร", { bold: true, width: 34 }),
        ],
      }),
      ...review.items.map(
        (item) =>
          new TableRow({
            children: [
              cell(`${item.criterion.code}\n${item.criterion.name}`),
              cell(item.isNA ? "N/A" : `${item.score ?? 0} / ${item.criterion.maxScore}`, {
                center: true,
              }),
              cell(item.reason ?? "-"),
              cell(item.evidence ?? "— ไม่พบข้อความอ้างอิงในเอกสาร —"),
            ],
          }),
      ),
    ],
  });

  const body: (Paragraph | Table)[] = [...header, scoreTable];

  if (timeline.length > 0) {
    body.push(
      p(""),
      p("ลำดับเหตุการณ์ (Timeline)", { bold: true, size: 30 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              cell("เวลา", { bold: true, width: 30 }),
              cell("เหตุการณ์", { bold: true, width: 55 }),
              cell("ที่มา", { bold: true, width: 15, center: true }),
            ],
          }),
          ...timeline.map(
            (e) =>
              new TableRow({
                children: [
                  cell(e.eventTime ? thaiDateTime(e.eventTime) : "ไม่ระบุเวลา"),
                  cell(e.title),
                  cell(e.source, { center: true }),
                ],
              }),
          ),
        ],
      }),
    );
  }

  body.push(
    p(""),
    p("หมายเหตุ", { bold: true }),
    p("• คะแนนทั้งหมดตัดสินโดย Rule Engine ตามเกณฑ์ที่ระบุข้างต้น ไม่ใช่จากดุลยพินิจของ AI"),
    p("• AI ทำหน้าที่สกัดข้อความจากเอกสารเท่านั้น และข้อมูลระบุตัวบุคคลถูกปิดบังก่อนส่งเข้าประมวลผล"),
    p("• หัวข้อที่เป็น N/A ไม่ถูกนับรวมทั้งในคะแนนที่ได้และคะแนนเต็ม"),
  );

  const doc = new Document({ sections: [{ children: body }] });
  return Buffer.from(await Packer.toBuffer(doc));
}
