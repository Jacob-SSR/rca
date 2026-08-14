# Dockerfile — container เดียวจบ (Next.js + Node + Prisma) ตามสเปกข้อ 3 / 10.14
# ไฟล์เอกสารอยู่บน volume ที่ mount เข้ามา ไม่ได้อยู่ใน image

FROM node:22-alpine AS base
# prisma query engine ต้องการ openssl บน alpine
RUN apk add --no-cache openssl
WORKDIR /app

# ── deps: ติดตั้ง dependency ทั้งหมด (รวม dev เพราะต้องใช้ตอน build/seed) ──────
FROM base AS deps
COPY package.json package-lock.json ./
# ใช้ npm ci ก่อนเสมอ (เร็วกว่าและ reproducible) แต่ต้อง fallback เป็น npm install
#
# เหตุผล: npm มีบั๊กเก่าเรื่อง optional dependency ที่ผูกกับ platform
# (@emnapi/*, @esbuild/*, @rollup/rollup-*) — รัน `npm install` บน Windows แล้ว
# lock file จะถูกเขียนใหม่โดยตัดตัวที่ Windows ไม่ใช้ทิ้ง พอเอา lock นั้นมา
# `npm ci` ใน alpine ก็ล้มด้วย "Missing: @emnapi/runtime from lock file"
#
# แลก reproducibility ไปนิดหน่อยเพื่อให้ build ไม่ล้มเพราะ lock drift ข้าม OS
# ซึ่งเป็นเรื่องที่เกิดแน่ๆ เมื่อ dev บน Windows แต่ build ใน linux container
RUN npm ci --no-audit --no-fund || \
    (echo "⚠ npm ci ล้ม (lock ไม่ตรงกับ platform) — fallback ไป npm install" && \
     npm install --no-audit --no-fund)

# ── build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL ตอน build ไม่ได้ต่อจริง แค่ให้ env validation ผ่าน
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV DOCUMENT_STORAGE_DIR=/app/data/documents

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/data/criteria ./data/criteria
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/data/documents \
  && chown -R node:node /app/data

USER node
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
