"use client";

// ไทม์ไลน์ลำดับเหตุการณ์แนวตั้ง — อ่านจากบนลงล่างตามเวลา แบ่งหัวข้อตามวัน
//
// ทำไมไม่ใช้แกนเวลาแนวนอนแบบเดิม: เหตุการณ์ในเคสเดียวมีทั้งประวัติเก่า (วัคซีนเมื่อปีก่อน)
// และเหตุการณ์วันมารับบริการที่ห่างกันไม่กี่นาที วางบนแกนเดียวจุดจะกองชิดขอบ
// ช่วงรอได้เป็นหมื่นชั่วโมงและป้ายทับกันอ่านไม่ออก
// แนวตั้งแต่ละเหตุการณ์มีแถวของตัวเอง ระยะห่างบอกด้วยข้อความเสมอ
// ความยาวเส้นเชื่อมยาวขึ้นตามเวลาที่รอ (สเกล log มีเพดาน) พอให้กะได้ด้วยตา
//
// สิ่งที่คนทำ RCA ต้องการดูคือ "รออะไรนานตรงไหน"
//   ห่าง ≥ gapWarnMin แต่ไม่ถึงวัน → สีเตือน + ป้าย "รอ …"
//   ห่างตั้งแต่ 1 วัน → เส้นประสีเทา "ห่าง … วัน" (ประวัติคนละครั้ง ไม่ใช่การรอ)
// ไม่ใช้สีอย่างเดียวบอกความหมาย — มีข้อความกำกับทุกช่วง

import { Fragment, useMemo } from "react";
import Icon from "@/app/components/Icon";

type Event = { eventTime: string; title: string };

type Props = {
  events: Event[];
  /** ห่างจากเหตุการณ์ก่อนหน้าเกินกี่นาทีถึงจะเตือน */
  gapWarnMin?: number;
};

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function parse(local: string): number | null {
  if (!local) return null;
  const t = new Date(local).getTime();
  return Number.isNaN(t) ? null : t;
}

function hhmm(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const dayKey = (t: number) => new Date(t).toDateString();

function thaiDate(t: number): string {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(t));
}

function thaiDay(t: number): string {
  return new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(t),
  );
}

/**
 * 125 นาที → "2 ชม. 5 นาที" · ตั้งแต่ 1 วัน → "3 วัน 4 ชม." (ไม่ลงนาที)
 * ตั้งแต่ 30 วัน → "9 เดือน 13 วัน" · ตั้งแต่ 365 วัน → "5 ปี 8 เดือน" (ประมาณ เดือนละ 30 วัน)
 */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 60000);
  const days = Math.floor(total / (24 * 60));
  if (days >= 365) {
    const y = Math.floor(days / 365);
    const mo = Math.floor((days % 365) / 30);
    return mo === 0 ? `${y} ปี` : `${y} ปี ${mo} เดือน`;
  }
  if (days >= 30) {
    const mo = Math.floor(days / 30);
    const d = days % 30;
    return d === 0 ? `${mo} เดือน` : `${mo} เดือน ${d} วัน`;
  }
  if (total >= 24 * 60) {
    const d = Math.floor(total / (24 * 60));
    const h = Math.floor((total % (24 * 60)) / 60);
    return h === 0 ? `${d} วัน` : `${d} วัน ${h} ชม.`;
  }
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

/** ความยาวเส้นเชื่อม (px) ตามเวลาที่ห่าง — log เพื่อให้นาทีกับชั่วโมงต่างกันพอเห็น แต่ไม่ยาวเกิน */
function railLength(gapMs: number): number {
  const minutes = gapMs / MIN;
  return Math.round(Math.min(72, 14 + 12 * Math.log2(1 + minutes / 5)));
}

export default function TimelineChart({ events, gapWarnMin = 30 }: Props) {
  const data = useMemo(() => {
    const timed = events
      .map((e) => ({ title: e.title.trim(), t: parse(e.eventTime) }))
      .filter((e): e is { title: string; t: number } => e.t !== null && e.title !== "")
      .sort((a, b) => a.t - b.t);
    const untimed = events.filter((e) => e.title.trim() !== "" && parse(e.eventTime) === null);
    if (timed.length === 0) return null;

    const rows = timed.map((e, i) => {
      const gap = i === 0 ? 0 : e.t - timed[i - 1].t;
      const newDay = i === 0 || dayKey(e.t) !== dayKey(timed[i - 1].t);
      return {
        ...e,
        gap,
        newDay,
        /** ห่างข้ามวันจากเหตุการณ์ก่อน — ไม่ใช่ "การรอ" */
        apart: i > 0 && gap >= DAY,
        longGap: i > 0 && gap >= gapWarnMin * MIN && gap < DAY,
      };
    });

    // วันล่าสุด = วันมารับบริการโดยมาก — สรุปเวลาของวันนั้นแยกให้เห็น
    const last = timed[timed.length - 1].t;
    const lastDay = timed.filter((e) => dayKey(e.t) === dayKey(last));

    return {
      rows,
      untimed,
      first: timed[0].t,
      days: new Set(timed.map((e) => dayKey(e.t))).size,
      lastDay: { from: lastDay[0].t, to: last, count: lastDay.length },
      longGaps: rows.filter((r) => r.longGap).length,
    };
  }, [events, gapWarnMin]);

  if (!data) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-zinc-500">
        ใส่เวลาให้เหตุการณ์อย่างน้อย 1 รายการ แล้วลำดับเหตุการณ์จะขึ้นที่นี่
      </p>
    );
  }

  return (
    <figure className="space-y-4">
      {/* ── ตัวเลขสรุป ── */}
      <div className="flex flex-wrap gap-2">
        <span className="badge tabular">
          <Icon name="activity" size={14} />
          {data.rows.length} เหตุการณ์
        </span>
        {data.days > 1 ? (
          <span className="badge tabular">
            <Icon name="calendar" size={14} />
            {thaiDate(data.first)} – {thaiDate(data.lastDay.to)}
          </span>
        ) : null}
        <span className="badge badge-brand tabular">
          <Icon name="clock" size={14} />
          {data.days > 1 ? "วันล่าสุด " : ""}
          {hhmm(data.lastDay.from)}–{hhmm(data.lastDay.to)} น.
          {data.lastDay.count > 1 ? ` · ${formatDuration(data.lastDay.to - data.lastDay.from)}` : ""}
        </span>
        {data.longGaps > 0 ? (
          <span className="badge tabular bg-warn-50 text-warn-600 ring-amber-200">
            <Icon name="alert" size={14} />
            รอนาน ≥ {gapWarnMin} นาที {data.longGaps} ช่วง
          </span>
        ) : null}
      </div>

      <ol className="relative">
        {data.rows.map((r, i) => (
          <Fragment key={i}>
            {/* ช่วงห่างจากเหตุการณ์ก่อนหน้า — วางบนเส้นแกนเดียวกับจุด */}
            {i > 0 ? (
              <li aria-hidden className="grid grid-cols-[3.5rem_1.75rem_1fr] items-center gap-x-3">
                <span />
                <span className="flex justify-center">
                  <span
                    className={`w-0.5 rounded-full ${
                      r.apart
                        ? "border-l-2 border-dashed border-zinc-300 bg-transparent"
                        : r.longGap
                          ? "bg-warn-600"
                          : "bg-brand-200"
                    }`}
                    style={{ height: r.apart ? 28 : railLength(r.gap) }}
                  />
                </span>
                <span
                  className={`tabular text-xs ${
                    r.apart ? "text-zinc-400" : r.longGap ? "font-semibold text-warn-600" : "text-zinc-400"
                  }`}
                >
                  {r.apart ? `ห่าง ${formatDuration(r.gap)}` : r.gap === 0 ? "เวลาเดียวกัน" : `${r.longGap ? "⚠ รอ " : "+"}${formatDuration(r.gap)}`}
                </span>
              </li>
            ) : null}

            {/* หัววัน — หลังช่วงห่าง ให้ป้าย "ห่าง … วัน" อยู่ระหว่างสองวัน */}
            {r.newDay ? (
              <li className={`flex items-center gap-2 ${i === 0 ? "" : "mt-1 mb-1"}`}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-0.5 text-sm font-medium text-zinc-600 ring-1 ring-zinc-200">
                  <Icon name="calendar" size={14} />
                  {thaiDay(r.t)}
                </span>
              </li>
            ) : null}

            {/* เหตุการณ์ */}
            <li
              className="group grid grid-cols-[3.5rem_1.75rem_1fr] items-start gap-x-3 rounded-xl py-1 transition-colors hover:bg-brand-50/60"
              aria-label={`${hhmm(r.t)} ${r.title}${i > 0 ? ` (ห่างจากก่อนหน้า ${formatDuration(r.gap)})` : ""}`}
            >
              <span className="tabular pt-0.5 text-right font-semibold text-zinc-700">{hhmm(r.t)}</span>
              <span className="flex justify-center pt-1.5">
                <span
                  className={`size-3.5 rounded-full ring-4 transition-transform group-hover:scale-125 ${
                    r.longGap ? "bg-warn-600 ring-warn-50" : "bg-brand-600 ring-brand-50"
                  }`}
                />
              </span>
              <span className="min-w-0 pt-0.5 break-words text-zinc-800">{r.title}</span>
            </li>
          </Fragment>
        ))}
      </ol>

      <figcaption className="text-sm text-zinc-500">
        เรียงจากเก่าไปใหม่ · ตัวเลขระหว่างจุดคือเวลาที่ห่างจากเหตุการณ์ก่อนหน้า · ห่างตั้งแต่ 1 วันขึ้นไปเป็นเส้นประ
        {data.untimed.length > 0
          ? ` · มี ${data.untimed.length} เหตุการณ์ที่ยังไม่ใส่เวลา จึงไม่แสดงที่นี่`
          : ""}
      </figcaption>
    </figure>
  );
}
