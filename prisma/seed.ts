// prisma/seed.ts
// อ่าน data/criteria/opd-a1.json → สร้าง CriteriaSet A1_OPD_2015 v1 + Criterion + CriterionLevel
//
// idempotent: รันซ้ำได้ ผลลัพธ์เหมือนเดิม
// ⚠️ ถ้าแก้ "เนื้อหาเกณฑ์" ให้ขึ้น version ใหม่ใน JSON (v2, v3...) แล้ว seed
//    → ได้ CriteriaSet คนละแถว (code A1_OPD_2015_V2) ตามสเปกข้อ 2.4
//    Review เก่าจะยังชี้ CriteriaSet เวอร์ชันเดิมเสมอ ไม่เปลี่ยนย้อนหลัง

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { criteriaFileSchema } from "../lib/criteria/schema";

const CRITERIA_FILE = path.join(process.cwd(), "data", "criteria", "opd-a1.json");
const BASE_CODE = "A1_OPD_2015";

/** v1 = "A1_OPD_2015", v2+ = "A1_OPD_2015_V2" — เวอร์ชันแรกคงชื่อเดิมตามสเปก */
function setCodeFor(version: number): string {
  return version === 1 ? BASE_CODE : `${BASE_CODE}_V${version}`;
}

async function main() {
  const raw = await readFile(CRITERIA_FILE, "utf8");
  const file = criteriaFileSchema.parse(JSON.parse(raw));

  if (!file.meta.verifiedAgainstSource) {
    throw new Error(
      "criteria file is not marked verifiedAgainstSource — ตรวจกับ PDF ต้นฉบับ สนย. ก่อน seed",
    );
  }

  const code = setCodeFor(file.meta.version);

  const criteriaSet = await prisma.criteriaSet.upsert({
    where: { code },
    create: {
      code,
      name: file.meta.form,
      version: file.meta.version,
      source: file.meta.source,
      sourcePage: file.meta.sourcePage,
      maxScore: file.meta.maxScoreTotal,
      isActive: true,
    },
    update: {
      name: file.meta.form,
      version: file.meta.version,
      source: file.meta.source,
      sourcePage: file.meta.sourcePage,
      maxScore: file.meta.maxScoreTotal,
    },
  });

  for (const c of file.criteria) {
    const criterion = await prisma.criterion.upsert({
      where: { criteriaSetId_code: { criteriaSetId: criteriaSet.id, code: c.code } },
      create: {
        criteriaSetId: criteriaSet.id,
        code: c.code,
        name: c.name,
        maxScore: c.maxScore,
        allowNA: c.allowNA,
        naRule: c.naRule ?? null,
      },
      update: {
        name: c.name,
        maxScore: c.maxScore,
        allowNA: c.allowNA,
        naRule: c.naRule ?? null,
      },
    });

    for (const level of c.levels) {
      await prisma.criterionLevel.upsert({
        where: { criterionId_score: { criterionId: criterion.id, score: level.score } },
        create: {
          criterionId: criterion.id,
          score: level.score,
          description: level.description,
        },
        update: { description: level.description },
      });
    }

    // ลบ level ที่ไม่มีใน JSON แล้ว (กรณีแก้เกณฑ์ให้สั้นลง)
    await prisma.criterionLevel.deleteMany({
      where: {
        criterionId: criterion.id,
        score: { notIn: c.levels.map((l) => l.score) },
      },
    });
  }

  // ── ตรวจผลลัพธ์ตามสเปกข้อ 10.5 ────────────────────────────────────────────
  const check = await prisma.criteriaSet.findUniqueOrThrow({
    where: { code },
    include: { criteria: { include: { levels: true } } },
  });

  const sum = check.criteria.reduce((s, c) => s + c.maxScore, 0);
  console.log(`✅ CriteriaSet ${check.code} (v${check.version})`);
  console.log(`   criteria: ${check.criteria.length} ข้อ, maxScore รวม = ${sum}`);
  for (const c of check.criteria) {
    console.log(
      `   - ${c.code.padEnd(17)} max=${c.maxScore} allowNA=${c.allowNA} levels=${c.levels.length}`,
    );
  }

  if (sum !== check.maxScore) {
    throw new Error(`seed mismatch: criteria sum=${sum} but CriteriaSet.maxScore=${check.maxScore}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
