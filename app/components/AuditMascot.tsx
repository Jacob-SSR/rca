"use client";

// app/components/AuditMascot.tsx
// ห้องทำงาน 2.5D (isometric pixel art) กับน้องผู้ตรวจ — ตัวละครพิกเซลสไตล์จิบิ (ออกแบบเอง)
// ภาพประกอบการ์ดความคืบหน้าตรวจอัตโนมัติ
//
// เรื่องในฉาก:
//   • โต๊ะเอกสาร (ชิดผนังซ้าย) มีแฟ้มเคสที่รอคิวซ้อนอยู่ — จำนวนแฟ้ม = คิวที่เหลือจริง
//   • เริ่มเคสใหม่ (job เปลี่ยน) → น้องเดินไปหยิบแฟ้มบนสุด ถือกลับมาวางที่โต๊ะทำงาน แล้วลงมือทำ
//   • ที่โต๊ะทำงาน (ใต้หน้าต่าง) ทำท่าตามขั้นที่ระบบกำลังทำจริง:
//       lookup → ชูตะเกียงส่องหา · form → ปากกาขนนกเขียน · document → กระดาษเด้งซ้อน
//       review → ส่องแว่นขยาย บรรทัดค่อยๆ เป็นสีเขียว มีประกาย
//   • cheer เปลี่ยน (ตรวจเสร็จหนึ่งราย) → กระโดดดีใจ
//   • idle (ไม่มีรอบตรวจ) → นั่งชิวบนเก้าอี้นุ่มกลางห้อง ยกแก้วกาแฟจิบเป็นระยะ
//   • ฟ้านอกหน้าต่างตามเวลาจริง (เวลาไทย): เช้า / กลางวัน / เย็น มีพระอาทิตย์เคลื่อนตามชั่วโมง
//     กลางคืนเป็นพระจันทร์กับดาว ห้องมืดลงแต่โคมไฟบนโต๊ะสว่าง
//
// ── วิธีวาด ──
// พิกัดห้อง (x, y, z): x ไปทางขวาล่าง, y ไปทางซ้ายล่าง, z ขึ้นบน — มุมในสุดของห้องอยู่ที่ (0, 0, 0)
// ฉายแบบ isometric 2:1 ด้วย P() · กล่องใช้ <Box> (เห็นสามด้าน คนละเฉด)
// ของแบนที่แปะผนัง/วางราบวาดเป็นสไปรต์ตรงๆ แล้วบิดเข้าระนาบด้วย matrix (OnRightWall/OnLeftWall/OnFloor)
// ตัวละครและของในมือเป็นสไปรต์ตั้งตรง (billboard) แบบเกม isometric ทั่วไป
//
// สไปรต์เขียนเป็นแถวตัวอักษร หนึ่งตัวอักษร = หนึ่งพิกเซล ("." = โปร่งใส) สีดูใน PAL
// แถวในสไปรต์เดียวกันต้องยาวเท่ากัน · ขยับแบบเฟรมต่อเฟรมด้วยคีย์เฟรม pix-* ใน globals.css
// หยุดนิ่งเองเมื่อผู้ใช้ตั้ง prefers-reduced-motion

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { AuditStep } from "@/lib/auto-audit/progress";

const PAL: Record<string, string> = {
  K: "#3b2b2b", // เส้นขอบ
  H: "#7a4a2e", // ผม
  h: "#a0673f", // ผมส่วนสว่าง / รองเท้า
  S: "#fcd9bd", // ผิว
  E: "#2b1d1d", // ตา
  W: "#ffffff",
  I: "#8a5a3a", // ม่านตา
  P: "#f49b9b", // แก้ม
  M: "#c95c5c", // ปาก
  C: "#fff3dd", // เสื้อ
  A: "#8fdcc0", // ชุดกันเปื้อน
  a: "#5fbf9f",
  B: "#5fd3b0", // โบว์
  L: "#6cbf4a", // ใบไม้
  l: "#46962f",
  Y: "#ffe08a", // ไฟ
  O: "#f28b3c",
  G: "#d6f1ff", // เลนส์
  D: "#8a5a3a", // ไม้เข้ม
  F: "#fffdf6", // กระดาษ
  f: "#d9d3c4", // บรรทัดบนกระดาษ
  g: "#2bcc9b", // บรรทัดที่ตรวจแล้ว
  R: "#ffd36e", // ประกาย
  m: "#f3d38b", // แฟ้ม
  n: "#d9b25f",
  c: "#e8796f", // เข็มนาฬิกา
};

// ── สไปรต์ ───────────────────────────────────────────────────────────────────

/** ตัวละครเต็มตัว 24 × 31 */
const GIRL = [
  "........KKKKKKKK........",
  "......KKHHHHHHHHKK......",
  ".....KHHhhhHHHHHHHK.....",
  "....KHHhhHHHHHHHHHHKLL..",
  "...KHHhHHHHHHHHHHHHKLlL.",
  "...KHHHHHHHHHHHHHHHHKL..",
  "..KHHHHKHHHHHHKHHHHHHK..",
  "..KHHHKSKHHHHKSSKHHHHK..",
  "..KHHKSSSKHHKSSSSKHHHK..",
  "BBKHKSSSSSSSSSSSSSSKHKBB",
  "BaKHKSKKKSSSSSSKKKSKHKaB",
  ".BKHKSEWESSSSSSEWESKHKB.",
  "..KHKSEWESSSSSSEWESKHK..",
  ".KHHKSEIESSSSSSEIESKHHK.",
  ".KHHKPPSSSSMMSSSSPPKHHK.",
  ".KHHHKSSSSSSSSSSSSKHHHK.",
  "..KHHHKKSSSSSSSSKKHHHK..",
  "..KHHK.KKKKKKKKKK.KHHK..",
  "...KK..KCCKSSKCCK..KK...",
  "......KCCCKKKKCCCK......",
  ".....KSKCCAAAACCK.......",
  ".....KSKCAAAAAACK.......",
  ".....KSKCAAaaAACK.......",
  ".....KKKCAAAAAACK.......",
  ".....KAAAAAAAAAAAK......",
  "....KAAAAAAAAAAAAAK.....",
  "....KKKKKKKKKKKKKKK.....",
  "......KSSK...KSSK.......",
  "......KSSK...KSSK.......",
  ".....KhhhK..KhhhK.......",
  ".....KKKKK..KKKKK.......",
];

/** ท่านั่ง — หัวกับลำตัวเหมือน GIRL ช่วงล่างเปลี่ยนเป็นขาห้อยหน้าเก้าอี้ */
const GIRL_SIT = [
  ...GIRL.slice(0, 20),
  ".....KCCCAAAACCCK.......",
  ".....KCCAAAAAACCK.......",
  ".....KCCAAaaAACCK.......",
  ".....KAAAAAAAAAAAK......",
  "....KAAAAAAAAAAAAAK.....",
  "....KKKKKKKKKKKKKKK.....",
  ".....KSSSK..KSSSK.......",
  ".....KhhhK..KhhhK.......",
  ".....KKKKK..KKKKK.......",
];

/** แก้วกาแฟในสองมือ (ท่านั่งพัก) */
const MUG_HANDS = ["..KKKKK..", ".SKFFFKK.", "SSKgggK.K", ".SKFFFKK.", "..KKKK..."];

/** ตาหลับ — วางทับตาขณะกะพริบ */
const EYES_CLOSED = ["SSS......SSS", "KKK......KKK", "SSS......SSS"];

/** แขนขวายื่นไปจับของ — ต่อจากไหล่ขวาของ GIRL */
const ARM_REACH = ["KKKKK", "SSSSSK", "KKKKSK", "....KK"];

const LANTERN = ["..KKK..", "...K...", ".KKKKK.", ".KYYYK.", ".KYOYK.", ".KYYYK.", ".KKKKK."];
const QUILL = ["......KK", ".....KWK", "....KWWK", "...KWWK.", "..KWWK..", ".KWWK...", ".KKK....", "KK......"];
const MAGNIFIER = [
  "..KKKK...",
  ".KGGGWK..",
  "KGGGGGWK.",
  "KGGGGGGK.",
  "KGGGGGGK.",
  ".KGGGGK..",
  "..KKKKDD.",
  "......DD.",
  ".......DD",
];
const HELD_PAPER = ["KKKKKK", "KFFFFK", "KFffFK", "KFFFFK", "KKKKKK"];
/** แฟ้มเคสที่ถือมาจากโต๊ะเอกสาร */
const FOLDER = ["KKKK....", "KmmmKKKK", "KmmmmmmK", "KmmFFmmK", "KmmmmmmK", "KnnnnnnK", "KKKKKKKK"];
const SPARKLE = ["..R..", ".RRR.", "RRWRR", ".RRR.", "..R.."];
const CLOUD = ["..WWW...", ".WWWWWW.", "WWWWWWWW"];
const LEAVES = ["..L...L..", ".LlL.LlL.", ".LLlLlLL.", "..LLlLL..", "...LlL...", "....l...."];
const SUN = [".YYY.", "YYYYY", "YYYYY", "YYYYY", ".YYY."];
const MOON = [".WWW.", "WWW..", "WW...", "WWW..", ".WWW."];
const CLOCK = ["..KKKK..", ".KWWWWK.", "KWWWWWWK", "KWWKWWWK", "KWWKKWWK", "KWWWWWWK", ".KWWWWK.", "..KKKK.."];
/** โปสเตอร์เช็กลิสต์เกณฑ์ */
const POSTER = [
  "KKKKKKKKKK",
  "KFFFFFFFFK",
  "KFgFffffFK",
  "KFFFFFFFFK",
  "KFgFfffFFK",
  "KFFFFFFFFK",
  "KFgFffffFK",
  "KFFFFFFFFK",
  "KKKKKKKKKK",
];

/** กระดาษบนโต๊ะ 16 × 10 */
function paper(lines: number) {
  const lens = [11, 9, 12, 8];
  const rows = ["KKKKKKKKKKKKKKKK"];
  for (let i = 0; i < 8; i++) {
    const n = Math.floor(i / 2);
    if (i % 2 === 1 && n < lines) rows.push(`KF${i === 1 ? "aaaaa" : "f".repeat(lens[n])}`.padEnd(15, "F") + "K");
    else rows.push(`K${"F".repeat(14)}K`);
  }
  rows.push("KKKKKKKKKKKKKKKK");
  return rows;
}

/** แถวตัวอักษร → สี่เหลี่ยม (รวมพิกเซลสีเดียวกันที่ติดกันในแถวเป็นชิ้นเดียว) */
function runs(rows: string[]) {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) w++;
      if (ch !== "." && PAL[ch]) out.push({ x, y, w, c: PAL[ch] });
      x += w;
    }
  });
  return out;
}

/**
 * วางสไปรต์ที่ (x, y) — ตำแหน่งอยู่ที่ <g> นอก ส่วน className (animation) อยู่ที่ <g> ใน
 * เพราะ CSS transform ของ animation จะทับ attribute transform ถ้าอยู่ชิ้นเดียวกัน
 */
function Sprite({
  rows,
  x,
  y,
  className,
  style,
}: {
  rows: string[];
  x: number;
  y: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={style}>
        {runs(rows).map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
        ))}
      </g>
    </g>
  );
}

// ── isometric ────────────────────────────────────────────────────────────────

/** ขนาดห้อง: พื้น N × N, ผนังสูง H */
const N = 56;
const H = 44;

/** (x, y, z) ในห้อง → จุดบนจอ */
const P = (x: number, y: number, z: number): [number, number] => [x - y, (x + y) / 2 - z];
const pts = (...ps: [number, number, number][]) => ps.map((p) => P(...p).join(",")).join(" ");

/** กล่องสามมิติ — เห็นด้านบน ด้านหน้าซ้าย (หัน +y) และด้านหน้าขวา (หัน +x) */
function Box({
  x,
  y,
  z,
  w,
  d,
  h,
  top,
  left,
  right,
  className,
  style,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  top: string;
  left: string;
  right: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <g stroke={PAL.K} strokeWidth={0.5} strokeLinejoin="round" className={className} style={style}>
      <polygon points={pts([x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h])} fill={left} />
      <polygon points={pts([x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h])} fill={right} />
      <polygon points={pts([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h])} fill={top} />
    </g>
  );
}

/** แปะของแบนบนผนังขวา (ระนาบ y = 0) — ในกลุ่มนี้ u = x, v = ระยะลงจากเพดาน */
function OnRightWall({ children }: { children: ReactNode }) {
  return <g transform={`matrix(1 0.5 0 1 0 ${-H})`}>{children}</g>;
}

/** แปะของแบนบนผนังซ้าย (ระนาบ x = 0) — u = N − y (อ่านจากซ้ายไปขวา), v = ระยะลงจากเพดาน */
function OnLeftWall({ children }: { children: ReactNode }) {
  return <g transform={`matrix(1 -0.5 0 1 ${-N} ${N / 2 - H})`}>{children}</g>;
}

/** วางของแบนราบที่ความสูง z (พื้นหรือหน้าโต๊ะ) — u = x, v = y */
function OnFloor({ z, children }: { z: number; children: ReactNode }) {
  return <g transform={`matrix(1 0.5 -1 0.5 0 ${-z})`}>{children}</g>;
}

/** มุมบนซ้ายของสไปรต์ตั้งตรงที่ยืนบนจุด (x, y, z) — กึ่งกลางล่างของสไปรต์อยู่ที่จุดนั้น */
function standAt(x: number, y: number, z: number, rows: string[]): { x: number; y: number } {
  const [sx, sy] = P(x, y, z);
  return { x: Math.round(sx - rows[0].length / 2), y: Math.round(sy - rows.length) };
}

// ── เวลาจริง (เวลาไทย) → ฟ้านอกหน้าต่าง ────────────────────────────────────────

type DayPart = "morning" | "day" | "evening" | "night";

/** ชั่วโมงแบบมีเศษนาที เช่น 14.5 = บ่ายสองครึ่ง — ปัดเป็นนาทีเพื่อให้ค่าคงที่ในนาทีเดียวกัน */
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

const SKY: Record<DayPart, { top: string; mid: string; low: string; hill: string; light: string | null }> = {
  morning: { top: "#9fd3f0", mid: "#ffd9c0", low: "#ffe9b8", hill: "#9ccb85", light: "#ffd9b0" },
  day: { top: "#6fc0ec", mid: "#a9dcef", low: "#d6f0f7", hill: "#8cc36f", light: null },
  evening: { top: "#c47aa0", mid: "#f39a6b", low: "#ffd08a", hill: "#7fa86a", light: "#ff9e57" },
  night: { top: "#16224a", mid: "#24346a", low: "#34467e", hill: "#2f4a3c", light: "#1d2b53" },
};

/** หน้าต่างบนผนังขวา (พิกัดในระนาบผนัง) */
const WIN = { u: 18, v: 6, w: 26, h: 16 };

function WindowView({ hour }: { hour: number }) {
  const part = dayPart(hour);
  const sky = SKY[part];
  const iw = WIN.w - 2;
  const ih = WIN.h - 2;
  // ดวงอาทิตย์โค้งจากซ้าย (05:00) ไปขวา (19:00) · พระจันทร์โค้งจากซ้าย (19:00) ไปขวา (05:00)
  const t = part === "night" ? (((hour - 19 + 24) % 24) / 10) : (hour - 5) / 14;
  const bx = Math.round(1 + t * (iw - 7));
  const by = Math.round(ih - 9 - Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)) * 6);

  return (
    <g>
      <rect x={WIN.u - 1} y={WIN.v - 1} width={WIN.w + 2} height={WIN.h + 2} fill={PAL.D} />
      <svg x={WIN.u + 1} y={WIN.v + 1} width={iw} height={ih} viewBox={`0 0 ${iw} ${ih}`} overflow="hidden">
        <rect width={iw} height={ih} fill={sky.top} />
        <rect y={Math.round(ih * 0.4)} width={iw} height={ih} fill={sky.mid} />
        <rect y={Math.round(ih * 0.7)} width={iw} height={ih} fill={sky.low} />
        {part === "night"
          ? [
              [3, 2],
              [9, 4],
              [15, 1],
              [20, 5],
              [6, 7],
            ].map(([x, y], i) => (
              <g key={i} className="pix-f2" style={{ animationDelay: `${-i * 0.37}s`, animationDuration: "1.8s" }}>
                <rect x={x} y={y} width={1} height={1} fill="#fff7d6" />
              </g>
            ))
          : null}
        <Sprite
          rows={part === "night" ? MOON : SUN}
          x={bx}
          y={by}
          className={part === "night" ? undefined : "pix-f2"}
          style={part === "night" ? undefined : { animationDuration: "3s" }}
        />
        {part === "night" ? null : <Sprite rows={CLOUD} x={-8} y={3} className="pix-cloud" />}
        <rect y={ih - 3} width={iw} height={3} fill={sky.hill} />
        <rect x={4} y={ih - 4} width={9} height={1} fill={sky.hill} />
        <rect x={15} y={ih - 4} width={6} height={1} fill={sky.hill} />
      </svg>
      {/* กรอบกากบาท */}
      <rect x={WIN.u + WIN.w / 2} y={WIN.v} width={1} height={WIN.h} fill={PAL.D} />
      <rect x={WIN.u} y={WIN.v + WIN.h / 2} width={WIN.w} height={1} fill={PAL.D} />
      {/* ผ้าม่าน + ราง */}
      <rect x={WIN.u - 4} y={WIN.v - 2} width={3} height={WIN.h + 4} fill="#f2b8a8" />
      <rect x={WIN.u + WIN.w + 1} y={WIN.v - 2} width={3} height={WIN.h + 4} fill="#f2b8a8" />
      <rect x={WIN.u - 5} y={WIN.v - 3} width={WIN.w + 10} height={1} fill={PAL.D} />
    </g>
  );
}

// ── ฉาก ──────────────────────────────────────────────────────────────────────

/** โต๊ะทำงานชิดผนังขวา ใต้หน้าต่าง */
const DESK = { x: 16, y: 2, w: 30, d: 13, top: 18 };
/** โต๊ะเอกสารชิดผนังซ้าย — มีแฟ้มเคสที่รอคิว */
const FILES = { x: 2, y: 30, w: 11, d: 14, top: 14 };
/** ที่ยืนตอนทำงาน (ปลายซ้ายของโต๊ะทำงาน) และตอนหยิบแฟ้ม (หน้าโต๊ะเอกสาร) */
const AT_DESK: [number, number] = [12, 14];
const AT_FILES: [number, number] = [17, 37];

/** ระยะเดินบนจอ จากที่โต๊ะทำงานไปที่โต๊ะเอกสาร */
const WALK = (() => {
  const [ax, ay] = P(AT_DESK[0], AT_DESK[1], 0);
  const [bx, by] = P(AT_FILES[0], AT_FILES[1], 0);
  return { dx: Math.round(bx - ax), dy: Math.round(by - ay) };
})();

/** แฟ้มซ้อนบนโต๊ะเอกสาร — ชิ้นที่ index สูงอยู่บน */
function FolderStack({ count, taking }: { count: number; taking: boolean }) {
  const shown = Math.min(count, 8);
  const total = shown + (taking ? 1 : 0);
  return (
    <>
      {Array.from({ length: total }, (_, i) => (
        <Box
          key={i}
          x={FILES.x + 1.5 + (i % 2) * 0.5}
          y={FILES.y + 2}
          z={FILES.top + 1 + i * 1.6}
          w={8}
          d={10}
          h={1.4}
          top={PAL.m}
          left={PAL.n}
          right="#c99f4c"
          // แฟ้มบนสุดที่เพิ่งถูกหยิบ — หายไปตอนน้องเดินไปถึง
          className={taking && i === total - 1 ? "pix-take" : undefined}
        />
      ))}
    </>
  );
}

/** ท่านั่งพักบนเก้าอี้นุ่ม ยกแก้วขึ้นจิบเป็นระยะ */
function Lounging() {
  const seat = { x: 20, y: 24, w: 11, d: 10, h: 6 };
  const cx = seat.x + seat.w / 2;
  const cy = seat.y + seat.d / 2;
  const girl = standAt(cx, cy, seat.h, GIRL_SIT);
  const mug = { x: girl.x + 8, y: girl.y + 20 };
  return (
    <>
      <ellipse cx={P(cx, cy, 0)[0]} cy={P(cx, cy, 0)[1]} rx={10} ry={4} fill="#3b2b2b" opacity={0.15} />
      {/* พนักพิง + เบาะ */}
      <Box x={seat.x} y={seat.y - 3} z={0} w={seat.w} d={3} h={16} top="#f7c6b5" left="#e9a893" right="#d9917c" />
      <Box x={seat.x} y={seat.y} z={0} w={seat.w} d={seat.d} h={seat.h} top="#f7c6b5" left="#e9a893" right="#d9917c" />
      <g className="pix-bob" style={{ animationDuration: "3.2s" }}>
        <Sprite rows={GIRL_SIT} x={girl.x} y={girl.y} />
        <Sprite rows={EYES_CLOSED} x={girl.x + 6} y={girl.y + 11} className="pix-blink" />
        {/* ยกแก้วขึ้นจิบ — ตาปิดสบายใจตอนจิบ */}
        <g className="pix-sip">
          <Sprite rows={MUG_HANDS} x={mug.x} y={mug.y} />
          <g className="pix-f2">
            <rect x={mug.x + 3} y={mug.y - 3} width={1} height={2} fill="#c9b8a0" />
            <rect x={mug.x + 5} y={mug.y - 4} width={1} height={2} fill="#c9b8a0" />
          </g>
          <g className="pix-f2" style={{ animationDelay: "-0.5s" }}>
            <rect x={mug.x + 4} y={mug.y - 4} width={1} height={2} fill="#c9b8a0" />
            <rect x={mug.x + 6} y={mug.y - 3} width={1} height={2} fill="#c9b8a0" />
          </g>
        </g>
        <Sprite rows={EYES_CLOSED} x={girl.x + 6} y={girl.y + 11} className="pix-sip-eyes" />
      </g>
    </>
  );
}

export default function AuditMascot({
  step = "lookup",
  cheer = 0,
  job,
  pending = 0,
  hour,
  idle = false,
  className = "",
}: {
  step?: AuditStep;
  cheer?: number;
  /** เคสที่กำลังทำ (เช่น VN) — เปลี่ยนเมื่อไรน้องจะเดินไปหยิบแฟ้มใหม่ */
  job?: string;
  /** จำนวนเคสที่รอคิว — เป็นจำนวนแฟ้มบนโต๊ะเอกสาร */
  pending?: number;
  /** บังคับชั่วโมง (0–24) แทนเวลาจริง — ไว้ทดสอบ */
  hour?: number;
  /** ไม่มีงาน — นั่งพักจิบกาแฟ (ไม่สนใจ step/job) */
  idle?: boolean;
  className?: string;
}) {
  const realHour = useBangkokHour();
  const h = hour ?? realHour;
  const part = dayPart(h);
  const girl = standAt(AT_DESK[0], AT_DESK[1], 0, GIRL);
  const hand = { x: girl.x + 21, y: girl.y + 20 };
  const deskZ = DESK.top + 2;
  const fetching = !idle && !!job;
  // หลังหยิบแฟ้มเสร็จค่อยโผล่ของบนโต๊ะ/ของในมือ — ระหว่างเดินมือว่าง
  const afterFetch = fetching ? "pix-after-fetch" : undefined;

  return (
    <svg
      viewBox="-58 -48 116 106"
      className={className}
      role="img"
      aria-label="น้องผู้ตรวจกำลังตรวจเอกสาร"
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated", background: part === "night" ? "#1f2a44" : "#eaf4f1" }}
    >
      {/* ── ห้อง: ผนังสองด้าน + บัวผนัง + พื้นไม้ ── */}
      <polygon points={pts([0, 0, 0], [0, N, 0], [0, N, H], [0, 0, H])} fill="#eadfc9" />
      <polygon points={pts([0, 0, 0], [N, 0, 0], [N, 0, H], [0, 0, H])} fill="#f7eedd" />
      <polygon points={pts([0, 0, 0], [0, N, 0], [0, N, 12], [0, 0, 12])} fill="#c4e2d3" />
      <polygon points={pts([0, 0, 0], [N, 0, 0], [N, 0, 12], [0, 0, 12])} fill="#d5eee2" />
      <polygon points={pts([0, 0, 12], [0, N, 12], [0, N, 13], [0, 0, 13])} fill="#a77a4f" />
      <polygon points={pts([0, 0, 12], [N, 0, 12], [N, 0, 13], [0, 0, 13])} fill="#b98b5e" />
      <polygon points={pts([0, 0, H], [N, 0, H], [N, -2, H], [-2, -2, H], [-2, N, H], [0, N, H])} fill="#d8c4a6" />
      <polygon points={pts([0, 0, 0], [N, 0, 0], [N, N, 0], [0, N, 0])} fill="#d6a978" />
      {[8, 16, 24, 32, 40, 48].map((y) => (
        <polyline key={y} points={pts([0, y, 0], [N, y, 0])} stroke="#c4935f" strokeWidth={0.6} fill="none" />
      ))}

      {/* ── หน้าต่างเหนือโต๊ะทำงาน (ฟ้าตามเวลาจริง) ── */}
      <OnRightWall>
        <WindowView hour={h} />
      </OnRightWall>

      {/* ── ผนังซ้าย: นาฬิกา (เข็มกระโดด) + โปสเตอร์เกณฑ์ เหนือโต๊ะเอกสาร ── */}
      <OnLeftWall>
        <Sprite rows={CLOCK} x={N - 52} y={8} />
        {[
          { x: N - 49, y: 10, w: 1, h: 2 },
          { x: N - 48, y: 12, w: 2, h: 1 },
          { x: N - 49, y: 13, w: 1, h: 2 },
          { x: N - 51, y: 12, w: 2, h: 1 },
        ].map((p, i) => (
          <g key={i} className="pix-f4" style={{ animationDelay: `${-i * 0.6}s`, animationDuration: "2.4s" }}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={PAL.c} />
          </g>
        ))}
        <Sprite rows={POSTER} x={N - 40} y={10} />
      </OnLeftWall>

      {/* ── พรม ── */}
      <OnFloor z={0}>
        <rect x={14} y={20} width={30} height={26} fill="#8fdcc0" />
        <rect x={16} y={22} width={26} height={22} fill="#bfe8d6" />
        <rect x={18} y={24} width={22} height={18} fill="#8fdcc0" opacity={0.5} />
      </OnFloor>

      {/* ── โต๊ะเอกสาร + แฟ้มเคสที่รอคิว ── */}
      <Box x={FILES.x} y={FILES.y + FILES.d - 2} z={0} w={2} d={2} h={FILES.top} top="#8a5a3a" left="#8a5a3a" right="#6e4a33" />
      <Box x={FILES.x + FILES.w - 2} y={FILES.y + FILES.d - 2} z={0} w={2} d={2} h={FILES.top} top="#8a5a3a" left="#8a5a3a" right="#6e4a33" />
      <Box x={FILES.x} y={FILES.y} z={FILES.top} w={FILES.w} d={FILES.d} h={1.5} top="#c99a6b" left="#a77a4f" right="#8a5a3a" />
      <FolderStack key={job ?? "idle"} count={pending} taking={fetching} />

      {/* ── กระถางต้นไม้มุมขวา ── */}
      <Box x={48} y={3} z={0} w={6} d={6} h={7} top="#7a4a2e" left="#d98c64" right="#e8a27c" />
      <g className="pix-sway">
        <Sprite rows={LEAVES} {...standAt(51, 6, 7, LEAVES)} />
      </g>

      {/* ── โต๊ะทำงาน: ตู้ลิ้นชักด้านขวา + ขาโต๊ะ + แผ่นโต๊ะ ── */}
      <Box x={DESK.x + DESK.w - 10} y={DESK.y} z={0} w={10} d={DESK.d} h={DESK.top} top="#b98b5e" left="#a77a4f" right="#8a5a3a" />
      {[6, 12].map((z) => (
        <polyline
          key={z}
          points={pts([DESK.x + DESK.w - 9, DESK.y + DESK.d, z], [DESK.x + DESK.w - 1, DESK.y + DESK.d, z])}
          stroke="#6e4a33"
          strokeWidth={0.6}
          fill="none"
        />
      ))}
      <Box x={DESK.x} y={DESK.y + DESK.d - 2} z={0} w={2} d={2} h={DESK.top} top="#8a5a3a" left="#8a5a3a" right="#6e4a33" />
      <Box x={DESK.x} y={DESK.y} z={DESK.top} w={DESK.w} d={DESK.d} h={2} top="#c99a6b" left="#a77a4f" right="#8a5a3a" />

      {/* โคมไฟตั้งโต๊ะ — สว่างตอนกลางคืน */}
      <Box x={DESK.x + 25} y={DESK.y + 2} z={deskZ} w={3} d={3} h={1} top="#5b4a3c" left="#3b2b2b" right="#3b2b2b" />
      <Box x={DESK.x + 26} y={DESK.y + 3} z={deskZ + 1} w={1} d={1} h={7} top="#5b4a3c" left="#3b2b2b" right="#3b2b2b" />
      <Box
        x={DESK.x + 23}
        y={DESK.y + 2}
        z={deskZ + 7}
        w={4}
        d={4}
        h={3}
        top="#5fbf9f"
        left="#8fdcc0"
        right="#5fbf9f"
      />

      {/* งานบนโต๊ะทำงาน — โผล่หลังน้องหยิบแฟ้มมาวาง */}
      <g className={afterFetch} display={idle ? "none" : undefined}>
        {step === "document" ? (
          <>
            <OnFloor z={deskZ}>
              <Sprite rows={paper(3)} x={DESK.x + 9} y={DESK.y + 1} className="pix-pop" />
            </OnFloor>
            <OnFloor z={deskZ}>
              <Sprite rows={paper(2)} x={DESK.x + 6} y={DESK.y + 2} className="pix-pop" style={{ animationDelay: "0.4s" }} />
            </OnFloor>
          </>
        ) : null}
        <OnFloor z={deskZ}>
          <Sprite rows={paper(4)} x={DESK.x + 3} y={DESK.y + 3} />
          {step === "review"
            ? [3, 5, 7].map((ly, i) => (
                <g key={ly} className="pix-fill" style={{ animationDelay: `${i * 0.5}s` }}>
                  <rect x={DESK.x + 5} y={DESK.y + 3 + ly} width={[9, 12, 8][i]} height={1} fill={PAL.g} />
                </g>
              ))
            : null}
          {step === "form" ? (
            <g className="pix-fill">
              <rect x={DESK.x + 5} y={DESK.y + 10} width={8} height={1} fill={PAL.K} />
            </g>
          ) : null}
        </OnFloor>
      </g>

      {/* แก้วกาแฟ + ไอร้อนสองเฟรม — ตอนพักน้องถือไปจิบ */}
      {idle ? null : (
        <>
      <Box x={DESK.x + 20} y={DESK.y + 8} z={deskZ} w={3} d={3} h={4} top="#7a4a2e" left="#fffdf6" right="#e9e2d2" />
      {(() => {
        const [sx, sy] = P(DESK.x + 21.5, DESK.y + 9.5, deskZ + 4);
        return (
          <>
            <g className="pix-f2">
              <rect x={sx - 1} y={sy - 4} width={1} height={2} fill="#c9b8a0" />
              <rect x={sx + 1} y={sy - 5} width={1} height={2} fill="#c9b8a0" />
            </g>
            <g className="pix-f2" style={{ animationDelay: "-0.5s" }}>
              <rect x={sx} y={sy - 5} width={1} height={2} fill="#c9b8a0" />
              <rect x={sx + 2} y={sy - 4} width={1} height={2} fill="#c9b8a0" />
            </g>
          </>
        );
      })()}
        </>
      )}

      {/* ── แสงในห้องตามช่วงเวลา (กลางคืนมืดลง) ── */}
      {SKY[part].light ? (
        <polygon
          points={pts([0, 0, H], [N, 0, H], [N, 0, 0], [N, N, 0], [0, N, 0], [0, N, H])}
          fill={SKY[part].light!}
          opacity={part === "night" ? 0.32 : 0.08}
          pointerEvents="none"
        />
      ) : null}
      {part === "night" ? (
        <g className="pix-f2" style={{ animationDuration: "3s" }}>
          <ellipse
            cx={P(DESK.x + 25, DESK.y + 4, deskZ)[0]}
            cy={P(DESK.x + 25, DESK.y + 4, deskZ)[1]}
            rx={18}
            ry={10}
            fill="#ffe9a8"
            opacity={0.28}
          />
        </g>
      ) : null}

      {/* ── ตัวละคร: พัก — นั่งเก้าอี้นุ่มกลางห้อง จิบกาแฟ ── */}
      {idle ? <Lounging /> : null}

      {/* ── ตัวละคร: ทำงาน ── */}
      {idle ? null : (
        <>
      {/* ชั้นนอกสุด: เดินไปหยิบแฟ้ม (เล่นครั้งเดียวทุกครั้งที่ job เปลี่ยน) */}
      <g
        key={job ?? "idle"}
        className={fetching ? "pix-fetch" : undefined}
        style={{ "--dx": `${WALK.dx}px`, "--dy": `${WALK.dy}px` } as CSSProperties}
      >
        {/* เงาใต้เท้า */}
        <ellipse cx={P(AT_DESK[0], AT_DESK[1], 0)[0]} cy={P(AT_DESK[0], AT_DESK[1], 0)[1]} rx={6} ry={2.5} fill="#3b2b2b" opacity={0.18} />
        <g key={cheer} className={cheer > 0 ? "pix-hop" : ""}>
          <g className={fetching ? "pix-walk" : undefined}>
            <g className="pix-bob">
              <Sprite rows={GIRL} x={girl.x} y={girl.y} />
              <Sprite rows={EYES_CLOSED} x={girl.x + 6} y={girl.y + 11} className="pix-blink" />
              <Sprite rows={ARM_REACH} x={girl.x + 16} y={girl.y + 20} />

              {/* แฟ้มที่ถือกลับมา — โผล่ตอนหยิบได้ หายตอนวางบนโต๊ะ */}
              {fetching ? <Sprite rows={FOLDER} x={hand.x - 1} y={hand.y - 4} className="pix-carry" /> : null}

              {/* ของในมือตามขั้นที่ทำ */}
              <g className={afterFetch}>
                {step === "lookup" ? (
                  <>
                    <g className="pix-f2" style={{ animationDuration: "0.8s" }}>
                      <rect x={hand.x - 2} y={hand.y - 10} width={11} height={11} fill="#ffe9a8" opacity={0.6} />
                    </g>
                    <Sprite rows={LANTERN} x={hand.x} y={hand.y - 8} className="pix-swing" />
                    <g className="pix-f2" style={{ animationDuration: "0.4s" }}>
                      <rect x={hand.x + 3} y={hand.y - 4} width={1} height={1} fill={PAL.Y} />
                    </g>
                  </>
                ) : null}
                {step === "form" ? <Sprite rows={QUILL} x={hand.x} y={hand.y - 8} className="pix-scribble" /> : null}
                {step === "review" ? <Sprite rows={MAGNIFIER} x={hand.x} y={hand.y - 10} className="pix-scan" /> : null}
                {step === "document" ? <Sprite rows={HELD_PAPER} x={hand.x} y={hand.y - 3} /> : null}
              </g>
            </g>
          </g>
        </g>
      </g>

        </>
      )}

      {/* ประกายตอน AI ตรวจ */}
      {!idle && step === "review" ? (
        <g className={afterFetch}>
          {[
            { x: 6, y: -24, d: "0s" },
            { x: -6, y: -16, d: "0.4s" },
            { x: 18, y: -12, d: "0.8s" },
          ].map((s) => (
            <Sprite
              key={s.x}
              rows={SPARKLE}
              x={s.x}
              y={s.y}
              className="pix-f2"
              style={{ animationDelay: s.d, animationDuration: "1.2s" }}
            />
          ))}
        </g>
      ) : null}
    </svg>
  );
}
