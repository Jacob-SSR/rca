-- AlterTable
ALTER TABLE `Case` ADD COLUMN `createdBy` VARCHAR(100) NULL,
    ADD COLUMN `createdByName` VARCHAR(200) NULL;

-- AlterTable
ALTER TABLE `Document` ADD COLUMN `createdBy` VARCHAR(100) NULL,
    ADD COLUMN `createdByName` VARCHAR(200) NULL;

-- CreateIndex
CREATE INDEX `Case_createdBy_idx` ON `Case`(`createdBy`);

