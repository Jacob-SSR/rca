// types/pdf-parse.d.ts
// @types/pdf-parse ประกาศไว้แค่ entry point หลัก แต่เราต้อง import จาก
// lib/pdf-parse.js ตรงๆ เพื่อเลี่ยง debug branch ใน index.js
// (ดูเหตุผลเต็มใน lib/documents/extract.ts)
declare module "pdf-parse/lib/pdf-parse.js" {
  type PdfResult = { text: string; numpages: number; info: unknown };
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfResult>;
  export = pdfParse;
}
