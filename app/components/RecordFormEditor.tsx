"use client";

// ฟอร์มบันทึกเวชระเบียน — ช่องทั้งหมดมาจาก FORM_SECTIONS ที่เดียว
// เพิ่มช่องใหม่ในไฟล์ schema แล้วหน้านี้กับ DOCX จะตามไปเอง

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { FORM_SECTIONS, blankFormValues, type RecordFormInput } from "@/lib/form/schema";
import { fieldLabel, isBlank, validateRecordForm, type Issue } from "@/lib/form/validate";
import { autoAuditOpd } from "@/lib/review/auto-audit";
import FormFieldInput from "@/app/components/FormFieldInput";
import HnPrefillBar from "@/app/components/HnPrefillBar";
import AutoAuditPanel, { scoreTone } from "@/app/components/AutoAuditPanel";

// ── สวิตช์ตรวจอัตโนมัติ — จำไว้ในเครื่อง (ค่าตั้งต้น: เปิด) ─────────────────────
// ใช้ useSyncExternalStore แทน useEffect+setState เพื่อไม่ให้ค่าบน server กับ client ชนกัน
const AUTO_KEY = "rca.autoAudit";
const autoListeners = new Set<() => void>();

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeAuto(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? "on" : "off");
  } catch {
    // โหมดส่วนตัว/บล็อก storage — เปลี่ยนได้แค่รอบนี้ ไม่เป็นไร
  }
  autoListeners.forEach((l) => l());
}

function subscribeAuto(l: () => void) {
  autoListeners.add(l);
  return () => autoListeners.delete(l);
}

/** หัวข้อเกณฑ์ → id ของ section ในหน้า (ใช้เลื่อนไปหา) */
const sectionId = (key: string) => `section-${key}`;
const SECTION_BY_CRITERION = new Map(
  FORM_SECTIONS.filter((s) => s.criterion).map((s) => [s.criterion as string, s.key]),
);

type Props = {
  formId?: string;
  initial: Partial<RecordFormInput>;
  caseNumber?: string;
};

type Values = Record<string, string>;

const toValues = (initial: Partial<RecordFormInput>): Values => blankFormValues(initial);

export default function RecordFormEditor({ formId, initial, caseNumber }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => toValues(initial));
  const [busy, setBusy] = useState<null | "save" | "generate" | "review">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** โชว์ error รายช่องหลังจากกดบันทึก/ตรวจครั้งแรก — ไม่ขึ้นแดงตั้งแต่ยังไม่ได้พิมพ์ */
  const [submitted, setSubmitted] = useState(false);

  const autoOn = useSyncExternalStore(subscribeAuto, readAuto, () => true);
  const audit = useMemo(() => (autoOn ? autoAuditOpd(values) : null), [autoOn, values]);
  const auditByCode = useMemo(
    () => new Map((audit?.items ?? []).map((i) => [i.criterionCode, i])),
    [audit],
  );

  const issues = useMemo(() => validateRecordForm(values), [values]);
  const errors = issues.filter((i) => i.level === "error");
  const issuesByField = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of issues) m.set(i.field, [...(m.get(i.field) ?? []), i]);
    return m;
  }, [issues]);

  function jumpTo(id: string) {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus({ preventScroll: true });
  }

  /**
   * ตรวจก่อนยิง API — มี error = ไม่ส่ง แล้วพาไปช่องแรกที่ผิด
   * ตรวจ/สร้างเอกสารต้องมีข้อมูลอย่างน้อยหนึ่งช่อง (บันทึกร่างเปล่าก็ไม่มีประโยชน์เช่นกัน)
   */
  function guard(): boolean {
    setSubmitted(true);
    if (isBlank(values)) {
      setError("ฟอร์มยังว่างอยู่ — ค้นหาจาก HOSxP ในขั้นที่ 1 หรือกรอกเองก่อน");
      return false;
    }
    if (errors.length > 0) {
      setError(`แก้ ${errors.length} ช่องที่ไม่ถูกต้องก่อน (ทำเครื่องหมายสีแดงไว้)`);
      jumpTo(errors[0].field);
      return false;
    }
    return true;
  }

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

  /** เติมหลายช่องพร้อมกันจาก HOSxP — ช่องที่ไม่ได้ส่งมาไม่ถูกแตะ */
  function fill(next: Record<string, string>) {
    setValues((prev) => ({ ...prev, ...next }));
  }

  /**
   * ล้างทุกช่อง เพื่อเปลี่ยนไปตรวจ HN อื่นในหน้าเดิม
   *
   * ⚠️ ล้างแค่ในหน้า ยังไม่แตะฐานข้อมูล — ของที่บันทึกไว้จะหายก็ต่อเมื่อกดบันทึกซ้ำ
   *    (ตัวถามยืนยันอยู่ใน HnPrefillBar ที่รู้ว่ากรอกไปกี่ช่องแล้ว)
   */
  function clearAll() {
    setValues(toValues({}));
    setMessage(null);
    setError(null);
    setSubmitted(false);
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
    if (!guard()) return;
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
    if (!guard()) return;
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
    if (!guard()) return;
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

  const hasPatient = (values.hn ?? "").trim() !== "" || (values.patientName ?? "").trim() !== "";
  const steps = [
    { n: 1, label: "ค้นหาผู้ป่วย", done: hasPatient },
    { n: 2, label: "เลือกครั้งที่มา", done: hasPatient },
    { n: 3, label: `ตรวจทาน/แก้ไข (${progress.done}/${progress.total} หัวข้อ)`, done: progress.done === progress.total },
    { n: 4, label: "บันทึก / ตรวจ", done: !!formId },
  ];

  return (
    <div className="space-y-5 pb-4">
      {/* ── ขั้นตอนการใช้งาน — ให้เห็นตลอดว่าอยู่ตรงไหน ต้องทำอะไรต่อ ───────── */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        {caseNumber ? <li className="badge badge-brand me-2">เคส {caseNumber}</li> : null}
        {steps.map((st, i) => (
          <li key={st.n} className="flex items-center gap-2">
            <span
              className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                st.done ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-700"
              }`}
            >
              {st.done ? "✓" : st.n}
            </span>
            <span className={st.done ? "text-zinc-800" : "text-zinc-500"}>{st.label}</span>
            {i < steps.length - 1 ? <span aria-hidden className="mx-1 text-zinc-300">→</span> : null}
          </li>
        ))}
      </ol>

      <HnPrefillBar
        current={values}
        disabled={busy !== null}
        onFill={fill}
        onClear={clearAll}
      />

      <AutoAuditPanel
        enabled={autoOn}
        onToggle={writeAuto}
        result={audit}
        onJump={(code) => {
          const key = SECTION_BY_CRITERION.get(code);
          if (key) jumpTo(sectionId(key));
        }}
      />

      <h2 className="flex items-center gap-2.5 pt-2 text-lg font-semibold">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-brand-600 text-sm text-white">
          3
        </span>
        ตรวจทานและแก้ไขข้อมูล
        <span className="text-base font-normal text-zinc-500">— แก้ได้ทุกช่อง ช่องที่ว่างจะไม่ปรากฏในเอกสาร</span>
      </h2>

      {FORM_SECTIONS.map((section) => {
        const scored = section.criterion ? auditByCode.get(section.criterion) : undefined;
        return (
          <section key={section.key} id={sectionId(section.key)} className="card scroll-mt-24">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              {section.criterion ? (
                <span className="flex flex-wrap items-center gap-2">
                  {scored ? (
                    <span
                      className={`badge tabular ${scoreTone(scored.score, scored.criterionMaxScore)}`}
                      title={scored.reason}
                    >
                      ประเมิน {scored.isNA ? "N/A" : `${scored.score}/${scored.criterionMaxScore}`}
                    </span>
                  ) : null}
                  <span className="badge badge-brand tabular">
                    {section.criterion} · เต็ม {section.maxScore}
                  </span>
                </span>
              ) : null}
            </header>

            {scored && scored.score !== scored.criterionMaxScore && !scored.isNA ? (
              <p className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-2 text-sm text-zinc-600 sm:px-6">
                {scored.reason}
              </p>
            ) : null}

            {/* ช่องบรรทัดเดียว (HN, อายุ, เพศ ฯลฯ) เรียงเป็น grid — ถ้าปล่อยเต็มความกว้าง
                ข้อมูลผู้ป่วย 6 ช่องจะกินพื้นที่เกือบทั้งจอ ต้องเลื่อนยาวโดยไม่จำเป็น
                ส่วนช่องข้อความยาวยังเต็มความกว้างเพราะต้องพิมพ์หลายบรรทัด */}
            <div className="grid grid-cols-1 gap-x-5 gap-y-5 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
              {section.fields.map((field) => {
                const fieldIssues = (issuesByField.get(field.name) ?? []).filter(
                  // warning โชว์ทันที error โชว์หลังกดบันทึกครั้งแรก หรือเมื่อช่องมีค่าแล้ว
                  (i) => i.level === "warning" || submitted || (values[field.name] ?? "") !== "",
                );
                const bad = fieldIssues.some((i) => i.level === "error");
                return (
                  <div
                    key={field.name}
                    className={`${field.kind === "area" ? "sm:col-span-2 lg:col-span-3" : ""} ${
                      bad ? "[&_.input]:border-red-400" : ""
                    }`}
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

                    {fieldIssues.map((i) => (
                      <span
                        key={i.message}
                        role={i.level === "error" ? "alert" : undefined}
                        className={`mt-1 block text-sm ${i.level === "error" ? "text-red-700" : "text-warn-600"}`}
                      >
                        {i.level === "error" ? "✕ " : "⚠ "}
                        {i.message}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="sticky bottom-0 -mx-4 border-t border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        {error ? <p className="alert alert-error mb-3">{error}</p> : null}

        {submitted && errors.length > 0 ? (
          <p className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-red-700">
            ต้องแก้ก่อน:
            {errors.map((e) => (
              <button key={e.field + e.message} type="button" className="underline" onClick={() => jumpTo(e.field)}>
                {fieldLabel(e.field)}
              </button>
            ))}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
            4
          </span>
          <button type="button" onClick={onReview} disabled={busy !== null} className="btn btn-primary">
            {busy === "review" ? "กำลังตรวจ… (อาจใช้เวลาสักครู่)" : "บันทึกและตรวจด้วย AI"}
          </button>

          <button type="button" onClick={onSave} disabled={busy !== null} className="btn">
            {busy === "save" ? "กำลังบันทึก…" : "บันทึกร่าง"}
          </button>

          <button type="button" onClick={onGenerate} disabled={busy !== null} className="btn">
            {busy === "generate" ? "กำลังสร้าง…" : "สร้างเอกสาร .docx"}
          </button>

          {message ? <span className="text-emerald-700">✓ {message}</span> : null}

          {audit ? (
            <span className="ms-auto text-sm text-zinc-600">
              ประเมินเบื้องต้น{" "}
              <strong className="tabular text-zinc-900">
                {audit.totalScore}/{audit.maxScore}
              </strong>
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-sm text-zinc-500">
          &ldquo;บันทึกและตรวจด้วย AI&rdquo; = บันทึก + สร้างเอกสาร + ให้คะแนนจริงตามเกณฑ์ ·
          &ldquo;บันทึกร่าง&rdquo; = เก็บไว้กรอกต่อทีหลัง · ระบบไม่เติมข้อความแทนช่องที่ว่าง
        </p>
      </div>
    </div>
  );
}
