#!/bin/sh
# docker-entrypoint.sh
# รอ DB พร้อม → migrate → seed → สตาร์ทแอป
#
# RUN_MIGRATIONS=0  → ข้าม migrate (กรณีอยากรันเองจากเครื่องอื่น)
# RUN_SEED=0        → ข้าม seed
# DB_WAIT_RETRIES   → จำนวนครั้งที่ลอง migrate ก่อนยอมแพ้ (default 60 ครั้ง ห่างละ 5 วิ = 5 นาที)
#
# นี่คือ "ตัวรอ DB จริง" ของ stack นี้ — compose ใช้ depends_on: service_started
# ไม่ใช่ service_healthy เพราะถ้า healthcheck เพี้ยนหรือช้าเกิน timeout
# จะทำให้ทั้ง stack ขึ้นไม่ได้เลยทั้งที่ MySQL อาจใช้ได้อยู่
#
# MySQL init ครั้งแรกบนเครื่องที่ดิสก์ช้า (Docker Desktop บน Windows)
# ใช้เวลาได้หลายนาที — default 5 นาทีจึงเผื่อไว้แล้ว ปรับได้ผ่าน env
#
# seed เป็น idempotent (upsert ล้วน) รันซ้ำทุกครั้งที่ container ขึ้นได้ไม่มีปัญหา
# และทำให้เกณฑ์ใน DB ตรงกับ data/criteria/opd-a1.json เสมอ

set -e

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  retries="${DB_WAIT_RETRIES:-60}"
  delay="${DB_WAIT_DELAY:-5}"
  i=1

  until npx prisma migrate deploy; do
    if [ "$i" -ge "$retries" ]; then
      echo "✗ migrate ไม่สำเร็จหลังลอง $retries ครั้ง (~$((retries * delay)) วินาที)"
      echo "  ตรวจ: docker compose logs mysql --tail 60"
      echo "  และ DATABASE_URL ที่แอปได้รับ: $(echo "$DATABASE_URL" | sed 's/:[^:@]*@/:****@/')"
      exit 1
    fi
    echo "… รอ MySQL พร้อมรับ connection (ครั้งที่ $i/$retries)"
    i=$((i + 1))
    sleep "$delay"
  done
fi

if [ "${RUN_SEED:-1}" = "1" ]; then
  echo "→ seed criteria"
  npx tsx prisma/seed.ts
fi

exec "$@"
