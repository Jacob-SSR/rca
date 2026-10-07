"use client";

// การ์ดสถานะ AI ในหน้าตั้งค่า
//   - ตั้งค่า API key แล้วหรือยัง / ใช้ model อะไร
//   - "ทดสอบการเชื่อมต่อ" — ตรวจว่า key ใช้ได้จริง (ไม่กินโควตา)
//   - โควตาหมดอยู่ไหม รีเซ็ตเมื่อไร (นับถอยหลัง) + ปุ่มล้างสถานะเอง

import { useCallback, useEffect, useState } from "react";
import Icon from "@/app/components/Icon";
import { AI_QUOTA_EVENT, splitDuration, thaiDateTime, useCountdown } from "@/app/components/ReviewDialogs";

type Status = {
  provider: string;
  model: string;
  configured: boolean;
  quota: { blocked: false } | { blocked: true; scope: "minute" | "day"; resetAt: string; since: string };
};

export default function AiStatusCard({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [probe, setProbe] = useState<{ ok: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState<null | "probe" | "clear">(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/ai/status", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setStatus((await res.json()) as Status);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    window.addEventListener(AI_QUOTA_EVENT, load);
    return () => {
      clearTimeout(first);
      window.removeEventListener(AI_QUOTA_EVENT, load);
    };
  }, [load]);

  async function act(action: "probe" | "clear") {
    setBusy(action);
    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (action === "probe") setProbe({ ok: !!json.ok, error: json.error });
      await load();
      window.dispatchEvent(new CustomEvent(AI_QUOTA_EVENT));
    } finally {
      setBusy(null);
    }
  }

  const blocked = status?.quota.blocked ? status.quota : null;
  const left = useCountdown(blocked?.resetAt ?? null);
  const t = splitDuration(left);

  return (
    <section className="card animate-rise overflow-hidden">
      <h2 className="card-title">
        <span className="icon-orb">
          <Icon name="sparkles" />
        </span>
        สถานะ AI
        {status ? (
          <span
            className={`badge ml-auto ${
              !status.configured ? "bg-red-50 text-red-700 ring-red-200" : blocked ? "bg-warn-50 text-warn-600 ring-amber-200" : "bg-good-50 text-good-600 ring-emerald-200"
            }`}
          >
            <span className={`size-2 rounded-full ${!status.configured ? "bg-red-500" : blocked ? "bg-amber-500" : "bg-emerald-500 animate-pulse"}`} />
            {!status.configured ? "ยังไม่ได้ตั้งค่า" : blocked ? "โควตาหมด" : "พร้อมใช้งาน"}
          </span>
        ) : null}
      </h2>

      {!status ? (
        <div className="space-y-2 px-6 py-5">
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-4 w-1/3" />
        </div>
      ) : (
        <div className="grid gap-5 px-5 py-5 sm:px-6 md:grid-cols-[1fr_auto]">
          <dl className="grid grid-cols-2 gap-4 text-base">
            <div>
              <dt className="text-sm text-zinc-500">ผู้ให้บริการ</dt>
              <dd className="font-medium">{status.provider}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Model</dt>
              <dd className="font-medium break-all">{status.model}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-sm text-zinc-500">โควตา</dt>
              <dd>
                {blocked && left > 0 ? (
                  <span className="text-warn-600">
                    {blocked.scope === "minute" ? "เกินโควตาต่อนาที" : "หมดโควตารายวัน"} — รีเซ็ตในอีก{" "}
                    <strong className="tabular">
                      {t.d ? `${t.d} วัน ` : ""}
                      {t.h} ชม. {t.m} นาที {t.s} วินาที
                    </strong>
                    <span className="block text-sm text-zinc-500">
                      ประมาณ {thaiDateTime(blocked.resetAt)} น. · ตรวจพบเมื่อ {thaiDateTime(blocked.since)} น.
                    </span>
                  </span>
                ) : (
                  <span className="text-zinc-600">ปกติ — ยังไม่พบการใช้เกินโควตา</span>
                )}
              </dd>
            </div>
          </dl>

          {canManage ? (
          <div className="flex flex-col gap-2 md:items-end">
            <button type="button" className="btn btn-sm" disabled={busy !== null || !status.configured} onClick={() => act("probe")}>
              {busy === "probe" ? (
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Icon name="activity" size={16} />
              )}
              ทดสอบการเชื่อมต่อ AI
            </button>
            {blocked ? (
              <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => act("clear")}>
                <Icon name="x" size={16} />
                ล้างสถานะโควตา
              </button>
            ) : null}
          </div>
          ) : null}

          {probe ? (
            <p
              role="status"
              className={`alert animate-rise flex items-start gap-2 text-sm md:col-span-2 ${probe.ok ? "alert-ok" : "alert-error"}`}
            >
              <Icon name={probe.ok ? "check" : "alert"} size={16} className="mt-1" />
              {probe.ok ? "เชื่อมต่อได้ — API key และ model ใช้งานได้" : `เชื่อมต่อไม่ได้: ${probe.error ?? "ไม่ทราบสาเหตุ"}`}
            </p>
          ) : null}

          <p className="text-sm text-zinc-500 md:col-span-2">
            ผู้ให้บริการไม่มีช่องทางให้ถามโควตาที่เหลือล่วงหน้า ระบบจะรู้เมื่อเรียกแล้วถูกปฏิเสธ จากนั้นหยุดเรียกจนถึงเวลารีเซ็ต
            (โควตารายวันของ Gemini รีเซ็ตเที่ยงคืนเวลาแปซิฟิก ≈ 14:00–15:00 น. เวลาไทย) · ใช้ &ldquo;ล้างสถานะโควตา&rdquo; หลังเปลี่ยน key หรืออัปเกรดแพ็กเกจ
          </p>
        </div>
      )}
    </section>
  );
}
