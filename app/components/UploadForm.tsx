"use client";

// ฟอร์มอัปโหลดเอกสาร → เรียก POST /api/review → เด้งไปหน้าผลตรวจ
//
// เลือกไฟล์ได้ทุกชนิด แต่ตรวจคะแนนได้เฉพาะไฟล์ที่สกัดข้อความออกมาได้
// ถ้าเลือกชนิดที่อ่านไม่ได้ ฝั่งเซิร์ฟเวอร์จะตอบกลับมาว่าต้องแปลงเป็นอะไรก่อน
// — บอกตอนกดส่งดีกว่าไปกรองที่ accept แล้วผู้ใช้งงว่าทำไมเลือกไฟล์ไม่ได้

import { useRef, useState, type FormEvent } from "react";
import Icon from "@/app/components/Icon";
import ReviewDialogs, { readReviewResponse, type ReviewOutcome } from "@/app/components/ReviewDialogs";

type Props = {
  /** ถ้าส่งมา = อัปโหลดเข้าเคสเดิม, ไม่ส่ง = ให้ API สร้างเคสใหม่ */
  caseId?: string;
};

export default function UploadForm({ caseId }: Props) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOutcome(null);

    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("กรุณาเลือกไฟล์ก่อน");
      return;
    }
    if (caseId) form.set("caseId", caseId);

    setBusy(true);
    try {
      const res = await fetch("/api/review", { method: "POST", body: form });
      const json = await res.json().catch(() => null);

      // ตรวจเสร็จ → popup คะแนน (มีคำเตือนตอนอ่านไฟล์ก็แสดงใน popup ก่อนกดไปดูผล)
      // โควตา AI หมด → popup นับถอยหลังถึงเวลารีเซ็ต
      const r = readReviewResponse(res, json);
      if (r.kind === "error") {
        setError(r.message);
        return;
      }
      setOutcome(r);
      if (r.kind === "done") {
        setFileName(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card card-pad card-hover group flex flex-col">
      <div className="flex items-center gap-3">
        <span className="icon-orb icon-orb-lg transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110">
          <Icon name="upload" size={26} />
        </span>
        <h2 className="text-xl font-semibold">อัปโหลดเอกสารที่มีอยู่แล้ว</h2>
      </div>
      <p className="mt-3 text-zinc-600">
        เลือกไฟล์อะไรก็ได้ ระบบจะปิดบังข้อมูลระบุตัวบุคคล (ชื่อ, HN,
        เลขบัตรประชาชน, ที่อยู่, เบอร์โทร) ก่อนส่งเข้าประมวลผลเสมอ
      </p>
      <p className="hint mt-1">
        ตรวจคะแนนอัตโนมัติได้กับ <strong>.docx</strong>, <strong>.pdf ที่มีข้อความ</strong>{" "}
        และไฟล์ข้อความ · ไฟล์รูปหรือ PDF ที่สแกนเป็นรูปยังอ่านไม่ได้ (ระบบไม่มี OCR)
      </p>

      {/* ลากไฟล์มาวางได้ หรือคลิกเลือก */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = e.dataTransfer.files;
          if (files.length > 0 && inputRef.current) {
            inputRef.current.files = files;
            setFileName(files[0].name);
          }
        }}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition duration-300 ${
          dragging
            ? "scale-[1.02] border-brand-500 bg-brand-50/70 shadow-[0_0_40px_-10px] shadow-brand-500"
            : fileName
              ? "border-emerald-600/60 bg-emerald-50/50"
              : "border-zinc-300 hover:border-brand-500 hover:bg-brand-50/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          name="file"
          // ไม่จำกัดชนิดที่นี่ — ให้เลือกได้ทุกไฟล์แล้วไปบอกเหตุผลตอนส่ง
          className="sr-only"
          disabled={busy}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <span
          className={`grid size-11 place-items-center rounded-full transition ${
            fileName ? "bg-emerald-600 text-on-brand" : "bg-zinc-100 text-brand-400 group-hover:animate-bounce"
          }`}
        >
          <Icon name={fileName ? "fileText" : "upload"} size={22} />
        </span>
        <span className={fileName ? "font-medium break-all text-zinc-800" : "text-zinc-500"}>
          {fileName ?? (dragging ? "ปล่อยไฟล์ตรงนี้เลย" : "คลิกเพื่อเลือกไฟล์ หรือลากมาวาง")}
        </span>
      </label>

      <button type="submit" disabled={busy} className="btn btn-primary mt-4 self-start">
        {busy ? (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Icon name="sparkles" />
        )}
        {busy ? "กำลังตรวจ… (อาจใช้เวลาสักครู่)" : "ตรวจเอกสาร"}
      </button>

      {error ? (
        <p role="alert" className="alert alert-error animate-rise mt-4 flex items-start gap-2">
          <Icon name="alert" className="mt-1" />
          {error}
        </p>
      ) : null}

      <ReviewDialogs busy={busy} outcome={outcome} onClose={() => setOutcome(null)} />
    </form>
  );
}
