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
      <body className="flex min-h-full flex-col bg-zinc-100 text-zinc-900">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-600 text-lg font-bold text-white">
                R
              </span>
              <span className="leading-tight">
                <span className="block text-lg font-semibold">ตรวจคุณภาพบันทึก OPD</span>
                <span className="block text-sm text-zinc-500">
                  เกณฑ์ Form A1 · สนย. 2558
                </span>
              </span>
            </Link>

            {session ? <UserBar name={session.name} role={session.role} /> : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>

        <footer className="border-t border-zinc-200 bg-white px-4 py-5 text-center text-sm text-zinc-500">
          ระบบภายในโรงพยาบาลพลับพลาชัย — คะแนนตัดสินโดย Rule Engine ตามเกณฑ์ ไม่ใช่ดุลยพินิจของ AI
        </footer>
      </body>
    </html>
  );
}
