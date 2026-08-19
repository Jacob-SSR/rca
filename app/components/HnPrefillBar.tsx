"use client";

// แถบ "กรอก HN แล้วดึงข้อมูลมาให้" ของฟอร์มบันทึกเวชระเบียน
//
// ⚠️ สิ่งที่ดึงมาคือข้อมูลดิบที่ HOSxP มี ไม่ใช่บันทึกที่สมบูรณ์
//    ยังต้องอ่านและแก้ก่อนสร้างเอกสาร เพราะเกณฑ์ สนย. ตัดสินที่รายละเอียด
//    ของข้อความ ไม่ใช่แค่มีข้อความ — จึงเขียนเตือนไว้ใต้ปุ่มตลอด
//
// ⚠️ ค่าที่กรอกไว้แล้วจะไม่ถูกทับ ต้องกดยืนยันก่อน
//    คนกรอกไปครึ่งฟอร์มแล้วเผลอกดดึง ข้อมูลที่พิมพ์เองหายหมดคือความเสียหายจริง
//
// ── ทำไมต้องมีรายการ visit ให้กด ────────────────────────────────────────────
// ผู้ป่วยคนเดียวกันมาหลายครั้งในวันเดียวได้ (เห็นได้จากหน้าจอ Visit List ของ
// HOSxP เอง) การเลือกด้วย "วันที่" อย่างเดียวจึงกำกวม — ต้องเลือกถึงระดับ VN
// แต่ยังคงช่องเลือกวันที่เองไว้ ใช้เมื่อยังไม่อยากดูรายการหรือ HOSxP ต่อไม่ได้

import { useState } from "react";
import { formatThaiDateShort } from "@/lib/form/thai-date";

type Prefill = {
  values: Record<string, string>;
  missing: string[];
  /** ตารางที่อ่านไม่ได้ พร้อมเหตุผล — ต่างจาก missing ที่แปลว่า "ไม่มีข้อมูล" */
  issues?: string[];
  vn: string;
};

type Visit = {
  vn: string;
  date: string;
  time: string;
  department: string;
  pttype: string;
  diagText: string;
};

type Props = {
  /** ค่าที่กรอกอยู่ตอนนี้ — ใช้เช็คว่าจะทับของเดิมไหม */
  current: Record<string, string>;
  disabled: boolean;
  onFill: (values: Record<string, string>) => void;
  /** ล้างทุกช่องในฟอร์ม เพื่อเริ่มกรอก HN ใหม่ในหน้าเดิม */
  onClear: () => void;
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
  presentIllness: "ประวัติปัจจุบัน",
  pastHistory: "ประวัติอดีต",
  personalHistory: "ประวัติส่วนตัว",
  vitalSigns: "สัญญาณชีพ",
  physicalExam: "ตรวจร่างกาย",
  labResult: "ผลชันสูตร/เอกซเรย์",
  diagnosis: "การวินิจฉัย",
  treatment: "การรักษา",
};

export default function HnPrefillBar({ current, disabled, onFill, onClear }: Props) {
  const [hn, setHn] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Prefill | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [pending, setPending] = useState<Prefill | null>(null);

  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [pickedVn, setPickedVn] = useState<string | null>(null);

  function apply(prefill: Prefill, overwrite: boolean) {
    const next = overwrite
      ? prefill.values
      : Object.fromEntries(
          Object.entries(prefill.values).filter(([k]) => (current[k] ?? "").trim() === ""),
        );

    onFill(next);
    setConflicts([]);
    setPending(null);
    setResult(prefill);
  }

  /**
   * ล้างทุกช่องเพื่อเปลี่ยนไปตรวจ HN อื่นในหน้าเดิม
   *
   * ⚠️ ถามก่อนเสมอเมื่อมีข้อมูลอยู่ — กดพลาดแล้วสิ่งที่พิมพ์เองหายหมด
   *    และตัวปุ่มเองไม่ได้บันทึกอะไร กด "บันทึกฟอร์ม" ทีหลังจึงจะทับของเดิมจริง
   */
  function reset() {
    const filled = Object.values(current).filter((v) => (v ?? "").trim() !== "").length;
    if (filled > 0 && !confirm(`ล้างข้อมูลในฟอร์มทั้งหมด ${filled} ช่อง เพื่อเริ่มกรอก HN ใหม่?`)) {
      return;
    }

    onClear();
    setHn("");
    setDate("");
    setVisits(null);
    setPickedVn(null);
    setResult(null);
    setError(null);
    setConflicts([]);
    setPending(null);
  }

  /** ดึงรายการ visit ของ HN นี้มาให้กดเลือก */
  async function loadVisits() {
    setBusy(true);
    setError(null);
    setVisits(null);
    setResult(null);

    try {
      const res = await fetch(
        `/api/hosxp/visit?list=1&hn=${encodeURIComponent(hn.trim())}`,
      );
      const json = await res.json().catch(() => ({}));

      if (!json?.available) {
        setError(json?.reason ?? json?.error ?? "ดึงรายการ visit ไม่สำเร็จ");
        return;
      }

      setVisits(json.visits ?? []);
      if ((json.visits ?? []).length === 0) {
        setError(json?.reason ?? `ไม่พบ visit ของ HN ${hn.trim()}`);
      }
    } catch {
      setError("ติดต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  /** เติมฟอร์ม — ระบุ vn เมื่อกดเลือกจากรายการ ไม่งั้นใช้ HN + วันที่ */
  async function pull(vn?: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    setConflicts([]);
    setPending(null);
    setPickedVn(vn ?? null);

    try {
      const params = new URLSearchParams();
      if (hn.trim()) params.set("hn", hn.trim());
      if (vn) params.set("vn", vn);
      else if (date) params.set("date", date);

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
        setPending(prefill);
        return;
      }

      apply(prefill, true);
    } catch {
      setError("ติดต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  const noHn = hn.trim() === "";

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
            onChange={(e) => {
              setHn(e.target.value);
              // เปลี่ยน HN แล้วรายการเดิมใช้ไม่ได้อีก ต้องล้างทิ้ง
              // ไม่งั้นจะกดเลือก visit ของคนไข้คนก่อนโดยไม่รู้ตัว
              setVisits(null);
              setPickedVn(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!noHn) loadVisits();
              }
            }}
            placeholder="HN"
          />
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || busy || noHn}
          onClick={() => loadVisits()}
        >
          {busy ? "กำลังดึง…" : "ดูรายการที่มารับบริการ"}
        </button>

        <span className="pb-2.5 text-zinc-400">หรือ</span>

        <div>
          <label className="label" htmlFor="prefill-date">
            ระบุวันที่เอง
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
          className="btn"
          disabled={disabled || busy || noHn}
          onClick={() => pull()}
        >
          ดึงตามวันที่
        </button>

        <span className="ms-auto">
          <button
            type="button"
            className="btn btn-danger"
            disabled={disabled || busy}
            onClick={reset}
          >
            ล้างข้อมูลในฟอร์ม
          </button>
        </span>
      </div>

      <p className="hint">
        ไม่ใส่วันที่ = เอาครั้งล่าสุดของ HN นั้น · ทุกช่องที่ดึงมาแก้ต่อได้ ·
        จะตรวจคนไข้รายอื่นในหน้านี้ ให้กด &ldquo;ล้างข้อมูลในฟอร์ม&rdquo; ก่อนใส่ HN ใหม่
      </p>

      {error ? <p className="alert alert-error mt-4">{error}</p> : null}

      {/* ── รายการ visit จริงจาก HOSxP ────────────────────────────────────── */}
      {visits && visits.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-300 bg-white">
          <div className="border-b border-zinc-200 px-4 py-2.5 text-base font-medium">
            ครั้งที่มารับบริการของ HN {hn.trim()} ({visits.length} ครั้ง) — กดเลือกครั้งที่จะตรวจ
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-12 text-center">#</th>
                  <th>วันที่ / เวลา</th>
                  <th>แผนก</th>
                  <th>สิทธิ</th>
                  <th>คำวินิจฉัย</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {visits.map((v, i) => (
                  <tr key={v.vn} className={pickedVn === v.vn ? "bg-brand-50" : undefined}>
                    <td className="tabular text-center text-sm text-zinc-400">{i + 1}</td>
                    <td className="tabular whitespace-nowrap">
                      {formatThaiDateShort(v.date)}
                      {v.time ? ` ${v.time}` : ""}
                    </td>
                    <td className="text-zinc-600">{v.department || "—"}</td>
                    <td className="text-zinc-600">{v.pttype || "—"}</td>
                    <td className="max-w-xs truncate text-zinc-600" title={v.diagText}>
                      {v.diagText || "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={disabled || busy}
                        onClick={() => pull(v.vn)}
                      >
                        เลือก
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ── ถามก่อนทับของที่กรอกไว้แล้ว ───────────────────────────────────── */}
      {conflicts.length > 0 && pending ? (
        <div className="alert alert-info mt-4 space-y-3">
          <p>
            ช่องเหล่านี้กรอกไว้แล้ว:{" "}
            <strong>{conflicts.map((k) => LABEL[k] ?? k).join(", ")}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" onClick={() => apply(pending, false)}>
              เติมเฉพาะช่องที่ยังว่าง
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => apply(pending, true)}
            >
              ทับของเดิมทั้งหมด
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setConflicts([]);
                setPending(null);
              }}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}

      {result ? (
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

      {/* ── อ่านตารางไหนไม่ได้บ้าง ─────────────────────────────────────────────
          ต่างจาก missing ข้างบนที่แปลว่า "ไม่มีข้อมูล" — ตรงนี้คือ "มีข้อมูลแต่
          ระบบอ่านไม่ได้" ซึ่งแก้ได้ด้วยการขอสิทธิ์ ต้องบอกชื่อตารางให้ตรง
          ไม่งั้นผู้ใช้เห็นแค่ช่องว่างแล้วเข้าใจว่า HOSxP ไม่มีข้อมูลจริงๆ */}
      {result && (result.issues?.length ?? 0) > 0 ? (
        <div className="alert alert-error mt-4 space-y-1">
          <p>
            <strong>อ่านบางตารางของ HOSxP ไม่ได้</strong> — ช่องที่เกี่ยวข้องจึงว่าง
            ไม่ใช่เพราะไม่มีข้อมูล ส่งรายการนี้ให้ผู้ดูแลระบบเปิดสิทธิ์อ่านให้
          </p>
          <ul className="list-disc space-y-0.5 ps-6 text-base">
            {result.issues?.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
