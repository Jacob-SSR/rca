-- ตรวจอัตโนมัติ: ตรวจต่อหลังโควตา AI รีเซ็ต + ตรวจทุกรายของวัน
ALTER TABLE `AutoAuditRun`
  ADD COLUMN `visitLimit` INTEGER NULL,
  ADD COLUMN `resumedFrom` VARCHAR(30) NULL;
