"use client";

// กราฟลำดับเหตุการณ์ตามชั่วโมง — แกน x คือเวลาจริง แต่ละแถวคือหนึ่งเหตุการณ์
//
// ทำไมไม่ใช่จุดบนเส้นเดียว: เหตุการณ์ใน ER มักห่างกันไม่กี่นาที (10:05, 10:05, 10:06)
// วางบนเส้นเดียวป้ายจะทับกันอ่านไม่ออก — แยกแถวแล้วยังเห็น "ช่องว่างของเวลา"
// ซึ่งคือสิ่งที่คนทำ RCA ต้องการดู (รออะไรนานตรงไหน)
//
// สีเดียว (brand) เพราะมีชุดข้อมูลเดียว ช่วงที่รอนานใช้สีเตือนพร้อมป้ายข้อความ
// ไม่ใช้สีอย่างเดียวบอกความหมาย

import { useMemo, useState } from "react";

type Event = { eventTime: string; title: string };

type Props = {
  events: Event[];
  /** ห่างจากเหตุการณ์ก่อนหน้าเกินกี่นาทีถึงจะเตือน */
  gapWarnMin?: number;
};

const HOUR = 60 * 60 * 1000;

function parse(local: string): number | null {
  if (!local) return null;
  const t = new Date(local).getTime();
  return Number.isNaN(t) ? null : t;
}

function hhmm(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 125 นาที → "2 ชม. 5 นาที" */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

export default function TimelineChart({ events, gapWarnMin = 30 }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(() => {
    const timed = events
      .map((e) => ({ title: e.title.trim(), t: parse(e.eventTime) }))
      .filter((e): e is { title: string; t: number } => e.t !== null && e.title !== "")
      .sort((a, b) => a.t - b.t);
    const untimed = events.filter((e) => e.title.trim() !== "" && parse(e.eventTime) === null);

    if (timed.length === 0) return null;

    const first = timed[0].t;
    const last = timed[timed.length - 1].t;
    // ขยายแกนให้ลงชั่วโมงเต็มทั้งสองข้าง — อ่านเวลาจากเส้นกริดได้ทันที
    const start = Math.floor(first / HOUR) * HOUR;
    const end = Math.max(Math.ceil(last / HOUR) * HOUR, start + HOUR);
    const span = end - start;

    const ticks: number[] = [];
    for (let t = start; t <= end; t += HOUR) ticks.push(t);
    // ช่วงสั้น (≤ 4 ชม.) ใส่เส้นย่อยทุก 15 นาทีให้กะเวลาได้ละเอียดขึ้น
    const minor: number[] = [];
    if (span <= 4 * HOUR) {
      for (let t = start; t < end; t += HOUR / 4) if ((t - start) % HOUR !== 0) minor.push(t);
    }

    const rows = timed.map((e, i) => {
      const gap = i === 0 ? 0 : e.t - timed[i - 1].t;
      return {
        ...e,
        x: ((e.t - start) / span) * 100,
        prevX: i === 0 ? null : ((timed[i - 1].t - start) / span) * 100,
        gap,
        longGap: i > 0 && gap >= gapWarnMin * 60000,
        elapsed: e.t - first,
      };
    });

    const dayChanges = new Date(first).toDateString() !== new Date(last).toDateString();

    return {
      rows,
      untimed,
      ticks,
      minor,
      start,
      span,
      total: last - first,
      longGaps: rows.filter((r) => r.longGap).length,
      dayChanges,
    };
  }, [events, gapWarnMin]);

  if (!data) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-zinc-500">
        ใส่เวลาให้เหตุการณ์อย่างน้อย 1 รายการ แล้วกราฟจะขึ้นที่นี่
      </p>
    );
  }

  const pos = (t: number) => ((t - data.start) / data.span) * 100;

  return (
    <figure className="space-y-3">
      {/* ── ตัวเลขสรุป ── */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-base">
        <span className="text-zinc-600">
          รวมทั้งหมด <strong className="tabular text-zinc-900">{formatDuration(data.total)}</strong>
        </span>
        <span className="text-zinc-600">
          <strong className="tabular text-zinc-900">{data.rows.length}</strong> เหตุการณ์
        </span>
        {data.longGaps > 0 ? (
          <span className="text-warn-600">
            ⚠ ช่วงที่ห่างกัน ≥ {gapWarnMin} นาที{" "}
            <strong className="tabular">{data.longGaps}</strong> ช่วง
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div className="relative min-w-[560px] pb-1 pe-6 ps-[12rem]">
          {/* ── แกนเวลา (บน) ── */}
          <div className="relative h-6 text-sm text-zinc-500">
            {data.ticks.map((t) => (
              <span
                key={t}
                className="tabular absolute -translate-x-1/2"
                style={{ left: `${pos(t)}%` }}
              >
                {hhmm(t)}
              </span>
            ))}
          </div>

          <div className="relative">
            {/* กริด — จางให้ข้อมูลเด่น */}
            {data.minor.map((t) => (
              <div
                key={`m${t}`}
                aria-hidden
                className="absolute inset-y-0 border-l border-dashed border-zinc-100"
                style={{ left: `${pos(t)}%` }}
              />
            ))}
            {data.ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className="absolute inset-y-0 border-l border-zinc-200"
                style={{ left: `${pos(t)}%` }}
              />
            ))}

            <ol>
              {data.rows.map((r, i) => {
                const active = hover === i;
                return (
                  <li
                    key={i}
                    className={`relative h-9 ${active ? "bg-brand-50/70" : ""}`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={0}
                    aria-label={`${hhmm(r.t)} ${r.title}${i > 0 ? ` (ห่างจากก่อนหน้า ${formatDuration(r.gap)})` : ""}`}
                  >
                    {/* ป้ายชื่อเหตุการณ์ อยู่ซ้ายของพื้นที่กราฟ */}
                    <span
                      className="absolute top-1/2 -translate-y-1/2 truncate pe-3 text-sm text-zinc-700"
                      style={{ left: "-12rem", width: "12rem" }}
                      title={r.title}
                    >
                      <span className="tabular text-zinc-500">{hhmm(r.t)}</span> {r.title}
                    </span>

                    {/* ช่วงรอจากเหตุการณ์ก่อนหน้า */}
                    {r.prevX !== null && r.x > r.prevX ? (
                      <span
                        aria-hidden
                        className={`absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full ${
                          r.longGap ? "bg-warn-600" : "bg-brand-200"
                        }`}
                        style={{ left: `${r.prevX}%`, width: `${r.x - r.prevX}%` }}
                      />
                    ) : null}

                    {/* จุดเหตุการณ์ — วงขาวรอบจุดกันจุดที่เวลาเดียวกันกลืนกัน */}
                    <span
                      aria-hidden
                      className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${
                        active ? "bg-brand-700 size-4" : "bg-brand-600"
                      }`}
                      style={{ left: `${r.x}%` }}
                    />

                    {/* ป้ายช่วงรอที่นานเกินเกณฑ์ — บอกด้วยข้อความ ไม่ใช่สีอย่างเดียว */}
                    {r.longGap && r.prevX !== null ? (
                      <span
                        className="tabular absolute top-0 -translate-x-1/2 text-xs font-medium text-warn-600"
                        style={{ left: `${(r.prevX + r.x) / 2}%` }}
                      >
                        รอ {formatDuration(r.gap)}
                      </span>
                    ) : null}

                    {/* tooltip */}
                    {active ? (
                      <span
                        role="tooltip"
                        className="pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-xs -translate-x-1/2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-md"
                        style={{ left: `${Math.min(Math.max(r.x, 12), 88)}%` }}
                      >
                        <span className="block font-medium text-zinc-900">{r.title}</span>
                        <span className="tabular block text-zinc-600">
                          {hhmm(r.t)} · นาทีที่ +{Math.round(r.elapsed / 60000)} จากเหตุการณ์แรก
                        </span>
                        {i > 0 ? (
                          <span className="tabular block text-zinc-600">
                            ห่างจากก่อนหน้า {formatDuration(r.gap)}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      <figcaption className="text-sm text-zinc-500">
        แกนนอนคือเวลา (ชั่วโมง) · เส้นระหว่างจุดคือช่วงเวลาที่ผ่านไป · ชี้/แตะที่แถวเพื่อดูรายละเอียด
        {data.dayChanges ? " · เหตุการณ์ข้ามวัน — ดูวันที่ในรายการด้านล่าง" : ""}
        {data.untimed.length > 0
          ? ` · มี ${data.untimed.length} เหตุการณ์ที่ยังไม่ใส่เวลา จึงไม่แสดงในกราฟ`
          : ""}
      </figcaption>
    </figure>
  );
}
