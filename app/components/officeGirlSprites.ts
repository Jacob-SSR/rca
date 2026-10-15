// app/components/officeGirlSprites.ts
// sprite sheet ของน้องผู้ตรวจ — สร้างโดย tools/office-girl/build_sprites.py อย่าแก้มือ
// ไฟล์ภาพ: public/sprites/office-girl/<ท่า>.png (เฟรมเรียงแนวนอน ซ้ายไปขวา)

export const OFFICE_GIRL_FRAME = { width: 120, height: 168 } as const;

export const OFFICE_GIRL_ACTIONS = {
  typing: { src: "/sprites/office-girl/typing.png", frames: 8, fps: 4, label: "พิมพ์คีย์บอร์ด" },
  blink: { src: "/sprites/office-girl/blink.png", frames: 5, fps: 3, label: "กะพริบตาและหายใจ" },
  snack: { src: "/sprites/office-girl/snack.png", frames: 5, fps: 2, label: "กินขนม" },
  drink: { src: "/sprites/office-girl/drink.png", frames: 5, fps: 2, label: "ดื่มน้ำ" },
  idle: { src: "/sprites/office-girl/idle.png", frames: 5, fps: 2, label: "ผมและตัวขยับ (บิดขี้เกียจ)" },
} as const;

export type OfficeGirlAction = keyof typeof OFFICE_GIRL_ACTIONS;
