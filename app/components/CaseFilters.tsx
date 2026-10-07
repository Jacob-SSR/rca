"use client";

// ตัวกรองรายการเคสบนหน้าแรก — แผนกที่สร้าง + เฉพาะของฉัน
// เก็บใน query string (?dep=…&mine=1) จะได้แชร์ลิงก์/กดย้อนกลับได้ และหน้า server กรองให้เลย

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import Icon from "@/app/components/Icon";

export default function CaseFilters({ departments }: { departments: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const dep = params.get("dep") ?? "";
  const mine = params.get("mine") === "1";

  function update(next: { dep?: string; mine?: boolean }) {
    const q = new URLSearchParams(params.toString());
    const d = next.dep ?? dep;
    const m = next.mine ?? mine;
    if (d) q.set("dep", d);
    else q.delete("dep");
    if (m) q.set("mine", "1");
    else q.delete("mine");
    start(() => router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false }));
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <div className="flex rounded-full bg-zinc-100 p-0.5 ring-1 ring-zinc-200" role="radiogroup" aria-label="เคสของใคร">
        {[
          [false, "ทั้งหมด"],
          [true, "ของฉัน"],
        ].map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={mine === v}
            onClick={() => update({ mine: v as boolean })}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              mine === v ? "bg-white text-brand-700 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {label as string}
          </button>
        ))}
      </div>

      <label className="relative">
        <span className="sr-only">กรองตามแผนก</span>
        <Icon name="layers" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
        <select
          className="input w-auto max-w-64 cursor-pointer rounded-full py-1.5 pr-8 pl-9 text-sm"
          value={dep}
          onChange={(e) => update({ dep: e.target.value })}
        >
          <option value="">ทุกแผนก</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
