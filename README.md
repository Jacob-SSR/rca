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
| Deploy | Docker container เดียว + volume mount |

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env      # แล้วใส่ DATABASE_URL กับ GEMINI_API_KEY

npm run db:migrate        # หรือ npx prisma migrate deploy บน production
npm run db:seed           # โหลดเกณฑ์ A1_OPD_2015 เข้า DB

npm run test              # เทสต์ Rule Engine + PHI sanitizer (ไม่ต้องมี DB / ไม่เรียก AI)
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
| `npm test` | รันทั้งสองชุด |

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

## API

| Method | Path | ทำอะไร |
|---|---|---|
| GET/POST | `/api/cases` | รายการเคส / สร้างเคส |
| POST | `/api/review` | อัปโหลด DOCX (multipart: `file`, `caseId?`) แล้วรัน pipeline |
| GET/PUT | `/api/cases/[id]/timeline` | อ่าน / บันทึก timeline ที่ผู้ใช้แก้ |
| GET | `/api/reviews/[id]/export` | ดาวน์โหลด DOCX สรุปผล |

## ฐานข้อมูล

ใช้ **MySQL ตัวเดียวกับ km-system** ตามสเปกข้อ 3 — ไม่ตั้ง instance ใหม่
แต่ **แยก database**: km ใช้ของมัน, RCA ใช้ database ชื่อ `rca` ต่างหาก ไม่ปนตารางกัน

### แผนผังพอร์ต

ค่าที่ km ใช้อยู่ อ่านจาก `kmppc-backtend/docker-compose.yml` โดยตรง

| พอร์ต | ใคร | หมายเหตุ |
|---|---|---|
| 3001 | km api (NestJS) | ของ km ไม่แตะ |
| 8080 | **phpMyAdmin ของ km** | ของ km — ใช้จัดการ DB ของ RCA ได้เลย |
| 3307 | MySQL ของ km | ของ km — RCA ใช้ตัวนี้ร่วม |
| 6380 | Redis ของ km | ของ km ไม่แตะ |
| **8088** | **RCA (แอป)** | ตั้งที่ `APP_PORT` |
| 3308 | ว่าง | ไม่ได้ใช้ |

**RCA ไม่เปิดพอร์ต MySQL และไม่รัน phpMyAdmin ของตัวเอง** — km มีให้แล้วที่ 8080
และมันชี้ไป MySQL ตัวเดียวกัน จึงเห็น database `rca` ด้วยอยู่แล้ว

จุดที่สับสนง่าย: `3307` คือพอร์ตที่ km **เปิดออกมาบนเครื่อง host** สำหรับต่อจากข้างนอก
แต่ container ที่อยู่ใน docker network เดียวกันคุยกันตรงๆ ที่พอร์ต**ภายใน** `3306` ผ่านชื่อ service
ดังนั้นใน `DATABASE_URL` ต้องใช้ `mysql:3306` ไม่ใช่ `mysql:3307`

### 1. หาชื่อ network ของ km

compose ของ km ไม่ได้ประกาศ `networks` ไว้ จึงใช้ default network
ชื่อ `<ชื่อโฟลเดอร์ที่รัน km>_default` — ยืนยันชื่อจริง:

```bash
docker network ls        # เช่น kmppc-backtend_default
```

เอาไปใส่ `.env` เป็น `KM_NETWORK` (ส่วนชื่อ service MySQL คือ `mysql` แน่นอนแล้ว)

### 2. สร้าง database + user (ต้องเป็น **root**)

> ⚠️ **ล็อกอินด้วย user `km` ไม่ได้** — compose ของ km สร้าง user `km` ให้มีสิทธิ์เฉพาะ
> `km_ppch` เท่านั้น ถ้ารัน `CREATE DATABASE` ด้วย user นี้จะได้
> `#1044 - Access denied for user 'km'@'%' to database 'rca'`

**หารหัส root** — จาก `MYSQL_ROOT_PASSWORD` ใน `.env` ของ km
(ถ้าไม่ได้ตั้งไว้ = ค่า default `kmroot` ตามที่ compose ของ km เขียนไว้)

```bash
grep MYSQL_ROOT_PASSWORD /path/ไปยัง/kmppc-backtend/.env
```

**วิธีที่ 1 — phpMyAdmin** ที่ http://&lt;เครื่อง&gt;:8080 ล็อกอินเป็น `root` แล้วรันในแท็บ SQL

**วิธีที่ 2 — CLI** (ไม่ต้องล็อกเอาต์จาก phpMyAdmin)

```bash
cd /path/ไปยัง/kmppc-backtend
docker compose exec mysql mysql -uroot -p <<'SQL'
CREATE DATABASE IF NOT EXISTS rca CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'rca'@'%' IDENTIFIED BY 'ตั้งรหัสผ่านตรงนี้';
GRANT ALL PRIVILEGES ON rca.* TO 'rca'@'%';
SQL
```

`IF NOT EXISTS` ทำให้รันซ้ำได้ไม่ error — ถ้าเผลอรันไปครึ่งทางแล้วก็รันใหม่ทั้งชุดได้เลย
(`FLUSH PRIVILEGES` ไม่จำเป็น — จำเป็นเฉพาะตอนแก้ตาราง grant ตรงๆ ไม่ใช่ตอนใช้ `GRANT`)

**ตรวจว่าผ่านจริง**

```sql
SELECT user, host FROM mysql.user WHERE user = 'rca';
SHOW GRANTS FOR 'rca'@'%';
```

ต้องเห็น `rca | %` และ ``GRANT ALL PRIVILEGES ON `rca`.* TO `rca`@`%` ``
ถ้าเห็น `ON *.*` แสดงว่าสิทธิ์กว้างเกินไป ให้ `REVOKE ALL ON *.* FROM 'rca'@'%';` แล้ว GRANT ใหม่

#### ทำไมไม่ใช้ user `km` ไปเลย

ใช้ได้ ไม่ผิดอะไรทางเทคนิค แต่**ไม่ได้ประหยัดขั้นตอน** — ยังต้องใช้ root รัน
`GRANT ALL ON rca.* TO 'km'@'%';` อยู่ดี ต่างกันแค่ SQL บรรทัดเดียว

ที่แลกไปคือ `DATABASE_URL` ของ RCA จะกลายเป็นรหัสที่เปิด `km_ppch` ได้ด้วย —
ถ้ามันหลุด (env โผล่ใน error page, log, เผลอ commit `.env`) ก็เสียฐานข้อมูล KM ไปด้วย
ทั้งที่ RCA แตะข้อมูลผู้ป่วย และ `CLAUDE.md` ของ km ก็ระบุว่า km เป็นเจ้าของ DB ของตัวเอง

user `rca` มีสิทธิ์เฉพาะ database `rca` — ต่อให้แอปมีช่องโหว่ก็แตะตาราง `km_ppch` ไม่ได้

### 3. ใส่รหัสผ่านลง `.env`

รหัสผ่าน DB ตั้ง **2 ที่ ต้องตรงกัน**: ที่ `CREATE USER ... IDENTIFIED BY` ข้างบน
และที่ `DATABASE_URL` ใน `.env`

```
DATABASE_URL="mysql://rca:รหัสเดียวกัน@mysql:3306/rca"
```

- **ห้ามใส่รหัสจริงใน `.env.example`** — ไฟล์นั้นเข้า git ส่วน `.env` อยู่ใน `.gitignore`
- **ถ้ารหัสมีอักขระพิเศษต้อง URL-encode** เพราะอยู่ใน URL:
  `@`→`%40` `:`→`%3A` `/`→`%2F` `#`→`%23` `?`→`%3F` `%`→`%25`
  เช่น `p@ss#1` → `mysql://rca:p%40ss%231@mysql:3306/rca`
  ทางที่ง่ายกว่าคือตั้งรหัสยาวๆ แต่ใช้แค่ `A-Z a-z 0-9`

> `MYSQL_PASSWORD` ใน compose ของ km เป็นรหัสของ user `km` คนละตัวกัน ไม่ต้องแตะ

## Deploy

```bash
cp .env.example .env      # ตั้ง KM_NETWORK, DATABASE_URL, GEMINI_API_KEY
docker compose up -d --build
```

เปิดใช้งานที่ **http://&lt;เครื่อง&gt;:8088**

entrypoint จะรอ DB พร้อม → `prisma migrate deploy` → seed เกณฑ์ ให้อัตโนมัติ
(ปิดได้ด้วย `RUN_MIGRATIONS=0` / `RUN_SEED=0`)

ไฟล์ DOCX เก็บที่ `./data/documents` ซึ่ง mount เข้า container — ลบ container แล้วไฟล์ไม่หาย

## การแก้เกณฑ์

1. แก้ `data/criteria/opd-a1.json` — **ต้องเทียบกับ PDF ต้นฉบับ สนย. ทุกครั้ง**
2. ถ้าเนื้อหาเกณฑ์เปลี่ยน ให้ขึ้น `meta.version` เป็น 2, 3, …
   seed จะสร้าง CriteriaSet ใหม่ (`A1_OPD_2015_V2`) แยกจากของเดิม
   → Review เก่ายังอ้างเกณฑ์เวอร์ชันที่ใช้ตอนตรวจเสมอ ไม่เปลี่ยนย้อนหลัง
3. ถ้าเงื่อนไขการให้คะแนนเปลี่ยน ต้องแก้ `lib/review/criteria/opd-a1.ts` ด้วย และเพิ่มเทสต์

## ยังไม่ทำใน Phase 1 (Non-goals)

Dashboard/chart, timeline anomaly detection ด้วย AI, Anthropic provider, CRUD เกณฑ์,
ระบบ auth, การเชื่อม HOSxP, MinIO/S3, microservices, Form A2/A3/A4, ตาราง version history แยก
