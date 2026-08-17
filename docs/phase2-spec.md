# RCA — Phase 2 Spec: HOSxP Adapter (อ่านอย่างเดียว)

สถานะ: **ร่างเพื่อตรวจ** — ยังไม่เริ่ม implement
ขอบเขต Phase 2 รอบนี้: **HOSxP adapter อ่านอย่างเดียว เท่านั้น**
(Auth / Claude provider / versioning ยังไม่เอาเข้ารอบนี้)

---

## 1. เป้าหมาย

Phase 1 ตรวจได้เฉพาะเอกสารที่คนอัปโหลดเข้ามาทีละไฟล์ — ซึ่งแปลว่า
ต้องมีคน export เวชระเบียนออกมาเป็น DOCX ก่อน จึงตรวจได้ทีละใบ ช้าและไม่ครอบคลุม

Phase 2 ให้ระบบ **ดึง visit จาก HOSxP มาตรวจได้ตรงๆ** โดยไม่ต้องอัปโหลดอะไร
เลือกช่วงวันที่ → เห็นรายการ visit → กดตรวจ → ได้คะแนนตามเกณฑ์ A1 ชุดเดิม

ผลลัพธ์ที่ต้องได้: สุ่มตรวจคุณภาพบันทึกได้จำนวนมากขึ้นมาก โดยเกณฑ์และวิธีคิดคะแนน
**เหมือนกันเป๊ะ**กับที่ตรวจจาก DOCX — คะแนนจากสองทางต้องเทียบกันได้

---

## 2. หลักการที่ต้องยึด (ห้ามละเมิด)

หลักการทั้ง 6 ข้อของ Phase 1 ยังใช้ทั้งหมด และเพิ่มอีก 4 ข้อ

7. **HOSxP เป็น read-only เด็ดขาด** — ห้ามมี `INSERT` / `UPDATE` / `DELETE` /
   `CREATE` / `ALTER` / `DROP` ในโค้ดที่ยิงไปฝั่ง HOSxP แม้แต่บรรทัดเดียว
   บังคับสามชั้น: user ใน MySQL มีสิทธิ์ `SELECT` อย่างเดียว, pool แยกตัวจาก DB ของแอป,
   และมี guard ในโค้ดที่ throw ถ้า SQL ไม่ได้ขึ้นต้นด้วย `SELECT`
   เหตุผล: นี่คือ production DB ของโรงพยาบาล พังแล้วไม่ใช่แค่ระบบนี้เจ๊ง

8. **PHI ถูกกันตั้งแต่ระดับ query ไม่ใช่แค่ mask ทีหลัง** —
   คำสั่ง `SELECT` ที่ยิงไป HOSxP **ห้าม select คอลัมน์ชื่อ/ที่อยู่/เบอร์โทร/เลขบัตร**
   ตั้งแต่แรก (`patient.pname/fname/lname`, `patient.addrpart`, `patient.hometel`,
   `patient.cid` ฯลฯ) — ข้อมูลที่ไม่เคยออกจาก DB ย่อมรั่วไม่ได้
   ตัว PHI sanitizer ยังต้องรันทับอีกชั้นเหมือนเดิม เพราะ free text
   (`opdscreen.cc`, `ovst_doctor_diag.diag_text`) มีชื่อคนปนได้เสมอ

9. **คะแนนต้องเทียบกันได้ระหว่าง DOCX กับ HOSxP** — ใช้ CriteriaSet ชุดเดียวกัน
   Rule Engine ตัวเดียวกัน และ `ExtractedFacts` โครงเดียวกัน
   ห้ามเขียนกติกาให้คะแนนชุดที่สองสำหรับ HOSxP โดยเด็ดขาด

10. **ไม่ scan ทั้ง DB** — ดึงเฉพาะ visit ที่ผู้ใช้เลือก และจำกัดจำนวนต่อครั้ง
    (ดูข้อ 8 เรื่อง quota) — HOSxP เป็น production ห้ามยิง query ที่กิน I/O หนัก
    ในเวลาราชการ

---

## 3. Non-goals — ห้ามทำใน Phase 2 รอบนี้

- ❌ **เขียนกลับ HOSxP ทุกรูปแบบ** — รวมถึงตาราง log ของตัวเอง
- ❌ HOSxP auth adapter (ใช้ user/รหัสของ HOSxP มาล็อกอิน) — คนละงาน แยกรอบ
- ❌ ระบบ auth ใดๆ — ยังเป็น internal tool ใน LAN เหมือนเดิม
- ❌ Claude provider — ยังใช้ Gemini ตัวเดียว
- ❌ ตรวจอัตโนมัติทั้งเดือน / cron / batch ทั้งก้อน — Phase 3
- ❌ IPD (Form A3/A4) และ ICD A-H (Form A2) — เกณฑ์คนละชุด
- ❌ Dashboard/chart สรุปผลรายแพทย์ — Phase 3
- ❌ เขียน adapter ให้ HIS ยี่ห้ออื่น

---

## 4. Prisma schema ที่เพิ่ม

Phase 1 เขียนหมายเหตุไว้แล้วว่า Phase 2 ค่อยเพิ่ม `hosxpPatientRef` / `hosxpVisitRef`

```prisma
model Case {
  // ... field เดิมทั้งหมด ไม่เปลี่ยน

  // อ้างอิงกลับไป HOSxP — ใช้ตรวจซ้ำและ audit
  // ⚠️ hosxpPatientRef คือ HN = PHI ห้ามส่งเข้า AI และห้ามโชว์บนหน้าจอที่ไม่มี auth
  hosxpPatientRef String?  @db.VarChar(20)
  hosxpVisitRef   String?  @db.VarChar(20)   // VN

  @@unique([hosxpVisitRef])   // 1 visit = 1 case กันตรวจซ้ำโดยไม่ตั้งใจ
  @@index([hosxpPatientRef])
}

model Review {
  // ... field เดิมทั้งหมด ไม่เปลี่ยน

  // "document" = อัปโหลด DOCX (Phase 1) | "hosxp" = ดึงจาก HOSxP (Phase 2)
  sourceType String @default("document")
}
```

`Document` **ไม่เปลี่ยน** — visit ที่ดึงจาก HOSxP ก็ยังสร้าง `Document` หนึ่งแถว
โดยเก็บข้อความที่ render แล้วลง `extractedText`, `fileName` เป็น `HOSXP-{vn}.txt`,
`filePath` เป็น path ของ snapshot ที่เขียนลง volume

เหตุผลที่ต้องเก็บ snapshot: **HOSxP แก้ย้อนหลังได้** ถ้าไม่เก็บไว้
พอเปิดผลตรวจเก่าดูอีกที ข้อมูลอาจไม่ใช่ตัวที่ใช้ตอนให้คะแนนแล้ว — audit ไม่ได้

---

## 5. โครงสร้างโค้ด

```
lib/hosxp/
├── client.ts      # mysql2 pool แยกตัว + read-only guard
├── queries.ts     # SELECT ทั้งหมด อยู่ที่นี่ที่เดียว
├── render.ts      # แถวจาก HOSxP → ข้อความเวชระเบียน (เข้า pipeline เดิม)
├── overrides.ts   # fact ที่ DB รู้แน่นอน ใช้ทับผลจาก AI
└── types.ts
```

### `client.ts` — ยืมแบบจาก `ppc-hos-10667/lib/db.ts`

```ts
const pool = mysql.createPool({
  host: env.HOSXP_DB_HOST,
  port: env.HOSXP_DB_PORT,
  user: env.HOSXP_DB_USER,        // ⚠️ ต้องเป็น user ที่มีสิทธิ์ SELECT อย่างเดียว
  password: env.HOSXP_DB_PASS,
  database: env.HOSXP_DB_NAME,
  charset: "tis620",              // HOSxP ใช้ TIS-620 ไม่ใช่ utf8mb4 — ต่อผิดภาษาไทยเพี้ยนทั้งระบบ
  multipleStatements: false,      // กัน stacked-query injection
  connectionLimit: 4,             // จำกัดไว้ อย่าไปแย่ง connection ของ HOSxP
});
```

**read-only guard** — ทุก query ต้องผ่านฟังก์ชันเดียวที่เช็คก่อนยิง:

```ts
export async function hosxpSelect<T>(sql: string, params: unknown[]): Promise<T[]> {
  if (!/^\s*SELECT\s/i.test(sql)) {
    throw new Error("HOSxP client รับเฉพาะ SELECT");
  }
  if (/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|TRUNCATE|GRANT)\b/i.test(sql)) {
    throw new Error("พบคำสั่งที่ไม่ใช่ SELECT ใน SQL ที่ส่งเข้า HOSxP client");
  }
  // ...
}
```

guard นี้ไม่ได้แทนสิทธิ์ระดับ MySQL — เป็น**ชั้นที่สอง** ไว้ให้พังตั้งแต่ตอนเขียนโค้ด
ไม่ใช่ไปพังตอน production

### กติกาการเขียน SQL (ยืมวินัยจาก ppc-hos-10667)

1. ค่าจาก request → placeholder `?` เสมอ ห้าม concat แม้แต่วันที่
2. `assertDate()` เช็ค `YYYY-MM-DD` ก่อนทุกครั้ง แม้จะส่งเป็น param แล้ว (defense-in-depth)
3. SQL fragment สร้างจาก constant เท่านั้น ค่าที่เป็น identifier ใช้ whitelist
4. คอมเมนต์ลำดับ param กำกับทุก query ที่มี subquery
5. cast ทุกค่าที่ออกจาก DB — `Number()` / `String(x ?? "").trim()`

---

## 6. ตาราง HOSxP ที่ใช้ และแมปไปเกณฑ์ A1

ตารางและคอลัมน์ที่ **ยืนยันแล้ว**ว่ามีใช้จริงใน `ppc-hos-10667`:

| เกณฑ์ | ตาราง / คอลัมน์ |
|---|---|
| `SERVICE_DATETIME` | `ovst.vstdate`, `ovst.vsttime` |
| `CC` | `opdscreen.cc` |
| `HISTORY` | `opdscreen` (ช่องประวัติ — **ต้องยืนยันชื่อคอลัมน์**) |
| `PHYSICAL_EXAM` | `opdscreen` (สัญญาณชีพ — **ต้องยืนยันชื่อคอลัมน์**) + `lab_head` / `lab_order` / `lab_items` |
| `DIAGNOSIS` | `ovst_doctor_diag.diag_text` (คำวินิจฉัยเป็นข้อความ) และ `ovstdiag.icd10` + `diagtype` |
| `TREATMENT` | `opitemrece` (`icode`, `qty`) + `drugitems` / `nondrugitems` |

ตารางประกอบ: `vn_stat` (visit หลัก), `patient` (**เอาแค่ `hn` ห้าม select ชื่อ/ที่อยู่**),
`doctor`, `doctor_position`, `kskdepartment`, `pttype`

เงื่อนไขที่ต้องมีทุก query: `ovst.an IS NULL` — กรองเอาเฉพาะ OPD ไม่เอาที่ admit
(`ppc-hos-10667` ใช้เงื่อนไขนี้ทุก query เช่นกัน)

### ⚠️ ต้องยืนยันกับ schema จริงก่อนเขียนโค้ด

`ppc-hos-10667` ใช้แค่ `opdscreen.cc` เท่านั้น จึงยืนยันชื่อคอลัมน์อื่นไม่ได้จากที่นั่น
ก่อนเริ่มข้อ 12.2 ต้องรัน `DESCRIBE opdscreen;` แล้วเทียบก่อน โดยเฉพาะ:

- ช่องสัญญาณชีพ (คาดว่า `bps` `bpd` `temperature` `pulse` `rr` `bw` `height` `o2sat`)
- ช่องประวัติ / อาการ (คาดว่า `symptom` หรือ `hpi`)
- ช่องตรวจร่างกาย (บาง รพ. อยู่ที่ `ovst_doctor_diag` ไม่ใช่ `opdscreen`)
- คอลัมน์วิธีใช้ยาใน `opitemrece` (ต้องมีเพื่อให้ `TREATMENT` แยกระดับ 1/2/3 ได้)

**ห้ามเดาชื่อคอลัมน์แล้วเขียนโค้ดไปก่อน** — query ที่ผิดบน production DB
อย่างน้อยก็ error อย่างมากก็ไปกิน I/O ฟรีๆ

---

## 7. Pipeline Phase 2

ยึดหลักการข้อ 9: **ใช้ pipeline เดิมทั้งเส้น** เปลี่ยนแค่ต้นทาง

```
เลือกช่วงวันที่ / แผนก บนหน้าจอ
   ↓
queries.ts ดึงรายการ visit (ยังไม่ดึงเนื้อหา)        ← SELECT อย่างเดียว
   ↓
ผู้ใช้เลือก visit ที่จะตรวจ
   ↓
queries.ts ดึงเนื้อหาของ visit นั้น                  ← ไม่ select ชื่อ/ที่อยู่/เบอร์โทร
   ↓
render.ts ประกอบเป็นข้อความเวชระเบียน               ← เก็บ snapshot ลง volume
   ↓  ───────────── ตั้งแต่จุดนี้ลงไปคือ pipeline เดิมของ Phase 1 ไม่แก้อะไรเลย ─────────────
PHI sanitizer
   ↓
Gemini extractFacts() — 1 call
   ↓
overrides.ts ทับ fact ที่ DB รู้แน่นอน               ← จุดเดียวที่เพิ่มเข้ามา
   ↓
Rule Engine → ReviewItem[]
   ↓
Review + Timeline + แสดงผล + Export DOCX
```

### จุดที่เพิ่ม: deterministic overrides

`overrides.ts` ทับเฉพาะ fact ที่ **HOSxP รู้แน่นอนกว่า AI** — รายการนี้ปิด ห้ามขยาย
โดยไม่แก้สเปก เพราะทุกตัวที่เพิ่มคือการเอาคะแนนออกจากมือ AI ซึ่งดี แต่ต้องตั้งใจ

| fact | มาจาก | เหตุผล |
|---|---|---|
| `serviceDateTime.hasDate` | `ovst.vstdate IS NOT NULL` | เป็น column ตรงๆ AI ไม่ต้องเดา |
| `serviceDateTime.hasTime` | `ovst.vsttime IS NOT NULL` | เดียวกัน |
| `physicalExam.labWasOrdered` | มีแถวใน `lab_head` ของ vn นั้น | **AI ไม่มีทางรู้** ว่าสั่งแล็บแล้วแต่ไม่บันทึกผล |
| `physicalExam.labResultExists` | มี `lab_order.lab_order_result` ที่ไม่ว่าง | เดียวกัน |
| `treatment.isNA` | ไม่มีแถวใน `opitemrece` ของ vn นั้น | แยก "ไม่มีการรักษา" (N/A) ออกจาก "มีแต่ไม่บันทึก" (0 คะแนน) ได้แน่นอน |

ตัวที่ 3-4 สำคัญมาก — เกณฑ์ `PHYSICAL_EXAM` ระดับ 3 คือ *"ตรวจมากกว่าสองระบบ
แต่ไม่บันทึกผลชันสูตร **ทั้งๆ ที่มีผลการตรวจชันสูตร**"* ซึ่งต้องรู้ว่ามีการสั่งแล็บจริงไหม
Phase 1 ต้องให้ AI เดาจากข้อความ Phase 2 รู้จาก DB ได้เลย

ทุก override ต้องบันทึกไว้ใน `ReviewItem.reason` ว่ามาจาก HOSxP ไม่ใช่จาก AI
เช่น `"(จาก HOSxP) มีการส่งตรวจชันสูตร 2 รายการ แต่ไม่พบผลในบันทึก"`

---

## 8. Config

```
HOSXP_ENABLED=false          # default ปิด — เปิดเมื่อพร้อมเท่านั้น
HOSXP_DB_HOST=
HOSXP_DB_PORT=3306
HOSXP_DB_USER=rca_readonly   # ⚠️ ต้องมีสิทธิ์ SELECT อย่างเดียว
HOSXP_DB_PASS=
HOSXP_DB_NAME=hos

HOSXP_MAX_VISITS_PER_QUERY=200   # กันเผลอดึงทั้งเดือน
HOSXP_QUERY_TIMEOUT_MS=15000     # ตัดทิ้งถ้า query ช้าผิดปกติ อย่าค้างบน production
```

SQL ที่ DBA ต้องรันให้ (ใส่ใน `docs/sql/hosxp-readonly-user.sql`):

```sql
CREATE USER 'rca_readonly'@'<ip ของเครื่อง rca>' IDENTIFIED BY '<รหัส>';
GRANT SELECT ON hos.* TO 'rca_readonly'@'<ip ของเครื่อง rca>';
-- ห้าม GRANT อย่างอื่นเด็ดขาด และห้ามใช้ '%' เป็น host
```

จำกัด host เป็น IP เดียว ไม่ใช่ `%` — ถ้ารหัสหลุด ก็ยังต่อจากเครื่องอื่นไม่ได้

---

## 9. ลำดับการ build

1. `DESCRIBE` ตารางที่จะใช้บน HOSxP จริง แล้วเติมชื่อคอลัมน์ลงข้อ 6 ให้ครบก่อน
2. ขอ DBA สร้าง user read-only + ทดสอบว่า `INSERT` แล้ว **ถูกปฏิเสธจริง**
3. `lib/hosxp/client.ts` + read-only guard + เทสต์ว่า guard โยน error กับ SQL ที่ไม่ใช่ SELECT
4. `lib/hosxp/queries.ts` — query รายการ visit (วันที่ + แผนก) ทดสอบกับข้อมูลจริง
5. `lib/hosxp/queries.ts` — query เนื้อหาราย visit
6. `lib/hosxp/render.ts` — ประกอบเป็นข้อความ + `npm run inspect` ตรวจว่า PHI ไม่หลุด
7. `lib/hosxp/overrides.ts` + เทสต์ด้วย mock (เหมือน `scripts/test-rule-engine.ts`)
8. ต่อเข้า pipeline — `POST /api/hosxp/review`
9. UI: หน้าเลือกช่วงวันที่ → ตารางรายการ visit → ปุ่มตรวจ
10. เทียบผล: เอา visit ที่มี DOCX อยู่แล้วมาตรวจทั้งสองทาง คะแนนควรใกล้เคียงกัน
    ถ้าต่างมาก แปลว่า `render.ts` ประกอบข้อความไม่ครบ

**ห้ามข้ามข้อ 1-2** — เขียนโค้ดก่อนรู้ schema จริงคือการเดา และต่อ production DB
ด้วย user ที่ยังไม่ได้พิสูจน์ว่า read-only จริง คือความเสี่ยงที่ไม่ควรรับ

---

## 10. เทสต์ที่ต้องมี

ทั้งหมดต้องรันได้โดย **ไม่ต่อ HOSxP จริง** (เหมือน Phase 1 ที่เทสต์ได้โดยไม่มี DB)

| เทสต์ | ตรวจอะไร |
|---|---|
| `test:hosxp-guard` | guard โยน error กับ INSERT/UPDATE/DELETE/DROP และปล่อยผ่านเฉพาะ SELECT |
| `test:hosxp-overrides` | mock แถวจาก HOSxP → override ทับ fact ถูกตัว และไม่แตะ fact อื่น |
| `test:hosxp-render` | mock แถว → ข้อความที่ประกอบออกมามีครบทุกหัวข้อที่เกณฑ์ต้องใช้ |
| `test:phi` (เดิม) | เพิ่มเคส: ข้อความที่ render จาก HOSxP ต้องไม่มี PHI หลงเหลือ |

---

## 11. ความเสี่ยงที่ต้องระวัง

| ความเสี่ยง | วิธีกัน |
|---|---|
| query หนักไปกวน HOSxP ในเวลาราชการ | `connectionLimit: 4`, timeout 15 วิ, จำกัดจำนวน visit ต่อครั้ง, แนะนำให้ตรวจนอกเวลา |
| ภาษาไทยเพี้ยน | `charset: "tis620"` — ผิดตรงนี้พังทั้งระบบและดูออกยาก |
| ชื่อคนไข้ปนใน free text แล้วหลุดเข้า AI | PHI sanitizer รันทับเสมอ + `npm run inspect` ตรวจก่อนเปิดใช้ |
| HN โชว์บนหน้าจอที่ใครก็เข้าได้ | ยังไม่มี auth — **ต้องคุยกันก่อนว่าจะโชว์ HN บนหน้าจอไหม** หรือรอ auth ก่อน |
| ข้อมูลใน HOSxP ถูกแก้ย้อนหลัง ทำให้ audit ไม่ตรง | เก็บ snapshot ข้อความลง `Document.extractedText` + volume ทุกครั้ง |
| เผลอเขียนกลับ | user read-only + guard ในโค้ด + ไม่มีโค้ดเขียนอยู่เลย |

---

## 12. คำถามที่ต้องตอบก่อนเริ่ม

1. **จะโชว์ HN บนหน้าจอไหม** — ตอนนี้ระบบไม่มี auth ใครในวง LAN ก็เปิด `:3800` ได้
   ถ้าโชว์ HN เท่ากับเปิดข้อมูลผู้ป่วยให้ทุกคนในโรงพยาบาล
   ทางเลือก: (ก) ไม่โชว์ HN เลย ใช้ caseNumber แทน (ข) ทำ auth ก่อนค่อยทำ adapter
2. **DBA ยอมสร้าง user read-only ให้ไหม** และเครื่อง rca ต่อ HOSxP ได้ทาง network หรือยัง
3. **ตรวจย้อนหลังได้กี่วัน** — มีผลกับ index และความหนักของ query
4. `opdscreen` ของ รพ. เก็บประวัติ/ตรวจร่างกายไว้ที่คอลัมน์ไหน (ข้อ 6)
