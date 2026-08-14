// lib/criteria/schema.ts
// Zod schema ของ data/criteria/*.json — Source of Truth ของเกณฑ์ (สเปกข้อ 2.4)
// ห้ามแก้เกณฑ์ใน Prisma/โค้ดตรงๆ ต้องแก้ JSON แล้ว seed ใหม่

import { z } from "zod";

export const criterionLevelSchema = z.object({
  score: z.number().int().min(0),
  description: z.string().min(1),
});

export const criterionSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]+$/, "criterion code must be UPPER_SNAKE"),
  name: z.string().min(1),
  maxScore: z.number().int().min(1),
  allowNA: z.boolean(),
  naRule: z.string().optional(),
  levels: z.array(criterionLevelSchema).min(2),
  specialRules: z.array(z.string()).optional(),
});

export const criteriaFileSchema = z
  .object({
    meta: z.object({
      source: z.string().min(1),
      form: z.string().min(1),
      scope: z.string().min(1),
      sourcePage: z.string().optional(),
      version: z.number().int().min(1),
      maxScoreTotal: z.number().int().min(1),
      maxScoreNote: z.string().optional(),
      verifiedAgainstSource: z.boolean(),
    }),
    criteria: z.array(criterionSchema).min(1),
  })
  .superRefine((file, ctx) => {
    // maxScore ของแต่ละข้อ ต้องเท่ากับ score สูงสุดใน levels — กันไฟล์เพี้ยนเงียบๆ
    for (const c of file.criteria) {
      const top = Math.max(...c.levels.map((l) => l.score));
      if (top !== c.maxScore) {
        ctx.addIssue({
          code: "custom",
          message: `criterion ${c.code}: maxScore=${c.maxScore} but highest level score=${top}`,
        });
      }
      if (c.allowNA && !c.naRule) {
        ctx.addIssue({
          code: "custom",
          message: `criterion ${c.code}: allowNA=true requires naRule`,
        });
      }
    }

    // ผลรวมต้องตรงกับ meta.maxScoreTotal (A1 = 17)
    const sum = file.criteria.reduce((s, c) => s + c.maxScore, 0);
    if (sum !== file.meta.maxScoreTotal) {
      ctx.addIssue({
        code: "custom",
        message: `sum of criteria maxScore=${sum} but meta.maxScoreTotal=${file.meta.maxScoreTotal}`,
      });
    }

    const codes = new Set<string>();
    for (const c of file.criteria) {
      if (codes.has(c.code)) {
        ctx.addIssue({ code: "custom", message: `duplicate criterion code: ${c.code}` });
      }
      codes.add(c.code);
    }
  });

export type CriteriaFile = z.infer<typeof criteriaFileSchema>;
export type CriteriaFileCriterion = z.infer<typeof criterionSchema>;
