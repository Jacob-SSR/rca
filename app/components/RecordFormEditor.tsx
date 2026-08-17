"use client";

// ฟอร์มบันทึกเวชระเบียน — ช่องทั้งหมดมาจาก FORM_SECTIONS ที่เดียว
// เพิ่มช่องใหม่ในไฟล์ schema แล้วหน้านี้กับ DOCX จะตามไปเอง

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FORM_SECTIONS, type RecordFormInput } from "@/lib/form/schema";
import FormFieldInput from "@/app/components/FormFieldInput";

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

  /** นับว่าหัวข้อที่ถูกให้คะแนนกรอกไปแล้วกี่ข้อ — ช่วยให้เห็นว่ายังขาดอะไร */
  const progress = useMemo(() => {
    const scored = FORM_SECTIONS.filter((s) => s.criterion);
    const done = scored.filter((s) =>
      s.fields.some((f) => (values[f.name] ?? "").trim().length > 0),
    );
    return { done: done.length, total: scored.length };
  }, [values]);

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
      // ถ้าจะย้ายหน้า ห้ามตาม refresh() (มันยกเลิก push — ดูคอมเมนต์ใน LoginForm)
      if (formId) {
        router.refresh();
      } else {
        router.push(`/forms/${id}`);
      }
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
      if (formId) {
        router.refresh();
      } else {
        router.push(`/forms/${id}`);
      }
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "ตรวจไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-wrap items-center gap-3">
        {caseNumber ? <span className="badge badge-brand">เคส {caseNumber}</span> : null}
        <span className="text-zinc-600">
          กรอกหัวข้อที่ให้คะแนนแล้ว{" "}
          <span className="tabular font-semibold text-zinc-900">
            {progress.done}/{progress.total}
          </span>{" "}
          ข้อ
        </span>
      </div>

      {FORM_SECTIONS.map((section) => (
        <section key={section.key} className="card">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.criterion ? (
              <span className="badge badge-brand tabular">
                {section.criterion} · เต็ม {section.maxScore}
              </span>
            ) : null}
          </header>

          {/* ช่องบรรทัดเดียว (HN, อายุ, เพศ ฯลฯ) เรียงเป็น grid — ถ้าปล่อยเต็มความกว้าง
              ข้อมูลผู้ป่วย 6 ช่องจะกินพื้นที่เกือบทั้งจอ ต้องเลื่อนยาวโดยไม่จำเป็น
              ส่วนช่องข้อความยาวยังเต็มความกว้างเพราะต้องพิมพ์หลายบรรทัด */}
          <div className="grid grid-cols-1 gap-x-5 gap-y-5 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {section.fields.map((field) => (
              <div
                key={field.name}
                className={field.kind === "area" ? "sm:col-span-2 lg:col-span-3" : ""}
              >
                <label className="label" htmlFor={field.name}>
                  {field.label}
                </label>

                {/* hint แสดงอยู่ใน FormFieldInput เพราะช่องที่ดึงตัวเลือกจาก HOSxP
                    ต้องเปลี่ยนข้อความ hint ตามว่าดึงรายการได้หรือไม่ */}
                <FormFieldInput
                  field={field}
                  value={values[field.name] ?? ""}
                  disabled={busy !== null}
                  onChange={(v) => set(field.name, v)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {error ? <p className="alert alert-error">{error}</p> : null}

      <div className="sticky bottom-0 -mx-4 border-t border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onReview} disabled={busy !== null} className="btn btn-primary">
            {busy === "review" ? "กำลังตรวจ… (อาจใช้เวลาสักครู่)" : "สร้างเอกสารและตรวจ"}
          </button>

          <button type="button" onClick={onSave} disabled={busy !== null} className="btn">
            {busy === "save" ? "กำลังบันทึก…" : "บันทึกฟอร์ม"}
          </button>

          <button type="button" onClick={onGenerate} disabled={busy !== null} className="btn">
            {busy === "generate" ? "กำลังสร้าง…" : "สร้างเอกสารอย่างเดียว"}
          </button>

          {message ? <span className="text-emerald-700">{message}</span> : null}
        </div>

        <p className="mt-3 text-sm text-zinc-500">
          ช่องที่เว้นว่างจะไม่ปรากฏในเอกสาร — ระบบไม่เติมข้อความแทนให้
          เพราะจะทำให้คะแนนสูงกว่าความเป็นจริง
        </p>
      </div>
    </div>
  );
}
