"use client";

// แถบเตือนใต้หัวเว็บเมื่อโควตา AI หมด — นับถอยหลังถึงเวลารีเซ็ตแบบสด
// ถามสถานะเมื่อเปิดหน้า, ทุก 2 นาที, และทันทีที่มีการกดตรวจแล้วโดนโควตา (event จาก ReviewDialogs)
// ถึงเวลารีเซ็ตแล้วถามซ้ำเอง แถบหายไปเองโดยไม่ต้องรีเฟรช

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/app/components/Icon";
import { AI_QUOTA_EVENT, splitDuration, thaiDateTime, useCountdown } from "@/app/components/ReviewDialogs";

type Status = { quota: { blocked: false } | { blocked: true; scope: "minute" | "day"; resetAt: string } };

export default function AiQuotaBanner() {
  const [block, setBlock] = useState<{ scope: "minute" | "day"; resetAt: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as Status;
      setBlock(json.quota.blocked ? { scope: json.quota.scope, resetAt: json.quota.resetAt } : null);
    } catch {
      // เน็ตหลุดชั่วคราว — ไม่ต้องเตือนอะไร รอบหน้าค่อยถามใหม่
    }
  }, []);

  useEffect(() => {
    // ถามครั้งแรกหลัง mount (ผ่าน timer เพื่อไม่ setState ตรงๆ ใน effect)
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 120_000);
    window.addEventListener(AI_QUOTA_EVENT, refresh);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener(AI_QUOTA_EVENT, refresh);
    };
  }, [refresh]);

  const left = useCountdown(block?.resetAt ?? null);

  useEffect(() => {
    if (block && left === 0) {
      const t = setTimeout(refresh, 1500);
      return () => clearTimeout(t);
    }
  }, [block, left, refresh]);

  const t = splitDuration(left);
  const parts = [t.d ? `${t.d} วัน` : "", t.h || t.d ? `${t.h} ชม.` : "", `${t.m} นาที`, `${t.s} วินาที`].filter(Boolean);

  return (
    <AnimatePresence>
      {block && left > 0 ? (
        <motion.div
          role="status"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-b border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm text-amber-900 sm:px-6">
            <span className="grid size-7 place-items-center rounded-full bg-amber-100 text-amber-700">
              <Icon name="clock" size={16} />
            </span>
            <strong className="font-semibold">
              {block.scope === "minute" ? "AI ถูกเรียกถี่เกินโควตาต่อนาที" : "โควตา AI วันนี้หมดแล้ว"}
            </strong>
            <span>
              รีเซ็ตในอีก <strong className="tabular">{parts.join(" ")}</strong>
              <span className="text-amber-800/80"> · ประมาณ {thaiDateTime(block.resetAt)} น.</span>
            </span>
            <span className="text-amber-800/80 sm:ml-auto">ยังกรอกและบันทึกร่างได้ตามปกติ</span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
