# RCA — Phase 2 Spec: ฟอร์มบันทึกเวชระเบียน (CRUD) + HOSxP prefill

สถานะ: **ร่างเพื่อตรวจ** — ยังไม่เริ่ม implement
ฉบับนี้เขียนทับร่างเดิมที่เข้าใจโจทย์ผิด (ร่างเดิมคิดว่า HOSxP เป็นต้นทางของการตรวจ)

---

## 1. โจทย์จริง

> "อยากให้กรอก HN แล้วข้อมูลเด้งมาให้เอง และแก้ไขได้ (ไม่ใช่แก้ในฐานข้อมูล
> คือแก้ในข้อความไฟล์ Word ที่สร้างมาให้เอง) แล้วสร้างไฟล์ DOCX แล้วให้ AI อ่าน
> ก็คือ CRUD เพื่อสร้างเอกสาร DOCX แล้วนำไฟล์นั้นมาให้ AI ตรวจ"

แปลเป็นงาน:

```
กรอก HN → HOSxP เด้งข้อมูลมาเติมฟอร์ม → แก้ไขในหน้าจอได้ → กด "สร้างเอกสาร"
   → ได้ DOCX ตามแบบ สนย. → เข้า pipeline เดิม → AI ตรวจ → คะแนน
```

**HOSxP เป็นแค่ตัวเติมข้อมูลตั้งต้น (prefill) ไม่ใช่ต้นทางของการให้คะแนน**
ต้นทางของการตรวจยังเป็น DOCX เหมือน Phase 1 ทุกประการ

ผลที่ตามมาที่สำคัญ: **ระบบทำงานได้เต็มรูปแบบโดยไม่ต้องต่อ HOSxP เลย**
HOSxP เป็นของเสริมที่เพิ่มทีหลังได้ — จึงไม่ต้องรอ DBA ก่อนเริ่มงาน

---

## 2. "form เหมือน สนย." — มีสองฟอร์ม ต้องทำทั้งคู่

เปิดเอกสารต้นฉบับ (สนย., มี.ค. 2558) แล้วพบว่า **Form A1 คือตารางสรุปผลตรวจ
ไม่ใช่ฟอร์มเวชระเบียน** (หน้า 17 = ตัวอย่างกรอกแล้ว, หน้า 55 = ฟอร์มเปล่า)

### ฟอร์ม ก. — ฟอร์มกรอกเวชระเบียน (ตัวที่ CRUD)

เอกสารต้นฉบับไม่ได้กำหนดหน้าตา OPD card ไว้ แต่กำหนด **หัวข้อที่ต้องมี** ผ่านเกณฑ์
6 ข้อ ฟอร์มกรอกจึงต้องมีช่องตรงกับ 6 หัวข้อนั้นเป๊ะ — กรอกครบ = ได้ 17 คะแนน

| ช่องในฟอร์ม | เกณฑ์ที่ตรงกัน | maxScore |
|---|---|---|
| วันที่ + เวลาที่มารับบริการ | `SERVICE_DATETIME` | 1 |
| อาการสำคัญ / เหตุผลที่มา | `CC` | 2 |
| ประวัติปัจจุบัน · โรคประจำตัว/อดีต · ประวัติส่วนตัว/ปัจจัยเสี่ยง | `HISTORY` | 3 |
| ผลตรวจร่างกาย (แยกรายระบบ) + ผลชันสูตร | `PHYSICAL_EXAM` | 4 |
| คำวินิจฉัยโรค (หลายรายการ) | `DIAGNOSIS` | 4 |
| การรักษา (ยา/หัตถการ) | `TREATMENT` | 3 |

### ฟอร์ม ข. — Form A1 ตารางสรุปผลตรวจ (ตัวที่ export)

ทำตามหน้า 55 เป๊ะ — นี่คือเอกสารที่เอาไปแนบแฟ้มคุณภาพจริง

```
รหัสสถานพยาบาล ____ ชื่อ ____ วันที่ ____ ตรวจโดย ____

HN | วันที่ | เวลา | วัน/เวลา | CC | ประวัติ | ตรวจร่างกาย | คำวินิจฉัย | การรักษา | คะแนนเต็ม | คะแนนที่ได้ | หมายเหตุ

สรุปผลการตรวจ  คะแนนที่ได้ทั้งหมด ____ คะแนนเต็ม ____ สัดส่วน ____ %
```

- คอลัมน์คะแนน 6 ช่องเรียงตามลำดับในเอกสารต้นฉบับ — **ห้ามสลับ**
- ช่อง N/A ให้ใส่ `N/A` ไม่ใช่ `0` และ "คะแนนเต็ม" ของแถวนั้นลดตาม
- "หมายเหตุ" = `ReviewItem.reason` ของข้อที่เสียคะแนน (ตัวอย่างในต้นฉบับ:
  *"คำวินิจฉัย Myalgia ไม่บอกตำแหน่ง"*) — ตรงกับที่ Rule Engine ผลิตอยู่แล้ว
- export ได้ทีละหลาย Review ในไฟล์เดียว (เลือกช่วงวันที่ / เลือกเคส)

---

## 3. หลักการที่เพิ่มจาก Phase 1

หลักการ 6 ข้อของ Phase 1 ยังใช้ทั้งหมด และเพิ่ม

7. **ฟอร์มคือแหล่งความจริงที่แก้ได้ DOCX คือผลลัพธ์ที่ generate ออกมา**
   แก้ฟอร์ม → generate DOCX ใหม่ → `Document.version` +1 (field นี้มีอยู่แล้วใน Phase 1)
   ไม่แก้ DOCX ตรงๆ และไม่ parse DOCX กลับมาเป็นฟอร์ม

8. **ห้ามเขียนกลับ HOSxP ทุกกรณี** — prefill เป็น `SELECT` อย่างเดียว
   บังคับสามชั้น: user MySQL สิทธิ์ `SELECT` เท่านั้น, pool แยกจาก DB ของแอป,
   และ guard ในโค้ดที่ throw ถ้า SQL ไม่ขึ้นต้นด้วย `SELECT`

9. **ระบบต้องทำงานได้เต็มรูปแบบเมื่อ `HOSXP_ENABLED=false`**
   ปิด HOSxP แล้วต้องยังกรอกฟอร์มเอง สร้าง DOCX และตรวจได้ครบ
   — ห้ามเขียนโค้ดที่พังเมื่อไม่มี HOSxP

10. **คะแนนยังมาจาก AI อ่าน DOCX เท่านั้น ห้าม shortcut**
    ถึงจะรู้ค่าในฟอร์มอยู่แล้วก็ห้ามเอาไปคำนวณคะแนนตรงๆ
    เพราะจุดประสงค์คือตรวจว่า "เอกสารที่ออกมา" มีคุณภาพพอไหม
    ถ้า shortcut คะแนนจะกลายเป็นการเช็คว่ากรอกฟอร์มครบไหม ซึ่งคนละเรื่องกัน

> **หมายเหตุออกแบบ** — ข้อ 10 ทำให้เกิด round trip: ฟอร์ม → DOCX → text → AI → facts
> ทั้งที่ facts บางส่วนรู้อยู่แล้วจากฟอร์ม ตั้งใจให้เป็นแบบนี้ เพราะ DOCX คือ
> "เอกสารที่ใช้จริง" และต้องถูกตรวจอย่างที่คนตรวจจะอ่านมัน
> ถ้าอยากประหยัด quota ทีหลัง ค่อยคุยเรื่อง cache ตาม hash ของข้อความ ไม่ใช่ shortcut คะแนน

---

## 4. Non-goals

- ❌ เขียนกลับ HOSxP ทุกรูปแบบ
- ❌ HOSxP auth adapter (ใช้ user HOSxP ล็อกอิน) — คนละงาน
- ❌ ระบบ auth — **แต่ดูข้อ 9 เรื่องความเสี่ยง HN**
- ❌ Claude provider — ยังใช้ Gemini ตัวเดียว
- ❌ แก้ DOCX ตรงๆ แล้ว sync กลับเข้าฟอร์ม
- ❌ IPD (A3/A4), ICD A-H (A2)
- ❌ ดึง visit ทั้งช่วงวันที่มาตรวจรวดเดียว — Phase 3
- ❌ Dashboard/chart สรุปรายแพทย์ — Phase 3

---

## 5. Prisma schema ที่เพิ่ม

```prisma
/// ฟอร์มบันทึกเวชระเบียน — ตัวที่ CRUD และ generate DOCX ออกมา
model RecordForm {
  id     String @id @default(cuid())
  caseId String

  // ── ข้อมูลผู้ป่วย ──────────────────────────────────────────────────────────
  // ⚠️ hn / patientName เป็น PHI — ถูก mask ก่อนเข้า AI เสมอ
  hn          String? @db.VarChar(20)
  patientName String? @db.VarChar(200)
  age         String? @db.VarChar(50)   // "52 ปี" / "1 ปี 6 เดือน" — เก็บเป็นข้อความตามที่กรอก
  gender      String? @db.VarChar(20)
  department  String? @db.VarChar(100)
  pttype      String? @db.VarChar(100)

  // ── 6 หัวข้อตามเกณฑ์ A1 ────────────────────────────────────────────────────
  serviceDate     String? @db.VarChar(30)   // "14 สิงหาคม 2569"
  serviceTime     String? @db.VarChar(20)   // "09:15"

  chiefComplaint  String? @db.Text

  presentIllness  String? @db.Text
  pastHistory     String? @db.Text
  personalHistory String? @db.Text

  vitalSigns      String? @db.Text
  physicalExam    String? @db.Text          // ผลตรวจร่างกายรายระบบ
  labResult       String? @db.Text

  diagnosis       String? @db.Text          // หลายรายการ บรรทัดละ 1 โรค
  treatment       String? @db.Text          // หลายรายการ บรรทัดละ 1 อย่าง
  note            String? @db.Text

  // ── ที่มาของข้อมูล ─────────────────────────────────────────────────────────
  source       String    @default("manual")  // "manual" | "hosxp"
  hosxpVisitRef String?  @db.VarChar(20)     // VN ตอน prefill
  prefilledAt  DateTime?

  case      Case     @relation(fields: [caseId], references: [id], onDelete: Cascade)
  documents Document[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([caseId])
  @@index([hn])
}

model Case {
  // ... เดิมทั้งหมด
  forms RecordForm[]

  // Phase 1 เขียนหมายเหตุไว้ว่า Phase 2 ค่อยเพิ่ม
  hosxpPatientRef String? @db.VarChar(20)
  hosxpVisitRef   String? @db.VarChar(20)
}

model Document {
  // ... เดิมทั้งหมด

  // DOCX ที่ generate จากฟอร์ม จะผูกกลับไปที่ฟอร์มต้นทาง
  // null = ไฟล์ที่ผู้ใช้อัปโหลดเอง (Phase 1)
  recordFormId String?
  recordForm   RecordForm? @relation(fields: [recordFormId], references: [id])

  @@index([recordFormId])
}

model Review {
  // ... เดิมทั้งหมด
  sourceType String @default("upload")  // "upload" | "form"
}
```

`Document.version` ที่มีอยู่แล้วใช้ได้พอดี — แก้ฟอร์มแล้ว generate ใหม่ = version ถัดไป
Review เก่ายังชี้ Document version เก่า จึง audit ย้อนหลังได้ว่าตอนให้คะแนนนั้น
เอกสารหน้าตาอย่างไร

---

## 6. โครงสร้างโค้ดที่เพิ่ม

```
lib/form/
├── schema.ts          # Zod ของ RecordForm (ใช้ทั้ง API และ UI)
└── to-docx.ts         # RecordForm → DOCX ตามแบบ สนย.

lib/docx/
└── form-a1.ts         # หลาย Review → ตาราง Form A1 (หน้า 55)

lib/hosxp/
├── client.ts          # pool แยก + read-only guard
├── queries.ts         # SELECT ทั้งหมดอยู่ที่นี่ที่เดียว
├── to-form.ts         # แถวจาก HOSxP → ค่าตั้งต้นของ RecordForm
└── types.ts

app/api/forms/
├── route.ts                    # GET list · POST create
└── [id]/
    ├── route.ts                # GET · PATCH · DELETE
    ├── generate/route.ts       # POST → สร้าง DOCX + Document
    └── review/route.ts         # POST → generate + รัน pipeline ในคราวเดียว

app/api/hosxp/
└── lookup/route.ts             # GET ?hn=... → ค่าตั้งต้นของฟอร์ม (ไม่บันทึกอะไร)

app/api/reports/
└── form-a1/route.ts            # GET → DOCX ตาราง Form A1

app/forms/
├── new/page.tsx
└── [id]/page.tsx               # ฟอร์มแก้ไข + ปุ่มสร้างเอกสาร/ตรวจ
```

---

## 7. HOSxP prefill

### กติกาความปลอดภัย

```ts
// lib/hosxp/client.ts
const pool = mysql.createPool({
  host: env.HOSXP_DB_HOST,
  port: env.HOSXP_DB_PORT,
  user: env.HOSXP_DB_USER,     // ⚠️ ต้องมีสิทธิ์ SELECT อย่างเดียว
  password: env.HOSXP_DB_PASS,
  database: env.HOSXP_DB_NAME,
  charset: "tis620",           // HOSxP ใช้ TIS-620 — ต่อผิดภาษาไทยเพี้ยนทั้งระบบ
  multipleStatements: false,   // กัน stacked-query injection
  connectionLimit: 4,          // อย่าไปแย่ง connection ของ HOSxP
});

export async function hosxpSelect<T>(sql: string, params: unknown[]): Promise<T[]> {
  if (!/^\s*SELECT\s/i.test(sql)) throw new Error("HOSxP client รับเฉพาะ SELECT");
  if (/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|TRUNCATE|GRANT)\b/i.test(sql)) {
    throw new Error("พบคำสั่งที่ไม่ใช่ SELECT");
  }
  // ...
}
```

กติกาการเขียน SQL ยืมวินัยจาก `ppc-hos-10667`:
ค่าจาก request ใช้ `?` เสมอ · `assertDate()` เช็ครูปแบบก่อนแม้จะส่งเป็น param แล้ว ·
SQL fragment สร้างจาก constant เท่านั้น · คอมเมนต์ลำดับ param เมื่อมี subquery ·
cast ทุกค่าที่ออกจาก DB

### ตารางที่ใช้ (ยืนยันแล้วว่ามีใช้จริงใน `ppc-hos-10667`)

| ช่องในฟอร์ม | มาจาก |
|---|---|
| `serviceDate` / `serviceTime` | `ovst.vstdate`, `ovst.vsttime` |
| `chiefComplaint` | `opdscreen.cc` |
| `diagnosis` | `ovst_doctor_diag.diag_text` (ข้อความ) — `ovstdiag.icd10` ใช้แค่แสดงประกอบ |
| `treatment` | `opitemrece` + `drugitems` / `nondrugitems` |
| `labResult` | `lab_head` → `lab_order` → `lab_items` |
| `department` | `kskdepartment.department` ผ่าน `ovst.main_dep` |
| `pttype` | `pttype.name` |

เงื่อนไขบังคับทุก query: `ovst.an IS NULL` (เอาเฉพาะ OPD ไม่เอาที่ admit)
— `ppc-hos-10667` ใช้เงื่อนไขนี้ทุก query เช่นกัน

> ⚠️ **`ovstdiag.icd10` ห้ามเอาไปใส่ช่อง `diagnosis`** — เกณฑ์ `DIAGNOSIS` ระดับ 0 คือ
> *"ใช้รหัส ICD แทนคำวินิจฉัยโรค"* ถ้า prefill เอา ICD ไปใส่ ระบบจะสร้างเอกสาร
> ที่ผิดเกณฑ์ให้เองตั้งแต่ต้น

### ⚠️ ต้อง DESCRIBE ก่อนเขียนโค้ด

`ppc-hos-10667` ใช้แค่ `opdscreen.cc` จึงยืนยันคอลัมน์อื่นไม่ได้จากที่นั่น
ก่อนเริ่มข้อ 10.6 ต้องรัน `DESCRIBE opdscreen;` แล้วเติมชื่อจริงลงสเปกก่อน โดยเฉพาะ
สัญญาณชีพ (คาดว่า `bps` `bpd` `temperature` `pulse` `rr` `bw` `height`),
ช่องประวัติ/อาการ, ช่องตรวจร่างกาย, และคอลัมน์วิธีใช้ยาใน `opitemrece`
(ต้องมีเพื่อให้ `TREATMENT` แยกระดับ 1/2/3 ได้)

**ห้ามเดาชื่อคอลัมน์แล้วยิง production DB**

### พฤติกรรมที่ต้องเป็น

- กรอก HN → แสดง visit ล่าสุด N รายการให้เลือก (default 10) → เลือกแล้วเติมฟอร์ม
- prefill **ไม่บันทึกอะไรลง DB ของแอป** จนกว่าผู้ใช้จะกด save
- ช่องที่ HOSxP ไม่มีข้อมูล ปล่อยว่างไว้ ห้ามเติมข้อความหลอกอย่าง "ไม่มี" หรือ "-"
  เพราะจะทำให้คะแนนสูงกว่าความจริง
- ทุกช่องที่ prefill มา ต้องแก้ได้ทั้งหมด และมีปุ่ม "ล้างค่า" กลับเป็นว่าง
- `HOSXP_ENABLED=false` → ซ่อนช่องค้นหา HN ไปเลย ที่เหลือใช้งานได้ปกติ

---

## 8. Config ที่เพิ่ม

```
HOSXP_ENABLED=false              # default ปิด — เปิดเมื่อ DBA พร้อมเท่านั้น
HOSXP_DB_HOST=
HOSXP_DB_PORT=3306
HOSXP_DB_USER=rca_readonly       # ⚠️ SELECT อย่างเดียว
HOSXP_DB_PASS=
HOSXP_DB_NAME=hos
HOSXP_LOOKUP_LIMIT=10            # จำนวน visit ล่าสุดที่ดึงมาให้เลือก
HOSXP_QUERY_TIMEOUT_MS=15000

HOSPITAL_CODE=10667              # ใช้ในหัวตาราง Form A1
HOSPITAL_NAME=โรงพยาบาลพลับพลาชัย
```

SQL ที่ DBA ต้องรัน (`docs/sql/hosxp-readonly-user.sql`):

```sql
CREATE USER 'rca_readonly'@'<ip ของเครื่อง rca>' IDENTIFIED BY '<รหัส>';
GRANT SELECT ON hos.* TO 'rca_readonly'@'<ip ของเครื่อง rca>';
-- ห้าม GRANT อย่างอื่น และห้ามใช้ '%' เป็น host
```

---

## 9. ความเสี่ยงที่ต้องตัดสินใจก่อน

| ความเสี่ยง | หมายเหตุ |
|---|---|
| **HN + ชื่อผู้ป่วยอยู่ในระบบที่ไม่มี auth** | ตอนนี้ใครในวง LAN เปิด `:3800` ได้หมด Phase 1 ยังพอรับได้เพราะไม่มีข้อมูลคนไข้ แต่ Phase 2 จะมีทั้ง HN ชื่อ และเวชระเบียนเต็ม — **อันนี้ต้องตัดสินใจก่อนเปิดใช้จริง** |
| query กวน HOSxP | `connectionLimit: 4`, timeout 15 วิ, ดึงทีละ visit ไม่ scan ช่วงวันที่ |
| ภาษาไทยเพี้ยน | `charset: "tis620"` |
| prefill เอา ICD ไปใส่ช่องคำวินิจฉัย | ห้ามเด็ดขาด (ดูข้อ 7) |
| ชื่อคนปนใน free text ของ HOSxP | PHI sanitizer รันทับเสมอ + `npm run inspect` ตรวจก่อนเปิดใช้ |

**ข้อแรกคือข้อที่ผมอยากให้ตัดสินก่อนเริ่ม** — ทางเลือก
(ก) ทำ auth ก่อนแล้วค่อยทำ Phase 2
(ข) ทำ Phase 2 ก่อน แต่ยังไม่เปิด HOSxP และไม่กรอก HN จริง ใช้ทดสอบภายในอย่างเดียว
(ค) รับความเสี่ยงไว้เพราะเป็นเครือข่ายภายในโรงพยาบาล

---

## 10. ลำดับการ build

เรียงให้ **ได้ของใช้ก่อนแตะ production DB** — ข้อ 1-5 ไม่ต้องพึ่ง DBA เลย

1. Prisma schema + migration (`RecordForm`, field ที่เพิ่มใน `Case`/`Document`/`Review`)
2. `lib/form/schema.ts` — Zod ของฟอร์ม ใช้ร่วมกันทั้ง API และ UI
3. `app/api/forms/**` — CRUD ครบ (list / create / read / update / delete)
4. `lib/form/to-docx.ts` — ฟอร์ม → DOCX ตามแบบ สนย. + เทสต์ว่า generate แล้ว
   parse กลับด้วย mammoth ได้ข้อความครบทุกหัวข้อ
5. UI ฟอร์ม + ปุ่ม "สร้างเอกสารและตรวจ" → ต่อเข้า pipeline เดิม
   **ถึงตรงนี้ระบบใช้งานได้จริงแล้ว โดยยังไม่แตะ HOSxP**
6. `lib/docx/form-a1.ts` + `app/api/reports/form-a1` — export ตารางสรุปตามหน้า 55
7. `DESCRIBE` ตาราง HOSxP จริง แล้วเติมชื่อคอลัมน์ลงข้อ 7
8. ขอ DBA สร้าง user read-only + **ทดสอบว่า `INSERT` ถูกปฏิเสธจริง**
9. `lib/hosxp/client.ts` + guard + เทสต์ว่า guard โยน error กับ SQL ที่ไม่ใช่ SELECT
10. `lib/hosxp/queries.ts` + `to-form.ts` + `app/api/hosxp/lookup`
11. ต่อช่องค้นหา HN เข้าหน้าฟอร์ม
12. `npm run inspect` กับเอกสารที่ generate จากข้อมูล HOSxP จริง — ตรวจว่า PHI ไม่หลุด

---

## 11. เทสต์ที่ต้องมี

ทั้งหมดต้องรันได้โดยไม่ต่อ HOSxP จริง (เหมือน Phase 1 ที่เทสต์ได้โดยไม่มี DB)

| เทสต์ | ตรวจอะไร |
|---|---|
| `test:form-docx` | ฟอร์ม → DOCX → mammoth → ข้อความมีครบทุกหัวข้อที่เกณฑ์ต้องใช้ |
| `test:form-a1` | mock Review หลายรายการ → ตารางมีคอลัมน์ครบ เรียงถูก N/A แสดงถูก คะแนนรวมถูก |
| `test:hosxp-guard` | guard โยน error กับ INSERT/UPDATE/DELETE/DROP ปล่อยผ่านเฉพาะ SELECT |
| `test:hosxp-to-form` | mock แถว HOSxP → ฟอร์มถูกช่อง และ **ไม่มี ICD หลุดเข้าช่องคำวินิจฉัย** |
| `test:phi` (เดิม) | เพิ่มเคส: DOCX ที่ generate จากฟอร์มต้องไม่มี PHI หลงเหลือหลัง mask |

---

## 12. คำถามที่ต้องตอบก่อนเริ่ม

1. **เรื่อง auth/HN ในข้อ 9** — เลือก (ก) (ข) หรือ (ค)
2. ฟอร์มกรอก 1 ฟอร์ม = 1 visit ใช่ไหม หรือรวมหลาย visit ของคนไข้คนเดียวในเคสเดียว
3. `RecordForm` ต้องมีสถานะ draft/final ไหม หรือแก้ได้ตลอด
4. DOCX ที่ generate ต้องมีหัวกระดาษ/โลโก้โรงพยาบาลไหม
5. Form A1 export — เลือกเคสเองทีละใบ หรือเลือกตามช่วงวันที่
