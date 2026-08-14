#!/bin/sh
# docker-entrypoint.sh
# รอ DB พร้อม → migrate → seed → สตาร์ทแอป
#
# RUN_MIGRATIONS=0  → ข้าม migrate (กรณีอยากรันเองจากเครื่องอื่น)
# RUN_SEED=0        → ข้าม seed
# DB_WAIT_RETRIES   → จำนวนครั้งที่ลอง migrate ก่อนยอมแพ้ (default 30 ครั้ง ห่างละ 2 วิ)
#
# seed เป็น idempotent (upsert ล้วน) รันซ้ำทุกครั้งที่ container ขึ้นได้ไม่มีปัญหา
# และทำให้เกณฑ์ใน DB ตรงกับ data/criteria/opd-a1.json เสมอ

set -e

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  # ตอน compose ขึ้นพร้อมกัน MySQL มักยังไม่รับ connection — ลองใหม่แทนที่จะตายทันที
  retries="${DB_WAIT_RETRIES:-30}"
  i=1
  until npx prisma migrate deploy; do
    if [ "$i" -ge "$retries" ]; then
      echo "✗ migrate ไม่สำเร็จหลังลอง $retries ครั้ง — ตรวจ DATABASE_URL และสถานะ MySQL"
      exit 1
    fi
    echo "… รอ DB (ครั้งที่ $i/$retries)"
    i=$((i + 1))
    sleep 2
  done
fi

if [ "${RUN_SEED:-1}" = "1" ]; then
  echo "→ seed criteria"
  npx tsx prisma/seed.ts
fi

exec "$@"
