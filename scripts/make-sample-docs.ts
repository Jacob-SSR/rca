// scripts/make-sample-docs.ts
// สร้างเอกสารเวชระเบียน OPD ตัวอย่างสำหรับทดสอบ pipeline
//   npm run make:samples   → data/samples/*.docx
//
// ⚠️ ข้อมูลในเอกสารเป็นของสมมติทั้งหมด ชื่อ/HN/เลขบัตร/ที่อยู่/เบอร์โทร ไม่มีอยู่จริง
//    มีไว้เพื่อทดสอบว่า PHI sanitizer ลบได้จริง และ Rule Engine ให้คะแนนถูก
//
// สามฉบับครอบสามสถานการณ์ที่ต้องทำงานต่างกัน
//   1. complete   บันทึกครบทุกหัวข้อ           → คาดว่าได้เต็มหรือใกล้เต็ม 17
//   2. incomplete บันทึกน้อย ขาดหลายหัวข้อ      → คาดว่าได้คะแนนต่ำ
//   3. vaccine    มารับวัคซีน ไม่มีโรค ไม่รักษา → DIAGNOSIS/TREATMENT ควรเป็น N/A
//                                                 คะแนนเต็มต้องลดจาก 17 เหลือ 10

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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

const FONT = "TH SarabunPSK";

// A4 (11906 DXA) ลบ margin ซ้าย+ขวาอย่างละ 1 นิ้ว (1440) = 9026
const CONTENT_WIDTH = 9026;

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
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 28, font: FONT })],
      }),
    ],
  });
}

/**
 * หัวกระดาษข้อมูลผู้ป่วยแบบตาราง — ฟอร์มจริงของโรงพยาบาลมักวางแบบนี้
 * ใช้ทดสอบว่า mammoth ดึงข้อความจากตารางได้ และ PHI sanitizer จับ label ในตารางเจอ
 */
function patientHeader(rows: [string, string, string, string][]) {
  const widths = [1800, 2713, 1800, 2713];
  return new Table({
    columnWidths: widths,
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    rows: rows.map(
      (r) =>
        new TableRow({
          children: [
            cell(r[0], widths[0], true),
            cell(r[1], widths[1]),
            cell(r[2], widths[2], true),
            cell(r[3], widths[3]),
          ],
        }),
    ),
  });
}

function docTitle() {
  return [
    p("โรงพยาบาลพลับพลาชัย จังหวัดบุรีรัมย์", { bold: true, size: 32, center: true }),
    p("แบบบันทึกการตรวจรักษาผู้ป่วยนอก (OPD Card)", { bold: true, size: 30, center: true }),
    p(""),
  ];
}

function build(children: (Paragraph | Table)[]) {
  return new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        children,
      },
    ],
  });
}

// ── 1. เอกสารสมบูรณ์ ──────────────────────────────────────────────────────────
function completeDoc() {
  return build([
    ...docTitle(),
    patientHeader([
      ["ชื่อ-สกุล", "นายสมชาย ใจดี", "HN", "0056321"],
      ["เลขบัตรประชาชน", "3-1099-01234-56-7", "VN", "690814012"],
      ["เพศ", "ชาย", "อายุ", "52 ปี"],
      ["ที่อยู่", "88/4 หมู่ 6 ต.ประโคนชัย อ.ประโคนชัย จ.บุรีรัมย์", "โทรศัพท์", "089-345-6712"],
      ["สิทธิการรักษา", "บัตรทอง (UC)", "แผนก", "อายุรกรรม"],
    ]),
    p(""),
    p("วันที่มารับบริการ 14 สิงหาคม 2569        เวลา 09:15 น."),

    heading("อาการสำคัญ (Chief Complaint)"),
    p("CC: ไข้สูง ไอมีเสมหะ เจ็บคอ 3 วันก่อนมาโรงพยาบาล"),

    heading("ประวัติการเจ็บป่วย (History)"),
    p(
      "PI: 3 วันก่อนมา เริ่มมีไข้สูงลอย หนาวสั่น ไอมีเสมหะสีเหลืองขุ่น เจ็บคอมากเวลากลืน " +
        "กินยาลดไข้ที่บ้านแล้วอาการไม่ดีขึ้น ไม่มีหอบเหนื่อย ไม่มีเจ็บหน้าอก ปฏิเสธอาเจียน ถ่ายเหลว",
    ),
    p("PH: โรคประจำตัว เบาหวานชนิดที่ 2 มา 8 ปี ความดันโลหิตสูง 5 ปี รักษาต่อเนื่องที่ รพ. นี้"),
    p("ยาที่ใช้ประจำ: Metformin 500 mg 1x2 pc, Enalapril 5 mg 1x1 เช้า"),
    p("แพ้ยา: ปฏิเสธการแพ้ยาและอาหาร"),
    p("SH: อาชีพเกษตรกร สูบบุหรี่วันละ 10 มวน มา 20 ปี ดื่มสุราสัปดาห์ละ 2 ครั้ง"),
    p("FH: บิดาเป็นเบาหวาน มารดาเป็นความดันโลหิตสูง"),

    heading("ผลการตรวจร่างกาย (Physical Examination)"),
    p("V/S: T 38.7 °C, BP 138/86 mmHg, PR 98 /min, RR 22 /min, O2 sat 97% room air"),
    p("General: ผู้ป่วยรู้สึกตัวดี ไม่ซีด ไม่เหลือง มีไข้"),
    p("HEENT: pharyngeal injection, tonsil enlarged grade 2 ไม่มี exudate"),
    p("Lungs: coarse crepitation ที่ปอดขวาล่าง ไม่มี wheezing"),
    p("Heart: normal S1 S2 ไม่มี murmur"),
    p("Abdomen: soft, not tender, no hepatosplenomegaly"),
    p("Extremities: no edema, capillary refill < 2 sec"),

    heading("ผลการตรวจทางห้องปฏิบัติการ (Laboratory)"),
    p("CBC: WBC 13,400 /µL (Neutrophil 78%), Hb 12.8 g/dL, Plt 245,000 /µL"),
    p("DTX: 186 mg/dL"),
    p("CXR: infiltration ที่ right lower lobe"),

    heading("คำวินิจฉัยโรค (Diagnosis)"),
    p("1. Community acquired pneumonia, right lower lobe"),
    p("2. Type 2 diabetes mellitus without complication"),
    p("3. Essential hypertension"),

    heading("การรักษา (Treatment)"),
    p("1. Amoxicillin/Clavulanic acid 1 g tablet รับประทานครั้งละ 1 เม็ด วันละ 2 ครั้ง หลังอาหาร นาน 7 วัน"),
    p("2. Paracetamol 500 mg tablet รับประทานครั้งละ 1 เม็ด ทุก 6 ชั่วโมง เวลามีไข้"),
    p("3. Bromhexine 8 mg tablet รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร"),
    p("4. ยาประจำเดิม Metformin และ Enalapril ให้รับประทานต่อเนื่อง"),
    p("5. แนะนำดื่มน้ำมากๆ พักผ่อนให้เพียงพอ งดสูบบุหรี่"),
    p("6. นัดติดตามอาการ 3 วัน หากไข้สูงขึ้นหรือหอบเหนื่อยให้มาก่อนนัด"),

    p(""),
    p("ผู้ตรวจรักษา นพ.กิตติภัทร์ คันธะมาลย์        เวลาที่บันทึก 09:52 น."),
  ]);
}

// ── 2. เอกสารบันทึกไม่ครบ ─────────────────────────────────────────────────────
function incompleteDoc() {
  return build([
    ...docTitle(),
    patientHeader([
      ["ชื่อ-สกุล", "นางสาวมาลี ศรีสุข", "HN", "0071845"],
      ["เพศ", "หญิง", "อายุ", "34 ปี"],
      ["โทรศัพท์", "081-234-5678", "แผนก", "ตรวจโรคทั่วไป"],
    ]),
    p(""),
    p("วันที่ 14 ส.ค. 2569"),

    heading("อาการสำคัญ"),
    p("CC: ปวดท้อง"),

    heading("ประวัติ"),
    p("ปวดท้องบริเวณสะดือ ไม่มีไข้"),

    heading("ตรวจร่างกาย"),
    p("Abdomen: soft, mild tenderness periumbilical"),

    heading("วินิจฉัย"),
    p("Dx: AGE"),

    heading("การรักษา"),
    p("Rx: ยาแก้ปวดท้อง, ORS"),

    p(""),
    p("ผู้ตรวจ พว.รจเรข เขียวรัมย์"),
  ]);
}

// ── 3. มารับวัคซีน — ไม่มีโรค ไม่มีการรักษา (เคส N/A) ─────────────────────────
function vaccineDoc() {
  return build([
    ...docTitle(),
    patientHeader([
      ["ชื่อ-สกุล", "ด.ช.ธนกฤต พูนทรัพย์", "HN", "0068992"],
      ["เลขบัตรประชาชน", "1-3199-00987-65-4", "VN", "690814045"],
      ["เพศ", "ชาย", "อายุ", "1 ปี 6 เดือน"],
      ["ที่อยู่", "12/3 หมู่ 2 ต.โคกขมิ้น อ.พลับพลาชัย จ.บุรีรัมย์", "โทรศัพท์", "092-887-4451"],
      ["ผู้นำมา", "นางสุดา พูนทรัพย์ (มารดา)", "แผนก", "คลินิกเด็กดี"],
    ]),
    p(""),
    p("วันที่มารับบริการ 14 สิงหาคม 2569        เวลา 13:40 น."),

    heading("เหตุผลที่มารับบริการ"),
    p("มารับวัคซีนตามนัด MMR เข็มที่ 2 และ JE เข็มที่ 3 ตามเกณฑ์อายุ 18 เดือน"),

    heading("ประวัติ"),
    p("PI: เด็กสบายดี ไม่มีไข้ ไม่มีอาการเจ็บป่วยในช่วง 7 วันที่ผ่านมา กินได้ นอนหลับดี"),
    p("PH: ปฏิเสธโรคประจำตัว ไม่เคยนอนโรงพยาบาล คลอดครบกำหนด น้ำหนักแรกเกิด 3,100 กรัม"),
    p("ประวัติวัคซีน: ได้รับครบตามเกณฑ์ทุกเข็ม ไม่เคยมีอาการแพ้วัคซีน"),
    p("SH: อาศัยกับบิดามารดา ไม่มีผู้สูบบุหรี่ในบ้าน พัฒนาการสมวัย"),

    heading("ผลการตรวจร่างกาย"),
    p("V/S: T 36.8 °C, PR 110 /min, RR 26 /min, น้ำหนัก 11.2 กก. ส่วนสูง 82 ซม."),
    p("General: เด็กร่าเริง ไม่ซีด ไม่มีไข้"),
    p("HEENT: ไม่พบความผิดปกติ ต่อมน้ำเหลืองไม่โต"),
    p("Lungs: clear both lungs"),
    p("Heart: normal S1 S2 ไม่มี murmur"),
    p("Skin: ไม่มีผื่น"),

    heading("การประเมิน"),
    p("เด็กสุขภาพแข็งแรง ไม่พบภาวะเจ็บป่วยใดๆ พัฒนาการสมวัย เหมาะสมสำหรับรับวัคซีนตามนัด"),

    heading("บริการที่ให้"),
    p("ฉีดวัคซีน MMR เข็มที่ 2 เข้ากล้ามเนื้อต้นแขนซ้าย"),
    p("ฉีดวัคซีน JE เข็มที่ 3 เข้ากล้ามเนื้อต้นแขนขวา"),
    p("สังเกตอาการหลังฉีด 30 นาที ไม่พบอาการข้างเคียง"),
    p("แนะนำมารดาเรื่องการเฝ้าระวังไข้หลังฉีดวัคซีน และนัดครั้งถัดไปเมื่ออายุ 2 ปี 6 เดือน"),

    p(""),
    p("ผู้ให้บริการ พว.สมคิด มนุษย์ชาติ        เวลา 14:25 น."),
  ]);
}

// ── main ──────────────────────────────────────────────────────────────────────
const SAMPLES: [string, () => Document][] = [
  ["opd-01-complete.docx", completeDoc],
  ["opd-02-incomplete.docx", incompleteDoc],
  ["opd-03-vaccine-na.docx", vaccineDoc],
];

async function main() {
  const dir = path.join(process.cwd(), "data", "samples");
  await mkdir(dir, { recursive: true });

  for (const [name, make] of SAMPLES) {
    const buffer = await Packer.toBuffer(make());
    await writeFile(path.join(dir, name), buffer);
    console.log(`✅ ${path.join("data", "samples", name)}  (${buffer.byteLength} bytes)`);
  }

  console.log("\nอัปโหลดไฟล์เหล่านี้ที่หน้าแรกเพื่อทดสอบ pipeline");
  console.log("⚠️ ข้อมูลในเอกสารเป็นของสมมติทั้งหมด ไม่ใช่ผู้ป่วยจริง");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
