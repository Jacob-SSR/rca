"use client";

// แถบ "ดึงรหัส ICD จาก HOSxP" — ใช้กับฟอร์ม A2 (HN) และ A4 (AN)
//
// ใส่ HN/AN แล้วระบบไปหยิบรหัสที่บันทึกไว้แล้วมาสร้างเป็นแถว
// หนึ่งรหัสหนึ่งแถว ตามกติกาในคู่มือหน้า 16/26
//
// ช่อง AuditICD กับผลการตรวจถูกเว้นว่างไว้เสมอ — นั่นคืองานของผู้ตรวจสอบ
// ระบบเติมให้แค่ "ของที่มีอยู่แล้ว" ไม่เติมข้อสรุป

import { useState } from "react";
import type { AuditFormDef } from "@/lib/audit-forms/registry";
import type { SheetRow } from "@/lib/audit-forms/compute";

type IcdRow = {
  ref: string;
  hn: string;
  date: string;
  time: string;
  icd: string;
  icdType: string;
  diagnosis: string;
};

type Props = {
  form: AuditFormDef;
  onRows: (rows: SheetRow[]) => void;
};

export default function IcdPullBar({ form, onRows }: Props) {
  const lookup = form.icdLookup;
  const [key, setKey] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!lookup) return null;

  const keyLabel = lookup.kind === "opd" ? "HN" : "AN";

  async function pull() {
    if (!lookup) return;

    setBusy(true);
    setMessage(null);

    try {
      const params = new URLSearchParams({ kind: lookup.kind, key: key.trim() });
      if (lookup.dateColumn && date) params.set("date", date);

      const res = await fetch(`/api/hosxp/icd?${params.toString()}`);
      const json = await res.json().catch(() => ({}));

      if (!json?.available) {
        setMessage({ ok: false, text: json?.reason ?? json?.error ?? "ดึงข้อมูลไม่สำเร็จ" });
        return;
      }

      const found = (json.rows ?? []) as IcdRow[];
      if (found.length === 0) {
        setMessage({
          ok: false,
          text: `ไม่พบรหัส ICD ของ ${keyLabel} ${key}${date ? ` วันที่ ${date}` : ""}`,
        });
        return;
      }

      // ลำดับนับใหม่ต่อ visit/admission — คอลัมน์ "ลำดับ" ในฟอร์มคือลำดับรหัสของรายนั้น
      const seqOf = new Map<string, number>();

      const rows: SheetRow[] = found.map((r) => {
        const n = (seqOf.get(r.ref) ?? 0) + 1;
        seqOf.set(r.ref, n);

        const row: SheetRow = {};
        for (const c of form.columns) if (c.kind !== "computed") row[c.key] = "";

        row[lookup.keyColumn] = lookup.kind === "opd" ? r.hn : r.ref;
        if (lookup.dateColumn) row[lookup.dateColumn] = r.date;
        if (form.columns.some((c) => c.key === "time")) row.time = r.time;
        if (form.columns.some((c) => c.key === "dischargeDate")) row.dischargeDate = r.date;

        row.diagnosis = r.diagnosis;
        row.seq = String(n);
        row.icdType = r.icdType;
        row.icd = r.icd;
        // auditIcd กับ result เว้นว่างไว้ — เป็นงานของผู้ตรวจสอบ ไม่ใช่ของระบบ

        return row;
      });

      onRows(rows);
      setMessage({ ok: true, text: `เพิ่ม ${rows.length} แถวจาก HOSxP แล้ว` });
      setKey("");
    } catch {
      setMessage({ ok: false, text: "ติดต่อเซิร์ฟเวอร์ไม่ได้" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-zinc-200 bg-brand-50/40 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="icd-key">
            ดึงรหัสที่บันทึกไว้แล้วจาก HOSxP — ใส่ {keyLabel}
          </label>
          <input
            id="icd-key"
            className="input tabular w-48"
            value={key}
            disabled={busy}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (key.trim()) pull();
              }
            }}
            placeholder={keyLabel}
          />
        </div>

        {lookup.dateColumn ? (
          <div>
            <label className="label" htmlFor="icd-date">
              วันที่มารับบริการ
            </label>
            <input
              id="icd-date"
              type="date"
              className="input tabular w-48"
              value={date}
              disabled={busy}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        ) : null}

        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || key.trim() === ""}
          onClick={pull}
        >
          {busy ? "กำลังดึง…" : "ดึงรหัสมาเป็นแถว"}
        </button>

        {message ? (
          <span className={`text-base ${message.ok ? "text-good-600" : "text-bad-600"}`}>
            {message.text}
          </span>
        ) : null}
      </div>

      <p className="hint">
        {lookup.dateColumn ? "ไม่ใส่วันที่ = เอา visit ล่าสุดของ HN นั้น · " : ""}
        ระบบเติมให้เฉพาะรหัสที่มีอยู่เดิม ช่อง AuditICD และผลการตรวจยังเป็นงานของผู้ตรวจสอบ
      </p>
    </div>
  );
}
