import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // แพ็กเกจฝั่ง server ที่ห้าม bundle เข้า output ของ Next
  // - @prisma/client / .prisma/client: โหลด query engine binary ตอน runtime
  // - mammoth / docx: ใช้ node built-in (fs, stream, zlib)
  serverExternalPackages: ["@prisma/client", ".prisma/client", "mammoth", "docx"],
};

export default nextConfig;
