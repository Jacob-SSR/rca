// app/no-access/page.tsx — ล็อกอินแล้วแต่ role ยังไม่มีสิทธิ์ในส่วนที่ขอ

import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { capabilitiesForRole } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const session = await getSession();
  const capabilities = capabilitiesForRole(session?.role);

  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="card card-pad text-center">
        <h1 className="text-2xl font-semibold">ไม่มีสิทธิ์เข้าถึงส่วนนี้</h1>

        {session ? (
          <p className="mt-4 text-zinc-600">
            บัญชี <span className="font-medium text-zinc-900">{session.name}</span> มีสิทธิ์{" "}
            <span className="badge badge-brand">{session.role}</span>
            {capabilities.length === 0
              ? " ซึ่งยังไม่ได้รับสิทธิ์ใช้งานระบบนี้"
              : ` (${capabilities.join(", ")})`}
          </p>
        ) : null}

        <p className="mt-3 text-zinc-600">
          ถ้าคิดว่าควรเข้าได้ กรุณาติดต่อผู้ดูแลระบบเพื่อตั้งสิทธิ์ให้บัญชีนี้
        </p>

        <Link href="/" className="btn mt-6">
          กลับหน้าแรก
        </Link>
      </div>
    </div>
  );
}
