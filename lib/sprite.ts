// lib/sprite.ts
// คำนวณเฟรมของ sprite sheet แนวนอน (เฟรมเรียงซ้ายไปขวา) — ใช้กับ SpritePlayer
// แยกเป็นฟังก์ชันล้วนเพื่อเทสต์ได้โดยไม่ต้องมี DOM

/** background-position ของเฟรมที่ index ในแถบที่มี frames เฟรม (ใช้คู่กับ background-size: frames×100% 100%) */
export function framePosition(index: number, frames: number): string {
  if (frames <= 1) return "0% 0%";
  const i = Math.min(Math.max(Math.round(index), 0), frames - 1);
  return `${(i / (frames - 1)) * 100}% 0%`;
}

export type FrameState = {
  /** เฟรมที่กำลังโชว์ */
  index: number;
  /** เฟรมถัดไป (สำหรับเฟด) — null เมื่อจบและไม่วน */
  next: number | null;
  /** ความคืบหน้าการเฟดไปเฟรมถัดไป 0–1 (โหมดตัดทีละเฟรมเป็น 0 เสมอ) */
  blend: number;
  /** เล่นจบแล้ว (เฉพาะไม่วน) */
  done: boolean;
};

/**
 * เฟรมที่ควรโชว์ ณ เวลาที่เล่นไปแล้ว elapsedMs
 * แต่ละเฟรมค้าง 1000/fps มิลลิวินาที · blendMs > 0 = ช่วงท้ายของเฟรมค่อยๆ เฟดไปเฟรมถัดไป
 */
export function frameAt(
  elapsedMs: number,
  opts: { fps: number; frames: number; loop: boolean; blendMs?: number },
): FrameState {
  const { frames, loop } = opts;
  const hold = 1000 / Math.max(opts.fps, 0.1);
  const blendMs = Math.min(Math.max(opts.blendMs ?? 0, 0), hold);
  if (frames <= 1) return { index: 0, next: null, blend: 0, done: !loop };

  const step = Math.floor(Math.max(elapsedMs, 0) / hold);
  if (!loop && step >= frames - 1) return { index: frames - 1, next: null, blend: 0, done: true };

  const index = step % frames;
  const next = loop ? (index + 1) % frames : index + 1;
  const inFrame = Math.max(elapsedMs, 0) - step * hold;
  const blend = blendMs > 0 ? Math.min(Math.max((inFrame - (hold - blendMs)) / blendMs, 0), 1) : 0;
  return { index, next, blend, done: false };
}
