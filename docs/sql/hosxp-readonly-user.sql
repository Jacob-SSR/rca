-- docs/sql/hosxp-readonly-user.sql
-- SQL ที่ DBA ต้องรันบนเซิร์ฟเวอร์ HOSxP ก่อนเปิด HOSXP_ENABLED=true
--
-- ระบบ RCA อ่าน HOSxP อย่างเดียว ไม่มีโค้ดเขียนกลับแม้แต่บรรทัดเดียว
-- user นี้จึงต้องมีสิทธิ์ SELECT เท่านั้น
--
-- ⚠️ แทน <ip ของเครื่อง rca> ด้วย IP จริง — ห้ามใช้ '%'
--    ถ้ารหัสหลุด จะยังต่อจากเครื่องอื่นไม่ได้

CREATE USER 'rca_readonly'@'<ip ของเครื่อง rca>'
  IDENTIFIED BY '<ตั้งรหัสผ่านที่สุ่มมา — openssl rand -hex 24>';

-- รอบนี้ระบบใช้แค่สองตาราง master (ไม่มีข้อมูลผู้ป่วย)
--   kskdepartment → รายการแผนก
--   pttype        → รายการสิทธิการรักษา
GRANT SELECT ON hos.kskdepartment TO 'rca_readonly'@'<ip ของเครื่อง rca>';
GRANT SELECT ON hos.pttype        TO 'rca_readonly'@'<ip ของเครื่อง rca>';

-- ถ้าภายหลังจะทำ prefill จาก HN (Phase 2 ข้อ 7-12) ค่อยเพิ่มตารางที่ต้องใช้ทีละตัว
-- ให้สิทธิ์เท่าที่ใช้จริง ดีกว่า GRANT SELECT ON hos.* ทั้งฐาน
--   GRANT SELECT ON hos.ovst             TO ...
--   GRANT SELECT ON hos.opdscreen        TO ...
--   GRANT SELECT ON hos.ovst_doctor_diag TO ...
--   GRANT SELECT ON hos.opitemrece       TO ...

FLUSH PRIVILEGES;

-- ── ตรวจว่า read-only จริง ──────────────────────────────────────────────────
-- ล็อกอินเป็น rca_readonly แล้วลองรันสองคำสั่งนี้ ต้องได้ error ทั้งคู่
--   INSERT INTO hos.kskdepartment (depcode) VALUES ('ZZZ');
--   SHOW GRANTS FOR CURRENT_USER();   -- ต้องเห็นแค่ SELECT
