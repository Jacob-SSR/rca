// app/animation/page.tsx — หน้าดูและตรวจ animation ของน้องผู้ตรวจ (sprite sheet)
// ทุกคนที่ล็อกอินเปิดได้ (proxy บังคับล็อกอินทุก path อยู่แล้ว)

import PageHeader from "@/app/components/PageHeader";
import AnimationPreview from "@/app/components/AnimationPreview";

export const metadata = { title: "Animation น้องผู้ตรวจ — MRA" };

export default function AnimationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon="sparkles"
        back={{ href: "/", label: "กลับหน้าแรก" }}
        title="Animation น้องผู้ตรวจ"
        subtitle={<p>ดู sprite sheet ทีละท่า หยุด/เลื่อนทีละเฟรมเพื่อตรวจมือ หน้า ผม และชุดก่อนนำไปใช้</p>}
      />
      <AnimationPreview />
    </div>
  );
}
