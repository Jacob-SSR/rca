"use client";

// วิดเจ็ตมุมขวาล่างทุกหน้า — ฉากออฟฟิศพิกเซลของน้องผู้ตรวจ บอกว่าตอนนี้มีรอบตรวจอัตโนมัติทำงานอยู่ไหม
//   มีรอบกำลังรัน → ฟองความคิดบอกขั้นที่ทำ แฟ้มลอยมาทุกเคสใหม่ + ตัวนับ/แถบคืบหน้า
//   ไม่มี          → ฟองความคิดเป็นแก้วกาแฟ (พักอยู่)
// กดแล้วไปหน้าตรวจอัตโนมัติ · ย่อเหลือปุ่มกลมได้ · กดค้างแล้วลากย้ายตำแหน่งได้ (ทั้งสองอย่างจำไว้ในเครื่องนี้)
// ไม่แสดงในหน้าตรวจอัตโนมัติเอง เพราะหน้านั้นมีการ์ดความคืบหน้าตัวใหญ่อยู่แล้ว
//
// poll GET /api/auto-audit/live — ทุก 3 วินาทีระหว่างมีรอบรัน, ทุก 30 วินาทีตอนว่าง

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import OfficeScene from "@/app/components/OfficeScene";
import Icon from "@/app/components/Icon";
import type { LiveProgress } from "@/lib/auto-audit/progress";

type Status = {
  running: {
    id: string;
    targetDate: string;
    reviewed: number;
    failed: number;
    target: number | null;
    live: LiveProgress | null;
  } | null;
};

const MIN_KEY = "mra.autoAuditWidget.min";
const POS_KEY = "mra.autoAuditWidget.pos";
/** ระยะห่างจากขอบจอขวา/ล่าง (px) — ยึดมุมขวาล่าง ตำแหน่งจึงไม่เพี้ยนเมื่อขยายหน้าต่าง */
type Pos = { right: number; bottom: number };
const DEFAULT_POS: Pos = { right: 12, bottom: 12 };
const EDGE = 8;
/** ขยับเกินนี้ (px) ถือว่าลาก ไม่ใช่กด — กันลากแล้วเผลอเปิดหน้าตรวจอัตโนมัติ */
const DRAG_THRESHOLD = 5;
const HIDDEN_ON = ["/settings/auto-audit", "/animation", "/login", "/no-access"];

function readMinimized(): boolean {
  try {
    return localStorage.getItem(MIN_KEY) === "1";
  } catch {
    return false;
  }
}

function readPos(): Pos {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? "null") as Pos | null;
    if (p && Number.isFinite(p.right) && Number.isFinite(p.bottom)) return p;
  } catch {
    // อ่านไม่ได้ก็ใช้มุมขวาล่าง
  }
  return DEFAULT_POS;
}

/** บีบตำแหน่งให้กล่องขนาด w×h อยู่ในจอเสมอ */
function clampPos(p: Pos, w: number, h: number): Pos {
  const maxRight = Math.max(EDGE, window.innerWidth - w - EDGE);
  const maxBottom = Math.max(EDGE, window.innerHeight - h - EDGE);
  return {
    right: Math.min(Math.max(p.right, EDGE), maxRight),
    bottom: Math.min(Math.max(p.bottom, EDGE), maxBottom),
  };
}

/**
 * ลากย้ายด้วยเมาส์/นิ้ว (pointer events) — คืน style ตำแหน่ง, handler ที่ต้องผูกกับกล่อง
 * และ onClickCapture ที่กลืนคลิกหลังลาก (ลากจบบนลิงก์จะได้ไม่เปิดหน้าอื่น)
 */
function useDraggable() {
  const [pos, setPos] = useState<Pos>(readPos);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; pos: Pos; w: number; h: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);

  // ย่อ/หมุนจอแล้วกล่องอาจหลุดขอบ — ดึงกลับเข้าจอ
  const boxRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    function onResize() {
      const el = boxRef.current;
      if (el) setPos((p) => clampPos(p, el.offsetWidth, el.offsetHeight));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ฟังการขยับ/ปล่อยที่ระดับหน้าต่าง — ลากเร็วจนเมาส์หลุดนอกกล่องก็ยังตามได้
  // (ไม่ใช้ setPointerCapture เพราะจะทำให้คลิกธรรมดาไปตกที่กล่องแทนลิงก์)
  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    // ปุ่มในกล่อง (เช่นปุ่มย่อ) กดได้ตามปกติ ไม่เริ่มลาก
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    const el = e.currentTarget;
    boxRef.current = el;
    const s = { x: e.clientX, y: e.clientY, pos, w: el.offsetWidth, h: el.offsetHeight, moved: false };
    start.current = s;

    function move(ev: PointerEvent) {
      const dx = ev.clientX - s.x;
      const dy = ev.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!s.moved) {
        s.moved = true;
        setDragging(true);
      }
      ev.preventDefault();
      setPos(clampPos({ right: s.pos.right - dx, bottom: s.pos.bottom - dy }, s.w, s.h));
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      start.current = null;
      if (!s.moved) return;
      setDragging(false);
      justDragged.current = true;
      // คลิกที่ตามหลังการลากจะถูกกลืนใน onClickCapture — ถ้าไม่มีคลิกตามมา (ปล่อยนอกกล่อง) ล้างธงทิ้ง
      setTimeout(() => (justDragged.current = false), 0);
      setPos((p) => {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify(p));
        } catch {
          // เก็บไม่ได้ก็แค่ไม่จำ
        }
        return p;
      });
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function onClickCapture(e: ReactMouseEvent) {
    if (!justDragged.current) return;
    justDragged.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  return {
    dragging,
    style: { right: pos.right, bottom: pos.bottom },
    handlers: {
      onPointerDown,
      onClickCapture,
      onDragStart: (e: ReactDragEvent) => e.preventDefault(),
    },
  };
}

export default function AutoAuditWidget() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  // ค่าเริ่มต้นอ่านจากเครื่อง — ระหว่างยังไม่ได้ status วิดเจ็ตไม่ render อะไร จึงไม่ชนตอน hydrate
  const [minimized, setMinimized] = useState(readMinimized);
  const drag = useDraggable();

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      let next: Status | null = null;
      try {
        const res = await fetch("/api/auto-audit/live", { cache: "no-store" });
        if (res.ok) next = (await res.json()) as Status;
      } catch {
        // เน็ตสะดุด — ลองใหม่รอบหน้า
      }
      if (stop) return;
      if (next) setStatus(next);
      timer = setTimeout(tick, next?.running ? 3000 : 30000);
    }
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  function toggle(min: boolean) {
    setMinimized(min);
    try {
      localStorage.setItem(MIN_KEY, min ? "1" : "0");
    } catch {
      // เก็บไม่ได้ก็แค่ไม่จำ
    }
  }

  if (!status || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const run = status.running;
  const live = run?.live ?? null;
  const done = live ? live.done : run ? run.reviewed + run.failed : 0;
  const total = live && live.phase === "auditing" ? live.total : (run?.target ?? null);
  const pct = run && total ? Math.min(100, (done / total) * 100) : null;
  const pending = live ? Math.max(0, live.total - live.done - (live.current ? 1 : 0)) : 0;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => toggle(false)}
        {...drag.handlers}
        style={drag.style}
        className={`fixed z-30 grid size-12 touch-none place-items-center rounded-full bg-white text-brand-700 shadow-lg ring-1 ring-brand-200 select-none ${
          drag.dragging ? "scale-105 cursor-grabbing shadow-2xl" : "cursor-grab transition hover:scale-105"
        }`}
        aria-label={run ? "มีรอบตรวจอัตโนมัติกำลังทำงาน — เปิดวิดเจ็ต" : "เปิดวิดเจ็ตตรวจอัตโนมัติ"}
        title={run ? `กำลังตรวจอัตโนมัติ ${done}/${total ?? "—"}` : "ตรวจอัตโนมัติ: ว่างอยู่"}
      >
        <Icon name={run ? "orbit" : "sparkles"} size={22} className={run ? "animate-spin [animation-duration:4s]" : ""} />
        {run ? <span className="absolute top-0.5 right-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse-ring" /> : null}
      </button>
    );
  }

  return (
    <aside
      {...drag.handlers}
      style={drag.style}
      className={`group fixed z-30 w-[204px] touch-none overflow-hidden rounded-2xl bg-white ring-1 ring-brand-200 select-none sm:w-[288px] ${
        drag.dragging ? "cursor-grabbing shadow-2xl ring-2 ring-brand-400" : "animate-rise cursor-grab shadow-xl"
      }`}
      aria-label="สถานะตรวจอัตโนมัติ — กดค้างแล้วลากเพื่อย้าย"
    >
      {/* แถบจับ — บอกว่าลากย้ายได้ */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1.5 left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-white/80 shadow ring-1 ring-black/10 opacity-70 transition group-hover:opacity-100"
      />
      <Link
        href="/settings/auto-audit"
        draggable={false}
        className={`block ${drag.dragging ? "" : "transition hover:brightness-105"}`}
        title="กดเพื่อไปหน้าตรวจอัตโนมัติ · กดค้างแล้วลากเพื่อย้าย"
      >
        <OfficeScene
          idle={!run}
          step={live?.current?.step ?? "lookup"}
          job={live?.current?.vn}
          pending={pending}
          cheer={done}
          compact
          className="w-full"
        />
        <div className="px-3 py-2">
          {run ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                <span className="size-2 shrink-0 rounded-full bg-emerald-500 animate-pulse-ring" />
                กำลังตรวจ
                <span className="tabular ml-auto text-zinc-600">
                  {done}/{total ?? "—"}
                </span>
              </p>
              <span className="relative mt-1 block h-1.5 overflow-hidden rounded-full bg-zinc-100">
                {pct === null ? (
                  <span
                    className="absolute top-0 h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-glow"
                    style={{ animation: "indeterminate 1.6s ease-in-out infinite" }}
                  />
                ) : (
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-glow transition-[width] duration-700"
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                )}
              </span>
              {live?.current ? (
                <p className="tabular mt-1 truncate text-xs text-zinc-500">VN {live.current.vn}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-zinc-600">
              <span className="font-semibold text-zinc-700">ว่างอยู่</span> — พักจิบกาแฟ ☕
            </p>
          )}
        </div>
      </Link>
      <button
        type="button"
        data-no-drag
        onClick={() => toggle(true)}
        className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-white/85 text-zinc-500 shadow-sm ring-1 ring-zinc-200 transition hover:text-zinc-800"
        aria-label="ย่อวิดเจ็ต"
      >
        <Icon name="x" size={14} />
      </button>
    </aside>
  );
}
