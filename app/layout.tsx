import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RCA — ตรวจคุณภาพการบันทึกข้อมูลผู้ป่วยนอก",
  description: "ระบบช่วยตรวจคุณภาพเอกสาร OPD ตามเกณฑ์ สนย. (Form A1) โรงพยาบาลพลับพลาชัย",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold">
              RCA · ตรวจคุณภาพบันทึก OPD
            </Link>
            <span className="text-xs text-zinc-500">Form A1 (สนย. 2558)</span>
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
