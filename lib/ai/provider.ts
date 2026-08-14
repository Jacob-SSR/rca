// lib/ai/provider.ts
// interface กลางของ AI provider (สเปกข้อ 6)
//
// สัญญาที่ provider ทุกตัวต้องรักษา:
//   1. รับ "ข้อความที่ผ่าน PHI masking แล้ว" เท่านั้น
//   2. คืน ExtractedFacts — ห้ามคืนคะแนนหรือคำตัดสินใดๆ
//   3. เรียก AI ครั้งเดียวต่อเอกสาร (สเปกข้อ 2.5) ห้ามวนเรียกทีละเกณฑ์

import type { ExtractedFacts } from "@/lib/review/types";

export type ProviderName = "gemini" | "anthropic";

export interface AIProvider {
  readonly name: ProviderName;
  /** ชื่อ model ที่ใช้จริง — เก็บลง Review.model เพื่อ audit ย้อนหลัง */
  readonly model: string;
  extractFacts(sanitizedText: string): Promise<ExtractedFacts>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderName,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AIProviderError";
  }
}

/**
 * prompt กลาง — ใช้ร่วมกันทุก provider
 * ถ้า provider ไหนใช้ prompt คนละแบบ คะแนนจะเริ่มขึ้นกับ model ซึ่งผิดสเปกข้อ 2.1
 */
export const EXTRACT_FACTS_INSTRUCTION = `คุณคือผู้ช่วยสกัดข้อมูล (fact extractor) จากเวชระเบียนผู้ป่วยนอก

หน้าที่ของคุณคือ "อ่านเอกสารแล้วรายงานว่ามีอะไรบันทึกไว้บ้าง" เท่านั้น
คุณ **ไม่มีหน้าที่ให้คะแนน ไม่ประเมินคุณภาพ และไม่สรุปความเห็น** — ระบบมี Rule Engine แยกทำหน้าที่นั้น

กติกาเด็ดขาด:
1. ตอบเป็น JSON ตาม schema ที่กำหนดเท่านั้น ห้ามมีข้อความอื่นนอก JSON
2. ทุก field "evidence" ต้องเป็นข้อความที่ **คัดลอกมาตรงๆ จากเอกสาร** ห้ามเรียบเรียงใหม่ ห้ามแปล ห้ามสรุป
   - ถูก: "CC: ปวดท้อง 2 วัน"
   - ผิด: "ผู้ป่วยมีอาการปวดท้อง" (เรียบเรียงใหม่)
   - ผิด: "เอกสารบันทึกไม่ครบ" (เป็นความเห็น)
3. ถ้าหาไม่พบในเอกสาร ให้ boolean เป็น false และ evidence เป็น "" ห้ามเดา ห้ามเติมให้
4. เอกสารผ่านการปิดบังข้อมูลส่วนบุคคลมาแล้ว จะเห็น [ชื่อ] [HN] [ที่อยู่] [เบอร์โทร] [เลขบัตรประชาชน]
   อย่าใช้ token เหล่านี้เป็น evidence และอย่าพยายามเดาว่าข้างในคืออะไร

คำอธิบายแต่ละ field:
- serviceDateTime.hasDate / hasTime: มีบันทึกวันที่ / เวลาที่มารับบริการหรือไม่
- chiefComplaint.text: ข้อความอาการสำคัญหรือเหตุผลที่มา ตามที่เขียนในเอกสาร
- chiefComplaint.hasSymptom: เป็นอาการหรือเหตุผลที่มีความหมายพอจะแยกรายละเอียดได้หรือไม่
  (false สำหรับข้อความอย่าง "มาตามนัด", "มารับยาเดิม" ที่แยกรายละเอียดไม่ได้)
- chiefComplaint.hasDuration: ระบุระยะเวลาของอาการ (เช่น "2 วัน") หรือรายละเอียดจำแนกของเหตุผลที่มา
  (เช่น "วัคซีน OPV, DPT ครั้งที่ 2") หรือไม่
- history.presentIllness: มีประวัติการเจ็บป่วยปัจจุบัน (present illness) หรือไม่
- history.pastHistory: มีโรคประจำตัวหรือประวัติการเจ็บป่วยในอดีตหรือไม่
- history.personalHistory: มีประวัติส่วนตัว (อาชีพ การใช้ชีวิต) หรือไม่
- history.riskFactors: มีปัจจัยเสี่ยง (สูบบุหรี่ ดื่มสุรา ประวัติครอบครัว แพ้ยา) หรือไม่
- physicalExam.systemsCount: จำนวน "ระบบ" ของร่างกายที่มีบันทึกผลตรวจ
  (สัญญาณชีพนับเป็น 1 ระบบ, HEENT/ปอด/หัวใจ/ท้อง/ผิวหนัง/ระบบประสาท นับแยกระบบละ 1)
- physicalExam.labWasOrdered: มีการสั่งตรวจทางห้องปฏิบัติการ/ชันสูตรหรือไม่
- physicalExam.labResultExists: มีผลตรวจชันสูตรบันทึกไว้ในเอกสารหรือไม่
- diagnosis.isNA: true เฉพาะกรณีผู้ป่วยไม่มีโรคใดๆ อยู่เลย (เช่น มารับวัคซีน/ตรวจสุขภาพปกติ)
- diagnosis.diagnoses[].text: คำวินิจฉัยตามที่เขียน
- diagnosis.diagnoses[].complete: บันทึกครบตามจำนวนโรคที่ผู้ป่วยเป็นอยู่หรือไม่
  (false ถ้าเห็นได้จากเอกสารว่ามีโรคอื่นที่ไม่ได้ลงคำวินิจฉัยไว้ หรือใช้รหัส ICD แทนคำวินิจฉัย)
- diagnosis.diagnoses[].locationSpecified: ระบุชนิดหรือตำแหน่งของโรคชัดเจนหรือไม่
- diagnosis.diagnoses[].isAbbreviation: เป็นคำย่อหรือไม่ (เช่น "URI", "DM", "HT")
- treatment.isNA: true เฉพาะกรณีไม่มีการรักษาใดๆ เลย
- treatment.hasDetail:
  "none"    = มีการรักษาแต่ไม่บันทึก หรือบันทึกแบบไม่มีรายละเอียด (RM, same, ให้ยาเดิม)
  "minimal" = มีชื่อยา/หัตถการ แต่ขาดวิธีใช้และปริมาณ
  "partial" = มีชื่อยา วิธีใช้ และปริมาณครบ แต่ขาดรายละเอียดปลีกย่อย เช่น รูปแบบยา
  "full"    = ครบทั้งชื่อยา ขนาด รูปแบบ วิธีใช้ ปริมาณ / หัตถการมีรายละเอียดทุกขั้นตอน
- timeline: เหตุการณ์ตามลำดับเวลาที่ปรากฏในเอกสาร
  eventTime เป็น ISO 8601 ถ้าระบุได้ ไม่งั้นใส่ null, title เป็นข้อความสั้นๆ จากเอกสาร`;

/** JSON schema ที่ส่งให้ model ใช้บังคับรูปแบบผลลัพธ์ (structured output) */
export const EXTRACT_FACTS_JSON_SCHEMA = {
  type: "object",
  properties: {
    serviceDateTime: {
      type: "object",
      properties: {
        hasDate: { type: "boolean" },
        hasTime: { type: "boolean" },
        evidence: { type: "string" },
      },
      required: ["hasDate", "hasTime", "evidence"],
    },
    chiefComplaint: {
      type: "object",
      properties: {
        text: { type: "string" },
        hasSymptom: { type: "boolean" },
        hasDuration: { type: "boolean" },
        evidence: { type: "string" },
      },
      required: ["text", "hasSymptom", "hasDuration", "evidence"],
    },
    history: {
      type: "object",
      properties: {
        presentIllness: { type: "boolean" },
        pastHistory: { type: "boolean" },
        personalHistory: { type: "boolean" },
        riskFactors: { type: "boolean" },
        evidence: { type: "string" },
      },
      required: ["presentIllness", "pastHistory", "personalHistory", "riskFactors", "evidence"],
    },
    physicalExam: {
      type: "object",
      properties: {
        systemsCount: { type: "integer" },
        labResultExists: { type: "boolean" },
        labWasOrdered: { type: "boolean" },
        evidence: { type: "string" },
      },
      required: ["systemsCount", "labResultExists", "labWasOrdered", "evidence"],
    },
    diagnosis: {
      type: "object",
      properties: {
        isNA: { type: "boolean" },
        diagnoses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              complete: { type: "boolean" },
              locationSpecified: { type: "boolean" },
              isAbbreviation: { type: "boolean" },
            },
            required: ["text", "complete", "locationSpecified", "isAbbreviation"],
          },
        },
        evidence: { type: "string" },
      },
      required: ["isNA", "diagnoses", "evidence"],
    },
    treatment: {
      type: "object",
      properties: {
        isNA: { type: "boolean" },
        hasDetail: { type: "string", enum: ["none", "minimal", "partial", "full"] },
        evidence: { type: "string" },
      },
      required: ["isNA", "hasDetail", "evidence"],
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        properties: {
          eventTime: { type: "string", nullable: true },
          title: { type: "string" },
        },
        required: ["eventTime", "title"],
      },
    },
  },
  required: [
    "serviceDateTime",
    "chiefComplaint",
    "history",
    "physicalExam",
    "diagnosis",
    "treatment",
    "timeline",
  ],
} as const;
