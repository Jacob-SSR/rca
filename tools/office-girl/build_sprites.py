#!/usr/bin/env python3
"""
tools/office-girl/build_sprites.py
สร้าง sprite sheet ของน้องผู้ตรวจ (Office Girl) จาก reference sheet ที่ผู้ใช้ให้มา

    python3 tools/office-girl/build_sprites.py

ขั้นตอน
  1. หาขอบของแต่ละเฟรมใน assets/office-girl/reference/sheet-a.webp
     (ช่องว่างสีอ่อนระหว่างเฟรมเป็นตัวแบ่ง — ตำแหน่งแถวของแต่ละท่ากำหนดไว้ใน ACTIONS)
  2. จัดเฟรมของท่าเดียวกันให้ตรงกัน: หาสเกล (เท่ากันทุกด้าน ไม่ยืด) + การเลื่อน
     ที่ทำให้เฟรมทับเฟรมกลางได้ดีที่สุด
  3. ตัดเหลือส่วนที่ทุกเฟรมมีภาพจริง แล้วตัดกลางเป็นขนาดเท่ากันทุกท่า (FRAME_W × FRAME_H)
  4. ส่งออก
       public/sprites/office-girl/<ท่า>.png        sprite sheet แนวนอน เฟรมเรียงซ้ายไปขวา
       assets/office-girl/frames/<ท่า>-NN.png      เฟรมแยก ไว้ตรวจทีละเฟรม
       app/components/officeGirlSprites.ts          ขนาด/จำนวนเฟรม/fps แนะนำ ให้ตัวเล่นใช้

⚠️ เฟรมใน reference sheet เป็นภาพหลักของแต่ละท่าที่ถูกวาดแยกกันทีละภาพ (ไม่ใช่เฟรมต่อเนื่อง)
   พื้นหลังและของบนโต๊ะจึงไม่ตรงกันทุกเฟรม — สคริปต์นี้จัดตำแหน่งได้ แต่สร้างเฟรมใหม่ไม่ได้
   ผลตรวจรายเฟรมดู docs/office-girl-animation.md

ต้องมี Pillow + numpy (pip install pillow numpy)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / "assets/office-girl/reference/sheet-a.webp"
OUT_SHEETS = ROOT / "public/sprites/office-girl"
OUT_FRAMES = ROOT / "assets/office-girl/frames"
OUT_TS = ROOT / "app/components/officeGirlSprites.ts"

FRAME_W, FRAME_H = 120, 168

# แถวของแต่ละท่าใน sheet-a: (y บน, y ล่าง, x ซ้าย, x ขวา) — กว้างกว่าแถวจริงเล็กน้อย ขอบจริงหาเอง
# fps แนะนำ: เฟรมเป็นภาพหลัก (keyframe) ห่างกันมาก จึงช้ากว่า animation ทั่วไป
ACTIONS = {
    "typing": dict(band=(42, 248, 420, 1530), fps=4, label="พิมพ์คีย์บอร์ด"),
    "blink": dict(band=(300, 500, 10, 762), fps=3, label="กะพริบตาและหายใจ"),
    "snack": dict(band=(300, 500, 775, 1530), fps=2, label="กินขนม"),
    "drink": dict(band=(548, 745, 10, 762), fps=2, label="ดื่มน้ำ"),
    "idle": dict(band=(548, 748, 775, 1530), fps=2, label="ผมและตัวขยับ (บิดขี้เกียจ)"),
}


def light(c):
    return c[0] > 215 and c[1] > 222 and c[2] > 230


def runs(flags):
    out, start = [], None
    for i, v in enumerate(flags):
        if v and start is None:
            start = i
        if not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(flags)))
    return out


def find_frames(im, band):
    """คืนกล่องของเฟรมในแถว [(x0, y0, x1, y1), ...] — คอลัมน์ที่สว่างเกือบทั้งแนวคือช่องว่างระหว่างเฟรม"""
    y0, y1, x0, x1 = band
    ys = range(y0 + 20, y1 - 20, 4)
    cols = [sum(light(im.getpixel((x, y))) for y in ys) / len(ys) < 0.6 for x in range(x0, x1)]
    xs = [(x0 + a, x0 + b) for a, b in runs(cols) if b - a > 60]
    fa, fb = xs[0]
    xr = range(fa + 5, fb - 5, 3)
    rows = [sum(light(im.getpixel((x, y))) for x in xr) / len(xr) < 0.6 for y in range(y0 - 10, y1 + 10)]
    ty0, ty1 = [(y0 - 10 + a, y0 - 10 + b) for a, b in runs(rows) if b - a > 60][0]
    return [(a, ty0, b, ty1) for a, b in xs]


def gray(im, s=0.5):
    g = im.convert("L").resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BILINEAR)
    return np.asarray(g, dtype=np.float32)


def align(tiles):
    """หาสเกล + การเลื่อนของแต่ละเฟรมเทียบเฟรมกลาง (ค้นหาแบบไล่ทุกค่าบนภาพย่อครึ่งหนึ่ง)"""
    ref = tiles[len(tiles) // 2]
    R = gray(ref)
    rh, rw = R.shape
    out = []
    for t in tiles:
        best = (1e9, 1.0, 0, 0)
        for sc in np.arange(0.88, 1.13, 0.01):
            T = gray(t.resize((max(1, int(t.width * sc)), max(1, int(t.height * sc))), Image.BILINEAR))
            th, tw = T.shape
            for dy in range(-14, 15):
                for dx in range(-14, 15):
                    ya, xa, yb, xb = max(0, dy), max(0, dx), min(rh, th + dy), min(rw, tw + dx)
                    if (yb - ya) < rh * 0.75 or (xb - xa) < rw * 0.75:
                        continue
                    d = float(np.mean(np.abs(R[ya:yb, xa:xb] - T[ya - dy : yb - dy, xa - dx : xb - dx])))
                    if d < best[0]:
                        best = (d, float(sc), dx * 2, dy * 2)
        out.append(best)
    return ref.size, out


def main():
    sheet = Image.open(SHEET).convert("RGB")
    OUT_SHEETS.mkdir(parents=True, exist_ok=True)
    OUT_FRAMES.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, cfg in ACTIONS.items():
        boxes = find_frames(sheet, cfg["band"])
        tiles = [sheet.crop(b) for b in boxes]
        (rw, rh), fits = align(tiles)
        placed = []
        for t, (_, sc, dx, dy) in zip(tiles, fits):
            ts = t.resize((round(t.width * sc), round(t.height * sc)), Image.LANCZOS)
            canvas = Image.new("RGB", (rw, rh))
            canvas.paste(ts, (dx, dy))
            placed.append((canvas, ts.size, dx, dy))
        # ส่วนที่ทุกเฟรมมีภาพจริง (ไม่ใช่ขอบดำที่เกิดจากการเลื่อน)
        cx0 = max(max(0, dx) for _, _, dx, _ in placed)
        cy0 = max(max(0, dy) for _, _, _, dy in placed)
        cx1 = min(min(rw, w + dx) for _, (w, _), dx, _ in placed)
        cy1 = min(min(rh, h + dy) for _, (_, h), _, dy in placed)
        if cx1 - cx0 < FRAME_W or cy1 - cy0 < FRAME_H:
            raise SystemExit(f"{name}: ส่วนที่ทุกเฟรมทับกัน ({cx1 - cx0}×{cy1 - cy0}) เล็กกว่าขนาดเฟรม")
        # ตัดกลางแนวนอน ชิดบนแนวตั้ง (เก็บหัวไว้ครบ)
        ox = cx0 + ((cx1 - cx0) - FRAME_W) // 2
        oy = cy0
        frames = [c.crop((ox, oy, ox + FRAME_W, oy + FRAME_H)) for c, *_ in placed]
        strip = Image.new("RGB", (FRAME_W * len(frames), FRAME_H))
        for i, f in enumerate(frames):
            strip.paste(f, (i * FRAME_W, 0))
            f.save(OUT_FRAMES / f"{name}-{i + 1:02d}.png", optimize=True)
        strip.save(OUT_SHEETS / f"{name}.png", optimize=True)
        manifest[name] = dict(
            frames=len(frames),
            fps=cfg["fps"],
            label=cfg["label"],
            fit=[dict(diff=round(d, 1), scale=round(sc, 2), dx=dx, dy=dy) for d, sc, dx, dy in fits],
        )
        print(f"{name}: {len(frames)} เฟรม · ความต่างหลังจัด {[m['diff'] for m in manifest[name]['fit']]}")

    lines = [
        "// app/components/officeGirlSprites.ts",
        "// sprite sheet ของน้องผู้ตรวจ — สร้างโดย tools/office-girl/build_sprites.py อย่าแก้มือ",
        "// ไฟล์ภาพ: public/sprites/office-girl/<ท่า>.png (เฟรมเรียงแนวนอน ซ้ายไปขวา)",
        "",
        f"export const OFFICE_GIRL_FRAME = {{ width: {FRAME_W}, height: {FRAME_H} }} as const;",
        "",
        "export const OFFICE_GIRL_ACTIONS = {",
    ]
    for name, m in manifest.items():
        lines.append(
            f'  {name}: {{ src: "/sprites/office-girl/{name}.png", frames: {m["frames"]}, fps: {m["fps"]}, label: "{m["label"]}" }},'
        )
    lines += ["} as const;", "", "export type OfficeGirlAction = keyof typeof OFFICE_GIRL_ACTIONS;", ""]
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    (OUT_FRAMES / "alignment.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
