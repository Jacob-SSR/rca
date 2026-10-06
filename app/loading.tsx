// app/loading.tsx — หน้ารอโหลดระหว่างเปลี่ยนหน้า
// โชว์ทันทีที่กดลิงก์ (Next prefetch ไว้แล้ว) ขณะที่ server กำลังดึงข้อมูลของหน้าใหม่
// เป็นโครงร่าง (skeleton) ให้เห็นว่ากำลังมา แทนจอค้างเฉยๆ

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="กำลังโหลด">
      <div className="flex items-center gap-4">
        <div className="relative grid size-12 place-items-center">
          <span className="absolute inset-0 animate-spin rounded-2xl border-[3px] border-brand-100 border-t-brand-500" />
          <span className="size-5 animate-pulse rounded-lg bg-gradient-to-br from-brand-500 to-cyan-glow" />
        </div>
        <div className="space-y-2">
          <div className="skeleton h-6 w-64" />
          <div className="skeleton h-4 w-96 max-w-[60vw]" />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card card-pad space-y-3">
            <div className="flex items-center gap-3">
              <div className="skeleton size-11 rounded-xl" />
              <div className="skeleton h-5 w-48" />
            </div>
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-4/5" />
            <div className="skeleton mt-4 h-10 w-36 rounded-xl" />
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="skeleton h-5 w-40" />
        </div>
        <div className="divide-y divide-zinc-100">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-6 px-6 py-4" style={{ opacity: 1 - i * 0.18 }}>
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-4 w-28" />
              <div className="skeleton ml-auto h-7 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">กำลังโหลด…</span>
    </div>
  );
}
