// app/forms/new/page.tsx — สร้างฟอร์มใหม่

import Link from "next/link";
import RecordFormEditor from "@/app/components/RecordFormEditor";

export const dynamic = "force-dynamic";

export default function NewFormPage() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-sm text-blue-700 underline">
          ← กลับหน้าแรก
        </Link>
        <h1 className="mt-2 text-xl font-semibold">บันทึกเวชระเบียนใหม่</h1>
        <p className="text-sm text-zinc-600">
          หัวข้อในฟอร์มตรงกับเกณฑ์ สนย. ทั้ง 6 ข้อ กรอกครบ = มีข้อมูลพอให้ได้ 17 คะแนน
        </p>
      </div>

      <RecordFormEditor initial={{}} />
    </div>
  );
}
