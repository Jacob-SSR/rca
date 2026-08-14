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

RCA มี **MySQL ของตัวเอง** สร้างโดย `docker compose` ไม่เกี่ยวกับ km เลย
ไม่ต่อ network ของ km ไม่ใช้ user ของ km และลบ/สร้าง stack นี้ใหม่ได้โดยไม่กระทบ km

> สเปกข้อ 3 เขียนไว้ว่าใช้ MySQL ตัวเดียวกับ km-system —
> ตรงนี้เลือกแยก instance ตามที่ตกลงกันภายหลัง เพื่อให้ RCA ไม่ผูกกับ stack ของ km

### แผนผังพอร์ต

| พอร์ต | ใคร | หมายเหตุ |
|---|---|---|
| 3001 | km api | ของ km ไม่แตะ |
| 8080 | phpMyAdmin ของ km | ของ km ไม่แตะ |
| 3307 | MySQL ของ km | ของ km ไม่แตะ |
| 6380 | Redis ของ km | ของ km ไม่แตะ |
| **8088** | **RCA (แอป)** | `APP_PORT` |
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

ใช้ `DATABASE_URL` ใน `.env` ที่ชี้มาที่พอร์ตบน host:

```
DATABASE_URL="mysql://rca:rcapass@localhost:3308/rca"
```

## Deploy

```bash
cp .env.example .env      # ตั้งรหัส MySQL + GEMINI_API_KEY
docker compose up -d --build
```

ขึ้นมา 3 container: `rca` (8088), `mysql` (3308), `phpmyadmin` (8089)
ไม่ต้องเตรียม database ไว้ก่อน — สร้างให้เองตอนบูตครั้งแรก

| service | URL |
|---|---|
| RCA | http://&lt;เครื่อง&gt;:8088 |
| phpMyAdmin | http://&lt;เครื่อง&gt;:8089 (ล็อกอิน `rca` / `MYSQL_PASSWORD`) |

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
