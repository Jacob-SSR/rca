"use client";

// เลือกช่วงวัน + ชื่อผู้ตรวจ แล้วโหลด Form A1
//
// ใช้ <a download> ธรรมดา ไม่ใช่ fetch แล้วสร้าง blob
// เพราะเบราว์เซอร์จัดการ Content-Disposition ให้เองอยู่แล้ว
// (ชื่อไฟล์ภาษาไทยที่ route ส่งมาทาง filename* จึงติดมาด้วย)

import { useState } from "react";

type Props = { defaultFrom: string; defaultTo: string };

export default function FormA1Download({ defaultFrom, defaultTo }: Props) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [reviewer, setReviewer] = useState("");

  const invalidRange = from !== "" && to !== "" && from > to;

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (reviewer.trim()) params.set("reviewer", reviewer.trim());

  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="a1-from">
            ตั้งแต่วันที่
          </label>
          <input
            id="a1-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input tabular"
          />
        </div>

        <div>
          <label className="label" htmlFor="a1-to">
            ถึงวันที่
          </label>
          <input
            id="a1-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input tabular"
          />
        </div>

        <div>
          <label className="label" htmlFor="a1-reviewer">
            ตรวจโดย
          </label>
          <input
            id="a1-reviewer"
            type="text"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            className="input"
            placeholder="ชื่อผู้ตรวจสอบ"
          />
          <span className="hint">เว้นว่างไว้ = เว้นช่องให้เซ็นชื่อในเอกสาร</span>
        </div>
      </div>

      {invalidRange ? (
        <p className="alert alert-error">วันที่เริ่มต้นอยู่หลังวันที่สิ้นสุด</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/api/reports/form-a1?${params.toString()}`}
          className={`btn btn-primary ${invalidRange ? "pointer-events-none opacity-50" : ""}`}
          aria-disabled={invalidRange}
        >
          ดาวน์โหลด Form A1 (.docx)
        </a>
        <span className="text-sm text-zinc-500">
          ไม่เลือกวัน = รวมผลการตรวจทั้งหมดที่มีในระบบ
        </span>
      </div>
    </div>
  );
}
