-- ตรวจอัตโนมัติ: เลือกแผนก / ช่วงเวลา / เวร + ชื่อคนกดรัน (เป็นผู้สร้างเคส)
ALTER TABLE `AutoAuditSetting` ADD COLUMN `departments` TEXT NULL;

ALTER TABLE `AutoAuditRun`
  ADD COLUMN `filters` JSON NULL,
  ADD COLUMN `startedByName` VARCHAR(200) NULL;
