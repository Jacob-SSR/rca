// lib/ai/quota.ts
// ตรวจจับ "โควตา AI หมด" แล้วจำไว้ว่าจะกลับมาใช้ได้เมื่อไร
//
// ทำไมต้องจำ: ถ้าไม่จำ ทุกครั้งที่ผู้ใช้กดตรวจ (หรือรอบตรวจอัตโนมัติวนทีละ visit)
// จะยิงไปหา AI แล้วโดน 429 ซ้ำๆ — เสียเวลารอ สร้าง Review FAILED ทิ้งไว้เต็มฐานข้อมูล
// และผู้ใช้ไม่รู้ว่าต้องรออีกนานแค่ไหน
//
// Gemini มีโควตา 2 ระดับ
//   - ต่อนาที (RPM/TPM)  → error บอก retryDelay มาเป็นวินาที
//   - ต่อวัน (RPD)       → รีเซ็ตตอนเที่ยงคืนเวลาแปซิฟิก (America/Los_Angeles)
//                          = 14:00 หรือ 15:00 เวลาไทย แล้วแต่ช่วง daylight saving
// ถ้าแยกไม่ออก ถือเป็นรายวันไว้ก่อน (ปลอดภัยกว่าบอกว่าอีกครู่เดียวแล้วโดนซ้ำ)
//
// เก็บสถานะไว้ในหน่วยความจำของ process (แอปนี้รันคอนเทนเนอร์เดียว)
// รีสตาร์ตแล้วหาย → ครั้งถัดไปที่เรียก AI จะโดน 429 แล้วจำใหม่เอง

export type QuotaScope = "minute" | "day";

export type QuotaBlock = {
  scope: QuotaScope;
  /** ISO — เวลาที่คาดว่าโควตาจะกลับมา */
  resetAt: string;
  /** ข้อความดิบจากผู้ให้บริการ (ตัดสั้น) — ไว้ดูตอนตรวจปัญหา */
  detail: string;
  since: string;
};

const store = globalThis as unknown as { __rcaAiQuota?: QuotaBlock | null };

/** สถานะปัจจุบัน — หมดเวลาแล้วถือว่าใช้ได้ (ล้างให้เอง) */
export function currentQuotaBlock(now: Date = new Date()): QuotaBlock | null {
  const b = store.__rcaAiQuota ?? null;
  if (!b) return null;
  if (new Date(b.resetAt).getTime() <= now.getTime()) {
    store.__rcaAiQuota = null;
    return null;
  }
  return b;
}

export function rememberQuotaBlock(block: Omit<QuotaBlock, "since">, now: Date = new Date()) {
  store.__rcaAiQuota = { ...block, since: now.toISOString() };
}

export function clearQuotaBlock() {
  store.__rcaAiQuota = null;
}

/**
 * เที่ยงคืนถัดไปตามเวลาแปซิฟิก — จุดรีเซ็ตโควตารายวันของ Gemini
 * คำนวณจาก offset ของ America/Los_Angeles ณ ขณะนั้น จึงถูกทั้งช่วง PST และ PDT
 */
export function nextPacificMidnight(now: Date = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  // เวลาท้องถิ่นแปซิฟิกตอนนี้ (ตีความเป็น UTC เพื่อหา offset)
  const localAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const nextLocalMidnightAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day + 1);
  return new Date(nextLocalMidnightAsUtc - offsetMs);
}

/** "37s" / "1.5s" / "120s" → วินาที */
function parseDelay(s: string): number | null {
  const m = /^(\d+(?:\.\d+)?)s$/.exec(s.trim());
  return m ? Math.ceil(Number(m[1])) : null;
}

/**
 * อ่าน error จาก SDK แล้วบอกว่าใช่ "โควตาหมด" หรือไม่ ถ้าใช่คืนช่วงเวลารีเซ็ต
 * รับได้ทั้ง ApiError ของ @google/genai (status + message ที่เป็น JSON) และ error ทั่วไป
 */
export function detectQuotaError(e: unknown, now: Date = new Date()): Omit<QuotaBlock, "since"> | null {
  const status = typeof e === "object" && e !== null && "status" in e ? Number((e as { status: unknown }).status) : NaN;
  const message = e instanceof Error ? e.message : String(e ?? "");

  const looksLikeQuota =
    status === 429 || /RESOURCE_EXHAUSTED|exceeded your current quota|quota exceeded|rate limit/i.test(message);
  if (!looksLikeQuota) return null;

  // รายละเอียดอยู่ใน JSON ที่ฝังมากับ message
  let retrySec: number | null = null;
  let perDay = /PerDay|per day|daily/i.test(message);
  const jsonStart = message.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const body = JSON.parse(message.slice(jsonStart)) as {
        error?: { details?: Array<Record<string, unknown>> };
      };
      for (const d of body.error?.details ?? []) {
        const type = String(d["@type"] ?? "");
        if (type.endsWith("RetryInfo") && typeof d.retryDelay === "string") {
          retrySec = parseDelay(d.retryDelay);
        }
        if (type.endsWith("QuotaFailure") && Array.isArray(d.violations)) {
          for (const v of d.violations as Array<Record<string, unknown>>) {
            if (/PerDay/i.test(String(v.quotaId ?? "")) || /PerDay/i.test(String(v.quotaMetric ?? ""))) perDay = true;
          }
        }
      }
    } catch {
      // message ไม่ใช่ JSON ล้วน — ใช้ regex ด้านล่างแทน
    }
  }
  if (retrySec === null) {
    const m = /retry(?:Delay)?["\s:]*(?:in\s*)?"?(\d+(?:\.\d+)?)s/i.exec(message);
    if (m) retrySec = Math.ceil(Number(m[1]));
  }

  const detail = message.slice(0, 400);

  // ต่อนาที: มี retryDelay สั้นๆ และไม่ใช่โควตารายวัน
  if (!perDay && retrySec !== null && retrySec <= 3600) {
    return { scope: "minute", resetAt: new Date(now.getTime() + (retrySec + 2) * 1000).toISOString(), detail };
  }
  return { scope: "day", resetAt: nextPacificMidnight(now).toISOString(), detail };
}

/** "2 วัน 3 ชั่วโมง 15 นาที" — ไม่โชว์หน่วยที่เป็นศูนย์ข้างหน้า */
export function formatRemainingThai(ms: number): string {
  if (ms <= 0) return "อีกไม่กี่วินาที";
  const totalMin = Math.ceil(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const out: string[] = [];
  if (d) out.push(`${d} วัน`);
  if (h) out.push(`${h} ชั่วโมง`);
  if (m || out.length === 0) out.push(`${m} นาที`);
  return out.join(" ");
}

export function quotaMessage(block: QuotaBlock, now: Date = new Date()): string {
  const when = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(block.resetAt));
  const left = formatRemainingThai(new Date(block.resetAt).getTime() - now.getTime());
  return block.scope === "minute"
    ? `AI ถูกเรียกถี่เกินโควตาต่อนาที — ลองใหม่ได้ในอีก ${left}`
    : `โควตา AI ของวันนี้หมดแล้ว — รีเซ็ตในอีก ${left} (ประมาณ ${when} น.)`;
}
