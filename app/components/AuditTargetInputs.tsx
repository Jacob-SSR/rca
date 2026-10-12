"use client";

// ช่องกรอกเป้าของรอบตรวจอัตโนมัติ — ใช้ทั้งในตั้งค่าและ "ตรวจเดี๋ยวนี้"
//   DepartmentRules: เซ็ตแยกรายแผนกที่เลือก — จำนวนที่ตรวจต่อรอบ + ICD-10 ที่ให้ตรวจ
//   IcdInput:        ช่องพิมพ์รหัส ICD-10 (รหัสเต็ม / ขึ้นต้นด้วย / ช่วง)

import { useState } from "react";
import Icon from "@/app/components/Icon";
import { useDepartments } from "@/app/components/DepartmentPicker";
import { type DepartmentRule, MAX_VISITS_CAP, parseIcdList } from "@/lib/auto-audit/schedule";

/** E119 → E11.9 ให้อ่านง่ายแบบที่หมอเขียน (ข้างในเก็บแบบไม่มีจุดตาม HOSxP) */
export const formatIcd = (code: string) => (code.length > 3 ? `${code.slice(0, 3)}.${code.slice(3)}` : code);

export const formatIcdPattern = (p: string) => p.split("-").map(formatIcd).join("–");

/** สรุปสั้น ๆ ไว้แสดงในแถบสรุป/ประวัติ */
export function icdSummary(patterns: string[] | undefined): string {
  if (!patterns || patterns.length === 0) return "";
  const shown = patterns.slice(0, 4).map(formatIcdPattern).join(", ");
  return `ICD-10 ${shown}${patterns.length > 4 ? ` +${patterns.length - 4}` : ""}`;
}

export type Rules = Record<string, DepartmentRule>;

/**
 * เซ็ตแยกรายแผนก — หนึ่งแถวต่อแผนกที่เลือก: จำนวนที่ตรวจต่อรอบ + ICD-10 ที่ให้ตรวจ
 * onInvalid: แผนกไหนมีรหัสที่อ่านไม่ได้ (ผู้เรียกใช้กันกดบันทึก/กดตรวจ)
 */
export function DepartmentRules({
  departments,
  rules,
  onChange,
  onInvalid,
  sharedHint,
}: {
  departments: string[];
  rules: Rules;
  onChange: (r: Rules) => void;
  onInvalid: (dep: string, invalid: string[]) => void;
  /** แผนกที่ไม่ได้ใส่จำนวนจะใช้อะไร — แสดงที่หัวตาราง */
  sharedHint: string;
}) {
  const { items } = useDepartments();
  if (departments.length === 0) {
    return (
      <p className="hint">
        เลือกแผนกด้านบนก่อน แล้วจะเซ็ตได้ว่าแต่ละแผนกตรวจกี่รายต่อรอบ และตรวจเฉพาะ ICD-10 อะไร
      </p>
    );
  }
  const byCode = new Map(items.map((d) => [d.code, d.label]));
  const ruleOf = (code: string): DepartmentRule => rules[code] ?? { quota: null, icd10: [] };

  function set(code: string, p: Partial<DepartmentRule>) {
    onChange({ ...rules, [code]: { ...ruleOf(code), ...p } });
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200">
      <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
        <span className="font-medium text-zinc-700">เซ็ตแยกรายแผนก</span> · จำนวนว่าง = {sharedHint} · ICD-10
        ว่าง = ทุกโรค
      </div>
      <ul className="divide-y divide-zinc-100">
        {departments.map((code) => {
          const name = byCode.get(code) ?? code;
          const r = ruleOf(code);
          return (
            <li key={code} className="grid gap-2 px-3 py-3 md:grid-cols-[minmax(0,14rem)_auto_minmax(0,1fr)] md:items-start">
              <span className="min-w-0 truncate pt-2 font-medium" title={name}>
                {name}
              </span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={MAX_VISITS_CAP}
                  inputMode="numeric"
                  aria-label={`จำนวนต่อรอบของ ${name}`}
                  placeholder="รวม"
                  className="input tabular w-24 py-1.5"
                  value={r.quota ?? ""}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber;
                    set(code, { quota: Number.isInteger(n) && n > 0 ? Math.min(n, MAX_VISITS_CAP) : null });
                  }}
                />
                <span className="text-sm text-zinc-500">ราย/รอบ</span>
              </span>
              <IcdInput
                compact
                ariaLabel={`ICD-10 ของ ${name}`}
                value={r.icd10}
                onChange={(icd10, invalid) => {
                  set(code, { icd10 });
                  onInvalid(code, invalid);
                }}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** สรุปค่าแยกรายแผนกสั้น ๆ เช่น "อายุรกรรม 5 ราย ICD-10 E11, I10" */
export function rulesSummary(rules: Rules | undefined, names: Map<string, string>): string {
  return Object.entries(rules ?? {})
    .map(([d, r]) =>
      [names.get(d) ?? d, r.quota !== null ? `${r.quota} ราย` : "", icdSummary(r.icd10)].filter(Boolean).join(" "),
    )
    .join(" · ");
}

export function IcdInput({
  id,
  value,
  onChange,
  compact,
  ariaLabel,
}: {
  id?: string;
  value: string[];
  compact?: boolean;
  ariaLabel?: string;
  /** patterns = รูปแบบที่ใช้ได้, invalid = คำที่อ่านเป็นรหัสไม่ได้ (ผู้เรียกใช้กันกดบันทึก) */
  onChange: (patterns: string[], invalid: string[]) => void;
}) {
  const joined = value.map(formatIcdPattern).join(", ");
  const [text, setText] = useState(joined);
  const [prevJoined, setPrevJoined] = useState(joined);
  // ค่าเปลี่ยนจากข้างนอก (โหลดค่าตั้งค่าใหม่) → เขียนข้อความใหม่ตาม แต่ไม่ทับตอนกำลังพิมพ์
  if (joined !== prevJoined) {
    setPrevJoined(joined);
    if (parseIcdList(text).patterns.map(formatIcdPattern).join(", ") !== joined) setText(joined);
  }
  const { patterns, invalid } = parseIcdList(text);

  return (
    <div>
      <input
        id={id}
        type="text"
        aria-label={ariaLabel}
        className={`input tabular w-full ${compact ? "py-1.5" : ""}`}
        placeholder="เช่น J02.9, E11, I10-I15"
        value={text}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          const p = parseIcdList(e.target.value);
          onChange(p.patterns, p.invalid);
        }}
      />
      <div className={`${compact ? "mt-1.5" : "mt-2"} flex min-h-7 flex-wrap items-center gap-1.5`}>
        {patterns.length === 0 ? (
          <span className="badge badge-brand">
            <Icon name="layers" size={14} />
            ทุกโรค
          </span>
        ) : (
          patterns.map((p) => (
            <span key={p} className="badge badge-brand tabular">
              {formatIcdPattern(p)}
              <span className="text-xs font-normal opacity-75">
                {p.includes("-") ? "ช่วง" : p.length === 3 ? "ทุกรหัสย่อย" : ""}
              </span>
            </span>
          ))
        )}
        {invalid.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-sm text-red-700">
            <Icon name="x" size={14} />
            อ่านไม่ได้: {invalid.join(", ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
