-- แผนกที่สร้าง/รับผิดชอบเคส — เลือกตอนสร้างฟอร์ม ไว้แยกเคสของแต่ละหน่วย
ALTER TABLE `Case` ADD COLUMN `department` VARCHAR(100) NULL;

CREATE INDEX `Case_department_idx` ON `Case`(`department`);
