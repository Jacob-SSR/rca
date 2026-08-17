"use client";

// ฟอร์มบันทึกเวชระเบียน — ช่องทั้งหมดมาจาก FORM_SECTIONS ที่เดียว
// เพิ่มช่องใหม่ในไฟล์ schema แล้วหน้านี้กับ DOCX จะตามไปเอง

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FORM_SECTIONS, type RecordFormInput } from "@/lib/form/schema";

type Props = {
  formId?: string;
  initial: Partial<RecordFormInput>;
  caseNumber?: string;
};

type Values = Record<string, string>;

function toValues(initial: Partial<RecordFormInput>): Values {
  const v: Values = {};
  for (const section of FORM_SECTIONS) {
    for (const field of section.fields) {
      const raw = initial[field.name];
      v[field.name] = typeof raw === "string" ? raw : "";
    }
  }
  return v;
}

export default function RecordFormEditor({ formId, initial, caseNumber }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => toValues(initial));
  const [busy, setBusy] = useState<null | "save" | "generate" | "review">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  /** บันทึกฟอร์ม — คืน id ของฟอร์ม (สร้างใหม่ถ้ายังไม่มี) */
  async function save(): Promise<string | null> {
    setError(null);

    const res = formId
      ? await fetch(`/api/forms/${formId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        })
      : await fetch("/api/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });

    const json = await res.json();

    if (!res.ok) {
      setError(json?.error ?? `บันทึกไม่สำเร็จ (${res.status})`);
      return null;
    }

    return json.id as string;
  }

  async function onSave() {
    setBusy("save");
    setMessage(null);
    try {
      const id = await save();
      if (!id) return;
      setMessage("บันทึกแล้ว");
      if (!formId) {
        router.push(`/forms/${id}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function onGenerate() {
    setBusy("generate");
    setMessage(null);
    try {
      const id = await save();
      if (!id) return;

      const res = await fetch(`/api/forms/${id}/generate`, { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error ?? `สร้างเอกสารไม่สำเร็จ (${res.status})`);
        return;
      }

      setMessage(`สร้างเอกสารแล้ว (ฉบับที่ ${json.version})`);
      if (!formId) router.push(`/forms/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างเอกสารไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function onReview() {
    setBusy("review");
    setMessage(null);
    try {
      const id = await save();
      if (!id) return;

      const res = await fetch(`/api/forms/${id}/review`, { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error ?? `ตรวจไม่สำเร็จ (${res.status})`);
        return;
      }

      router.push(`/reviews/${json.reviewId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ตรวจไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {caseNumber ? (
        <p className="text-sm text-zinc-500">เคส {caseNumber}</p>
      ) : null}

      {FORM_SECTIONS.map((section) => (
        <section key={section.key} className="rounded border border-zinc-200 bg-white p-4">
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">{section.title}</h2>
            {section.criterion ? (
              <span className="shrink-0 text-xs text-zinc-500">
                {section.criterion} · เต็ม {section.maxScore}
              </span>
            ) : null}
          </header>

          <div className="space-y-3">
            {section.fields.map((field) => (
              <label key={field.name} className="block">
                <span className="mb-1 block text-sm text-zinc-700">{field.label}</span>

                {field.kind === "area" ? (
                  <textarea
                    rows={4}
                    value={values[field.name] ?? ""}
                    onChange={(e) => set(field.name, e.target.value)}
                    disabled={busy !== null}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <input
                    type="text"
                    value={values[field.name] ?? ""}
                    onChange={(e) => set(field.name, e.target.value)}
                    disabled={busy !== null}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
                  />
                )}

                {field.hint ? (
                  <span className="mt-1 block text-xs text-zinc-500">{field.hint}</span>
                ) : null}
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-zinc-200 bg-zinc-50 py-3">
        <button
          type="button"
          onClick={onSave}
          disabled={busy !== null}
          className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy === "save" ? "กำลังบันทึก…" : "บันทึกฟอร์ม"}
        </button>

        <button
          type="button"
          onClick={onGenerate}
          disabled={busy !== null}
          className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy === "generate" ? "กำลังสร้าง…" : "สร้างเอกสาร (.docx)"}
        </button>

        <button
          type="button"
          onClick={onReview}
          disabled={busy !== null}
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy === "review" ? "กำลังตรวจ… (อาจใช้เวลาสักครู่)" : "สร้างเอกสารและตรวจ"}
        </button>

        {message ? <span className="text-sm text-green-700">{message}</span> : null}
      </div>

      {error ? (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      <p className="text-xs text-zinc-500">
        ช่องที่เว้นว่างจะไม่ปรากฏในเอกสาร — ระบบไม่เติมข้อความแทนให้
        เพราะจะทำให้คะแนนสูงกว่าความเป็นจริง
      </p>
    </div>
  );
}
