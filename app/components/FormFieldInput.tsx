"use client";

// ช่องกรอกหนึ่งช่อง — เลือกชนิดจาก field.kind
//
// ช่องแบบเลือกใช้ Combobox (พิมพ์ค้นหาได้) ไม่ใช่ <select>
// รายการจาก HOSxP มีหลายสิบรายการและคนกรอกรู้ชื่อที่ต้องการอยู่แล้ว
//
// ค่าที่ไม่มีในรายการยังใส่ได้เสมอถ้า field.allowOther — พิมพ์ลงไปตรงๆ ได้เลย
// ไม่ต้องไปหาเมนู "อื่นๆ" ก่อน เพราะรายการจาก HOSxP อาจไม่ครบ
// และห้ามให้รายการที่ไม่ครบขวางการกรอกเวชระเบียน ถ้าขวาง คนจะเลิกใช้แล้ว
// กลับไปเขียนมือ ซึ่งทำให้ระบบตรวจไม่มีความหมาย

import { useEffect, useState } from "react";
import Combobox, { type ComboboxItem } from "@/app/components/Combobox";
import { type FormField } from "@/lib/form/schema";

type OptionItem = ComboboxItem;

type Props = {
  field: FormField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

export default function FormFieldInput({ field, value, disabled, onChange }: Props) {
  const [remote, setRemote] = useState<OptionItem[]>([]);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "ready" | "unavailable">(
    field.optionsFrom ? "loading" : "idle",
  );
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

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

    // รายการคงที่ (เช่นเพศ) ไม่มีรหัส — ใช้ชื่อเป็นรหัสไปเลย Combobox จะไม่แสดงซ้ำ
    const items: OptionItem[] = field.optionsFrom
      ? remote
      : ((field.options ?? []) as string[]).map((o) => ({ code: o, label: o }));

    return (
      <>
        <Combobox
          id={field.name}
          items={items}
          value={value}
          disabled={disabled}
          allowOther={field.allowOther ?? false}
          ariaLabel={field.label}
          onChange={onChange}
        />
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
