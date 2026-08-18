"use client";

// ช่องเลือกแบบพิมพ์ค้นหาได้ — ใช้แทน <select> ในฟอร์มเวชระเบียน
//
// ทำไมไม่ใช้ <select> ธรรมดา
//   รายการแผนก/สิทธิจาก HOSxP มีหลายสิบรายการ คนกรอกรู้ชื่อที่ต้องการอยู่แล้ว
//   การให้เลื่อนหาทีละบรรทัดช้ากว่าพิมพ์สามตัวอักษรมาก
//   ช่องนี้เลยเป็น input จริงๆ ที่กรองรายการตามที่พิมพ์ แล้วกด Enter จบ
//
// ค้นได้ทั้งชื่อและรหัส — สิทธิการรักษาบางตัวคนจำเป็นรหัสมากกว่าชื่อเต็ม
//
// ⚠️ ต้องใช้งานด้วยคีย์บอร์ดล้วนได้ทั้งหมด
//    คนกรอกเวชระเบียนพิมพ์รวดเดียวจบทั้งฟอร์ม การต้องปล่อยมือไปจับเมาส์
//    กลางฟอร์มคือสิ่งที่ทำให้คนเลิกใช้ระบบแล้วกลับไปเขียนมือ

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ComboboxItem = { code: string; label: string };

type Props = {
  id: string;
  items: ComboboxItem[];
  value: string;
  disabled: boolean;
  /** ยอมให้ใช้ค่าที่ไม่มีในรายการได้ (รายการจาก HOSxP อาจไม่ครบ) */
  allowOther: boolean;
  placeholder?: string;
  ariaLabel?: string;
  onChange: (value: string) => void;
};

/**
 * ทำให้คำค้นเทียบกันได้
 * - ตัดช่องว่างทิ้งทั้งหมด: คนพิมพ์ "ห้องคลอด" ต้องเจอ "ห้อง คลอด"
 * - lowercase: มีผลกับรหัสที่เป็นตัวอักษรอังกฤษ (ภาษาไทยไม่มีตัวพิมพ์ใหญ่เล็ก)
 */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export default function Combobox({
  id,
  items,
  value,
  disabled,
  allowOther,
  placeholder,
  ariaLabel,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  /**
   * ผู้ใช้พิมพ์แก้แล้วหรือยัง
   *
   * ตอนเพิ่งเปิด ช่องจะโชว์ค่าเดิมไว้ให้เห็นว่าตอนนี้เลือกอะไรอยู่
   * แต่ต้องยัง "ไม่กรอง" ด้วยค่านั้น ไม่งั้นจะเห็นรายการเดียวคือตัวที่เลือกอยู่แล้ว
   * ซึ่งทำให้เปลี่ยนไปตัวอื่นไม่ได้ถ้าไม่ลบทิ้งก่อน
   */
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const listId = useId();

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!dirty || q === "") return items;
    return items.filter((i) => norm(i.label).includes(q) || norm(i.code).includes(q));
  }, [items, query, dirty]);

  /** พิมพ์ค่าที่ไม่มีในรายการ — เสนอให้ใช้ค่านั้นเลย แทนที่จะต้องไปหาเมนู "อื่นๆ" */
  const typed = query.trim();
  const showFreeText =
    allowOther &&
    dirty &&
    typed.length > 0 &&
    !items.some((i) => norm(i.label) === norm(typed));

  /** จำนวนแถวที่เลือกได้ทั้งหมด (รวมแถว "ใช้ค่าที่พิมพ์") */
  const rowCount = filtered.length + (showFreeText ? 1 : 0);

  /**
   * แถวที่ถูกชี้อยู่จริง
   *
   * เก็บ active เป็น state ดิบไว้ แล้วบีบให้อยู่ในช่วงตอน render
   * เพราะรายการหดได้เองระหว่างที่ยังเปิดอยู่ (พิมพ์กรอง / ตัวเลือกโหลดมาทีหลัง)
   * ถ้าไปตามแก้ด้วย useEffect จะกลายเป็น setState ซ้อน render โดยไม่จำเป็น
   */
  const activeIdx = rowCount === 0 ? 0 : Math.min(active, rowCount - 1);

  // เลื่อนแถวที่ถูกชี้ให้อยู่ในสายตาเมื่อไล่ด้วยลูกศร
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIdx, open]);

  function openList() {
    if (disabled) return;
    setQuery(value);
    setDirty(false);
    setActive(0);
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
    setDirty(false);
  }

  function commit(next: string) {
    onChange(next);
    closeList();
  }

  /**
   * ปิดโดยไม่ได้เลือกจากรายการ (คลิกที่อื่น / Tab ออก)
   * ถ้าพิมพ์ค้างไว้ก็พยายามใช้สิ่งที่พิมพ์ให้ ไม่ทิ้งงานที่พิมพ์ไปแล้ว
   */
  function commitFromQuery() {
    if (!dirty) return closeList();

    const q = query.trim();
    if (q === "") return commit("");

    const exact = items.find((i) => norm(i.label) === norm(q));
    if (exact) return commit(exact.label);
    if (allowOther) return commit(q);

    // เลือกได้เฉพาะในรายการ แต่พิมพ์ไม่ตรงอะไรเลย → คืนค่าเดิม
    closeList();
  }

  function pick(index: number) {
    if (index < filtered.length) return commit(filtered[index].label);
    if (showFreeText) return commit(typed);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openList();
      if (rowCount === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (Math.min(i, rowCount - 1) + step + rowCount) % rowCount);
      return;
    }

    if (e.key === "Enter") {
      if (!open) return;
      // กัน Enter ไปกด submit ฟอร์มทั้งใบตอนที่ตั้งใจแค่เลือกรายการ
      e.preventDefault();
      if (rowCount > 0) pick(activeIdx);
      else commitFromQuery();
      return;
    }

    if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      closeList();
      return;
    }

    if (e.key === "Tab") {
      if (open) commitFromQuery();
    }
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      // onBlur ของ React คือ focusout ของ DOM — bubble ขึ้นมาจาก input ข้างในได้
      onBlur={(e) => {
        // ย้ายโฟกัสไปที่อื่นในช่องนี้ (เช่นกดปุ่มล้างค่า) ไม่ถือว่าออก
        if (wrapRef.current?.contains(e.relatedTarget)) return;
        if (open) commitFromQuery();
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && rowCount > 0 ? `${listId}-${activeIdx}` : undefined}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        className="input pr-10"
        placeholder={placeholder ?? "พิมพ์เพื่อค้นหา…"}
        value={open ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          setDirty(true);
          setActive(0);
          setOpen(true);
        }}
        onFocus={(e) => {
          openList();
          // เลือกข้อความเดิมไว้ทั้งหมด พิมพ์ทับได้เลยโดยไม่ต้องลบก่อน
          requestAnimationFrame(() => e.target.select());
        }}
        onClick={() => {
          if (!open) openList();
        }}
        onKeyDown={onKeyDown}
      />

      {/* ปุ่มล้างค่า — เร็วกว่าเลื่อนไปหา "— ไม่ระบุ —" ในรายการ */}
      {value && !disabled ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="ล้างค่า"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-lg
                     leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          onClick={() => {
            onChange("");
            closeList();
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-zinc-400"
        >
          ▾
        </span>
      )}

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border
                     border-zinc-300 bg-white py-1 shadow-lg"
        >
          {filtered.map((item, i) => (
            <li
              key={`${item.code}-${item.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={item.label === value}
              data-active={i === activeIdx}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2
                          text-base ${i === activeIdx ? "bg-brand-50 text-brand-700" : "text-zinc-800"}`}
              // ใช้ mouseDown ไม่ใช่ click — click มาหลัง blur ทำให้ปิดรายการไปก่อนถูกเลือก
              onMouseDown={(e) => {
                e.preventDefault();
                commit(item.label);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{item.label}</span>
              {item.code && item.code !== item.label ? (
                <span className="tabular shrink-0 text-sm text-zinc-400">{item.code}</span>
              ) : null}
            </li>
          ))}

          {showFreeText ? (
            <li
              id={`${listId}-${filtered.length}`}
              role="option"
              aria-selected={false}
              data-active={activeIdx === filtered.length}
              className={`cursor-pointer border-t border-zinc-200 px-3.5 py-2 text-base
                          ${activeIdx === filtered.length ? "bg-brand-50 text-brand-700" : "text-zinc-600"}`}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(typed);
              }}
              onMouseEnter={() => setActive(filtered.length)}
            >
              ใช้ “{typed}” ที่พิมพ์ไว้
            </li>
          ) : null}

          {rowCount === 0 ? (
            <li className="px-3.5 py-2 text-base text-zinc-500">ไม่พบรายการที่ตรงกับที่พิมพ์</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
