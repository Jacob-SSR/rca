"use client";

// แถบ "กรอก HN แล้วดึงข้อมูลมาให้" ของฟอร์มบันทึกเวชระเบียน
//
// ⚠️ สิ่งที่ดึงมาคือข้อมูลดิบที่ HOSxP มี ไม่ใช่บันทึกที่สมบูรณ์
//    ยังต้องอ่านและแก้ก่อนสร้างเอกสาร เพราะเกณฑ์ สนย. ตัดสินที่รายละเอียด
//    ของข้อความ ไม่ใช่แค่มีข้อความ — จึงเขียนเตือนไว้ใต้ปุ่มตลอด
//
// ⚠️ ค่าที่กรอกไว้แล้วจะไม่ถูกทับ ต้องกดยืนยันก่อน
//    คนกรอกไปครึ่งฟอร์มแล้วเผลอกดดึง ข้อมูลที่พิมพ์เองหายหมดคือความเสียหายจริง

import { useState } from "react";

type Prefill = { values: Record<string, string>; missing: string[]; vn: string };

type Props = {
  /** ค่าที่กรอกอยู่ตอนนี้ — ใช้เช็คว่าจะทับของเดิมไหม */
  current: Record<string, string>;
  disabled: boolean;
  onFill: (values: Record<string, string>) => void;
};

/** ป้ายชื่อช่องไว้บอกผู้ใช้ว่าจะทับอะไรบ้าง */
const LABEL: Record<string, string> = {
  hn: "HN",
  patientName: "ชื่อ-สกุล",
  age: "อายุ",
  gender: "เพศ",
  department: "แผนก",
  pttype: "สิทธิการรักษา",
  serviceDate: "วันที่",
  serviceTime: "เวลา",
  chiefComplaint: "อาการสำคัญ",
  vitalSigns: "สัญญาณชีพ",
  labResult: "ผลชันสูตร/เอกซเรย์",
  diagnosis: "การวินิจฉัย",
  treatment: "การรักษา",
};

export default function HnPrefillBar({ current, disabled, onFill }: Props) {
  const [hn, setHn] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Prefill | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  function apply(prefill: Prefill, overwrite: boolean) {
    const next = overwrite
      ? prefill.values
      : Object.fromEntries(
          Object.entries(prefill.values).filter(
            ([k]) => (current[k] ?? "").trim() === "",
          ),
        );

    onFill(next);
    setConflicts([]);
    setResult(prefill);
  }

  async function pull() {
    setBusy(true);
    setError(null);
    setResult(null);
    setConflicts([]);

    try {
      const params = new URLSearchParams({ hn: hn.trim() });
      if (date) params.set("date", date);

      const res = await fetch(`/api/hosxp/visit?${params.toString()}`);
      const json = await res.json().catch(() => ({}));

      if (!json?.available) {
        setError(json?.reason ?? json?.error ?? "ดึงข้อมูลไม่สำเร็จ");
        return;
      }

      const prefill = json.prefill as Prefill;

      // ช่องที่จะถูกทับ — ถามก่อนเสมอ ไม่ทับเงียบๆ
      const clash = Object.keys(prefill.values).filter(
        (k) => (current[k] ?? "").trim() !== "" && current[k] !== prefill.values[k],
      );

      if (clash.length > 0) {
        setConflicts(clash);
        setResult(prefill);
        return;
      }

      apply(prefill, true);
    } catch {
      setError("ติดต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad bg-brand-50/40">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="prefill-hn">
            กรอก HN แล้วดึงข้อมูลจาก HOSxP มาให้
          </label>
          <input
            id="prefill-hn"
            className="input tabular w-48"
            value={hn}
            disabled={disabled || busy}
            onChange={(e) => setHn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (hn.trim()) pull();
              }
            }}
            placeholder="HN"
          />
        </div>

        <div>
          <label className="label" htmlFor="prefill-date">
            วันที่มารับบริการ
          </label>
          <input
            id="prefill-date"
            type="date"
            className="input tabular w-48"
            value={date}
            disabled={disabled || busy}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || busy || hn.trim() === ""}
          onClick={pull}
        >
          {busy ? "กำลังดึง…" : "ดึงข้อมูล"}
        </button>
      </div>

      <p className="hint">
        ไม่ใส่วันที่ = เอา visit ล่าสุดของ HN นั้น · ทุกช่องที่ดึงมาแก้ต่อได้
      </p>

      {error ? <p className="alert alert-error mt-4">{error}</p> : null}

      {conflicts.length > 0 && result ? (
        <div className="alert alert-info mt-4 space-y-3">
          <p>
            ช่องเหล่านี้กรอกไว้แล้ว: <strong>{conflicts.map((k) => LABEL[k] ?? k).join(", ")}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" onClick={() => apply(result, false)}>
              เติมเฉพาะช่องที่ยังว่าง
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => apply(result, true)}
            >
              ทับของเดิมทั้งหมด
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setConflicts([]);
                setResult(null);
              }}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}

      {result && conflicts.length === 0 ? (
        <div className="alert alert-ok mt-4 space-y-1">
          <p>
            ดึงข้อมูลมาแล้ว (VN {result.vn}) — <strong>ตรวจทานทุกช่องก่อนสร้างเอกสาร</strong>{" "}
            เกณฑ์ สนย. ตัดสินที่รายละเอียด เช่น อาการสำคัญต้องระบุระยะเวลาด้วยจึงได้คะแนนเต็ม
          </p>
          {result.missing.length > 0 ? (
            <p className="text-base">
              ไม่มีข้อมูลใน HOSxP (ต้องกรอกเอง): {result.missing.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
