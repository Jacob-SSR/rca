// lib/ai/facts.schema.ts
// Zod schema ของ ExtractedFacts — validate ผลลัพธ์จาก AI ก่อนเข้า Rule Engine
//
// AI จะส่งอะไรมาก็ได้ แต่ต้องผ่านด่านนี้ก่อนเสมอ
// ถ้า field ไหนหาย ให้ค่า default ที่ "อนุรักษ์นิยม" (= ถือว่าไม่พบการบันทึก)
// ไม่ใช่เดาว่ามี — เพราะการเดาว่ามีจะปั่นคะแนนขึ้นโดยไม่มีหลักฐาน

import { z } from "zod";
import type { ExtractedFacts } from "@/lib/review/types";

const evidence = z.string().default("");

export const extractedFactsSchema = z.object({
  serviceDateTime: z
    .object({
      hasDate: z.boolean().default(false),
      hasTime: z.boolean().default(false),
      evidence,
    })
    .default({ hasDate: false, hasTime: false, evidence: "" }),

  chiefComplaint: z
    .object({
      text: z.string().default(""),
      hasSymptom: z.boolean().default(false),
      hasDuration: z.boolean().default(false),
      evidence,
    })
    .default({ text: "", hasSymptom: false, hasDuration: false, evidence: "" }),

  history: z
    .object({
      presentIllness: z.boolean().default(false),
      pastHistory: z.boolean().default(false),
      personalHistory: z.boolean().default(false),
      riskFactors: z.boolean().default(false),
      evidence,
    })
    .default({
      presentIllness: false,
      pastHistory: false,
      personalHistory: false,
      riskFactors: false,
      evidence: "",
    }),

  physicalExam: z
    .object({
      systemsCount: z.coerce.number().int().min(0).max(20).default(0),
      labResultExists: z.boolean().default(false),
      labWasOrdered: z.boolean().default(false),
      evidence,
    })
    .default({ systemsCount: 0, labResultExists: false, labWasOrdered: false, evidence: "" }),

  diagnosis: z
    .object({
      isNA: z.boolean().default(false),
      diagnoses: z
        .array(
          z.object({
            text: z.string().default(""),
            complete: z.boolean().default(false),
            locationSpecified: z.boolean().default(false),
            isAbbreviation: z.boolean().default(false),
          }),
        )
        .default([]),
      evidence,
    })
    .default({ isNA: false, diagnoses: [], evidence: "" }),

  treatment: z
    .object({
      isNA: z.boolean().default(false),
      hasDetail: z.enum(["none", "minimal", "partial", "full"]).default("none"),
      evidence,
    })
    .default({ isNA: false, hasDetail: "none", evidence: "" }),

  timeline: z
    .array(
      z.object({
        eventTime: z.string().nullable().default(null),
        title: z.string().default(""),
      }),
    )
    .default([]),
});

/**
 * parse + normalize ผลจาก AI
 * - ตัด timeline ที่ไม่มี title ทิ้ง (ไม่มีประโยชน์ ทำให้หน้าจอรก)
 * - ถ้า labResultExists=true ต้องถือว่า labWasOrdered=true ด้วย (มีผลแปลว่าสั่งแล้ว)
 */
export function parseExtractedFacts(raw: unknown): ExtractedFacts {
  const facts = extractedFactsSchema.parse(raw);

  return {
    ...facts,
    physicalExam: {
      ...facts.physicalExam,
      labWasOrdered: facts.physicalExam.labWasOrdered || facts.physicalExam.labResultExists,
    },
    timeline: facts.timeline.filter((e) => e.title.trim().length > 0),
  };
}
