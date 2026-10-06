// app/forms/new/page.tsx — สร้างฟอร์มใหม่

import RecordFormEditor from "@/app/components/RecordFormEditor";
import PageHeader from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

export default function NewFormPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        icon="filePlus"
        back={{ href: "/", label: "กลับหน้าแรก" }}
        title="บันทึกเวชระเบียนใหม่"
        subtitle="หัวข้อในฟอร์มตรงกับเกณฑ์ สนย. ทั้ง 6 ข้อ กรอกครบ = มีข้อมูลพอให้ได้ 17 คะแนน"
      />

      <RecordFormEditor initial={{}} />
    </div>
  );
}
