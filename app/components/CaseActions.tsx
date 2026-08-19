"use client";

// แก้ชื่อเรื่อง / ลบเคส — แสดงเฉพาะคนที่มีสิทธิ์แก้ (เจ้าของ หรือผู้ดูแลระบบ)
//
// ⚠️ ซ่อนปุ่มไม่ใช่การป้องกัน — ฝั่ง API ตรวจความเป็นเจ้าของซ้ำเสมอ
//    ตรงนี้แค่ไม่เอาปุ่มที่กดไปก็โดนปฏิเสธมาให้เกะกะ

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  caseId: string;
  caseNumber: string;
  initialTitle: string;
};

export default function CaseActions({ caseId, caseNumber, initialTitle }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error ?? "บันทึกไม่สำเร็จ");
        return;
      }

      setSaved(true);
      setEditing(false);
      router.refresh();
    } catch {
      setError("ติดต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    // ให้พิมพ์เลขที่เคสยืนยัน — ลบเคสคือลบเอกสารและผลตรวจทั้งหมดไปด้วย
    // กด confirm เฉยๆ พลาดง่ายเกินไปสำหรับงานที่กู้คืนไม่ได้
    const typed = prompt(
      `ลบเคสนี้ทั้งใบ พร้อมเอกสารและผลตรวจทั้งหมด — กู้คืนไม่ได้\n\n` +
        `พิมพ์เลขที่เคส "${caseNumber}" เพื่อยืนยัน:`,
    );
    if (typed === null) return;
    if (typed.trim() !== caseNumber) {
      setError("เลขที่เคสไม่ตรง — ยกเลิกการลบแล้ว");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/cases/${caseId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error ?? "ลบไม่สำเร็จ");
        return;
      }

      router.push("/");
    } catch {
      setError("ติดต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {editing ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className="label" htmlFor="case-title">
              ชื่อเรื่องของเคส
            </label>
            <input
              id="case-title"
              className="input"
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              placeholder="เช่น ตรวจ OPD ไตรมาส 3"
            />
          </div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setTitle(initialTitle);
              setEditing(false);
              setError(null);
            }}
          >
            ยกเลิก
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
            แก้ชื่อเรื่อง
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={busy}
            onClick={remove}
          >
            ลบเคสนี้
          </button>
        </div>
      )}

      {error ? <p className="alert alert-error">{error}</p> : null}
      {saved ? <p className="alert alert-ok">บันทึกแล้ว</p> : null}
    </div>
  );
}
