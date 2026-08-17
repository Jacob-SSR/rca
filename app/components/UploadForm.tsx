"use client";

// ฟอร์มอัปโหลด DOCX → เรียก POST /api/review → เด้งไปหน้าผลตรวจ

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Props = {
  /** ถ้าส่งมา = อัปโหลดเข้าเคสเดิม, ไม่ส่ง = ให้ API สร้างเคสใหม่ */
  caseId?: string;
};

export default function UploadForm({ caseId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("กรุณาเลือกไฟล์ .docx ก่อน");
      return;
    }
    if (caseId) form.set("caseId", caseId);

    setBusy(true);
    try {
      const res = await fetch("/api/review", { method: "POST", body: form });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error ?? `เกิดข้อผิดพลาด (${res.status})`);
        return;
      }

      router.push(`/reviews/${json.reviewId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card card-pad flex flex-col">
      <h2 className="text-xl font-semibold">อัปโหลดเอกสารที่มีอยู่แล้ว</h2>
      <p className="mt-2 text-zinc-600">
        มีไฟล์ .docx อยู่แล้วก็ส่งตรวจได้เลย ระบบจะปิดบังข้อมูลระบุตัวบุคคล
        (ชื่อ, HN, เลขบัตรประชาชน, ที่อยู่, เบอร์โทร) ก่อนส่งเข้าประมวลผลเสมอ
      </p>

      <label className="mt-4 flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed border-zinc-300 px-4 py-6 text-center transition hover:border-brand-500 hover:bg-brand-50/40">
        <input
          type="file"
          name="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          disabled={busy}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <span className={fileName ? "font-medium text-zinc-800" : "text-zinc-500"}>
          {fileName ?? "คลิกเพื่อเลือกไฟล์ .docx"}
        </span>
      </label>

      <button type="submit" disabled={busy} className="btn btn-primary mt-4 self-start">
        {busy ? "กำลังตรวจ… (อาจใช้เวลาสักครู่)" : "ตรวจเอกสาร"}
      </button>

      {error ? <p className="alert alert-error mt-4">{error}</p> : null}
    </form>
  );
}
