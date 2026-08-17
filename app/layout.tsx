import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSession } from "@/lib/auth/session";
import UserBar from "@/app/components/UserBar";

export const metadata: Metadata = {
  title: "RCA — ตรวจคุณภาพการบันทึกข้อมูลผู้ป่วยนอก",
  description: "ระบบช่วยตรวจคุณภาพเอกสาร OPD ตามเกณฑ์ สนย. (Form A1) โรงพยาบาลพลับพลาชัย",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();

  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="font-semibold">
              RCA · ตรวจคุณภาพบันทึก OPD
            </Link>
            <div className="flex items-center gap-4">
              <span className="hidden text-xs text-zinc-500 sm:inline">
                Form A1 (สนย. 2558)
              </span>
              {session ? <UserBar name={session.name} role={session.role} /> : null}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-zinc-200 bg-white px-4 py-3 text-center text-xs text-zinc-500">
          ระบบภายในโรงพยาบาลพลับพลาชัย — คะแนนตัดสินโดย Rule Engine ตามเกณฑ์ ไม่ใช่ดุลยพินิจของ AI
        </footer>
      </body>
    </html>
  );
}
