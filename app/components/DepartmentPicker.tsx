"use client";

// เลือกแผนก OPD ได้หลายแผนก — พิมพ์ค้นหา ติ๊กเลือก เห็นที่เลือกเป็นป้ายด้านบน
// ไม่เลือกเลย = ทุกแผนก
//
// รายการแผนกคือ OPD_DEPARTMENTS (ชุดเดียวกับ ppc-hos-10667) — ไม่ต้องต่อ HOSxP ก็เลือกได้

import { useMemo, useState } from "react";
import Icon from "@/app/components/Icon";
import { OPD_DEPARTMENTS } from "@/lib/departments";

export type Department = { code: string; label: string };

const ITEMS: Department[] = OPD_DEPARTMENTS.map((d) => ({ code: d.code, label: d.label }));

/** รายการแผนก OPD — คงรูปแบบ hook ไว้ ให้ผู้เรียกไม่ต้องรู้ว่ามาจากไหน */
export function useDepartments(): { items: Department[]; reason?: string; loading: boolean } {
  return { items: ITEMS, loading: false };
}

export function departmentNames(codes: string[], items: Department[]): string {
  if (codes.length === 0) return "ทุกแผนก";
  const byCode = new Map(items.map((d) => [d.code, d.label]));
  return codes.map((c) => byCode.get(c) ?? c).join(", ");
}

export default function DepartmentPicker({
  value,
  onChange,
  disabled,
  id,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { items, reason, loading } = useDepartments();
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((d) => d.label.toLowerCase().includes(t) || d.code.toLowerCase().includes(t)) : items;
  }, [items, q]);

  const selected = new Set(value);
  const byCode = new Map(items.map((d) => [d.code, d.label]));
  const toggle = (code: string) =>
    onChange(selected.has(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div className={disabled ? "pointer-events-none opacity-60" : ""}>
      {/* ที่เลือกไว้ */}
      <div className="mb-2 flex min-h-8 flex-wrap items-center gap-1.5">
        {value.length === 0 ? (
          <span className="badge badge-brand">
            <Icon name="layers" size={14} />
            ทุกแผนก
          </span>
        ) : (
          <>
            {value.map((c) => (
              <span key={c} className="badge badge-brand animate-rise">
                {byCode.get(c) ?? c}
                <button
                  type="button"
                  onClick={() => toggle(c)}
                  aria-label={`เอา ${byCode.get(c) ?? c} ออก`}
                  className="-mr-1 rounded-full p-0.5 hover:bg-brand-100"
                >
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
            <button type="button" className="text-sm text-zinc-500 underline" onClick={() => onChange([])}>
              ล้าง (ทุกแผนก)
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="skeleton h-10 w-full" />
      ) : items.length === 0 ? (
        <p className="hint">{reason ?? "ไม่พบรายการแผนกใน HOSxP"} — ตรวจทุกแผนก</p>
      ) : (
        <div className="rounded-xl border border-zinc-300 bg-white">
          <div className="relative border-b border-zinc-200">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
            <input
              id={id}
              className="w-full rounded-t-xl bg-transparent py-2 pr-3 pl-10 text-base outline-none"
              placeholder="ค้นหาแผนก…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            {shown.map((d) => (
              <li key={d.code}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-base hover:bg-brand-50/60">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-600"
                    checked={selected.has(d.code)}
                    onChange={() => toggle(d.code)}
                  />
                  <span className="min-w-0 flex-1 truncate">{d.label}</span>
                  <span className="tabular text-xs text-zinc-400">{d.code}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 ? <li className="px-3 py-2 text-sm text-zinc-500">ไม่พบแผนกที่ค้นหา</li> : null}
          </ul>
        </div>
      )}
    </div>
  );
}
