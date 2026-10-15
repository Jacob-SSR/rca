"use client";

// app/components/SpritePlayer.tsx
// ตัวเล่น sprite sheet แนวนอน (เฟรมเรียงซ้ายไปขวา ขนาดเท่ากันทุกเฟรม)
//
//   mode "step"  → ตัดทีละเฟรมตาม fps (แบบ sprite ทั่วไป)
//   mode "blend" → ช่วงท้ายของแต่ละเฟรมค่อยๆ เฟดไปเฟรมถัดไป (blendMs)
//                  เหมาะกับเฟรมที่เป็นภาพหลัก (keyframe) ห่างกันมาก — กลบการกระพริบของพื้นหลัง
//   playing=false → หยุดที่เฟรม frame (ใช้เลื่อนดูทีละเฟรมตอนตรวจคุณภาพ)
//   เปลี่ยน src (สลับท่า) → ภาพเดิมค่อยๆ จางออก ทับบนท่าใหม่ ไม่ตัดกระตุก
//
// ผู้ใช้ตั้ง prefers-reduced-motion → ไม่เล่นเอง (ยังหยุด/เลื่อนดูทีละเฟรมได้)
// เวลาคำนวณจาก lib/sprite.ts (ฟังก์ชันล้วน มีเทสต์)

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { frameAt, framePosition } from "@/lib/sprite";

type Props = {
  src: string;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  loop?: boolean;
  mode?: "step" | "blend";
  /** ระยะเฟดก่อนเปลี่ยนเฟรม (มิลลิวินาที) — ใช้เฉพาะ mode "blend" */
  blendMs?: number;
  playing?: boolean;
  /** เฟรมที่โชว์ตอนหยุด */
  frame?: number;
  /** ขยายกี่เท่า (ภาพพิกเซลคมเมื่อเป็นจำนวนเต็ม) */
  scale?: number;
  /** ระยะเฟดตอนสลับท่า (มิลลิวินาที) */
  transitionMs?: number;
  onFrame?: (index: number) => void;
  /** เล่นจบ (เฉพาะ loop=false) */
  onEnd?: () => void;
  className?: string;
  label?: string;
};

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function layer(src: string, frames: number, index: number, opacity = 1): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    backgroundImage: `url(${src})`,
    backgroundSize: `${frames * 100}% 100%`,
    backgroundPosition: framePosition(index, frames),
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
    opacity,
  };
}

export default function SpritePlayer({
  src,
  frames,
  frameWidth,
  frameHeight,
  fps,
  loop = true,
  mode = "step",
  blendMs = 250,
  playing = true,
  frame = 0,
  scale = 1,
  transitionMs = 350,
  onFrame,
  onEnd,
  className = "",
  label,
}: Props) {
  const reduced = useReducedMotion();
  const running = playing && !reduced;
  const [state, setState] = useState({ index: frame, next: null as number | null, blend: 0 });

  // ── เล่น: requestAnimationFrame คำนวณเฟรมจากเวลาที่ผ่านไป (ไม่สะสม error แบบ setInterval) ──
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);
  const frameRef = useRef(frame);
  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    // เล่นต่อจากเฟรมที่หยุดไว้ ไม่ย้อนกลับไปเฟรมแรก
    const startAt = performance.now() - (frameRef.current * 1000) / Math.max(fps, 0.1);
    const tick = (now: number) => {
      const f = frameAt(now - startAt, { fps, frames, loop, blendMs: mode === "blend" ? blendMs : 0 });
      const blend = Math.round(f.blend * 50) / 50; // ปัดก่อน setState — ไม่ render ทุกเสี้ยวโดยไม่เปลี่ยนภาพ
      setState((s) => (s.index === f.index && s.next === f.next && s.blend === blend ? s : { index: f.index, next: f.next, blend }));
      if (f.done) {
        onEndRef.current?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, src, fps, frames, loop, mode, blendMs]);

  // หยุดอยู่ → โชว์เฟรมที่สั่ง (ไม่ setState ใน effect — คำนวณตรงนี้เลย)
  const shown = running ? state : { index: Math.min(Math.max(frame, 0), frames - 1), next: null, blend: 0 };

  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);
  useEffect(() => {
    onFrameRef.current?.(shown.index);
  }, [shown.index]);

  // ── สลับท่า: ภาพสุดท้ายของท่าเดิมจางออกทับท่าใหม่ ──
  // เก็บ src ที่เห็นล่าสุดไว้ใน state แล้วเทียบระหว่าง render (แนวทางของ React แทน useEffect)
  // ได้ภาพเดิมตั้งแต่เฟรมแรกที่สลับ ไม่มีช่วงว่าง
  const [seen, setSeen] = useState({ src, frames, key: 0 });
  const [prev, setPrev] = useState<{ src: string; frames: number; index: number; key: number } | null>(null);
  if (seen.src !== src) {
    setPrev({ src: seen.src, frames: seen.frames, index: shown.index, key: seen.key + 1 });
    setSeen({ src, frames, key: seen.key + 1 });
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ width: frameWidth * scale, height: frameHeight * scale }}
      role="img"
      aria-label={label}
    >
      <div style={layer(src, frames, shown.index)} />
      {shown.next !== null && shown.blend > 0 ? <div style={layer(src, frames, shown.next, shown.blend)} /> : null}
      {prev ? (
        <div
          key={prev.key}
          style={{ ...layer(prev.src, prev.frames, prev.index), animation: `sprite-fade-out ${transitionMs}ms ease-out both` }}
          onAnimationEnd={() => setPrev(null)}
        />
      ) : null}
    </div>
  );
}
