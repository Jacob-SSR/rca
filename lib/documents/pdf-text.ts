// lib/documents/pdf-text.ts
// อ่านข้อความจาก PDF ให้ภาษาไทยออกมาถูก
//
// ── ปัญหาที่ต้องแก้ ──────────────────────────────────────────────────────────
// PDF ที่ HOSxP พิมพ์ออกมาฝังฟอนต์ไทยแบบ subset (Identity-H + CIDFontType2)
// แล้วเขียน ToUnicode มา "ไม่ครบ" — สระและวรรณยุกต์บางตัวไม่มีใน CMap เลย
// ตัวอ่าน PDF จึงต้อง fallback เป็น identity แล้วได้อักขระมั่วออกมาแทน เช่น
//   "เสงี่ยมศักดิ์"  →  "เสงีÉยมศักดิÍ"
//   "๒๕๖๙"          →  "ŚŝŞš"
//
// ตรวจสอบกับไฟล์จริงของโรงพยาบาลแล้วพบว่า
//   - ToUnicode มีอยู่ทุกฟอนต์ แต่ครอบคลุมแค่ 175 CID จากที่ใช้จริง
//   - รหัสที่หายไป ไม่มีฟอนต์ไหนใน PDF map ไว้เลย และ cmap ในไฟล์ฟอนต์ที่ฝังมา
//     ก็ถูก subset จนไม่มีข้อมูลนั้นแล้ว → กู้จากตัวไฟล์ไม่ได้ ต้องมีตารางแก้เอง
//
// ── สามชั้นที่ทำ ────────────────────────────────────────────────────────────
// 1. ใช้ pdfjs-dist รุ่นปัจจุบัน (ไม่ใช่ pdf-parse ที่ฝัง pdf.js ปี 2018 ไว้)
//    แค่เปลี่ยนตัวอ่าน ตัวอักษรไทยส่วนใหญ่ก็ถูกทันที
// 2. ตารางแก้อักขระที่เหลือ — ทุกบรรทัดยืนยันจากบริบทในเอกสารจริง (ดูข้างล่าง)
// 3. ถ้าแก้แล้วยังเหลืออักขระมั่วเกินเกณฑ์ → ถือว่าอ่านไม่ได้ ไม่ให้ตรวจคะแนน
//    ⚠️ ข้อ 3 สำคัญที่สุด — ให้คะแนนเวชระเบียนจากข้อความที่อ่านผิด
//       คือการสร้างผลตรวจที่ผิดโดยไม่มีใครรู้ว่าผิด

import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * ตารางแก้อักขระที่ ToUnicode ไม่ครอบคลุม
 *
 * ทุกรายการยืนยันจากบริบทในไฟล์จริง ไม่ได้เดา:
 *   U+00C9 É  "เสงีÉยมศักดิ" → "เสงี่ยม"     = ไม้เอก
 *   U+00CA Ê  "ทัÊ งสิÊ น"    → "ทั้งสิ้น"     = ไม้โท
 *   U+00CD Í  "ศักดิÍ"       → "ศักดิ์"       = ทัณฑฆาต
 *     สามตัวนี้เรียงต่อกัน C9→0E48, CA→0E49, CD→0E4C จึงเติม CB/CC ตรงกลาง
 *     (ไม้ตรี/ไม้จัตวา) ตามลำดับเดียวกัน
 *   U+0477 ѷ  "ทัѷวไป" "เริѷม" "ทีѷ" "สัѷง" → ไม้เอก (ฟอนต์อีกตัวในเอกสารเดียวกัน)
 *   U+049F ҟ  "ครั ҟง"       → "ครั้ง"        = ไม้โท
 *   U+0158..U+0161 → เลข 0-9 เรียงกัน ยืนยันจากหลายจุด:
 *     "řŜŜ ม.Ś" = 144 ม.2 · "ŘšŝŞřśśśŜŞ" = 0956133346 · "řŘ:śş:Śš" = 10:37:29
 *
 * ⚠️ ห้ามเดาเพิ่มเอง ถ้าเจอไฟล์ที่ยังอ่านไม่ออก ให้หาบริบทยืนยันก่อนเติม
 *    เติมผิดหนึ่งตัว = เวชระเบียนถูกอ่านผิดโดยไม่มีใครสังเกต
 */
const REPAIR = new Map<number, string>([
  [0x00c9, "่"], // ่
  [0x00ca, "้"], // ้
  [0x00cb, "๊"], // ๊
  [0x00cc, "๋"], // ๋
  [0x00cd, "์"], // ์
  [0x0477, "่"], // ่
  [0x049f, "้"], // ้
]);

for (let d = 0; d <= 9; d++) REPAIR.set(0x0158 + d, String(d));

export function repairThaiPdfText(text: string): string {
  let changed = false;
  const out = [...text]
    .map((ch) => {
      const fixed = REPAIR.get(ch.codePointAt(0) ?? 0);
      if (fixed === undefined) return ch;
      changed = true;
      return fixed;
    })
    .join("");
  return changed ? out : text;
}

/**
 * อักขระที่ไม่ควรโผล่ในเวชระเบียนไทย
 * ไทย + ASCII + เครื่องหมายวรรคตอนที่ใช้จริง ถือว่าปกติ ที่เหลือคือสัญญาณว่าอ่านผิด
 */
function isSuspicious(code: number): boolean {
  if (code < 0x80) return false; // ASCII
  if (code >= 0x0e00 && code <= 0x0e7f) return false; // ไทย
  // เครื่องหมายที่เจอในเอกสารจริงและไม่ใช่ความผิดพลาด
  if ([0x00a0, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026, 0x00b0].includes(code)) {
    return false;
  }
  return true;
}

export type ThaiReadability = {
  /** สัดส่วนอักขระที่น่าจะอ่านผิด (0-1) */
  ratio: number;
  /** ตัวอย่างอักขระที่พบ ไว้ใส่ในข้อความแจ้งเตือน */
  samples: string[];
};

/** เกินเท่านี้ถือว่าอ่านไม่ได้ — 1% ของทั้งเอกสารก็มากพอที่จะทำให้คะแนนเพี้ยน */
const MAX_BAD_RATIO = 0.01;

export function checkThaiReadability(text: string): ThaiReadability {
  const chars = [...text];
  if (chars.length === 0) return { ratio: 0, samples: [] };

  const bad = new Map<string, number>();
  for (const ch of chars) {
    if (isSuspicious(ch.codePointAt(0) ?? 0)) bad.set(ch, (bad.get(ch) ?? 0) + 1);
  }

  const total = [...bad.values()].reduce((a, b) => a + b, 0);

  return {
    ratio: total / chars.length,
    samples: [...bad.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([ch]) => ch),
  };
}

export function isUnreadableThai(text: string): boolean {
  return checkThaiReadability(text).ratio > MAX_BAD_RATIO;
}

type Item = { x: number; w: number; str: string };

/**
 * ประกอบ item ในหนึ่งบรรทัดให้เป็นข้อความ
 *
 * ⚠️ ห้ามเรียงทีละ item ตามแกน x — วรรณยุกต์ไทยมีความกว้าง 0 และวางทับตัวก่อนหน้า
 *    เรียงตาม x เมื่อไหร่ วรรณยุกต์จะเลื่อนไปอยู่หลังพยัญชนะตัวถัดไปทันที
 *    ("เสงียมศักดิ่ ์" แทนที่จะเป็น "เสงี่ยมศักดิ์")
 *
 * ⚠️ แต่จะเชื่อลำดับใน content stream อย่างเดียวก็ไม่ได้ ใบ OPD เป็นหลายคอลัมน์
 *    stream กระโดดข้ามคอลัมน์ไปมา ได้ "วันที่ เวลา 08:37:485 พฤษภาคม 2569"
 *
 * ทางออก: ตัดเป็นช่วงเมื่อ x กระโดดถอยหลัง แล้วเรียง "ช่วง" ตาม x
 *         ภายในช่วงคงลำดับเดิม → วรรณยุกต์ไม่หลุด และคอลัมน์เรียงถูก
 */
function joinLine(items: Item[]): string {
  const segments: { x: number; text: string }[] = [];
  let current: { x: number; text: string } | null = null;
  let prevEnd: number | null = null;

  for (const it of items) {
    if (current === null || (prevEnd !== null && it.x < prevEnd - 2)) {
      current = { x: it.x, text: "" };
      segments.push(current);
      prevEnd = null;
    }
    // เว้นวรรคเฉพาะเมื่อมีช่องว่างจริงบนหน้ากระดาษ
    if (prevEnd !== null && it.x - prevEnd > 1.2 && !current.text.endsWith(" ")) {
      current.text += " ";
    }
    current.text += it.str;
    prevEnd = it.x + it.w;
  }

  segments.sort((a, b) => a.x - b.x);

  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("  ");
}

/**
 * ที่อยู่ของฟอนต์มาตรฐานที่ pdfjs ต้องใช้ตอนเจอ PDF ที่ไม่ได้ฝังฟอนต์มา
 * ไม่ชี้ให้ถูก pdfjs จะพ่น warning รัวๆ ทุกหน้า และอ่านฟอนต์พวกนั้นไม่ออก
 */
function standardFontsDir(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("pdfjs-dist/package.json");
    return join(dirname(pkg), "standard_fonts/");
  } catch {
    return undefined;
  }
}

/** อ่าน PDF ทั้งไฟล์เป็นข้อความ (ยังไม่ผ่านตัวแก้อักขระ) */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // import ตอนใช้งาน — pdfjs เป็น ESM ก้อนใหญ่ ไม่ควรโหลดตอน boot
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: standardFontsDir(),
    // ปิดทุกอย่างที่ไม่จำเป็นสำหรับการอ่านข้อความ — ไฟล์มาจากภายนอก
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  const pages: string[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    // จัดเข้าบรรทัดตามพิกัดแนวตั้ง — เผื่อคลาดกัน 3 หน่วยถือว่าบรรทัดเดียวกัน
    const lines = new Map<number, Item[]>();

    for (const item of content.items) {
      if (!("str" in item) || item.str === "") continue;

      const x = item.transform[4] as number;
      const y = Math.round(item.transform[5] as number);

      let key: number | null = null;
      for (const existing of lines.keys()) {
        if (Math.abs(existing - y) <= 3) {
          key = existing;
          break;
        }
      }
      if (key === null) {
        key = y;
        lines.set(key, []);
      }

      lines.get(key)!.push({ x, w: item.width ?? 0, str: item.str });
    }

    const text = [...lines.entries()]
      .sort((a, b) => b[0] - a[0]) // บนลงล่าง (y ของ PDF นับจากล่างขึ้นบน)
      .map(([, items]) => joinLine(items))
      .filter(Boolean)
      .join("\n");

    if (text.trim() !== "") pages.push(text);

    page.cleanup();
  }

  await doc.destroy();

  return pages.join("\n\n");
}

/**
 * ภาษาไทยที่ "วรรณยุกต์หายไปทั้งเอกสาร"
 *
 * PDF บางไฟล์ map วรรณยุกต์ไปที่ glyph ที่ไม่มี Unicode เลย ตัวอักษรจึงหายเงียบๆ
 * ได้ "ขอมูล" แทน "ข้อมูล" — ไม่มีตัวมั่วให้จับ ตัวตรวจอักขระแปลกปลอมจึงมองไม่เห็น
 *
 * ภาษาไทยจริงมีวรรณยุกต์ราว 3-6% ของตัวอักษรไทย ถ้าต่ำกว่า 0.5% ในเอกสารยาวๆ
 * แปลว่าน่าจะหล่นหาย — เตือนไว้ ไม่บล็อก เพราะเอกสารสั้นหรือเนื้อหาบางแบบ
 * ก็อาจมีวรรณยุกต์น้อยจริงได้ การบล็อกจะปฏิเสธไฟล์ที่ใช้ได้
 */
export function looksMissingToneMarks(text: string): boolean {
  const thai = [...text].filter((c) => {
    const n = c.codePointAt(0) ?? 0;
    return n >= 0x0e01 && n <= 0x0e2e; // พยัญชนะไทย
  }).length;

  if (thai < 200) return false; // สั้นเกินกว่าจะสรุป

  const tones = [...text].filter((c) => {
    const n = c.codePointAt(0) ?? 0;
    return n >= 0x0e48 && n <= 0x0e4b;
  }).length;

  return tones / thai < 0.005;
}
