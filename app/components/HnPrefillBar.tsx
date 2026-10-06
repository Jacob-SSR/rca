"use client";

// ขั้นที่ 1–2 ของฟอร์มบันทึกเวชระเบียน: ค้นหาการมารับบริการใน HOSxP → เลือกครั้งที่จะตรวจ
//
// ⚠️ สิ่งที่ดึงมาคือข้อมูลดิบที่ HOSxP มี ไม่ใช่บันทึกที่สมบูรณ์
//    ยังต้องอ่านและแก้ก่อนสร้างเอกสาร เพราะเกณฑ์ สนย. ตัดสินที่รายละเอียด
//    ของข้อความ ไม่ใช่แค่มีข้อความ
//
// ⚠️ ค่าที่กรอกไว้แล้วจะไม่ถูกทับ ต้องกดยืนยันก่อน
//    คนกรอกไปครึ่งฟอร์มแล้วเผลอกดดึง ข้อมูลที่พิมพ์เองหายหมดคือความเสียหายจริง
//
// ── ค้นหาได้สามแบบด้วยปุ่มเดียว ──────────────────────────────────────────────
//   HN อย่างเดียว      → ทุกครั้งที่ HN นี้มา (ใหม่ → เก่า)
//   วันที่อย่างเดียว    → ทุกคนที่มาวันนั้น (รู้วันแต่ยังไม่รู้ HN)
//   HN + วันที่        → เฉพาะวันนั้นของ HN นั้น
// ทุกแบบจบที่ "กดเลือกจากรายการ" เสมอ เพราะวันเดียวมาได้หลายครั้ง (ต้องเลือกถึงระดับ VN)
// ก่อนหน้านี้มีปุ่ม "ดึงตามวันที่" แยก ซึ่งกดไม่ได้ถ้ายังไม่ใส่ HN และไม่บอกเหตุผล
// ผู้ใช้จึงเข้าใจว่าใช้งานไม่ได้ — รวมเป็นปุ่มเดียวแล้วบอกเหตุผลทุกครั้งที่กดไม่ได้

import { useState } from "react";
import { formatThaiDateShort } from "@/lib/form/thai-date";
import { classifySearch, parsePatientQuery } from "@/lib/hosxp/search-query";
import Icon from "@/app/components/Icon";

type Prefill = {
  values: Record<string, string>;
  missing: string[];
  /** ตารางที่อ่านไม่ได้ พร้อมเหตุผล — ต่างจาก missing ที่แปลว่า "ไม่มีข้อมูล" */
  issues?: string[];
  vn: string;
};

type Visit = {
  vn: string;
  hn: string;
  date: string;
  time: string;
  department: string;
  pttype: string;
  diagText: string;
  patientName?: string;
};

type Patient = { hn: string; name: string; cidMasked: string; age: string; gender: string };

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

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-on-brand transition-all duration-500 ${
        done
          ? "bg-emerald-600 shadow-[0_0_16px_-3px] shadow-emerald-600"
          : "bg-gradient-to-br from-brand-600 to-cyan-glow shadow-[0_0_16px_-3px] shadow-brand-500"
      }`}
    >
      {done ? <Icon name="check" size={16} strokeWidth={3} /> : n}
    </span>
  );
}

export default function HnPrefillBar({ current, disabled, onFill, onClear }: Props) {
  const [hn, setHn] = useState("");
  const [date, setDate] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Prefill | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [pending, setPending] = useState<Prefill | null>(null);

  const [visits, setVisits] = useState<Visit[] | null>(null);
  /** ค้นด้วยอะไร — ใช้เลือกคอลัมน์ในตาราง (ค้นตามวันที่ต้องเห็น HN/ชื่อ) */
  const [searchedBy, setSearchedBy] = useState<"hn" | "date">("hn");
  const [picked, setPicked] = useState<Visit | null>(null);
  const [showList, setShowList] = useState(true);
  /** ผลค้นหาด้วยชื่อ/เลขบัตร — เลือกคนแล้วค่อยไปดูรายการ visit */
  const [patients, setPatients] = useState<Patient[] | null>(null);

  // ── validate ช่องค้นหา ─────────────────────────────────────────────────────
  const hnTrim = hn.trim();
  const kind = classifySearch(hn);
  const parsedQuery = kind === "cid" || kind === "name" ? parsePatientQuery(hn) : null;
  const hnError = parsedQuery?.kind === "invalid" ? parsedQuery.reason : null;
  const dateError = date !== "" && date > todayIso() ? "วันที่อยู่ในอนาคต" : null;
  const nothing = hnTrim === "" && date === "";
  const searchBlocker = nothing
    ? "ใส่ HN / เลขบัตรประชาชน / ชื่อ หรือเลือกวันที่ อย่างน้อยหนึ่งอย่าง"
    : (hnError ?? dateError);

  const searchHint =
    kind === "cid"
      ? "ค้นด้วยเลขบัตรประชาชน → เลือกผู้ป่วย แล้วจะแสดงรายการที่มารับบริการ"
      : kind === "name"
        ? "ค้นด้วยชื่อ (พิมพ์ “ชื่อ นามสกุล” หรือคำเดียวก็ได้) → เลือกผู้ป่วย แล้วจะแสดงรายการที่มารับบริการ"
        : hnTrim !== "" && date !== ""
      ? "จะแสดงเฉพาะครั้งที่ HN นี้มาในวันที่เลือก"
      : hnTrim !== ""
        ? "จะแสดงทุกครั้งที่ HN นี้มา (ใหม่ → เก่า) — เลือกวันที่ด้วยถ้าอยากกรองให้เหลือวันเดียว"
        : date !== ""
          ? "จะแสดงผู้มารับบริการทุกคนในวันที่เลือก"
          : "พิมพ์ HN, เลขบัตรประชาชน 13 หลัก หรือชื่อ-สกุล — หรือเลือกแค่วันที่เพื่อดูผู้ป่วยทั้งหมดของวันนั้น";

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
    setShowList(false);
  }

  /**
   * ล้างทุกช่องเพื่อเปลี่ยนไปตรวจผู้ป่วยรายอื่นในหน้าเดิม
   *
   * ⚠️ ถามก่อนเสมอเมื่อมีข้อมูลอยู่ — กดพลาดแล้วสิ่งที่พิมพ์เองหายหมด
   *    และตัวปุ่มเองไม่ได้บันทึกอะไร กด "บันทึก" ทีหลังจึงจะทับของเดิมจริง
   */
  function reset() {
    const filled = Object.values(current).filter((v) => (v ?? "").trim() !== "").length;
    if (filled > 0 && !confirm(`ล้างข้อมูลในฟอร์มทั้งหมด ${filled} ช่อง เพื่อเริ่มผู้ป่วยรายใหม่?`)) {
      return;
    }

    onClear();
    setHn("");
    setDate("");
    setTouched(false);
    setVisits(null);
    setPatients(null);
    setPicked(null);
    setShowList(true);
    setResult(null);
    setError(null);
    setConflicts([]);
    setPending(null);
  }

  /** ปุ่มค้นหา — HN/วันที่ ไปที่รายการ visit ตรง ๆ ส่วนชื่อ/เลขบัตร ไปหาตัวผู้ป่วยก่อน */
  async function search() {
    setTouched(true);
    if (searchBlocker) return;

    if (kind === "cid" || kind === "name") {
      await findPatients();
    } else {
      await loadVisits(hnTrim);
    }
  }

  /** ค้นผู้ป่วยด้วยชื่อ/เลขบัตร — เจอคนเดียวไปต่อรายการ visit เลย */
  async function findPatients() {
    setBusy(true);
    setError(null);
    setVisits(null);
    setPatients(null);

    try {
      const res = await fetch(`/api/hosxp/patients?q=${encodeURIComponent(hnTrim)}`);
      const json = await res.json().catch(() => ({}));

      if (!json?.available) {
        setError(json?.reason ?? json?.error ?? "ค้นหาผู้ป่วยไม่สำเร็จ");
        return;
      }

      const list = (json.patients ?? []) as Patient[];
      if (list.length === 0) {
        setError(json?.reason ?? "ไม่พบผู้ป่วย");
        return;
      }
      if (list.length === 1) {
        setBusy(false);
        await choosePatient(list[0]);
        return;
      }
      setPatients(list);
    } catch {
      setError("ติดต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  async function choosePatient(p: Patient) {
    setPatients(null);
    setHn(p.hn);
    await loadVisits(p.hn);
  }

  /** รายการ visit ตาม HN และ/หรือวันที่ */
  async function loadVisits(hnValue: string) {
    setBusy(true);
    setError(null);
    setVisits(null);
    setShowList(true);

    try {
      const params = new URLSearchParams({ list: "1" });
      if (hnValue) params.set("hn", hnValue);
      if (date) params.set("date", date);

      const res = await fetch(`/api/hosxp/visit?${params.toString()}`);
      const json = await res.json().catch(() => ({}));

      if (!json?.available) {
        setError(json?.reason ?? json?.error ?? "ค้นหาไม่สำเร็จ");
        return;
      }

      const list = (json.visits ?? []) as Visit[];
      setSearchedBy(hnValue ? "hn" : "date");
      setVisits(list);
      if (list.length === 0) setError(json?.reason ?? "ไม่พบการมารับบริการ");
    } catch {
      setError("ติดต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  /** เติมฟอร์มจาก visit ที่เลือก */
  async function pull(v: Visit) {
    setBusy(true);
    setError(null);
    setResult(null);
    setConflicts([]);
    setPending(null);
    setPicked(v);

    try {
      const params = new URLSearchParams({ vn: v.vn });
      if (v.hn) params.set("hn", v.hn);

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

  const step1Done = (visits !== null && visits.length > 0) || result !== null;
  const step2Done = result !== null;

  return (
    <section className="card animate-rise overflow-hidden">
      {/* ── ขั้นที่ 1 : ค้นหา ─────────────────────────────────────────────── */}
      <div className="card-pad bg-brand-50/40">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold">
            <StepBadge n={1} done={step1Done} />
            ค้นหาการมารับบริการใน HOSxP
          </h2>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={disabled || busy}
            onClick={reset}
            title="ล้างทุกช่องในฟอร์ม เพื่อเริ่มตรวจผู้ป่วยรายอื่น"
          >
            <Icon name="plus" size={16} />
            เริ่มผู้ป่วยรายใหม่
          </button>
        </div>

        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,22rem)_minmax(0,14rem)_auto] sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
          noValidate
        >
          <div>
            <label className="label" htmlFor="prefill-hn">
              HN / เลขบัตรประชาชน / ชื่อ-สกุล
            </label>
            <input
              id="prefill-hn"
              className={`input tabular ${hnError ? "border-red-400" : ""}`}
              value={hn}
              autoComplete="off"
              disabled={disabled || busy}
              aria-invalid={!!hnError}
              aria-describedby="prefill-hn-err"
              onChange={(e) => {
                setHn(e.target.value);
                // เปลี่ยน HN แล้วรายการเดิมใช้ไม่ได้อีก ต้องล้างทิ้ง
                // ไม่งั้นจะกดเลือก visit ของคนไข้คนก่อนโดยไม่รู้ตัว
                setVisits(null);
                setPatients(null);
                setError(null);
              }}
              placeholder="เช่น 000012345 หรือ สมชาย ใจดี"
            />
            {hnError ? (
              <span id="prefill-hn-err" className="mt-1 block text-sm text-red-700">
                {hnError}
              </span>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="prefill-date">
              วันที่มารับบริการ <span className="font-normal text-zinc-500">(ไม่บังคับ)</span>
            </label>
            <div className="flex gap-1.5">
              <input
                id="prefill-date"
                type="date"
                className={`input tabular ${dateError ? "border-red-400" : ""}`}
                value={date}
                max={todayIso()}
                disabled={disabled || busy}
                aria-invalid={!!dateError}
                onChange={(e) => {
                  setDate(e.target.value);
                  setVisits(null);
                  setError(null);
                }}
              />
              {date ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label="ล้างวันที่"
                  onClick={() => {
                    setDate("");
                    setVisits(null);
                  }}
                >
                  <Icon name="x" size={16} />
                </button>
              ) : null}
            </div>
            {dateError ? <span className="mt-1 block text-sm text-red-700">{dateError}</span> : null}
          </div>

          <div>
            {/* ป้ายล่องหน ให้ปุ่มตรงแนวกับช่องกรอก ไม่ว่าฟอนต์จะสูงเท่าไร */}
            <span aria-hidden className="label invisible hidden sm:block">
              &nbsp;
            </span>
            <button
              type="submit"
              className="btn btn-primary w-full sm:w-auto"
              disabled={disabled || busy}
              aria-disabled={!!searchBlocker}
            >
              {busy && !picked ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="search" />}
              {busy && !picked ? "กำลังค้นหา…" : "ค้นหา"}
            </button>
          </div>
        </form>

        <p className={`hint ${touched && searchBlocker ? "!text-red-700" : ""}`}>
          {touched && searchBlocker ? searchBlocker : searchHint}
        </p>

        {error ? <p className="alert alert-error mt-4">{error}</p> : null}
      </div>

      {/* ── ผลค้นหาด้วยชื่อ/เลขบัตร — ชื่อซ้ำกันได้ ต้องให้เลือกคนก่อน ─────────── */}
      {patients && patients.length > 0 ? (
        <div className="border-t border-zinc-200">
          <h3 className="px-5 py-3 text-base font-semibold sm:px-6">
            เลือกผู้ป่วย{" "}
            <span className="font-normal text-zinc-500">
              (พบ {patients.length} คน{patients.length >= 30 ? " — แสดง 30 คนแรก พิมพ์ชื่อ-นามสกุลให้ละเอียดขึ้น" : ""})
            </span>
          </h3>
          <div className="max-h-96 overflow-auto border-t border-zinc-100">
            <table className="table">
              <thead className="sticky top-0">
                <tr>
                  <th>ชื่อ-สกุล</th>
                  <th>HN</th>
                  <th>เลขบัตร</th>
                  <th>อายุ / เพศ</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.hn}>
                    <td>{p.name || "—"}</td>
                    <td className="tabular">{p.hn}</td>
                    <td className="tabular text-zinc-500">{p.cidMasked || "—"}</td>
                    <td className="text-zinc-600">
                      {[p.age, p.gender].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={disabled || busy}
                        onClick={() => void choosePatient(p)}
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

      {/* ── ขั้นที่ 2 : เลือกครั้งที่จะตรวจ ─────────────────────────────────── */}
      {visits && visits.length > 0 ? (
        <div className="border-t border-zinc-200">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
            <h3 className="flex items-center gap-2.5 text-base font-semibold">
              <StepBadge n={2} done={step2Done} />
              {picked && !showList ? (
                <span>
                  กำลังตรวจ{" "}
                  <span className="tabular">
                    HN {picked.hn || hnTrim} · {formatThaiDateShort(picked.date)}
                    {picked.time ? ` ${picked.time}` : ""} · VN {picked.vn}
                  </span>
                </span>
              ) : (
                <span>
                  เลือกครั้งที่จะตรวจ{" "}
                  <span className="font-normal text-zinc-500">
                    ({visits.length} รายการ{searchedBy === "date" ? ` · ${formatThaiDateShort(date)}` : ` · HN ${hnTrim}`})
                  </span>
                </span>
              )}
            </h3>
            {picked && !showList ? (
              <button type="button" className="btn btn-sm" onClick={() => setShowList(true)}>
                เปลี่ยนครั้งที่มา
              </button>
            ) : null}
          </div>

          {showList ? (
            <div className="max-h-96 overflow-auto border-t border-zinc-100">
              <table className="table">
                <thead className="sticky top-0">
                  <tr>
                    <th>วันที่ / เวลา</th>
                    {searchedBy === "date" ? <th>ผู้ป่วย</th> : null}
                    <th>แผนก</th>
                    <th>คำวินิจฉัย (แพทย์)</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {visits.map((v) => (
                    <tr key={v.vn} className={picked?.vn === v.vn ? "bg-brand-50" : undefined}>
                      <td className="tabular whitespace-nowrap">
                        {formatThaiDateShort(v.date)}
                        {v.time ? <span className="text-zinc-500"> {v.time}</span> : null}
                        <span className="block text-xs text-zinc-400">VN {v.vn}</span>
                      </td>
                      {searchedBy === "date" ? (
                        <td className="whitespace-nowrap">
                          {v.patientName || "—"}
                          <span className="tabular block text-xs text-zinc-500">HN {v.hn}</span>
                        </td>
                      ) : null}
                      <td className="text-zinc-600">
                        {v.department || "—"}
                        {v.pttype ? <span className="block text-xs text-zinc-400">{v.pttype}</span> : null}
                      </td>
                      <td className="max-w-xs text-zinc-600">
                        <span className="line-clamp-2 whitespace-pre-line" title={v.diagText}>
                          {v.diagText || "—"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={disabled || busy}
                          onClick={() => pull(v)}
                        >
                          {busy && picked?.vn === v.vn ? "กำลังดึง…" : "เลือก"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── ถามก่อนทับของที่กรอกไว้แล้ว ───────────────────────────────────── */}
      {conflicts.length > 0 && pending ? (
        <div className="border-t border-zinc-200 px-5 py-4 sm:px-6">
          <div className="alert alert-info space-y-3">
            <p>
              ฟอร์มมีข้อมูลอยู่แล้วในช่อง:{" "}
              <strong>{conflicts.map((k) => LABEL[k] ?? k).join(", ")}</strong> — จะทำอย่างไร?
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => apply(pending, false)}>
                เติมเฉพาะช่องที่ยังว่าง
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => apply(pending, true)}
              >
                แทนที่ด้วยข้อมูล HOSxP ทั้งหมด
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setConflicts([]);
                  setPending(null);
                  setPicked(null);
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3 border-t border-zinc-200 px-5 py-4 sm:px-6">
          <div className="alert alert-ok space-y-1">
            <p>
              <Icon name="check" className="mr-1 inline" strokeWidth={2.6} />
              ดึงข้อมูลมาแล้ว — <strong>ขั้นต่อไป: ตรวจทานทุกช่องด้านล่าง</strong> แก้ได้ทุกช่อง
              (เช่น อาการสำคัญต้องมีระยะเวลาจึงได้คะแนนเต็ม)
            </p>
            {result.missing.length > 0 ? (
              <p className="text-base">ไม่มีข้อมูลใน HOSxP (ต้องกรอกเอง): {result.missing.join(", ")}</p>
            ) : null}
          </div>

          {/* อ่านตารางไหนไม่ได้ — ต่างจาก missing ที่แปลว่า "ไม่มีข้อมูล"
              ตรงนี้คือ "มีข้อมูลแต่ระบบอ่านไม่ได้" ซึ่งแก้ได้ด้วยการขอสิทธิ์ */}
          {(result.issues?.length ?? 0) > 0 ? (
            <div className="alert alert-error space-y-1">
              <p>
                <strong>อ่านบางตารางของ HOSxP ไม่ได้</strong> — ช่องที่เกี่ยวข้องจึงว่าง
                ไม่ใช่เพราะไม่มีข้อมูล ส่งรายการนี้ให้ผู้ดูแลระบบเปิดสิทธิ์อ่านให้
              </p>
              <ul className="list-disc space-y-0.5 ps-6 text-base">
                {result.issues?.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
