# RCA — ผู้ช่วยตรวจคุณภาพการบันทึกข้อมูลผู้ป่วยนอก (MVP Phase 1)

ระบบภายในโรงพยาบาลพลับพลาชัย สำหรับตรวจคุณภาพการบันทึกเวชระเบียนผู้ป่วยนอก (OPD)
ตามเกณฑ์ **Form A1** ของสำนักนโยบายและยุทธศาสตร์ สธ. (มีนาคม 2558)

## หลักการที่ระบบนี้ยึด

1. **Rule Engine ตัดสินคะแนน ไม่ใช่ AI** — AI มีหน้าที่สกัด facts จากเอกสารเป็น JSON เท่านั้น
   เปลี่ยน AI provider แล้วคะแนนต้องไม่เปลี่ยน ถ้า facts เหมือนกัน
2. **ทุกหัวข้อต้องมี evidence เป็นข้อความจริงจากเอกสาร** ไม่ใช่คำสรุปของ AI
3. **ปิดบัง PHI ก่อนส่งเข้า AI ทุกครั้ง** — ชื่อ, HN, เลขบัตรประชาชน, ที่อยู่, เบอร์โทร
   แต่ไม่ปิดบังอายุ เพศ โรคประจำตัว และข้อความทางคลินิก เพราะมีผลต่อการประเมิน
4. **`data/criteria/opd-a1.json` คือ Source of Truth ของเกณฑ์** — แก้เกณฑ์ที่ JSON แล้ว seed ใหม่
   ห้ามแก้ใน Prisma หรือในโค้ดตรงๆ
5. **เรียก AI ครั้งเดียวต่อเอกสาร** — สกัดทุกหัวข้อในการเรียกเดียว
6. **Phase 1 ไม่เชื่อม HOSxP** ทั้งฝั่งข้อมูลและ auth

## Tech stack

| ส่วน | ใช้ |
|---|---|
| Framework | Next.js 16 (App Router) — frontend + API Route Handlers ในตัวเดียว |
| Language | TypeScript |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-mariadb`) |
| Database | MySQL |
| DOCX parse | `mammoth` |
| DOCX generate | `docx` |
| AI | Gemini (`@google/genai`) — Phase 1 ตัวเดียว |
| Validation | Zod |
| Deploy | Docker compose — rca + mysql + phpmyadmin |

## เริ่มใช้งาน

ทางที่เร็วที่สุด — ขึ้นทั้ง stack เลย ไม่ต้องเตรียม database ไว้ก่อน:

```bash
cp .env.example .env      # ตั้งรหัส MySQL + GEMINI_API_KEY
docker compose up -d --build
docker compose logs -f rca
```

หรือรัน dev นอก docker (ต้องมี MySQL ของ RCA ขึ้นอยู่แล้ว):

```bash
docker compose up -d mysql   # เอาแค่ DB
npm install
npm run db:migrate
npm run db:seed              # โหลดเกณฑ์ A1_OPD_2015 เข้า DB
npm run test                 # เทสต์ Rule Engine + PHI (ไม่ต้องมี DB / ไม่เรียก AI)
npm run dev
```

seed จะพิมพ์สรุปให้ตรวจ — ต้องได้ **6 เกณฑ์ maxScore รวม 17**

## Scripts

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | สร้าง/รัน migration (dev) |
| `npm run db:seed` | โหลดเกณฑ์จาก `data/criteria/opd-a1.json` |
| `npm run test:rules` | เทสต์ Rule Engine ด้วย mock facts (36 เคส) |
| `npm run test:phi` | เทสต์ PHI sanitizer สองด้าน: PHI หายจริง + ข้อมูลคลินิกไม่ถูกทำลาย (23 เคส) |
| `npm run test:auth` | เทสต์สิทธิ์ตาม role + rate limit + การตรวจรหัสผ่าน (24 เคส) |
| `npm run test:form` | เทสต์ ฟอร์ม → DOCX → mammoth ได้ข้อความครบทุกหัวข้อ (20 เคส) |
| `npm run test:hosxp` | เทสต์ตัวกันเขียน HOSxP + การแปลงวันที่ไทย (23 เคส) |
| `npm test` | รันทั้งห้าชุด |
| `npm run make:samples` | สร้างเอกสาร OPD ตัวอย่าง 3 ฉบับใน `data/samples/` |
| `npm run inspect -- <file.docx>` | ดูข้อความที่จะถูกส่งเข้า AI จริง (parse + mask แล้ว) |

## เอกสารตัวอย่างสำหรับทดสอบ

`data/samples/` มีเวชระเบียน OPD สมมติ 3 ฉบับ ครอบสถานการณ์ที่ต้องทำงานต่างกัน
(สร้างใหม่ได้ด้วย `npm run make:samples`) — **ข้อมูลในเอกสารเป็นของสมมติทั้งหมด
ชื่อ/HN/เลขบัตร/ที่อยู่/เบอร์โทร ไม่มีอยู่จริง**

| ไฟล์ | เนื้อหา | คาดว่าควรได้ |
|---|---|---|
| `opd-01-complete.docx` | ปอดอักเสบ บันทึกครบทุกหัวข้อ ตรวจ 6 ระบบ มีผลแล็บ ยาละเอียดครบ | ใกล้เต็ม 17 |
| `opd-02-incomplete.docx` | ปวดท้อง บันทึกสั้นมาก ไม่ระบุระยะเวลา ตรวจระบบเดียว วินิจฉัยเป็นคำย่อ ยาไม่มีขนาด | คะแนนต่ำ |
| `opd-03-vaccine-na.docx` | เด็กมารับวัคซีนตามนัด ไม่มีโรค ไม่มีการรักษา | DIAGNOSIS + TREATMENT = N/A → คะแนนเต็มลดจาก 17 เหลือ **10** |

ฉบับที่ 3 คือตัวทดสอบสำคัญ — ถ้าคะแนนเต็มไม่ลดเหลือ 10 แปลว่า N/A ไม่ทำงาน

### ตรวจ PHI ก่อนยิง AI

```bash
npm run inspect -- data/samples/opd-01-complete.docx
```

พิมพ์ข้อความที่ผ่าน parse + mask แล้วออกมาทั้งก้อน = สิ่งที่จะถูกส่งเข้า AI จริง
พร้อมเตือนถ้าเจอรูปแบบที่น่าสงสัยว่าเป็น PHI หลงเหลือ (เลข 13 หลัก, เบอร์โทร,
คำนำหน้าชื่อ, ต./อ./จ.) — ไม่ต้องมี DB ไม่ต้องยิง API

**ใช้ตัวนี้ตรวจกับฟอร์มจริงของโรงพยาบาลก่อนใช้งานจริงเสมอ** เพราะ pattern ใน
`lib/phi/sanitize.ts` เขียนจากฟอร์มตัวอย่าง ถ้าฟอร์มจริงใช้ label อื่น
(เช่น `เลขที่ผู้ป่วย` แทน `HN`) อาจ mask ไม่โดน

## Pipeline

```
อัปโหลด DOCX
  → mammoth แปลงเป็น plain text            lib/docx/parse.ts
  → ปิดบัง PHI                              lib/phi/sanitize.ts
  → Gemini extractFacts() เรียกครั้งเดียว    lib/ai/gemini.ts
  → Rule Engine ให้คะแนนตามเกณฑ์             lib/review/rule-engine.ts
  → บันทึก Review + ReviewItem[] + Timeline  lib/review/pipeline.ts
  → แสดงผล / Export DOCX                     app/reviews/[id]/
```

## โครงสร้างที่สำคัญ

```
data/criteria/opd-a1.json      เกณฑ์ Form A1 — Source of Truth
prisma/schema.prisma           schema (ตามสเปกข้อ 5 เป๊ะๆ)
prisma/seed.ts                 JSON → CriteriaSet/Criterion/CriterionLevel (idempotent)
lib/ai/                        provider.ts (interface + prompt กลาง), gemini.ts, anthropic.ts (โครง)
lib/phi/sanitize.ts            PHI data minimization
lib/review/criteria/opd-a1.ts  กติกาให้คะแนนต่อ criterion — "ที่เดียว" ที่ตัดสินคะแนน
lib/review/rule-engine.ts      facts + criteria → ReviewItem[] + คะแนนรวม
lib/review/pipeline.ts         ต่อทุกขั้นเข้าด้วยกัน
lib/storage/documents.ts       เก็บไฟล์ลง volume
lib/docx/export.ts             DOCX สรุปผล
```

## ฟอร์มบันทึกเวชระเบียน (Phase 2)

นอกจากอัปโหลด `.docx` เอง ยังกรอกฟอร์มในระบบแล้วให้มัน generate เอกสารให้ได้

```
กรอกฟอร์ม → สร้าง .docx ตามแบบ สนย. → PHI mask → AI → Rule Engine → คะแนน
```

หัวข้อในฟอร์มตรงกับเกณฑ์ A1 ทั้ง 6 ข้อ กรอกครบ = มีข้อมูลพอให้ได้ 17 คะแนน
โครงฟอร์มนิยามไว้ที่ `lib/form/schema.ts` ที่เดียว — เพิ่มช่องใหม่ที่นั่น
แล้วทั้งหน้าจอและ DOCX จะตามไปเอง

**ฟอร์มคือแหล่งความจริง DOCX คือผลลัพธ์** — แก้ฟอร์มแล้ว generate ใหม่จะได้
`Document` เวอร์ชันถัดไป ไม่ทับของเดิม ผลตรวจเก่าจึงยังชี้เอกสารเวอร์ชันที่ใช้
ตอนให้คะแนน และ audit ย้อนหลังได้

> ⚠️ ช่องที่เว้นว่างจะ**หายไปจากเอกสารเลย** ระบบไม่เติม `-` หรือ `ไม่มี` แทนให้
> เพราะจะทำให้คะแนนสูงกว่าความจริง — ระบบนี้มีไว้หาเอกสารที่บันทึกไม่ครบ
> ถ้าบังคับกรอกครบก่อนบันทึกได้ ก็จะไม่มีวันเจอสิ่งที่ต้องการหา

### ช่องที่กดเลือกได้

| ช่อง | แบบ | ที่มาของตัวเลือก |
|---|---|---|
| เพศ | dropdown | `ชาย` · `หญิง` · `LGBTQ` · **อื่นๆ (พิมพ์เอง)** |
| แผนก | dropdown | HOSxP `kskdepartment` |
| สิทธิการรักษา | dropdown | HOSxP `pttype` |
| วันที่ | ปฏิทิน | เก็บเป็น `YYYY-MM-DD` |
| เวลา | นาฬิกา | เก็บเป็น `HH:mm` |

**dropdown ทุกตัวมี "อื่นๆ (พิมพ์เอง)"** — รายการจาก HOSxP อาจไม่ครบ และห้ามให้
รายการที่ไม่ครบขวางการกรอกเวชระเบียน ถ้าขวาง คนจะเลิกใช้แล้วกลับไปเขียนมือ
ซึ่งทำให้ระบบตรวจไม่มีความหมาย

**`HOSXP_ENABLED=false` หรือต่อ HOSxP ไม่ได้** → แผนก/สิทธิ กลายเป็นช่องพิมพ์เอง
พร้อมบอกเหตุผลใต้ช่อง ระบบยังใช้งานได้ครบทุกอย่าง

วันที่เก็บเป็น ISO แต่**เอกสารแสดงเป็นวันที่ไทย พ.ศ. ให้เอง** (`2026-08-14` →
`14 สิงหาคม 2569`) ฟอร์มเก่าที่พิมพ์วันที่เป็นข้อความไว้ก็ยังใช้ได้ ระบบส่งผ่านไปตามเดิม

## API

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET/POST | `/api/cases` | รายการเคส / สร้างเคส | view / review |
| POST | `/api/review` | อัปโหลด DOCX (multipart: `file`, `caseId?`) แล้วรัน pipeline | review |
| GET/PUT | `/api/cases/[id]/timeline` | อ่าน / บันทึก timeline ที่ผู้ใช้แก้ | view / review |
| GET | `/api/reviews/[id]/export` | ดาวน์โหลด DOCX สรุปผล | view |
| GET/POST | `/api/forms` | รายการฟอร์ม (กรอง `caseId` / `hn` ได้) / สร้างฟอร์ม | view / review |
| GET/PATCH/DELETE | `/api/forms/[id]` | อ่าน / แก้ / ลบฟอร์ม | view / review / manage |
| POST | `/api/forms/[id]/generate` | สร้าง DOCX จากฟอร์ม (ยังไม่ตรวจ) | review |
| GET | `/api/forms/[id]/generate` | ดาวน์โหลด DOCX ฉบับล่าสุดของฟอร์ม | view |
| POST | `/api/forms/[id]/review` | สร้างเอกสารแล้วสั่งตรวจในคราวเดียว | review |
| POST | `/api/auth/login` · `/api/auth/logout` | เข้า / ออกจากระบบ | public |
| GET | `/api/auth/me` | ใครล็อกอินอยู่ | public |
| GET | `/api/hosxp/options?kind=departments\|pttypes` | ตัวเลือกแผนก/สิทธิจาก HOSxP | view |

## เข้าสู่ระบบ (auth)

ทุกหน้าและทุก API ต้องล็อกอิน — **deny by default** สร้าง route ใหม่แล้วลืมมาแก้
`lib/auth/permissions.ts` ก็ยังถูกล็อกอัตโนมัติ ไม่หลุดเป็น public

**ใช้บัญชีเดียวกับระบบ dashboard (`ppc-hos-10667`)** — ตาราง `users` ในฐาน `ppchos`
บุคลากรจึงใช้ user/รหัสเดิม ไม่ต้องสร้างบัญชีใหม่ และ role ที่ตั้งไว้แล้วใช้ต่อได้ทันที

> ⚠️ RCA ต่อฐานผู้ใช้แบบ **อ่านอย่างเดียว** — `ppc-hos-10667` มีโค้ดอัปเกรดรหัสจาก
> md5 เป็น bcrypt แล้วเขียนกลับ RCA ไม่ทำ (ตรวจได้ทั้งสองรูปแบบแต่ไม่เขียน)
> เพื่อให้ตารางนั้นมีเจ้าของระบบเดียว

### สิทธิ์ตาม role

| role | ดูผล | สั่งตรวจ | ลบ/จัดการ |
|---|:--:|:--:|:--:|
| `ADMIN` `IT` `DIRECTOR` `DOCTOR` `FINANCE` | ✅ | ✅ | ✅ |
| `NURSE` (หัวหน้าพยาบาล) | ✅ | ✅ | — |
| `NURSE_OPD` `NURSE_IPD` `NURSE_ER` `NURSE_LR` `NURSE_IC` | ✅ | — | — |
| `USER` และ role อื่นที่ไม่อยู่ในตาราง | — | — | — |

`FINANCE` (การเงิน/ประกัน/เวชระเบียน) ได้สิทธิ์เต็ม เพราะเป็นเจ้าของงานตรวจคุณภาพตัวจริง

role ที่ไม่อยู่ในตาราง = ล็อกอินได้แต่ยังไม่เห็นอะไร ต้องให้ ADMIN ตั้ง role ก่อน
(ตั้งที่ตาราง `ppchos.users` เหมือนที่ `ppc-hos-10667/docs/sql/assign_roles.sql` ทำ)

### ตั้งค่า

```
AUTH_DB_HOST=<เครื่องที่มีฐาน ppchos>
AUTH_DB_USER=
AUTH_DB_PASS=
AUTH_DB_NAME=ppchos
JWT_SECRET=<openssl rand -hex 32>
COOKIE_SECURE=false     # true เมื่อเสิร์ฟผ่าน https
```

> ⚠️ เปลี่ยน `JWT_SECRET` = ทุกคนถูกเตะออกจากระบบ (token เดิมใช้ไม่ได้)

### รายละเอียดที่ควรรู้

- token เก็บใน cookie แบบ `httpOnly` อายุ 8 ชั่วโมง — JavaScript ฝั่งหน้าเว็บอ่านไม่ได้
- จำกัดการล็อกอินสองชั้น: **10 ครั้ง/5 นาที ต่อ IP** และ **5 ครั้ง/15 นาที ต่อบัญชี**
  (ชั้นที่สองกันคนไล่เดารหัสของบัญชีเดียวจากหลาย IP)
- ข้อความตอบกลับตอนล็อกอินผิดเหมือนกันหมด ไม่แยกว่า user ผิดหรือรหัสผิด
  ไม่งั้นจะกลายเป็นช่องให้ไล่เดาว่ามีใครอยู่ในระบบบ้าง
- `proxy.ts` เป็นด่านแรก **ไม่ใช่ด่านเดียว** — route ที่แตะข้อมูลผู้ป่วยเรียก
  `requireCapability()` ซ้ำเสมอ (เอกสาร Next.js เองระบุว่า proxy ไม่ควรเป็นชั้นตรวจสิทธิ์ชั้นเดียว)
- เปลี่ยน role ให้ใคร คนนั้นต้องออกจากระบบแล้วเข้าใหม่ (หรือรอ token หมดอายุ)
  เพราะ role อยู่ใน token ไม่ได้ยิงถาม DB ทุก request

## HOSxP (อ่านอย่างเดียว)

รอบนี้ใช้ HOSxP แค่ดึงรายการ **แผนก** และ **สิทธิการรักษา** มาเป็นตัวเลือกใน dropdown
— ตาราง master สองตัวที่ไม่มีข้อมูลผู้ป่วยเลย จึงเป็นจุดเริ่มที่ความเสี่ยงต่ำสุด

> ปิดอยู่เป็น default (`HOSXP_ENABLED=false`) ระบบทำงานได้ครบโดยไม่ต้องต่อ HOSxP

### ความปลอดภัยสามชั้น

1. **user ใน MySQL มีสิทธิ์ `SELECT` เท่านั้น** และจำกัด host เป็น IP เดียว
   — SQL ที่ DBA ต้องรันอยู่ใน `docs/sql/hosxp-readonly-user.sql`
   ให้สิทธิ์เฉพาะ `kskdepartment` กับ `pttype` ไม่ใช่ `hos.*` ทั้งฐาน
2. **pool แยกตัวจาก DB ของแอป** — คนละ credential, `connectionLimit: 4`,
   `charset: tis620` (HOSxP เก็บภาษาไทยเป็น TIS-620 ต่อผิดแล้วเพี้ยนทั้งหมด)
3. **guard ในโค้ด** (`lib/hosxp/client.ts`) — ปฏิเสธ SQL ที่ไม่ขึ้นต้นด้วย `SELECT`,
   ที่มีคำสั่งเขียนอยู่ที่ไหนก็ตาม, และที่มี `;` (กัน stacked query)
   เทสต์ไว้ 13 เคส ครอบ INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER/CREATE/GRANT

ชั้นที่ 3 ไม่ได้แทนชั้นที่ 1 — มีไว้ให้พังตั้งแต่ตอนเขียนโค้ด ไม่ใช่ไปพังตอน production

> ⚠️ ตารางที่มีข้อมูลผู้ป่วย (`ovst`, `opdscreen`, `ovst_doctor_diag` ฯลฯ) **ยังไม่แตะ**
> ต้อง `DESCRIBE` schema จริงก่อนตามที่ระบุใน `docs/phase2-spec.md` ข้อ 7

## ฐานข้อมูล

RCA มี **MySQL ของตัวเอง** สร้างโดย `docker compose` ไม่เกี่ยวกับ km เลย
ไม่ต่อ network ของ km ไม่ใช้ user ของ km และลบ/สร้าง stack นี้ใหม่ได้โดยไม่กระทบ km

> สเปกข้อ 3 เขียนไว้ว่าใช้ MySQL ตัวเดียวกับ km-system —
> ตรงนี้เลือกแยก instance ตามที่ตกลงกันภายหลัง เพื่อให้ RCA ไม่ผูกกับ stack ของ km

### แผนผังพอร์ต

| พอร์ต | ใคร | หมายเหตุ |
|---|---|---|
| 3000, 3100, 3300, 3500 | ระบบอื่น | มีเจ้าของแล้ว |
| 3001 | km api | ของ km ไม่แตะ |
| 8080 | phpMyAdmin ของ km | ของ km ไม่แตะ |
| 3307 | MySQL ของ km | ของ km ไม่แตะ |
| 6380 | Redis ของ km | ของ km ไม่แตะ |
| **3800** | **RCA (แอป)** | `APP_PORT` |
| **8089** | **phpMyAdmin ของ RCA** | `PHPMYADMIN_PORT` |
| **3308** | **MySQL ของ RCA** | `DB_PUBLISH_PORT` |

### ไม่ต้องรัน SQL เอง

image `mysql` จะสร้าง database + user ให้อัตโนมัติตอนบูตครั้งแรก
จากค่า `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` ใน `.env`
พร้อม grant สิทธิ์บน database นั้นให้ครบ — ไม่ต้องล็อกอิน root ไปรัน
`CREATE DATABASE` / `CREATE USER` / `GRANT` เอง

ค่า default ใน `.env.example`:

```
MYSQL_ROOT_PASSWORD=rcaroot
MYSQL_DATABASE=rca
MYSQL_USER=rca
MYSQL_PASSWORD=rcapass
```

`DATABASE_URL` ที่แอปใช้ตอนอยู่ใน docker ประกอบให้อัตโนมัติใน `docker-compose.yml`
จากค่าข้างบน จึงไม่ต้องตั้งซ้ำและไม่มีทางตั้งไม่ตรงกัน

> ⚠️ ค่าพวกนี้มีผล **เฉพาะตอนสร้าง volume ครั้งแรก** เท่านั้น
> แก้รหัสทีหลังแล้วอยากให้มีผล ต้อง `ALTER USER 'rca'@'%' IDENTIFIED BY '<ใหม่>';`
> หรือ `docker compose down -v` แล้วขึ้นใหม่ (**ข้อมูลหายหมด**)

> ⚠️ พอร์ต 8089 (phpMyAdmin) และ 3308 (MySQL) เปิดเฉพาะวง LAN โรงพยาบาลเท่านั้น
> ห้าม forward ออกอินเทอร์เน็ต ถ้าเครื่องมี public IP ให้ผูกกับ LAN interface
> เช่น `ports: ["192.168.x.x:8089:80"]`

### รันนอก docker (`npm run dev`)

ใช้ `DATABASE_URL` ใน `.env` ที่ชี้มาที่พอร์ตบน host และตั้ง `PORT`
เพราะ Next.js เกาะ 3000 เป็น default ซึ่งมีเจ้าของแล้ว:

```
DATABASE_URL="mysql://rca:rcapass@localhost:3308/rca"
PORT=3800
```

## Deploy

```bash
cp .env.example .env      # ตั้งรหัส MySQL + GEMINI_API_KEY
docker compose up -d --build
```

ขึ้นมา 3 container: `rca` (3800), `mysql` (3308), `phpmyadmin` (8089)
ไม่ต้องเตรียม database ไว้ก่อน — สร้างให้เองตอนบูตครั้งแรก

| service | URL |
|---|---|
| RCA | http://&lt;เครื่อง&gt;:3800 |
| phpMyAdmin | http://&lt;เครื่อง&gt;:8089 (ล็อกอิน `rca` / `MYSQL_PASSWORD`) |

entrypoint จะรอ DB พร้อม → `prisma migrate deploy` → seed เกณฑ์ ให้อัตโนมัติ
(ปิดได้ด้วย `RUN_MIGRATIONS=0` / `RUN_SEED=0`)

ไฟล์ DOCX เก็บที่ `./data/documents` ซึ่ง mount เข้า container — ลบ container แล้วไฟล์ไม่หาย

### แก้ปัญหาตอนขึ้น stack

**`npm ci can only install packages when your package.json and package-lock.json are in sync`**
**`Missing: @emnapi/runtime from lock file`**

lock file ถูกเขียนใหม่ตอนรัน `npm install` บน Windows แล้ว npm ตัด optional
dependency ที่ผูกกับ platform ทิ้ง (`@emnapi/*`, `@esbuild/*`, `@rollup/rollup-*`)
พอ `npm ci` ในคอนเทนเนอร์ linux ก็หาไม่เจอ

Dockerfile จัดการให้แล้ว — `npm ci` ล้มจะ fallback ไป `npm install` อัตโนมัติ
ถ้ายังอยากให้ `npm ci` ทำงานตรงๆ (build เร็วกว่า) ให้สร้าง lock ใหม่จากในคอนเทนเนอร์:

```bash
docker run --rm -v "%cd%":/app -w /app node:22-alpine npm install --package-lock-only
```


**`dependency failed to start: container rca-mysql-1 is unhealthy`**

MySQL init ครั้งแรกช้ากว่า budget ของ healthcheck — พบบ่อยบน Docker Desktop/Windows
ที่ดิสก์ช้า ตอนนี้ตั้ง budget ไว้ ~10 นาที และ `rca` ไม่ผูกกับ healthcheck แล้ว
(ใช้ `service_started` + retry loop ใน entrypoint แทน) ปัญหานี้จึงไม่ควรบล็อกทั้ง stack อีก

ถ้ายังเจอ ให้ดูว่า MySQL พังจริงหรือแค่ช้า:

```bash
docker compose logs mysql --tail 60
docker inspect --format "{{json .State.Health}}" rca-mysql-1
```

**MySQL init ค้างหรือ volume เสีย** — ลบ volume แล้วเริ่มใหม่ (ข้อมูลหายหมด
ถ้าเพิ่งติดตั้งก็ไม่มีอะไรให้เสีย):

```bash
docker compose down -v
docker compose up -d
```

**อยากดูว่า `rca` รออยู่หรือพังไปแล้ว**

```bash
docker compose logs -f rca
```

ระหว่างรอจะเห็น `… รอ MySQL พร้อมรับ connection (ครั้งที่ n/60)` เป็นระยะ —
ถ้าครบ 60 ครั้งจะพิมพ์ `DATABASE_URL` (ปิดบังรหัสผ่านแล้ว) ให้ตรวจว่าชี้ถูกที่หรือเปล่า
ปรับเวลารอได้ด้วย `DB_WAIT_RETRIES` / `DB_WAIT_DELAY`

**ขึ้นทีละตัวเพื่อไล่ปัญหา**

```bash
docker compose up -d mysql          # รอจนขึ้นก่อน
docker compose up -d phpmyadmin     # เข้า :8089 ดูว่า MySQL ใช้ได้จริง
docker compose up -d rca
```

## การแก้เกณฑ์

1. แก้ `data/criteria/opd-a1.json` — **ต้องเทียบกับ PDF ต้นฉบับ สนย. ทุกครั้ง**
2. ถ้าเนื้อหาเกณฑ์เปลี่ยน ให้ขึ้น `meta.version` เป็น 2, 3, …
   seed จะสร้าง CriteriaSet ใหม่ (`A1_OPD_2015_V2`) แยกจากของเดิม
   → Review เก่ายังอ้างเกณฑ์เวอร์ชันที่ใช้ตอนตรวจเสมอ ไม่เปลี่ยนย้อนหลัง
3. ถ้าเงื่อนไขการให้คะแนนเปลี่ยน ต้องแก้ `lib/review/criteria/opd-a1.ts` ด้วย และเพิ่มเทสต์

## ยังไม่ทำใน Phase 1 (Non-goals)

Dashboard/chart, timeline anomaly detection ด้วย AI, Anthropic provider, CRUD เกณฑ์,
ระบบ auth, การเชื่อม HOSxP, MinIO/S3, microservices, Form A2/A3/A4, ตาราง version history แยก
