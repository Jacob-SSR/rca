// scripts/check-connections.ts
// ตรวจว่าตั้งค่าการเชื่อมต่อทั้งสามฝั่งถูกไหม โดยไม่ต้องเดาจาก log
//
//   ในคอนเทนเนอร์:  docker compose exec rca npm run check:conn
//   นอกคอนเทนเนอร์: npm run check:conn
//
// บอกให้ชัดว่าอันไหนผ่าน อันไหนไม่ผ่าน และถ้าไม่ผ่านให้แก้ตัวแปรไหน
// ⚠️ ไม่พิมพ์รหัสผ่านออกมา

import "dotenv/config";
import mysql from "mysql2/promise";

type Result = { ok: boolean; detail: string; fix?: string };

const mask = (v: string | undefined) => (v ? `${"•".repeat(Math.min(v.length, 8))}` : "(ว่าง)");

function line(label: string, r: Result) {
  console.log(`${r.ok ? "✅" : "❌"} ${label}`);
  console.log(`   ${r.detail}`);
  if (!r.ok && r.fix) console.log(`   → ${r.fix}`);
  console.log();
}

/** ต่อ MySQL แล้วรัน callback — คืนข้อความ error ที่อ่านรู้เรื่องแทน stack */
async function withConn<T>(
  cfg: mysql.ConnectionOptions,
  fn: (c: mysql.Connection) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string; code?: string }> {
  let conn: mysql.Connection | undefined;
  try {
    conn = await mysql.createConnection({ ...cfg, connectTimeout: 8000 });
    return { ok: true, value: await fn(conn) };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    return { ok: false, error: err.message ?? String(e), code: err.code };
  } finally {
    await conn?.end().catch(() => {});
  }
}

// ── 1) ฐานข้อมูลของแอปเอง ─────────────────────────────────────────────────────
async function checkAppDb(): Promise<Result> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return { ok: false, detail: "ไม่ได้ตั้ง DATABASE_URL", fix: "ตั้ง DATABASE_URL ใน .env" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, detail: "DATABASE_URL ไม่ใช่ URL ที่ถูกต้อง", fix: "ดูรูปแบบใน .env.example" };
  }

  const db = parsed.pathname.replace(/^\//, "");
  const r = await withConn(
    {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: db,
    },
    async (c) => {
      const [rows] = await c.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?",
        [db],
      );
      return Number(rows[0]?.n ?? 0);
    },
  );

  if (!r.ok) {
    return {
      ok: false,
      detail: `ต่อ ${parsed.hostname}:${parsed.port || 3306}/${db} ไม่ได้ — ${r.error}`,
      fix: "ตรวจ DATABASE_URL (ในคอนเทนเนอร์ host ต้องเป็น mysql ไม่ใช่ localhost)",
    };
  }

  if (r.value === 0) {
    return {
      ok: false,
      detail: `ต่อ ${db} ได้ แต่ยังไม่มีตารางเลย`,
      fix: "ยังไม่ได้ migrate — ดู log ตอน container ขึ้น หรือรัน npx prisma migrate deploy",
    };
  }

  return { ok: true, detail: `ต่อ ${parsed.hostname}/${db} ได้ · มี ${r.value} ตาราง` };
}

// ── 2) ฐานผู้ใช้ (auth) ───────────────────────────────────────────────────────
async function checkAuthDb(): Promise<Result> {
  const host = process.env.AUTH_DB_HOST;
  const name = process.env.AUTH_DB_NAME || "ppchos";

  if (!host) {
    return {
      ok: false,
      detail: "ไม่ได้ตั้ง AUTH_DB_HOST",
      fix: "ก็อป DB_HOST2 จาก .env ของ ppc-hos-10667 มาใส่ AUTH_DB_HOST",
    };
  }

  const cfg: mysql.ConnectionOptions = {
    host,
    port: Number(process.env.AUTH_DB_PORT || 3306),
    user: process.env.AUTH_DB_USER,
    password: process.env.AUTH_DB_PASS,
    charset: "tis620",
  };

  // ต่อโดยยังไม่เลือก database ก่อน แล้วค่อยดูว่าตาราง users อยู่ที่ไหน
  const r = await withConn(cfg, async (c) => {
    const [rows] = await c.query<mysql.RowDataPacket[]>(
      "SELECT table_schema AS db FROM information_schema.tables WHERE table_name = 'users'",
    );
    return rows.map((x) => String(x.db));
  });

  if (!r.ok) {
    return {
      ok: false,
      detail: `ต่อ ${host}:${cfg.port} (user=${process.env.AUTH_DB_USER ?? "(ว่าง)"}, pass=${mask(process.env.AUTH_DB_PASS)}) ไม่ได้ — ${r.error}`,
      fix: "ตรวจ AUTH_DB_HOST / AUTH_DB_USER / AUTH_DB_PASS",
    };
  }

  const schemas = r.value;

  if (schemas.length === 0) {
    return {
      ok: false,
      detail: `ต่อ ${host} ได้ แต่ user นี้มองไม่เห็นตาราง users ในฐานไหนเลย`,
      fix: "ตรวจว่า user มีสิทธิ์อ่านฐาน ppchos",
    };
  }

  if (!schemas.includes(name)) {
    return {
      ok: false,
      detail: `AUTH_DB_NAME=${name} แต่ตาราง users อยู่ที่ ${schemas.map((s) => `"${s}"`).join(", ")}`,
      fix: `ตั้ง AUTH_DB_NAME=${schemas[0]} (ตาราง users ไม่ได้อยู่ในฐาน hos)`,
    };
  }

  // นับผู้ใช้ + ดูว่ามีคอลัมน์ role ไหม
  const detail = await withConn({ ...cfg, database: name }, async (c) => {
    const [u] = await c.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM `users`");
    const [cols] = await c.query<mysql.RowDataPacket[]>(
      "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = 'users'",
      [name],
    );
    const names = cols.map((x) => String(x.c).toLowerCase());
    return { count: Number(u[0]?.n ?? 0), names };
  });

  if (!detail.ok) {
    return { ok: false, detail: `อ่านตาราง ${name}.users ไม่ได้ — ${detail.error}` };
  }

  const missing = ["user", "passweb", "role", "name"].filter(
    (c) => !detail.value.names.includes(c),
  );

  if (missing.length > 0) {
    return {
      ok: false,
      detail: `พบ ${name}.users (${detail.value.count} บัญชี) แต่ขาดคอลัมน์: ${missing.join(", ")}`,
      fix: "ตารางอาจไม่ใช่ตัวเดียวกับที่ ppc-hos-10667 ใช้",
    };
  }

  return {
    ok: true,
    detail: `ต่อ ${host}/${name} ได้ · ตาราง users มี ${detail.value.count} บัญชี · คอลัมน์ครบ`,
  };
}

// ── 3) HOSxP ─────────────────────────────────────────────────────────────────
async function checkHosxp(): Promise<Result> {
  if (process.env.HOSXP_ENABLED !== "true") {
    return {
      ok: true,
      detail: "ปิดอยู่ (HOSXP_ENABLED != true) — แผนก/สิทธิจะเป็นช่องพิมพ์เอง ระบบใช้ได้ปกติ",
    };
  }

  const host = process.env.HOSXP_DB_HOST;
  const name = process.env.HOSXP_DB_NAME || "hos";

  if (!host) {
    return {
      ok: false,
      detail: "HOSXP_ENABLED=true แต่ไม่ได้ตั้ง HOSXP_DB_HOST",
      fix: "ก็อป DB_HOST จาก .env ของ ppc-hos-10667",
    };
  }

  const r = await withConn(
    {
      host,
      port: Number(process.env.HOSXP_DB_PORT || 3306),
      user: process.env.HOSXP_DB_USER,
      password: process.env.HOSXP_DB_PASS,
      database: name,
      charset: "tis620",
    },
    async (c) => {
      const [dep] = await c.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM kskdepartment",
      );
      const [ptt] = await c.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM pttype");
      const [sample] = await c.query<mysql.RowDataPacket[]>(
        "SELECT department FROM kskdepartment WHERE department <> '' ORDER BY department LIMIT 3",
      );
      return {
        dep: Number(dep[0]?.n ?? 0),
        ptt: Number(ptt[0]?.n ?? 0),
        sample: sample.map((x) => String(x.department)),
      };
    },
  );

  if (!r.ok) {
    return {
      ok: false,
      detail: `ต่อ ${host}/${name} ไม่ได้ — ${r.error}`,
      fix:
        r.code === "ER_NO_SUCH_TABLE"
          ? `ต่อได้แต่ไม่มีตาราง — ตรวจ HOSXP_DB_NAME (ตอนนี้ = ${name})`
          : "ตรวจ HOSXP_DB_HOST / HOSXP_DB_USER / HOSXP_DB_PASS",
    };
  }

  return {
    ok: true,
    detail:
      `ต่อ ${host}/${name} ได้ · แผนก ${r.value.dep} รายการ · สิทธิ ${r.value.ptt} รายการ\n` +
      `   ตัวอย่างแผนก: ${r.value.sample.join(", ") || "(ไม่มี)"}` +
      (r.value.sample.some((s) => /[^ -฀-๿]/.test(s))
        ? "\n   ⚠️ ชื่อแผนกดูเพี้ยน — charset อาจไม่ใช่ tis620"
        : ""),
  };
}

async function main() {
  console.log("\nตรวจการเชื่อมต่อทั้งหมด\n" + "═".repeat(60) + "\n");

  line("ฐานข้อมูลของ RCA (DATABASE_URL)", await checkAppDb());
  line("ฐานผู้ใช้สำหรับ login (AUTH_DB_*)", await checkAuthDb());
  line("HOSxP (HOSXP_DB_*)", await checkHosxp());

  console.log("═".repeat(60));
  console.log("หมายเหตุ: host ของ HOSxP กับฐานผู้ใช้เป็นเครื่องเดียวกันได้");
  console.log("แต่คนละ database — ตาราง users อยู่ใน ppchos ไม่ใช่ hos\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
