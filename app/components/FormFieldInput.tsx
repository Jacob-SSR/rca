"use client";

// ช่องกรอกหนึ่งช่อง — เลือกชนิดจาก field.kind
//
// dropdown ทุกตัวมีตัวเลือก "อื่นๆ" ให้พิมพ์เองได้เสมอ (field.allowOther)
// เพราะรายการจาก HOSxP อาจไม่ครบ และห้ามให้รายการที่ไม่ครบขวางการกรอกเวชระเบียน
// ถ้าขวาง คนจะเลิกใช้แล้วกลับไปเขียนมือ ซึ่งทำให้ระบบตรวจไม่มีความหมาย

import { useEffect, useState } from "react";
import { OTHER_OPTION_LABEL, type FormField } from "@/lib/form/schema";

type OptionItem = { code: string; label: string };

type Props = {
  field: FormField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

/**
 * ค่าพิเศษของ <option> ที่หมายถึง "พิมพ์เอง"
 *
 * ⚠️ ห้ามใช้อักขระช่องว่างหรืออักขระควบคุมเป็นค่านี้ — เคยใช้แล้วค่าเพี้ยนตอนผ่าน DOM
 *    ทำให้เทียบ e.target.value === OTHER ไม่ตรง ผลคือค่า sentinel ไปโผล่ในช่องพิมพ์เอง
 *    และ dropdown เด้งกลับเป็น "ไม่ระบุ"
 *
 * ใช้รูปแบบที่อ่านออกและไม่มีทางเป็นชื่อแผนก/สิทธิจริงใน HOSxP
 */
const OTHER = "__OTHER__";

export default function FormFieldInput({ field, value, disabled, onChange }: Props) {
  const [remote, setRemote] = useState<OptionItem[]>([]);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "ready" | "unavailable">(
    field.optionsFrom ? "loading" : "idle",
  );
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  /** ผู้ใช้กด "อื่นๆ" เอง — แยกจากการเดาจากค่าที่มีอยู่ */
  const [otherMode, setOtherMode] = useState(false);

  // โหลดตัวเลือกจาก HOSxP (แผนก / สิทธิการรักษา)
  useEffect(() => {
    if (!field.optionsFrom) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/hosxp/options?kind=${field.optionsFrom}`);
        const json = await res.json();
        if (cancelled) return;

        if (res.ok && json.available && Array.isArray(json.items) && json.items.length > 0) {
          setRemote(json.items);
          setRemoteState("ready");
        } else {
          setUnavailableReason(json?.reason ?? null);
          setRemoteState("unavailable");
        }
      } catch {
        if (!cancelled) setRemoteState("unavailable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [field.optionsFrom]);

  /**
   * hint ที่จะแสดงใต้ช่อง — ตัดสินที่นี่ที่เดียว
   * ช่องที่ดึงตัวเลือกจาก HOSxP แล้วดึงไม่ได้ จะกลายเป็นช่องพิมพ์เอง
   * hint เดิมที่อธิบายวิธีใช้ dropdown จึงไม่ตรงกับสิ่งที่ผู้ใช้เห็น ต้องไม่แสดง
   */
  const hintText: string | null =
    field.optionsFrom && remoteState === "unavailable"
      ? `${unavailableReason ?? "ดึงรายการจาก HOSxP ไม่ได้"} — พิมพ์เองได้ตามปกติ`
      : field.optionsFrom && remoteState === "loading"
        ? null
        : (field.hint ?? null);

  const hintNode = hintText ? <span className="hint">{hintText}</span> : null;

  // ── ช่องข้อความหลายบรรทัด ──────────────────────────────────────────────────
  if (field.kind === "area") {
    return (
      <>
        <textarea
          id={field.name}
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="input"
        />
        {hintNode}
      </>
    );
  }

  // ── ปฏิทิน / นาฬิกา ────────────────────────────────────────────────────────
  if (field.kind === "date" || field.kind === "time") {
    return (
      <>
        <input
          id={field.name}
          type={field.kind}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="input tabular"
        />
        {hintNode}
      </>
    );
  }

  // ── dropdown ───────────────────────────────────────────────────────────────
  if (field.kind === "select") {
    // ตัวเลือกจาก HOSxP ยังโหลดไม่เสร็จ / ต่อไม่ได้ → ให้พิมพ์เองไปก่อน
    // ห้ามให้ผู้ใช้รอหรือค้าง เพราะช่องนี้ไม่ใช่ช่องที่ถูกให้คะแนน
    if (field.optionsFrom && remoteState !== "ready") {
      return (
        <>
          <input
            id={field.name}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="input"
            placeholder={remoteState === "loading" ? "กำลังโหลดรายการ…" : undefined}
          />
          {hintNode}
        </>
      );
    }

    const options = field.optionsFrom
      ? remote.map((o) => o.label)
      : ((field.options ?? []) as string[]);

    // ค่าที่มีอยู่แต่ไม่อยู่ในรายการ = โหลดมาจากที่เคยพิมพ์เองไว้
    // ต้องดูร่วมกับ otherMode ด้วย ไม่งั้นตอนกด "อื่นๆ" แล้วค่ายังว่าง
    // ช่องพิมพ์เองจะหายไปทันทีก่อนที่ผู้ใช้จะได้พิมพ์
    const usingOther = otherMode || (value.trim().length > 0 && !options.includes(value));

    return (
      <>
        <select
          id={field.name}
          value={usingOther ? OTHER : value}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setOtherMode(true);
              onChange("");
            } else {
              setOtherMode(false);
              onChange(e.target.value);
            }
          }}
          disabled={disabled}
          className="input"
        >
          <option value="">— ไม่ระบุ —</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {field.allowOther ? <option value={OTHER}>{OTHER_OPTION_LABEL}</option> : null}
        </select>

        {usingOther ? (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            autoFocus
            className="input mt-2"
            placeholder="พิมพ์ค่าที่ต้องการ"
            aria-label={`${field.label} (พิมพ์เอง)`}
          />
        ) : null}
        {hintNode}
      </>
    );
  }

  // ── ช่องข้อความบรรทัดเดียว ─────────────────────────────────────────────────
  return (
    <>
      <input
        id={field.name}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="input"
      />
      {hintNode}
    </>
  );
}
