// app/components/ScoreBadge.tsx
// แสดงคะแนนพร้อมสีตามระดับ — ใช้ร่วมกันทุกหน้า จะได้ตีความสีเหมือนกันทั้งระบบ
//
// เกณฑ์สี: ยึด "สัดส่วนคะแนนที่ได้" ตามที่ Form A1 สรุปท้ายตาราง
//   ≥ 80% ผ่านดี · 60-79% พอใช้ · < 60% ต้องปรับปรุง

type Props = {
  total: number | null;
  max: number | null;
  percentage?: string | number | null;
  size?: "sm" | "lg";
};

function tone(pct: number | null): string {
  if (pct === null) return "bg-zinc-100 text-zinc-600";
  if (pct >= 80) return "bg-good-50 text-good-600";
  if (pct >= 60) return "bg-warn-50 text-warn-600";
  return "bg-bad-50 text-bad-600";
}

export default function ScoreBadge({ total, max, percentage, size = "sm" }: Props) {
  if (total === null || max === null) {
    return <span className="badge">ยังไม่มีคะแนน</span>;
  }

  const pct =
    percentage === null || percentage === undefined
      ? max > 0
        ? (total / max) * 100
        : null
      : Number(percentage);

  const cls = size === "lg" ? "px-4 py-2 text-2xl" : "px-2.5 py-1 text-base";

  return (
    <span
      className={`tabular inline-flex items-baseline gap-2 rounded-lg font-semibold ${cls} ${tone(pct)}`}
    >
      <span>
        {total}/{max}
      </span>
      {pct !== null ? (
        <span className={size === "lg" ? "text-lg font-medium" : "text-sm font-medium"}>
          {pct.toFixed(2)}%
        </span>
      ) : null}
    </span>
  );
}
