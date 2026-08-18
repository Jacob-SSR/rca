-- docs/sql/hosxp-readonly-user.sql
--
-- ⚠️ ไฟล์นี้เป็น "ทางเลือก" ไม่ใช่ขั้นตอนบังคับ
--
-- วิธีที่ง่ายที่สุดคือใช้ credential เดิมที่ ppc-hos-10667 ต่อ HOSxP อยู่แล้ว
-- ก็อป DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME จาก .env ของ ppc-hos-10667
-- ไปใส่เป็น HOSXP_DB_* ใน .env ของ RCA แล้วตั้ง HOSXP_ENABLED=true — จบ
--
-- RCA อ่านอย่างเดียวเสมอไม่ว่า user จะมีสิทธิ์อะไร เพราะ lib/hosxp/client.ts
-- ปฏิเสธ SQL ที่ไม่ขึ้นต้นด้วย SELECT / มีคำสั่งเขียน / มี ; และไม่มีโค้ดเขียน
-- HOSxP อยู่ในระบบนี้เลยแม้แต่บรรทัดเดียว (เทสต์ไว้ 13 เคส: npm run test:hosxp)
--
-- ────────────────────────────────────────────────────────────────────────────
-- ใช้ไฟล์นี้เมื่อไร: ถ้าอยากลดผลกระทบกรณี .env ของ RCA หลุด
-- user เฉพาะกิจที่มีสิทธิ์ SELECT แค่สองตาราง ทำอะไรอย่างอื่นกับ HOSxP ไม่ได้เลย
-- ต่างจาก credential รวมที่เปิดทั้งฐานได้
-- ────────────────────────────────────────────────────────────────────────────

-- แทน <ip ของเครื่อง rca> ด้วย IP จริง — ห้ามใช้ '%'
CREATE USER 'rca_readonly'@'<ip ของเครื่อง rca>'
  IDENTIFIED BY '<ตั้งรหัสผ่านที่สุ่มมา — openssl rand -hex 24>';

-- ให้สิทธิ์เท่าที่ระบบใช้จริง (สองตาราง master ไม่มีข้อมูลผู้ป่วย)
GRANT SELECT ON hos.kskdepartment TO 'rca_readonly'@'<ip ของเครื่อง rca>';
GRANT SELECT ON hos.pttype        TO 'rca_readonly'@'<ip ของเครื่อง rca>';

FLUSH PRIVILEGES;

-- ตรวจว่า read-only จริง: ล็อกอินเป็น rca_readonly แล้วสองคำสั่งนี้ต้อง error
--   INSERT INTO hos.kskdepartment (depcode) VALUES ('ZZZ');
--   SHOW GRANTS FOR CURRENT_USER();   -- ต้องเห็นแค่ SELECT บนสองตารางนั้น
