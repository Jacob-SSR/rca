import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import "./globals.css";
import { getSession } from "@/lib/auth/session";
import UserBar from "@/app/components/UserBar";
import NavLinks from "@/app/components/NavLinks";
import ThemeToggle from "@/app/components/ThemeToggle";
import Cosmos from "@/app/components/Cosmos";
import Spotlight from "@/app/components/Spotlight";
import OrbitLogo from "@/app/components/OrbitLogo";
import Icon from "@/app/components/Icon";
import { hasCapability } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "RCA — ตรวจคุณภาพการบันทึกข้อมูลผู้ป่วยนอก",
  description: "ระบบช่วยตรวจคุณภาพเอกสาร OPD ตามเกณฑ์ สนย. (Form A1) โรงพยาบาลพลับพลาชัย",
};

export const viewport: Viewport = {
  themeColor: "#070a1f",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  const theme = (await cookies()).get("rca-theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="th" data-theme={theme} className="h-full antialiased">
      <body className="flex min-h-full flex-col text-zinc-900">
        <Cosmos />
        <Spotlight />

        <header className="sticky top-0 z-30 border-b border-zinc-200/60 bg-surface/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5 sm:flex-nowrap sm:px-6">
            <Link href="/" className="group flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
              <OrbitLogo size={46} className="shrink-0 transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-lg font-bold tracking-tight">
                  ตรวจคุณภาพบันทึก <span className="text-cosmic">OPD</span>
                </span>
                <span className="block truncate text-sm text-zinc-500">
                  เกณฑ์ Form A1 · สนย. 2558
                </span>
              </span>
            </Link>

            {/* มือถือ: เมนูลงไปเป็นแถวที่สองเต็มความกว้าง */}
            {session ? (
              <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto">
                <NavLinks canManage={hasCapability(session.role, "manage")} />
              </div>
            ) : null}

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              <ThemeToggle initial={theme} />
              {session ? <UserBar name={session.name} role={session.role} /> : null}
            </div>
          </div>
          {/* เส้นแสงใต้แถบเมนู */}
          <div aria-hidden className="h-px bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>

        <footer className="border-t border-zinc-200/60 bg-surface/60 px-4 py-5 text-center text-sm text-zinc-500 backdrop-blur">
          <span className="inline-flex items-center gap-2">
            <Icon name="shield" className="text-brand-400" />
            ระบบภายในโรงพยาบาลพลับพลาชัย — คะแนนตัดสินโดย Rule Engine ตามเกณฑ์ ไม่ใช่ดุลยพินิจของ AI
          </span>
        </footer>
      </body>
    </html>
  );
}
