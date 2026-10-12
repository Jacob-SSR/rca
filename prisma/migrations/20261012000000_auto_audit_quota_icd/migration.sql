-- ตรวจอัตโนมัติ: เซ็ตแยกรายแผนก — จำนวนที่ตรวจต่อรอบ + รหัส ICD-10 ที่ให้ตรวจ
ALTER TABLE `AutoAuditSetting` ADD COLUMN `departmentRules` JSON NULL;
