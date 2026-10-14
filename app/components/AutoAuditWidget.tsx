"use client";

// วิดเจ็ตมุมขวาล่างทุกหน้า — ฉากออฟฟิศพิกเซลของน้องผู้ตรวจ บอกว่าตอนนี้มีรอบตรวจอัตโนมัติทำงานอยู่ไหม
//   มีรอบกำลังรัน → ฟองความคิดบอกขั้นที่ทำ แฟ้มลอยมาทุกเคสใหม่ + ตัวนับ/แถบคืบหน้า
//   ไม่มี          → ฟองความคิดเป็นแก้วกาแฟ (พักอยู่)
// กดแล้วไปหน้าตรวจอัตโนมัติ · ย่อเหลือปุ่มกลมได้ (จำไว้ในเครื่องนี้)
// ไม่แสดงในหน้าตรวจอัตโนมัติเอง เพราะหน้านั้นมีการ์ดความคืบหน้าตัวใหญ่อยู่แล้ว
//
// poll GET /api/auto-audit/live — ทุก 3 วินาทีระหว่างมีรอบรัน, ทุก 30 วินาทีตอนว่าง

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
const HIDDEN_ON = ["/settings/auto-audit", "/login", "/no-access"];

function readMinimized(): boolean {
  try {
    return localStorage.getItem(MIN_KEY) === "1";
  } catch {
    return false;
  }
}

export default function AutoAuditWidget() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  // ค่าเริ่มต้นอ่านจากเครื่อง — ระหว่างยังไม่ได้ status วิดเจ็ตไม่ render อะไร จึงไม่ชนตอน hydrate
  const [minimized, setMinimized] = useState(readMinimized);

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
        className="fixed right-3 bottom-3 z-30 grid size-12 place-items-center rounded-full bg-white text-brand-700 shadow-lg ring-1 ring-brand-200 transition hover:scale-105"
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
      className="fixed right-3 bottom-3 z-30 w-[204px] animate-rise overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-brand-200 sm:w-[288px]"
      aria-label="สถานะตรวจอัตโนมัติ"
    >
      <Link href="/settings/auto-audit" className="block transition hover:brightness-105" title="ไปหน้าตรวจอัตโนมัติ">
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
        onClick={() => toggle(true)}
        className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-white/85 text-zinc-500 shadow-sm ring-1 ring-zinc-200 transition hover:text-zinc-800"
        aria-label="ย่อวิดเจ็ต"
      >
        <Icon name="x" size={14} />
      </button>
    </aside>
  );
}
