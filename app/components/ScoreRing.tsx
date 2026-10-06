// app/components/ScoreRing.tsx
// วงแหวนคะแนนแบบ "วงโคจร" — วาดเส้นรอบวงตามสัดส่วนคะแนน พร้อมแอนิเมชันตอนเปิดหน้า
// สีใช้เกณฑ์เดียวกับ ScoreBadge (≥80 ดี · 60–79 พอใช้ · <60 ต้องปรับปรุง)

type Props = { percentage: number | null; size?: number };

export default function ScoreRing({ percentage, size = 132 }: Props) {
  const pct = percentage === null ? 0 : Math.max(0, Math.min(100, percentage));
  const r = 52;
  const c = 2 * Math.PI * r;
  const color =
    percentage === null
      ? "var(--color-zinc-400)"
      : pct >= 80
        ? "var(--color-good-600)"
        : pct >= 60
          ? "var(--color-warn-600)"
          : "var(--color-bad-600)";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-zinc-100)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{
            filter: `drop-shadow(0 0 6px ${color})`,
            animation: "ring-draw 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) both",
            ["--ring-c" as string]: `${c}`,
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="tabular text-3xl leading-none font-bold" style={{ color }}>
            {percentage === null ? "—" : Math.round(pct)}
            <span className="text-base font-medium">%</span>
          </div>
          {size >= 130 ? <div className="mt-1 text-xs text-zinc-500">สัดส่วนคะแนน</div> : null}
        </div>
      </div>
    </div>
  );
}
