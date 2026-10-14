// app/components/officeScenes.ts
// ตำแหน่งชั้นของแต่ละฉากออฟฟิศ (% ของภาพ 3:2) — สร้างจากสคริปต์ตัดชั้น (scenes.py) อย่าแก้มือ
// ox/oy = จุดหมุนของชั้น (% ของกล่องชั้นนั้น) · ไฟล์ภาพอยู่ที่ public/scene/<ฉาก>.webp และ <ฉาก>-<ชั้น>.webp

export type Box = { left: number; top: number; width: number; height: number; ox?: number; oy?: number };

export const SCENE_LAYERS = {
  type: {
    head: { left: 38.854, top: 13.281, width: 22.604, height: 34.062, ox: 42.7, oy: 98.6 },
    "blink-l": { left: 42.5, top: 35.469, width: 3.021, height: 4.375, ox: 198.7, oy: 260.7 },
    "blink-r": { left: 46.771, top: 36.406, width: 3.646, height: 5.312, ox: 47.5, oy: 197.1 },
    "hand-l": { left: 33.229, top: 57.188, width: 8.75, height: 8.125, ox: 48.1, oy: 53.4 },
    "hand-r": { left: 38.854, top: 62.187, width: 8.646, height: 8.75, ox: 47.6, oy: 53.8 },
    coworker: { left: 85.833, top: 8.75, width: 8.646, height: 14.062, ox: 50.2, oy: 98.9 },
    "plant-top": { left: 32.917, top: 4.062, width: 7.812, height: 10.625, ox: 49.5, oy: 94.1 },
    "plant-right": { left: 82.604, top: 29.531, width: 10.208, height: 13.281, ox: 49.9, oy: 95.3 },
    "plant-desk": { left: 23.854, top: 70.625, width: 11.458, height: 15.625, ox: 49.8, oy: 96.1 },
  },
  review: {
    head: { left: 38.542, top: 21.25, width: 18.125, height: 37.812, ox: 11.9, oy: 94.9 },
    "blink-l": { left: 42.083, top: 37.188, width: 3.125, height: 4.375, ox: -44.6, oy: 455.8 },
    "blink-r": { left: 45.625, top: 37.812, width: 3.438, height: 5.156, ox: -143.6, oy: 374.6 },
    coworker: { left: 85.833, top: 8.75, width: 8.646, height: 14.062, ox: 50.2, oy: 98.9 },
    "plant-top": { left: 32.917, top: 3.906, width: 7.812, height: 10.0, ox: 49.5, oy: 93.8 },
    "plant-right": { left: 82.604, top: 29.375, width: 10.312, height: 13.438, ox: 50.0, oy: 95.3 },
    "plant-desk": { left: 25.625, top: 67.656, width: 9.688, height: 15.0, ox: 50.0, oy: 96.5 },
  },
  fetch: {
    head: { left: 41.458, top: 19.688, width: 16.146, height: 26.094, ox: 49.7, oy: 100.4 },
    "blink-l": { left: 42.708, top: 38.594, width: 3.021, height: 4.062, ox: 224.1, oy: 179.8 },
    "blink-r": { left: 46.771, top: 39.375, width: 3.125, height: 4.219, ox: 86.7, oy: 154.6 },
    paper: { left: 35.208, top: 48.906, width: 11.458, height: 14.531, ox: 79.1, oy: 76.7 },
    coworker: { left: 85.833, top: 8.75, width: 8.646, height: 14.062, ox: 50.2, oy: 98.9 },
    "plant-top": { left: 32.396, top: 4.375, width: 8.646, height: 9.688, ox: 50.0, oy: 94.0 },
    "plant-right": { left: 83.125, top: 30.469, width: 9.167, height: 12.5, ox: 49.9, oy: 95.3 },
    "plant-desk": { left: 25.833, top: 67.812, width: 10.0, height: 14.062, ox: 49.6, oy: 96.2 },
  },
  coffee: {
    head: { left: 38.125, top: 20.312, width: 16.667, height: 30.156, ox: 25.2, oy: 97.2 },
    "blink-l": { left: 41.771, top: 35.781, width: 2.396, height: 3.906, ox: 22.8, oy: 354.0 },
    "blink-r": { left: 46.042, top: 37.656, width: 2.708, height: 3.906, ox: -137.5, oy: 306.0 },
    coworker: { left: 85.833, top: 8.75, width: 8.646, height: 14.062, ox: 50.2, oy: 98.9 },
    "plant-top": { left: 32.396, top: 4.375, width: 8.646, height: 10.156, ox: 50.0, oy: 93.5 },
    "plant-right": { left: 83.229, top: 30.469, width: 9.167, height: 12.5, ox: 50.1, oy: 95.3 },
    "plant-desk": { left: 25.625, top: 68.438, width: 9.896, height: 13.438, ox: 50.3, oy: 96.1 },
  },
  snack: {
    head: { left: 35.417, top: 17.188, width: 26.354, height: 42.812, ox: 10.1, oy: 96.3 },
    "blink-l": { left: 43.229, top: 35.469, width: 2.5, height: 4.219, ox: -205.7, oy: 543.5 },
    "blink-r": { left: 47.396, top: 36.875, width: 3.542, height: 4.844, ox: -262.9, oy: 444.4 },
    coworker: { left: 85.833, top: 8.75, width: 8.646, height: 14.062, ox: 50.2, oy: 98.9 },
    "plant-top": { left: 32.917, top: 4.062, width: 7.812, height: 10.156, ox: 49.5, oy: 94.6 },
    "plant-right": { left: 82.5, top: 29.531, width: 10.312, height: 13.125, ox: 49.7, oy: 94.9 },
    "plant-desk": { left: 23.75, top: 70.469, width: 11.979, height: 15.781, ox: 49.6, oy: 96.2 },
  },
  nap: {
    head: { left: 36.875, top: 20.625, width: 19.271, height: 41.25, ox: 11.4, oy: 96.8 },
    coworker: { left: 85.833, top: 8.75, width: 8.646, height: 14.062, ox: 50.2, oy: 98.9 },
    "plant-right": { left: 85.0, top: 32.188, width: 6.979, height: 9.844, ox: 49.8, oy: 93.7 },
    "plant-desk": { left: 26.354, top: 71.562, width: 9.375, height: 11.094, ox: 49.4, oy: 95.2 },
  },
} satisfies Record<string, Record<string, Box>>;

export type SceneName = keyof typeof SCENE_LAYERS;
