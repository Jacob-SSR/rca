-- ตรวจอัตโนมัติ: สรุปการสุ่มแบบแบ่งชั้นตามรหัสโรคหลักของแต่ละรอบ (เป้า / มีจริง / สุ่มได้ ต่อรหัส)
ALTER TABLE `AutoAuditRun` ADD COLUMN `strata` JSON NULL;
