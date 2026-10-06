"use client";

// ตัวเลขที่นับขึ้นตอนเปิดหน้า — ค่าสุดท้ายอยู่ใน HTML ตั้งแต่แรก (อ่านได้แม้ JS ยังไม่โหลด)

import { useEffect, useState } from "react";

export default function CountUp({ value, decimals = 0, duration = 1200 }: { value: number; decimals?: number; duration?: number }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{shown.toLocaleString("th-TH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
}
