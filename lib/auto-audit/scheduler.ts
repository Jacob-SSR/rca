// lib/auto-audit/scheduler.ts
// ตัวตั้งเวลาในตัวแอป — เช็คทุกนาทีว่าถึงเวลารันตรวจอัตโนมัติของวันนี้หรือยัง
//
// เริ่มจาก instrumentation.ts ตอน server บูต (ฝั่ง Node เท่านั้น)
// ไม่ใช้ cron ของเครื่อง เพราะระบบนี้ deploy ด้วย docker compose ตัวเดียว
// ตั้งค่าเปิด/ปิด/เวลา/วัน ได้จากหน้าเว็บโดยไม่ต้องแตะเครื่อง
//
// การกันรันซ้ำอยู่ที่ runKey unique ใน DB (ดู runner.ts) ไม่ใช่ที่ตัวแปรในหน่วยความจำ
// จึงปลอดภัยแม้ container รีสตาร์ทหรือมีหลาย instance

import { prisma } from "@/lib/prisma";
import { autoRunKey, isDue } from "@/lib/auto-audit/schedule";
import { RunAlreadyClaimedError, loadSettings, resumePausedRun, runAutoAudit } from "@/lib/auto-audit/runner";

const TICK_MS = 60_000;

const g = globalThis as unknown as { autoAuditTimer?: NodeJS.Timeout; autoAuditBusy?: boolean };

export async function tick(now = new Date()) {
  if (g.autoAuditBusy) return;
  g.autoAuditBusy = true;
  try {
    const settings = await loadSettings();
    const { due, runDate } = isDue(settings, now);
    const already = due
      ? await prisma.autoAuditRun.findUnique({ where: { runKey: autoRunKey(runDate) } })
      : null;

    if (!due || already) {
      // ไม่มีรอบตามเวลาต้องรัน → ถ้ามีรอบที่หยุดรอโควตา AI และโควตากลับมาแล้ว ตรวจต่อ
      // (ทำแม้ปิดตรวจอัตโนมัติไว้ — รอบที่กดรันเองแล้วหยุดรอโควตาก็ควรได้ตรวจจนครบ)
      const resumed = await resumePausedRun(now);
      if (resumed) {
        console.log(
          `auto-audit: จบรอบตรวจต่อ ${resumed.status} — ตรวจ ${resumed.reviewed} ราย, ไม่สำเร็จ ${resumed.failed}`,
        );
      }
      return;
    }

    console.log(`auto-audit: เริ่มรอบอัตโนมัติของวันที่ ${runDate}`);
    const run = await runAutoAudit({ trigger: "auto", now });
    console.log(
      `auto-audit: จบรอบ ${run.status} — ตรวจ ${run.reviewed} ราย, ไม่สำเร็จ ${run.failed}, ข้าม ${run.skipped}`,
    );
  } catch (e) {
    if (!(e instanceof RunAlreadyClaimedError)) console.error("auto-audit: tick ล้มเหลว:", e);
  } finally {
    g.autoAuditBusy = false;
  }
}

export function startAutoAuditScheduler() {
  if (g.autoAuditTimer) return; // dev hot-reload เรียกซ้ำได้ — อย่าตั้งสองตัว
  if (process.env.AUTO_AUDIT_SCHEDULER === "off") {
    console.log("auto-audit: ปิดตัวตั้งเวลาไว้ (AUTO_AUDIT_SCHEDULER=off)");
    return;
  }
  g.autoAuditTimer = setInterval(() => void tick(), TICK_MS);
  g.autoAuditTimer.unref?.();
  console.log("auto-audit: ตัวตั้งเวลาเริ่มทำงาน (เช็คทุก 1 นาที)");
}
