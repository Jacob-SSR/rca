"use client";

// app/components/OfficeScene.tsx
// ฉากออฟฟิศพิกเซลของน้องผู้ตรวจ — ภาพประกอบการ์ดความคืบหน้าและวิดเจ็ตตรวจอัตโนมัติ
//
// ฉากหลักเป็นภาพนิ่ง (public/scene/office.webp — ภาพที่ผู้ใช้ให้มา) แล้วซ้อน animation ทับให้ภาพมีชีวิต:
//   • ฟ้าในหน้าต่างตามเวลาจริง (เวลาไทย): เช้าอมส้ม / กลางวันตามภาพ / เย็นสีพระอาทิตย์ตก
//     / กลางคืนมืด มีพระจันทร์ ดาว ไฟตามตึก — ห้องมืดลงแต่แสงจอส่องหน้า
//   • ฟองความคิดเหนือหัวบอกขั้นที่ทำ (ค้นหา / เขียนฟอร์ม / สร้างเอกสาร / AI ตรวจ) · ว่าง = แก้วกาแฟ
//   • เริ่มเคสใหม่ (job เปลี่ยน) → แฟ้มลอยจากชั้นด้านขวามาวางบนกองเอกสาร
//   • ตรวจเสร็จหนึ่งราย (cheer เปลี่ยน) → ✓ +1 เด้งเหนือหัว
//   • ป้ายบนกองเอกสาร = จำนวนเคสที่รอคิว · มีจุดแสงกะพริบที่คีย์บอร์ดระหว่างทำงาน
//
// ตำแหน่งทั้งหมดเป็น % ของภาพ (อัตราส่วน 3:2) — ย้าย/เปลี่ยนภาพต้องวัดตำแหน่งใหม่ใน SPOT
//
// ── ทำให้ภาพนิ่งมีชีวิต (puppet) ──
// ตัดส่วนของภาพเป็นชั้นโปร่งใส (public/scene/layer-*.webp, blink-*.webp, plant-*.webp) แล้วขยับทีละชั้น:
//   หัว+แขนที่ท้าวคาง โยกรอบข้อศอก · กะพริบตา (แผ่นทาผิวทับลูกตา อยู่ในชั้นหัวจะได้โยกตาม)
//   ปุ่มคีย์บอร์ดใต้นิ้วสว่างเป็นช่วงๆ ตอนทำงาน (เหมือนกำลังกด) · หัวเพื่อนร่วมงานขยับ · ใบไม้ไหว
// ไม่ขยับชั้นมือ — ในวิดเจ็ตขนาดเล็กเลื่อนได้ไม่ถึงพิกเซลจอ ดูเป็นภาพกระตุกมากกว่าพิมพ์
// ภาพฉากซ่อมก้อนดำใต้นิ้ว (ภาพต้นฉบับวาดเมาส์กับคีย์บอร์ดกลืนกัน) ให้เป็นแถวปุ่มคีย์บอร์ดต่อเนื่องแล้ว
// ชั้นตัดจากภาพต้นฉบับแล้วย่อด้วยวิธีเดียวกับภาพฉาก ตำแหน่งจึงตรงกันพอดีพิกเซล
// เปลี่ยนภาพฉากต้องตัดชั้นใหม่และวัด LAYER ใหม่ทั้งหมด
// ตัวละครเดินไปมาไม่ได้ (ภาพนิ่ง) — ที่ขยับได้คือส่วนที่ตัดไว้เท่านั้น
// animation หยุดเองเมื่อผู้ใช้ตั้ง prefers-reduced-motion (ดู globals.css)

import Image from "next/image";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import Icon, { type IconName } from "@/app/components/Icon";
import type { AuditStep } from "@/lib/auto-audit/progress";

/** จุดสำคัญในภาพ (% ของกว้าง/สูง) */
const SPOT = {
  /** กระจกหน้าต่างมุมซ้ายบน (clip-path) */
  window: "polygon(0% 0%, 12.6% 0%, 12.6% 30.5%, 0% 33.5%)",
  face: { x: 47, y: 39 },
  bubble: { x: 59, y: 21 },
  cheer: { x: 37, y: 30 },
  /** ปุ่มคีย์บอร์ดใต้ปลายนิ้ว */
  keyboard: { x: 42.7, y: 65.4 },
  monitor: { x: 25, y: 52 },
  /** กองเอกสารหน้าโต๊ะ — ป้ายคิว + ปลายทางของแฟ้มที่ลอยมา */
  stack: { x: 47, y: 79 },
  /** ชั้นแฟ้มด้านขวา — ต้นทางของแฟ้ม */
  shelf: { x: 85, y: 56 },
};

// ── เวลาจริง (เวลาไทย) ───────────────────────────────────────────────────────

type DayPart = "morning" | "day" | "evening" | "night";

/** ชั่วโมงแบบมีเศษนาที — ปัดเป็นนาทีเพื่อให้ค่าคงที่ในนาทีเดียวกัน */
function bangkokHour(): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return h + m / 60;
}

function subscribeMinute(cb: () => void) {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
}

/** ชั่วโมงปัจจุบันที่อัปเดตเองทุกครึ่งนาที — ฝั่ง server ใช้เที่ยงวันไปก่อน */
function useBangkokHour(): number {
  return useSyncExternalStore(subscribeMinute, bangkokHour, () => 12);
}

function dayPart(h: number): DayPart {
  if (h >= 5 && h < 9) return "morning";
  if (h >= 9 && h < 16) return "day";
  if (h >= 16 && h < 19) return "evening";
  return "night";
}

/** สีที่ซ้อนบนหน้าต่าง (multiply) และบนทั้งห้อง */
const TINT: Record<DayPart, { window: string | null; room: string | null }> = {
  morning: {
    window: "linear-gradient(180deg, #9fc6f0 0%, #ffc9a8 60%, #ffe1a8 100%)",
    room: "rgba(255, 196, 150, 0.12)",
  },
  day: { window: null, room: null },
  evening: {
    window: "linear-gradient(180deg, #b77aa8 0%, #f39a6b 55%, #ffcf8a 100%)",
    room: "rgba(255, 140, 70, 0.16)",
  },
  night: {
    window: "linear-gradient(180deg, #0e1838 0%, #1d2b5a 70%, #2a3a6e 100%)",
    room: "rgba(18, 26, 62, 0.55)",
  },
};

const STEP_BUBBLE: Record<AuditStep, { icon: IconName; label: string }> = {
  lookup: { icon: "search", label: "ค้นข้อมูลใน HOSxP" },
  form: { icon: "pencil", label: "กรอกฟอร์ม" },
  document: { icon: "fileText", label: "สร้างเอกสาร" },
  review: { icon: "sparkles", label: "AI กำลังตรวจ" },
};

const at = (p: { x: number; y: number }): CSSProperties => ({ left: `${p.x}%`, top: `${p.y}%` });

/** กล่องของแต่ละชั้น (% ของภาพ) + จุดหมุน ox/oy (% ของกล่องชั้นนั้น) */
type Box = { left: number; top: number; width: number; height: number; ox?: number; oy?: number };

const LAYER: Record<string, Box> = {
  head: { left: 38.646, top: 20.938, width: 18.021, height: 39.219, ox: 13.2, oy: 94.8 },
  coworker: { left: 85.625, top: 8.438, width: 8.854, height: 15.313, ox: 49.9, oy: 98 },
  plantDesk: { left: 25.521, top: 69.375, width: 9.167, height: 11.25, ox: 49.7, oy: 95.1 },
  plantRight: { left: 82.604, top: 29.531, width: 10.104, height: 10.938, ox: 49.7, oy: 105 },
  plantTop: { left: 32.812, top: 4.062, width: 8.125, height: 8.594, ox: 49.7, oy: 93.6 },
};

/** ตาหลับ — กล่องในภาพ แปลงเป็นตำแหน่งภายในชั้นหัวด้วย inside() */
const BLINK_L: Box = { left: 42.083, top: 38.594, width: 2.5, height: 3.438 };
const BLINK_R: Box = { left: 45.833, top: 39.219, width: 2.708, height: 3.906 };

function inside(child: Box, parent: Box): Box {
  return {
    left: ((child.left - parent.left) / parent.width) * 100,
    top: ((child.top - parent.top) / parent.height) * 100,
    width: (child.width / parent.width) * 100,
    height: (child.height / parent.height) * 100,
  };
}

const boxStyle = (b: Box): CSSProperties => ({
  left: `${b.left}%`,
  top: `${b.top}%`,
  width: `${b.width}%`,
  height: `${b.height}%`,
});

/** ชั้นภาพหนึ่งชิ้น — กล่องนอกวางตำแหน่ง กล่องในขยับ (animation) รอบจุดหมุนของชั้น */
function Layer({
  src,
  box,
  className,
  style,
  children,
}: {
  src: string;
  box: Box;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div className="absolute" style={boxStyle(box)}>
      <div
        className={`absolute inset-0 ${className ?? ""}`}
        style={{ transformOrigin: `${box.ox ?? 50}% ${box.oy ?? 50}%`, ...style }}
      >
        <Image src={src} alt="" fill unoptimized draggable={false} />
        {children}
      </div>
    </div>
  );
}

export default function OfficeScene({
  step = "lookup",
  cheer = 0,
  job,
  pending = 0,
  hour,
  idle = false,
  compact = false,
  className = "",
}: {
  step?: AuditStep;
  /** เปลี่ยนค่าเมื่อตรวจเสร็จหนึ่งราย (เช่นจำนวนที่เสร็จ) → ✓ +1 */
  cheer?: number;
  /** เคสที่กำลังทำ (เช่น VN) — เปลี่ยนเมื่อไรแฟ้มใหม่จะลอยมาวางบนโต๊ะ */
  job?: string;
  /** จำนวนเคสที่รอคิว — แสดงเป็นป้ายบนกองเอกสาร */
  pending?: number;
  /** บังคับชั่วโมง (0–24) แทนเวลาจริง — ไว้ทดสอบ */
  hour?: number;
  /** ไม่มีงาน — ฟองความคิดเป็นแก้วกาแฟ ไม่มีป้ายคิว/แสงคีย์บอร์ด */
  idle?: boolean;
  /** ขนาดเล็ก (วิดเจ็ต) — ซ่อนป้ายข้อความในฟอง เหลือแต่ไอคอน */
  compact?: boolean;
  className?: string;
}) {
  const realHour = useBangkokHour();
  const part = dayPart(hour ?? realHour);
  const tint = TINT[part];
  const bubble = idle ? { icon: "coffee" as IconName, label: "พักจิบกาแฟ" } : STEP_BUBBLE[step];

  return (
    <div
      className={`relative aspect-[3/2] overflow-hidden select-none ${className}`}
      role="img"
      aria-label={idle ? "น้องผู้ตรวจนั่งพักจิบกาแฟ" : `น้องผู้ตรวจกำลัง${bubble.label}`}
    >
      <Image
        src="/scene/office.webp"
        alt=""
        fill
        // ย่อไว้แล้ว (960×640) — ไม่ผ่าน /_next/image เพราะตัวย่อรูปดึงไฟล์โดยไม่มี cookie แล้วโดน proxy บล็อก
        unoptimized
        className="object-cover"
        draggable={false}
      />

      {/* ── ชั้นที่ขยับได้ (puppet) — อยู่ใต้ชั้นแสงตามเวลา จะได้มืด/สว่างตามห้อง ── */}
      <Layer src="/scene/plant-top.webp" box={LAYER.plantTop} className="scene-leaf" style={{ animationDuration: "5.1s" }} />
      <Layer src="/scene/plant-right.webp" box={LAYER.plantRight} className="scene-leaf" style={{ animationDuration: "4.3s", animationDelay: "-1.7s" }} />
      <Layer src="/scene/plant-desk.webp" box={LAYER.plantDesk} className="scene-leaf" style={{ animationDuration: "3.7s", animationDelay: "-0.9s" }} />
      <Layer src="/scene/layer-coworker.webp" box={LAYER.coworker} className="scene-nod" />
      {/* หัว + แขนท้าวคาง: ว่าง = โยกเหม่อช้าๆ · ทำงาน = พยักเล็กน้อยแบบตั้งใจ */}
      <Layer src="/scene/layer-head.webp" box={LAYER.head} className={idle ? "scene-daydream" : "scene-focus"}>
        <div className="absolute inset-0 scene-blink">
          <div className="absolute" style={boxStyle(inside(BLINK_L, LAYER.head))}>
            <Image src="/scene/blink-l.webp" alt="" fill unoptimized draggable={false} />
          </div>
          <div className="absolute" style={boxStyle(inside(BLINK_R, LAYER.head))}>
            <Image src="/scene/blink-r.webp" alt="" fill unoptimized draggable={false} />
          </div>
        </div>
      </Layer>

      {/* ── ฟ้าในหน้าต่างตามเวลาจริง ── */}
      {tint.window ? (
        <div
          className="absolute inset-0"
          style={{ clipPath: SPOT.window, background: tint.window, mixBlendMode: "multiply", opacity: 0.9 }}
        />
      ) : null}
      {part === "night" ? (
        <div className="absolute inset-0" style={{ clipPath: SPOT.window }}>
          {/* พระจันทร์ + ดาว + ไฟตามตึก */}
          <span className="absolute size-[3.4%] rounded-full bg-[#fff6d6] shadow-[0_0_6px_2px_rgba(255,246,214,0.6)]" style={at({ x: 7.5, y: 3 })} />
          {[
            { x: 2, y: 2.5 },
            { x: 4.5, y: 6 },
            { x: 10.5, y: 8 },
          ].map((s, i) => (
            <span
              key={i}
              className="absolute size-[0.6%] bg-white scene-twinkle"
              style={{ ...at(s), animationDelay: `${-i * 0.6}s` }}
            />
          ))}
          {[
            { x: 1.5, y: 12 },
            { x: 3.5, y: 15 },
            { x: 6, y: 11 },
            { x: 8.5, y: 16 },
            { x: 2.5, y: 19 },
            { x: 7, y: 21 },
          ].map((w, i) => (
            <span key={i} className="absolute h-[1.2%] w-[0.9%] bg-[#ffd36e]" style={{ ...at(w), opacity: 0.85 }} />
          ))}
        </div>
      ) : null}

      {/* ── แสงในห้องตามช่วงเวลา · กลางคืนแสงจอส่องหน้า ── */}
      {tint.room ? (
        <div className="absolute inset-0" style={{ background: tint.room, mixBlendMode: "multiply" }} />
      ) : null}
      {part === "night" ? (
        <div
          className="absolute inset-0 scene-glow"
          style={{
            background: `radial-gradient(18% 20% at ${SPOT.face.x}% ${SPOT.face.y}%, rgba(170, 205, 255, 0.55), transparent 70%),
                         radial-gradient(16% 22% at ${SPOT.monitor.x}% ${SPOT.monitor.y}%, rgba(150, 190, 255, 0.35), transparent 70%)`,
            mixBlendMode: "screen",
          }}
        />
      ) : null}

      {/* ── ปุ่มคีย์บอร์ดใต้นิ้วสว่างเป็นช่วงๆ (กำลังกด) — ขนาด/สีเท่าปุ่มจริงในภาพ ── */}
      {idle ? null : (
        <>
          {[
            { x: SPOT.keyboard.x, y: SPOT.keyboard.y, d: "0s" },
            { x: SPOT.keyboard.x + 1.1, y: SPOT.keyboard.y + 0.9, d: "-0.9s" },
            { x: SPOT.keyboard.x - 1.1, y: SPOT.keyboard.y + 1, d: "-1.7s" },
          ].map((k, i) => (
            <span
              key={i}
              className="absolute h-[0.8%] w-[0.9%] -translate-1/2 rounded-[1px] bg-[#aeb2cc] scene-key"
              style={{ ...at(k), animationDelay: k.d }}
            />
          ))}
        </>
      )}

      {/* ── ป้ายจำนวนคิวบนกองเอกสาร ── */}
      {!idle && pending > 0 ? (
        <span
          className="absolute -translate-1/2 rounded-sm bg-[#2a2733] px-[1.2%] py-[0.3%] text-[10px] sm:text-xs leading-none font-bold text-white shadow ring-2 ring-white"
          style={at({ x: SPOT.stack.x + 5, y: SPOT.stack.y - 6 })}
          title={`รอคิวอีก ${pending} เคส`}
        >
          คิว {pending}
        </span>
      ) : null}

      {/* ── แฟ้มลอยจากชั้นมาวางบนโต๊ะ (ทุกครั้งที่เริ่มเคสใหม่) ── */}
      {!idle && job ? (
        <span
          key={job}
          className="absolute h-[7%] w-[6%] -translate-1/2 scene-fly"
          style={
            {
              "--from-x": `${SPOT.shelf.x}%`,
              "--from-y": `${SPOT.shelf.y}%`,
              "--to-x": `${SPOT.stack.x}%`,
              "--to-y": `${SPOT.stack.y}%`,
            } as CSSProperties
          }
        >
          <span className="absolute inset-0 rounded-[2px] border-2 border-[#2a2733] bg-[#f3d38b]" />
          <span className="absolute -top-[18%] left-0 h-[30%] w-[45%] rounded-t-[2px] border-2 border-b-0 border-[#2a2733] bg-[#f3d38b]" />
        </span>
      ) : null}

      {/* ── ฟองความคิดเหนือหัว ── */}
      <div key={idle ? "idle" : step} className="absolute -translate-1/2 scene-pop" style={at(SPOT.bubble)}>
        <div className="scene-float flex items-center gap-1 rounded-lg border-2 border-[#2a2733] bg-white px-1.5 py-0.5 text-[#2a2733] shadow-[2px_2px_0_#2a2733]">
          <Icon name={bubble.icon} size={compact ? 13 : 16} strokeWidth={2.4} className={idle ? "" : "text-brand-700"} />
          {compact ? null : <span className="text-xs font-semibold whitespace-nowrap">{bubble.label}</span>}
        </div>
        {/* หางฟองเป็นจุดเล็กสองจุดลงไปหาหัว */}
        <span className="absolute -bottom-2 left-[22%] size-1.5 border-2 border-[#2a2733] bg-white" />
        <span className="absolute -bottom-3.5 left-[12%] size-1 bg-[#2a2733]" />
      </div>

      {/* ── ✓ +1 เมื่อตรวจเสร็จหนึ่งราย ── */}
      {cheer > 0 ? (
        <span
          key={cheer}
          className="absolute -translate-1/2 scene-cheer rounded-full bg-emerald-500 px-1.5 py-0.5 text-xs font-bold text-white shadow ring-2 ring-white"
          style={at(SPOT.cheer)}
        >
          ✓ +1
        </span>
      ) : null}
    </div>
  );
}
