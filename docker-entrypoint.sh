#!/bin/sh
# docker-entrypoint.sh
# รัน migration + seed ก่อนสตาร์ทแอป
#
# RUN_MIGRATIONS=0  → ข้าม migrate (กรณีอยากรันเองจากเครื่องอื่น)
# RUN_SEED=0        → ข้าม seed
#
# seed เป็น idempotent (upsert ล้วน) รันซ้ำทุกครั้งที่ container ขึ้นได้ไม่มีปัญหา
# และทำให้เกณฑ์ใน DB ตรงกับ data/criteria/opd-a1.json เสมอ

set -e

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "→ prisma migrate deploy"
  npx prisma migrate deploy
fi

if [ "${RUN_SEED:-1}" = "1" ]; then
  echo "→ seed criteria"
  npx tsx prisma/seed.ts
fi

exec "$@"
