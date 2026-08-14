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
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("กรุณาเลือกไฟล์ .docx");
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
    <form onSubmit={onSubmit} className="rounded border border-zinc-200 bg-white p-4">
      <h2 className="mb-2 font-semibold">อัปโหลดเอกสาร (.docx)</h2>
      <p className="mb-3 text-sm text-zinc-600">
        ระบบจะปิดบังข้อมูลระบุตัวบุคคล (ชื่อ, HN, เลขบัตรประชาชน, ที่อยู่, เบอร์โทร)
        ก่อนส่งเข้าประมวลผลเสมอ
      </p>

      <input
        type="file"
        name="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="block w-full text-sm"
        disabled={busy}
      />

      <button
        type="submit"
        disabled={busy}
        className="mt-3 rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? "กำลังตรวจ… (อาจใช้เวลาสักครู่)" : "ตรวจเอกสาร"}
      </button>

      {error ? (
        <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>
      ) : null}
    </form>
  );
}
