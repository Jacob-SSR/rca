"use client";

// สลับธีม อวกาศ (มืด) ↔ รุ่งอรุณ (สว่าง)
// จำไว้ใน cookie → server ใส่ data-theme ให้ตั้งแต่ HTML แรก หน้าไม่กระพริบ

import { useState } from "react";
import Icon from "@/app/components/Icon";

export default function ThemeToggle({ initial }: { initial: "dark" | "light" }) {
  const [theme, setTheme] = useState(initial);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `rca-theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-sm btn-ghost size-10 rounded-full p-0"
      title={dark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมอวกาศ"}
      aria-label={dark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมอวกาศ"}
    >
      <span key={theme} className="animate-rise inline-flex">
        <Icon name={dark ? "sun" : "moon"} size={20} />
      </span>
    </button>
  );
}
