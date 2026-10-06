"use client";

// แสงตามเมาส์บนการ์ด — ตั้งตัวแปร --mx/--my ให้ .card ที่ชี้อยู่
// listener ตัวเดียวทั้งหน้า ไม่ต้องผูกกับทุกการ์ด และไม่ re-render React เลย

import { useEffect } from "react";

export default function Spotlight() {
  useEffect(() => {
    let last: HTMLElement | null = null;
    function onMove(e: PointerEvent) {
      const card = (e.target as Element | null)?.closest?.(".card") as HTMLElement | null;
      if (last && last !== card) {
        last.style.removeProperty("--mx");
        last.style.removeProperty("--my");
      }
      last = card;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return null;
}
