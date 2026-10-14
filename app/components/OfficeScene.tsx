"use client";

// app/components/OfficeScene.tsx
// ฉากออฟฟิศพิกเซลของน้องผู้ตรวจ — ภาพประกอบการ์ดความคืบหน้าและวิดเจ็ตตรวจอัตโนมัติ
//
// ฉากเป็นภาพนิ่งที่ผู้ใช้ให้มา (public/scene/<ฉาก>.webp) เลือกตามสถานะจริง:
//   ว่างงาน            → วน coffee (จิบกาแฟ) → snack (กินขนม) → nap (งีบ มี zZ) ฉากละ 20 วินาที
//   ค้นข้อมูล/ฟอร์ม/เอกสาร → type (พิมพ์คีย์บอร์ดสองมือ)
//   AI กำลังตรวจ        → review (ท้าวคาง มือจับเมาส์ ดูจอ — มีวงคลิกที่เมาส์)
//   เริ่มเคสใหม่ (job เปลี่ยน) → fetch (เอื้อมหยิบแฟ้มจากชั้น) ซ้อนขึ้นมาราว 4 วินาทีแล้วเฟดออก
// แล้วซ้อน animation ทับให้ภาพมีชีวิต:
//   • ฟ้าในหน้าต่างตามเวลาจริง (เวลาไทย): เช้าอมส้ม / กลางวันตามภาพ / เย็นสีพระอาทิตย์ตก
//     / กลางคืนมืด มีพระจันทร์ ดาว ไฟตามตึก — ห้องมืดลงแต่แสงจอส่องหน้า
//   • ฟองความคิดเหนือหัวบอกขั้นที่ทำ (ค้นหา / เขียนฟอร์ม / สร้างเอกสาร / AI ตรวจ)
//   • ตรวจเสร็จหนึ่งราย (cheer เปลี่ยน) → ✓ +1 เด้ง · ป้ายมุมซ้ายล่าง = จำนวนเคสที่รอคิว
//
// ── ทำให้ภาพนิ่งมีชีวิต (puppet) ──
// ตัดส่วนของภาพเป็นชั้นโปร่งใส (public/scene/<ฉาก>-<ชั้น>.webp) แล้วขยับทีละชั้น:
//   หัว (พยัก/ยกแก้วจิบ/เคี้ยว/หายใจตอนงีบ) · กะพริบตา (แผ่นทาผิวทับลูกตา อยู่ในชั้นหัวจะได้ขยับตาม)
//   มือพิมพ์สลับซ้ายขวา + ปุ่มใต้นิ้วสว่าง · กระดาษในมือไหวตอนหยิบแฟ้ม · เพื่อนร่วมงานขยับ · ใบไม้ไหว
// ตำแหน่งชั้นอยู่ใน officeScenes.ts — สร้างจากสคริปต์ตัดชั้น เปลี่ยนภาพต้องตัดชั้นใหม่ทั้งหมด
// ตัวละครเดินไปมาไม่ได้ (ภาพนิ่ง) — ที่ขยับได้คือส่วนที่ตัดไว้เท่านั้น
// animation หยุดเองเมื่อผู้ใช้ตั้ง prefers-reduced-motion (ดู globals.css)

import Image from "next/image";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import Icon, { type IconName } from "@/app/components/Icon";
import type { AuditStep } from "@/lib/auto-audit/progress";
import { SCENE_LAYERS, type Box, type SceneName } from "@/app/components/officeScenes";

/** จุดที่ใช้ร่วมทุกฉาก (% ของกว้าง/สูง) — ทุกภาพจัดฉากเหมือนกัน */
const SPOT = {
  /** กระจกหน้าต่างมุมซ้ายบน (clip-path) */
  window: "polygon(0% 0%, 12.6% 0%, 12.6% 30.5%, 0% 33.5%)",
  bubble: { x: 59, y: 21 },
  cheer: { x: 37, y: 30 },
  monitor: { x: 25, y: 52 },
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

/** ภาพไม่ผ่าน /_next/image — ย่อไว้แล้ว และตัวย่อรูปดึงไฟล์โดยไม่มี cookie แล้วโดน proxy บล็อก */
function Img({ src, className }: { src: string; className?: string }) {
  return <Image src={src} alt="" fill unoptimized draggable={false} className={className} />;
}

/** ชั้นภาพหนึ่งชิ้น — กล่องนอกวางตำแหน่ง กล่องในขยับ (animation) รอบจุดหมุนของชั้น */
function Layer({
  scene,
  name,
  className,
  style,
  children,
}: {
  scene: SceneName;
  name: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const box = (SCENE_LAYERS[scene] as Record<string, Box>)[name];
  if (!box) return null;
  return (
    <div className="absolute" style={boxStyle(box)}>
      <div
        className={`absolute inset-0 ${className ?? ""}`}
        style={{ transformOrigin: `${box.ox ?? 50}% ${box.oy ?? 50}%`, ...style }}
      >
        <Img src={`/scene/${scene}-${name}.webp`} />
        {children}
      </div>
    </div>
  );
}

/** ตากะพริบ — แผ่นตาหลับวางในชั้นหัว จะได้ขยับไปด้วยกัน */
function Blink({ scene }: { scene: SceneName }) {
  const L = SCENE_LAYERS[scene] as Record<string, Box>;
  if (!L["blink-l"] || !L["blink-r"]) return null;
  return (
    <div className="absolute inset-0 scene-blink">
      {(["l", "r"] as const).map((side) => (
        <div key={side} className="absolute" style={boxStyle(inside(L[`blink-${side}`], L.head))}>
          <Img src={`/scene/${scene}-blink-${side}.webp`} />
        </div>
      ))}
    </div>
  );
}

/** แสงจอส่องหน้าตอนกลางคืน — กึ่งกลางระหว่างตาสองข้าง (ฉากงีบใช้กลางชั้นหัว) */
function faceOf(scene: SceneName): { x: number; y: number } {
  const L = SCENE_LAYERS[scene] as Record<string, Box>;
  const l = L["blink-l"];
  const r = L["blink-r"];
  if (l && r) return { x: (l.left + r.left + r.width) / 2, y: (l.top + r.top + r.height) / 2 };
  return { x: L.head.left + L.head.width / 2, y: L.head.top + L.head.height * 0.45 };
}

/** ท่าของหัวในแต่ละฉาก */
const HEAD_MOTION: Record<SceneName, string> = {
  type: "scene-focus",
  review: "scene-focus",
  fetch: "scene-focus",
  coffee: "scene-sip",
  snack: "scene-munch",
  nap: "scene-breathe",
};

/** ฉากหนึ่งฉาก: ภาพเต็ม + ใบไม้ + เพื่อนร่วมงาน + หัว (กะพริบตา) + ของเฉพาะฉาก */
function Scene({ scene }: { scene: SceneName }) {
  return (
    <>
      <Img src={`/scene/${scene}.webp`} className="object-cover" />
      <Layer scene={scene} name="plant-top" className="scene-leaf" style={{ animationDuration: "5.1s" }} />
      <Layer scene={scene} name="plant-right" className="scene-leaf" style={{ animationDuration: "4.3s", animationDelay: "-1.7s" }} />
      <Layer scene={scene} name="plant-desk" className="scene-leaf" style={{ animationDuration: "3.7s", animationDelay: "-0.9s" }} />
      <Layer scene={scene} name="coworker" className="scene-nod" />
      <Layer scene={scene} name="head" className={HEAD_MOTION[scene]}>
        <Blink scene={scene} />
      </Layer>

      {scene === "type" ? (
        <>
          {/* มือพิมพ์สลับซ้ายขวา + ปุ่มใต้ปลายนิ้วสว่าง */}
          <Layer scene={scene} name="hand-l" className="scene-type" />
          <Layer scene={scene} name="hand-r" className="scene-type" style={{ animationDelay: "-1.3s" }} />
          {[
            { x: 35, y: 62, d: "0s" },
            { x: 41.5, y: 67, d: "-0.7s" },
            { x: 37, y: 63.2, d: "-1.5s" },
          ].map((k, i) => (
            <span
              key={i}
              className="absolute h-[0.8%] w-[0.9%] -translate-1/2 rounded-[1px] bg-[#aeb2cc] scene-key"
              style={{ ...at(k), animationDelay: k.d }}
            />
          ))}
        </>
      ) : null}

      {/* กระดาษในมือไหวตอนหยิบแฟ้ม */}
      {scene === "fetch" ? <Layer scene={scene} name="paper" className="scene-paper" /> : null}

      {/* วงคลิกที่เมาส์ระหว่างรอ AI ตรวจ */}
      {scene === "review" ? (
        <span className="absolute size-[3%] -translate-1/2 rounded-full border-2 border-white/90 scene-click" style={at({ x: 45.6, y: 70 })} />
      ) : null}

      {/* ไอร้อนจากแก้วกาแฟ — สามสายลอยเฉียงออกซ้าย ไม่บังตา */}
      {scene === "coffee"
        ? [0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute h-[4%] w-[0.7%] rounded-full bg-white/60 blur-[1px] scene-steam"
              style={{ ...at({ x: 39.3 - i * 0.9, y: 39 }), animationDelay: `${-i * 0.8}s` }}
            />
          ))
        : null}

      {/* zZ ลอยตอนงีบ */}
      {scene === "nap"
        ? ["z", "Z", "z"].map((z, i) => (
            <span
              key={i}
              className="absolute font-bold text-[#2a2733] [text-shadow:1px_1px_0_#fff] scene-zz"
              style={{ ...at({ x: 57 + i * 2, y: 26 - i * 3 }), fontSize: `${0.7 + i * 0.25}em`, animationDelay: `${i * 0.9}s` }}
            >
              {z}
            </span>
          ))
        : null}
    </>
  );
}

/** ฉากพักวนกัน — แต่ละฉากโชว์ 20 วินาทีแล้วเฟดต่อ (เลื่อนจังหวะด้วย animation-delay ติดลบ) */
const IDLE_SCENES: SceneName[] = ["coffee", "snack", "nap"];

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
  /** เคสที่กำลังทำ (เช่น VN) — เปลี่ยนเมื่อไรน้องจะเอื้อมหยิบแฟ้มเคสถัดไป */
  job?: string;
  /** จำนวนเคสที่รอคิว — แสดงเป็นป้ายมุมซ้ายล่าง */
  pending?: number;
  /** บังคับชั่วโมง (0–24) แทนเวลาจริง — ไว้ทดสอบ */
  hour?: number;
  /** ไม่มีงาน — วนฉากพัก (จิบกาแฟ / กินขนม / งีบ) ไม่มีฟองความคิด/ป้ายคิว */
  idle?: boolean;
  /** ขนาดเล็ก (วิดเจ็ต) — ซ่อนป้ายข้อความในฟอง เหลือแต่ไอคอน */
  compact?: boolean;
  className?: string;
}) {
  const realHour = useBangkokHour();
  const part = dayPart(hour ?? realHour);
  const tint = TINT[part];
  const bubble = STEP_BUBBLE[step];
  const workScene: SceneName = step === "review" ? "review" : "type";
  // ฉากพักวนกันจึงใช้หน้าของฉากกาแฟเป็นตัวแทน
  const face = faceOf(idle ? "coffee" : workScene);

  return (
    <div
      className={`relative aspect-[3/2] overflow-hidden select-none ${className}`}
      role="img"
      aria-label={idle ? "น้องผู้ตรวจนั่งพักอยู่" : `น้องผู้ตรวจกำลัง${bubble.label}`}
    >
      {/* ── ฉากตามสถานะ (ทุกฉากอยู่ใต้ชั้นแสงตามเวลา) — โหลดเฉพาะฉากที่ใช้ ── */}
      {idle ? (
        IDLE_SCENES.map((sc, i) => (
          <div
            key={sc}
            className="absolute inset-0 scene-idle-cycle"
            style={{ animationDelay: `${i === 0 ? 0 : -(IDLE_SCENES.length - i) * 20}s` }}
          >
            <Scene scene={sc} />
          </div>
        ))
      ) : (
        <div key={`scene-${workScene}`} className="absolute inset-0 scene-enter">
          <Scene scene={workScene} />
        </div>
      )}
      {/* เริ่มเคสใหม่ → เอื้อมหยิบแฟ้มจากชั้น แล้วเฟดกลับไปฉากทำงาน */}
      {!idle && job ? (
        <div key={`fetch-${job}`} className="absolute inset-0 scene-fetch-once">
          <Scene scene="fetch" />
        </div>
      ) : null}

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
            background: `radial-gradient(18% 20% at ${face.x}% ${face.y}%, rgba(170, 205, 255, 0.55), transparent 70%),
                         radial-gradient(16% 22% at ${SPOT.monitor.x}% ${SPOT.monitor.y}%, rgba(150, 190, 255, 0.35), transparent 70%)`,
            mixBlendMode: "screen",
          }}
        />
      ) : null}

      {/* ── ป้ายจำนวนคิว (มุมซ้ายล่าง) ── */}
      {!idle && pending > 0 ? (
        <span
          className="absolute bottom-[4%] left-[3%] rounded-sm bg-[#2a2733] px-1.5 py-0.5 text-[10px] leading-none font-bold text-white shadow ring-2 ring-white sm:text-xs"
          title={`รอคิวอีก ${pending} เคส`}
        >
          คิว {pending}
        </span>
      ) : null}

      {/* ── ฟองความคิดเหนือหัว ── */}
      {idle ? null : (
      <div key={`bubble-${step}`} className="absolute -translate-1/2 scene-pop" style={at(SPOT.bubble)}>
        <div className="scene-float flex items-center gap-1 rounded-lg border-2 border-[#2a2733] bg-white px-1.5 py-0.5 text-[#2a2733] shadow-[2px_2px_0_#2a2733]">
          <Icon name={bubble.icon} size={compact ? 13 : 16} strokeWidth={2.4} className="text-brand-700" />
          {compact ? null : <span className="text-xs font-semibold whitespace-nowrap">{bubble.label}</span>}
        </div>
        {/* หางฟองเป็นจุดเล็กสองจุดลงไปหาหัว */}
        <span className="absolute -bottom-2 left-[22%] size-1.5 border-2 border-[#2a2733] bg-white" />
        <span className="absolute -bottom-3.5 left-[12%] size-1 bg-[#2a2733]" />
      </div>
      )}

      {/* ── ✓ +1 เมื่อตรวจเสร็จหนึ่งราย ── */}
      {cheer > 0 ? (
        <span
          key={`cheer-${cheer}`}
          className="absolute -translate-1/2 scene-cheer rounded-full bg-emerald-500 px-1.5 py-0.5 text-xs font-bold text-white shadow ring-2 ring-white"
          style={at(SPOT.cheer)}
        >
          ✓ +1
        </span>
      ) : null}
    </div>
  );
}
