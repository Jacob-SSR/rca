// app/no-access/page.tsx — ล็อกอินแล้วแต่ role ยังไม่มีสิทธิ์ในส่วนที่ขอ

import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { capabilitiesForRole } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const session = await getSession();
  const capabilities = capabilitiesForRole(session?.role);

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="mb-2 text-xl font-semibold">ไม่มีสิทธิ์เข้าถึงส่วนนี้</h1>

      {session ? (
        <p className="mb-4 text-sm text-zinc-600">
          บัญชี <span className="font-medium">{session.name}</span> มีสิทธิ์{" "}
          <span className="font-medium">{session.role}</span>
          {capabilities.length === 0
            ? " ซึ่งยังไม่ได้รับสิทธิ์ใช้งานระบบนี้"
            : ` (${capabilities.join(", ")})`}
        </p>
      ) : null}

      <p className="mb-4 text-sm text-zinc-600">
        ถ้าคิดว่าควรเข้าได้ กรุณาติดต่อผู้ดูแลระบบเพื่อตั้งสิทธิ์ให้บัญชีนี้
      </p>

      <Link href="/" className="text-sm text-blue-700 underline">
        ← กลับหน้าแรก
      </Link>
    </div>
  );
}
