"use client";

// แก้ timeline ของเคสได้ในหน้าจอ
// บันทึกทั้งชุดผ่าน PUT /api/cases/[id]/timeline — event ที่แก้แล้วกลายเป็น source="manual"

import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = { eventTime: string; title: string; source: string };

type Props = {
  caseId: string;
  initialEvents: { eventTime: string | null; title: string; source: string }[];
};

/** Date → "YYYY-MM-DDTHH:mm" สำหรับ <input type="datetime-local"> (เวลาไทย) */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function TimelineEditor({ caseId, initialEvents }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(
    initialEvents.map((e) => ({
      eventTime: toLocalInput(e.eventTime),
      title: e.title,
      source: e.source,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: rows
            .filter((r) => r.title.trim().length > 0)
            .map((r) => ({ eventTime: r.eventTime || null, title: r.title.trim() })),
        }),
      });
      const json = await res.json();
      setMessage(res.ok ? `บันทึกแล้ว ${json.saved} เหตุการณ์` : (json?.error ?? "บันทึกไม่สำเร็จ"));
      if (res.ok) router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <h2 className="card-title">ลำดับเหตุการณ์ (แก้ไขได้)</h2>

      <div className="px-5 py-5 sm:px-6">
        {rows.length === 0 ? (
          <p className="text-zinc-500">ยังไม่มีเหตุการณ์</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3">
                <input
                  type="datetime-local"
                  value={row.eventTime}
                  onChange={(e) => update(i, { eventTime: e.target.value })}
                  className="input tabular w-auto"
                />
                <input
                  type="text"
                  value={row.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  className="input min-w-0 flex-1"
                />
                <span className="badge">{row.source}</span>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  className="btn btn-sm btn-danger"
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { eventTime: "", title: "", source: "manual" }])}
            className="btn"
          >
            + เพิ่มเหตุการณ์
          </button>
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary">
            {busy ? "กำลังบันทึก…" : "บันทึก timeline"}
          </button>
          {message ? <span className="text-zinc-600">{message}</span> : null}
        </div>

        <p className="mt-3 text-sm text-zinc-500">
          การบันทึกจะแทนที่รายการทั้งหมดของเคสนี้ และทำให้ทุกรายการเป็น source = manual
          (รอบตรวจถัดไปจะไม่ลบทิ้ง)
        </p>
      </div>
    </section>
  );
}
