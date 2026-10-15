"use client";

// app/components/AnimationPreview.tsx
// หน้าดู/ตรวจ animation ของน้องผู้ตรวจ — สลับท่า, ตัดทีละเฟรม/เฟด, ปรับ fps,
// หยุดแล้วเลื่อนทีละเฟรม, กดแถบเฟรมเพื่อกระโดด และอ่านผลตรวจคุณภาพของแต่ละท่า

import { useState } from "react";
import SpritePlayer from "@/app/components/SpritePlayer";
import Icon from "@/app/components/Icon";
import { framePosition } from "@/lib/sprite";
import { OFFICE_GIRL_ACTIONS, OFFICE_GIRL_FRAME, type OfficeGirlAction } from "@/app/components/officeGirlSprites";

/** ผลตรวจด้วยตาทีละเฟรม (ขยาย 2–3 เท่า) — ดูรายละเอียดเต็มใน docs/office-girl-animation.md */
const QC: Record<OfficeGirlAction, { ok: string[]; issues: string[] }> = {
  typing: {
    ok: ["หน้า ทรงผม ชุด สายคล้องบัตร คงที่ทั้ง 8 เฟรม", "มือสองข้างวางบนคีย์บอร์ด ไม่เห็นนิ้วเกิน/ขาด/ติดกันที่ความละเอียดนี้"],
    issues: [
      "พื้นหลังไม่ตรงกันทุกเฟรม — เฟรม 1 ไม่มีกระถางต้นไม้บนตู้ เฟรม 2–8 มีแต่ตำแหน่งต่างกัน",
      "นิ้วไม่ได้ขยับทีละนิ้ว — เป็นท่าวางมือคล้ายกันหลายแบบ",
    ],
  },
  blink: {
    ok: ["ลำดับ ลืมตา → หลับตา 3 เฟรม → ลืมตา ต่อกันได้", "ไหล่และมือคงที่"],
    issues: ["เฟรม 3–4 มีสัญลักษณ์ ♣ และ ♪ โผล่ขึ้นมา", "หลับตายาว 3 เฟรม ดูเป็นงีบมากกว่ากะพริบ"],
  },
  snack: {
    ok: ["มือถือขนมเข้าปากดูเป็นธรรมชาติ", "มืออีกข้างวางบนโต๊ะ/กล่องอย่างสมเหตุสมผล"],
    issues: [
      "กล่องและขนมเปลี่ยนทุกเฟรม (ไม่มีฝา/มีฝา, คุกกี้/ขนมแท่ง)",
      "ไม่มีจังหวะเอื้อมไปหยิบ — ทุกเฟรมมือแทบอยู่ที่ปากแล้ว",
      "เฟรม 5 มีหัวใจโผล่",
    ],
  },
  drink: {
    ok: ["ลำดับ พิมพ์ → หยิบแก้ว → ดูดหลอด → ดูดหลอด → กลับไปพิมพ์ ต่อกันเป็นเรื่องได้", "มือจับแก้วดูเป็นธรรมชาติ"],
    issues: ["แก้วเปลี่ยนขนาด/ตำแหน่งระหว่างเฟรม 2–4", "เฟรม 1 และ 5 ไม่มีแก้วบนโต๊ะเลย", "เฟรม 5 มีโน้ต ♪"],
  },
  idle: {
    ok: ["ทรงผม ชุด คงที่", "เฟรม 2 บิดขี้เกียจยกแขน — แขนครบสองข้าง"],
    issues: ["เปลี่ยนท่าใหญ่ระหว่างเฟรม (ก้มพิมพ์ → บิดขี้เกียจ → ยิ้ม → หลับตา) ไม่ใช่ขยับเบาๆ", "พื้นหลังเลื่อนมากที่สุดในทุกท่า"],
  },
};

const ACTIONS = Object.keys(OFFICE_GIRL_ACTIONS) as OfficeGirlAction[];

export default function AnimationPreview() {
  const [action, setAction] = useState<OfficeGirlAction>("typing");
  const [mode, setMode] = useState<"step" | "blend">("blend");
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [fpsOverride, setFpsOverride] = useState<number | null>(null);
  const [blendMs, setBlendMs] = useState(220);
  const [scale, setScale] = useState(2);

  const a = OFFICE_GIRL_ACTIONS[action];
  const fps = fpsOverride ?? a.fps;
  const { width: fw, height: fh } = OFFICE_GIRL_FRAME;
  const qc = QC[action];

  function pick(next: OfficeGirlAction) {
    setAction(next);
    setFrame(0);
    setFpsOverride(null);
  }
  function step(d: number) {
    setPlaying(false);
    setFrame((f) => (f + d + a.frames) % a.frames);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      {/* ── ตัวเล่น ── */}
      <section className="card card-pad flex flex-col items-center gap-4">
        <div className="rounded-xl bg-zinc-100 p-2 ring-1 ring-zinc-200">
          <SpritePlayer
            src={a.src}
            frames={a.frames}
            frameWidth={fw}
            frameHeight={fh}
            fps={fps}
            mode={mode}
            blendMs={blendMs}
            playing={playing}
            frame={frame}
            scale={scale}
            onFrame={setFrame}
            label={`น้องผู้ตรวจ: ${a.label}`}
            className="rounded-lg"
          />
        </div>
        <p className="tabular text-sm text-zinc-500">
          เฟรม {frame + 1} / {a.frames} · {fw}×{fh} px · {fps} fps
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-sm" onClick={() => step(-1)} aria-label="เฟรมก่อนหน้า">
            <Icon name="chevronRight" size={16} className="rotate-180" />
          </button>
          <button type="button" className="btn btn-sm btn-primary min-w-24" onClick={() => setPlaying((p) => !p)}>
            {playing ? "หยุด" : "เล่น"}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => step(1)} aria-label="เฟรมถัดไป">
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </section>

      {/* ── ตัวควบคุม + ผลตรวจ ── */}
      <section className="card card-pad space-y-5">
        <div>
          <p className="label">ท่า</p>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => pick(k)}
                className={`btn btn-sm ${k === action ? "btn-primary" : ""}`}
                aria-pressed={k === action}
              >
                {OFFICE_GIRL_ACTIONS[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="label">การเปลี่ยนเฟรม</p>
            <div className="flex gap-2">
              <button type="button" className={`btn btn-sm ${mode === "step" ? "btn-primary" : ""}`} onClick={() => setMode("step")}>
                ตัดทีละเฟรม
              </button>
              <button type="button" className={`btn btn-sm ${mode === "blend" ? "btn-primary" : ""}`} onClick={() => setMode("blend")}>
                เฟดต่อเนื่อง
              </button>
            </div>
          </div>
          <div>
            <p className="label">ขนาด</p>
            <div className="flex gap-2">
              {[1, 2, 3].map((s) => (
                <button key={s} type="button" className={`btn btn-sm ${scale === s ? "btn-primary" : ""}`} onClick={() => setScale(s)}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="label">ความเร็ว: {fps} fps</span>
            <input type="range" min={1} max={12} value={fps} onChange={(e) => setFpsOverride(Number(e.target.value))} className="w-full" />
          </label>
          <label className={`block ${mode === "blend" ? "" : "opacity-50"}`}>
            <span className="label">ระยะเฟด: {blendMs} ms</span>
            <input
              type="range"
              min={0}
              max={Math.round(1000 / fps)}
              step={10}
              value={Math.min(blendMs, Math.round(1000 / fps))}
              disabled={mode !== "blend"}
              onChange={(e) => setBlendMs(Number(e.target.value))}
              className="w-full"
            />
          </label>
        </div>

        {/* แถบเฟรม — กดเพื่อหยุดที่เฟรมนั้น */}
        <div>
          <p className="label">เฟรมทั้งหมด (กดเพื่อดูทีละเฟรม)</p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: a.frames }, (_, i) => (
              <button
                key={`${action}-${i}`}
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setFrame(i);
                }}
                className={`relative overflow-hidden rounded-md ring-2 transition ${i === frame ? "ring-brand-500" : "ring-transparent hover:ring-zinc-300"}`}
                style={{
                  width: fw / 2,
                  height: fh / 2,
                  backgroundImage: `url(${a.src})`,
                  backgroundSize: `${a.frames * 100}% 100%`,
                  backgroundPosition: framePosition(i, a.frames),
                }}
                aria-label={`เฟรม ${i + 1}`}
              >
                <span className="tabular absolute right-0.5 bottom-0.5 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ผลตรวจคุณภาพ */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-emerald-800">
              <Icon name="check" size={16} /> ผ่าน
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-emerald-900">
              {qc.ok.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-warn-50 p-3 ring-1 ring-amber-200">
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-warn-600">
              <Icon name="alert" size={16} /> ต้องแก้ที่ภาพต้นฉบับ
            </p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-zinc-700">
              {qc.issues.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-sm text-zinc-500">
          เฟรมมาจาก reference sheet ที่วาดแยกกันทีละภาพ — จัดตำแหน่งให้ตรงกันแล้ว แต่ยังไม่ใช่เฟรม animation ต่อเนื่อง
          โหมด &ldquo;เฟดต่อเนื่อง&rdquo; ช่วยกลบการกระพริบของพื้นหลัง · สร้าง sprite ใหม่: <code>python3 tools/office-girl/build_sprites.py</code>
        </p>
      </section>
    </div>
  );
}
