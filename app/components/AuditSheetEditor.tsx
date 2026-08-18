"use client";

// ตัวกรอกแผ่นงานแบบฟอร์มตรวจสอบคุณภาพ — ใช้ได้กับทั้ง 8 ใบ
//
// หน้าตาเป็นตารางเหมือนกระดาษต้นฉบับ เพราะคนตรวจเปิดแฟ้มดูแล้วกรอกไล่ทีละแถว
// ถ้าทำเป็นฟอร์มทีละรายการแบบหน้าเว็บทั่วไป จะกรอกช้ากว่ากระดาษแล้วไม่มีใครใช้
//
// ⚠️ ช่องคำนวณ (คะแนนเต็ม/คะแนนที่ได้/สัดส่วน) แสดงอย่างเดียว แก้ไม่ได้
//    และไม่ถูกส่งขึ้นเซิร์ฟเวอร์ — คิดใหม่ทุกครั้งจากค่าที่กรอก
//    ป้องกันไม่ให้คะแนนในไฟล์ที่ส่ง สสจ. ต่างจากคะแนนที่คำนวณได้จริง

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ICD_ERROR_CODES,
  type AuditFormDef,
  type FormColumn,
} from "@/lib/audit-forms/registry";
import {
  NA,
  computedValue,
  summarize,
  type CellValue,
  type SheetRow,
} from "@/lib/audit-forms/compute";

type Props = {
  form: AuditFormDef;
  sheetId?: string;
  initialTitle?: string;
  initialMeta?: Record<string, string>;
  initialRows?: SheetRow[];
  canEdit: boolean;
};

/** แถวเปล่าหนึ่งแถว — ทุกคีย์ต้องมีอยู่ ไม่งั้น React จะสลับ input กันตอนลบแถว */
function blankRow(form: AuditFormDef): SheetRow {
  const row: SheetRow = {};
  for (const c of form.columns) if (c.kind !== "computed") row[c.key] = "";
  return row;
}

export default function AuditSheetEditor({
  form,
  sheetId,
  initialTitle = "",
  initialMeta = {},
  initialRows = [],
  canEdit,
}: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [meta, setMeta] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const f of form.meta) m[f.key] = initialMeta[f.key] ?? "";
    return m;
  });
  const [rows, setRows] = useState<SheetRow[]>(() =>
    initialRows.length > 0 ? initialRows : [blankRow(form), blankRow(form), blankRow(form)],
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const summary = useMemo(() => summarize(form, rows), [form, rows]);

  function setCell(rowIndex: number, key: string, value: CellValue) {
    setRows((prev) =>
      prev.map((r, i) => (i === rowIndex ? { ...r, [key]: value } : r)),
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(sheetId ? `/api/sheets/${sheetId}` : "/api/sheets", {
        method: sheetId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formCode: form.code, title, meta, rows }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error ?? "บันทึกไม่สำเร็จ");
        return;
      }

      setSaved(true);
      if (!sheetId && json?.sheet?.id) {
        // สร้างใหม่แล้วต้องย้ายไปหน้าแก้ ไม่งั้นกดเซฟซ้ำจะได้แผ่นใหม่ทุกครั้ง
        router.push(`/sheets/${json.sheet.id}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("ติดต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!sheetId) return;
    if (!confirm("ลบแผ่นงานนี้ทั้งแผ่น? ข้อมูลที่กรอกไว้จะหายถาวร")) return;

    const res = await fetch(`/api/sheets/${sheetId}`, { method: "DELETE" });
    if (res.ok) router.push("/sheets");
    else setError("ลบไม่สำเร็จ");
  }

  return (
    <div className="space-y-6">
      {/* ── หัวฟอร์ม ─────────────────────────────────────────────────────── */}
      <section className="card card-pad">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">
            Form {form.code} — {form.title}
          </h1>
          <span className="badge badge-brand">{form.scope}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">{form.sourcePage}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="sheet-title">
              ชื่อแผ่นงาน (ไว้ค้นหาในระบบ)
            </label>
            <input
              id="sheet-title"
              className="input"
              value={title}
              disabled={!canEdit}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaved(false);
              }}
              placeholder={`เช่น ตรวจ ${form.code} ไตรมาส 1`}
            />
          </div>

          {form.meta.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`meta-${f.key}`}>
                {f.label}
              </label>
              <input
                id={`meta-${f.key}`}
                type={f.kind === "date" ? "date" : "text"}
                className={`input ${f.kind === "date" ? "tabular" : ""}`}
                value={meta[f.key] ?? ""}
                disabled={!canEdit}
                onChange={(e) => {
                  setMeta((m) => ({ ...m, [f.key]: e.target.value }));
                  setSaved(false);
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── ตาราง ────────────────────────────────────────────────────────── */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">ตารางบันทึกผล ({rows.length} แถว)</h2>
          {canEdit ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setRows((r) => [...r, blankRow(form)])}
              >
                + เพิ่มแถว
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setRows((r) => [...r, ...Array.from({ length: 10 }, () => blankRow(form))])
                }
              >
                + 10 แถว
              </button>
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          {/* min-w กันเบราว์เซอร์บีบคอลัมน์จนค่าที่เลือกไว้มองไม่เห็น
              ฟอร์มพวกนี้ 10-13 คอลัมน์ เลื่อนแนวนอนดีกว่าอ่านไม่ออก */}
          <table className="table min-w-[1100px]">
            <thead>
              <tr>
                <th className="w-10 text-center">#</th>
                {form.columns.map((c) => (
                  <th
                    key={c.key}
                    // หัวคอลัมน์ห้ามตัดบรรทัด ไม่งั้นแถวหัวสูงจนตารางอ่านยาก
                    // คำอธิบายย้ายไปไว้ใต้ตารางแทน (ดู legend ข้างล่าง)
                    className={`whitespace-nowrap ${c.kind === "text" ? "" : "text-center"}`}
                    title={c.hint}
                  >
                    {c.header}
                  </th>
                ))}
                {canEdit ? <th className="w-12" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="tabular text-center text-sm text-zinc-400">{i + 1}</td>
                  {form.columns.map((c) => (
                    <td key={c.key}>
                      <CellInput
                        form={form}
                        column={c}
                        row={row}
                        disabled={!canEdit}
                        onChange={(v) => setCell(i, c.key, v)}
                      />
                    </td>
                  ))}
                  {canEdit ? (
                    <td className="text-center">
                      <button
                        type="button"
                        aria-label={`ลบแถวที่ ${i + 1}`}
                        className="rounded px-2 py-1 text-zinc-400 hover:bg-bad-50 hover:text-bad-600"
                        onClick={() => {
                          setRows((r) => r.filter((_, j) => j !== i));
                          setSaved(false);
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {form.columns.some((c) => c.hint) ? (
          <dl className="grid gap-x-6 gap-y-1 border-t border-zinc-200 px-5 py-4 text-sm text-zinc-500 sm:grid-cols-2 sm:px-6">
            {form.columns
              .filter((c) => c.hint)
              .map((c) => (
                <div key={c.key} className="flex gap-2">
                  <dt className="shrink-0 font-medium text-zinc-700">{c.header}</dt>
                  <dd>{c.hint}</dd>
                </div>
              ))}
          </dl>
        ) : null}
      </section>

      {/* ── บรรทัดสรุป ───────────────────────────────────────────────────── */}
      {summary.kind !== "none" ? (
        <section className="card card-pad">
          <h2 className="text-lg font-semibold">สรุปผลการตรวจ</h2>

          {summary.kind === "score" ? (
            <div className="mt-3 flex flex-wrap gap-x-10 gap-y-2 text-lg">
              <span>
                คะแนนที่ได้ทั้งหมด{" "}
                <strong className="tabular">{summary.totalScore}</strong>
              </span>
              <span>
                คะแนนเต็ม <strong className="tabular">{summary.maxScore}</strong>
              </span>
              <span>
                สัดส่วน{" "}
                <strong className="tabular">
                  {summary.percentage === null ? "—" : summary.percentage.toFixed(2)}
                </strong>{" "}
                %
              </span>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {ICD_ERROR_CODES.map((c) => (
                  <span
                    key={c}
                    className={`badge ${summary.errorCounts[c] > 0 ? "badge-brand" : ""}`}
                  >
                    {c} <span className="tabular">{summary.errorCounts[c] ?? 0}</span>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-10 gap-y-2 text-lg">
                <span>
                  จำนวนรหัสที่ผิด <strong className="tabular">{summary.wrongCount}</strong>
                </span>
                <span>
                  รหัสทั้งหมด <strong className="tabular">{summary.totalCodes}</strong>
                </span>
                <span>
                  ผิดพลาด{" "}
                  <strong className="tabular">
                    {summary.percentage === null ? "—" : summary.percentage.toFixed(2)}
                  </strong>{" "}
                  %
                </span>
              </div>
            </div>
          )}

          <p className="hint mt-3">ระบบคิดให้จากค่าที่กรอก — ตัวเลขในไฟล์ที่ดาวน์โหลดจะตรงกับที่เห็นตรงนี้</p>
        </section>
      ) : null}

      {/* ── ปุ่ม ─────────────────────────────────────────────────────────── */}
      {error ? <p className="alert alert-error whitespace-pre-line">{error}</p> : null}
      {saved ? <p className="alert alert-ok">บันทึกแล้ว</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        ) : null}

        {sheetId ? (
          <a href={`/api/sheets/${sheetId}/export`} className="btn">
            ดาวน์โหลด .docx
          </a>
        ) : (
          <span className="text-sm text-zinc-500">บันทึกก่อนจึงจะดาวน์โหลดไฟล์ได้</span>
        )}

        {canEdit && sheetId ? (
          <button type="button" className="btn btn-danger ml-auto" onClick={remove}>
            ลบแผ่นงาน
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── ช่องกรอกหนึ่งช่อง ────────────────────────────────────────────────────────

function CellInput({
  form,
  column,
  row,
  disabled,
  onChange,
}: {
  form: AuditFormDef;
  column: FormColumn;
  row: SheetRow;
  disabled: boolean;
  onChange: (v: CellValue) => void;
}) {
  const value = row[column.key];
  const str = value === null || value === undefined ? "" : String(value);

  // ช่องคำนวณ — แสดงอย่างเดียว
  if (column.kind === "computed") {
    const v = computedValue(form, column, row);
    return (
      <span className="tabular block text-center font-medium text-zinc-700">
        {v === null ? "—" : column.compute === "percent" ? v.toFixed(2) : v}
      </span>
    );
  }

  // min-w กันช่องหดจนอ่านค่าที่กรอกไว้ไม่ออก — เคยเจอมาแล้วว่า na ที่เลือกไว้หายไปจากจอ
  // ช่องคะแนนใส่แค่เลขหลักเดียว/na จึงแคบได้ แต่ HN/AN/รหัส ICD ต้องเห็นครบทั้งค่า
  const wide = ["text", "date", "time"].includes(column.kind);
  const base =
    `w-full rounded border border-zinc-300 px-2 py-1.5 text-base disabled:bg-zinc-50 ${
      wide ? "min-w-[8.5rem]" : "min-w-[4.5rem]"
    }`;

  if (column.kind === "score") {
    const options: string[] = [];
    for (let i = 0; i <= (column.max ?? 0); i++) options.push(String(i));

    return (
      <select
        className={`${base} tabular text-center`}
        value={str}
        disabled={disabled}
        aria-label={column.header}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {column.allowNA ? <option value={NA}>na</option> : null}
      </select>
    );
  }

  if (column.kind === "select") {
    return (
      <select
        className={base}
        value={str}
        disabled={disabled}
        aria-label={column.header}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {(column.options ?? []).map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (column.kind === "date" || column.kind === "time") {
    return (
      <input
        type={column.kind}
        className={`${base} tabular`}
        value={str}
        disabled={disabled}
        aria-label={column.header}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (column.kind === "int") {
    return (
      <input
        type="number"
        min={0}
        step={1}
        className={`${base} tabular text-center`}
        value={str}
        disabled={disabled}
        aria-label={column.header}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <input
      type="text"
      className={base}
      value={str}
      disabled={disabled}
      aria-label={column.header}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
