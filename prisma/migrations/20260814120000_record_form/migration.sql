-- AlterTable
ALTER TABLE `Case` ADD COLUMN `hosxpPatientRef` VARCHAR(20) NULL,
    ADD COLUMN `hosxpVisitRef` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `Document` ADD COLUMN `recordFormId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Review` ADD COLUMN `sourceType` VARCHAR(191) NOT NULL DEFAULT 'upload';

-- CreateTable
CREATE TABLE `RecordForm` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `hn` VARCHAR(20) NULL,
    `patientName` VARCHAR(200) NULL,
    `age` VARCHAR(50) NULL,
    `gender` VARCHAR(20) NULL,
    `department` VARCHAR(100) NULL,
    `pttype` VARCHAR(100) NULL,
    `serviceDate` VARCHAR(50) NULL,
    `serviceTime` VARCHAR(20) NULL,
    `chiefComplaint` TEXT NULL,
    `presentIllness` TEXT NULL,
    `pastHistory` TEXT NULL,
    `personalHistory` TEXT NULL,
    `vitalSigns` TEXT NULL,
    `physicalExam` TEXT NULL,
    `labResult` TEXT NULL,
    `diagnosis` TEXT NULL,
    `treatment` TEXT NULL,
    `note` TEXT NULL,
    `recorder` VARCHAR(200) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'manual',
    `hosxpVisitRef` VARCHAR(20) NULL,
    `prefilledAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(100) NULL,
    `updatedBy` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RecordForm_caseId_idx`(`caseId`),
    INDEX `RecordForm_hn_idx`(`hn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Case_hosxpPatientRef_idx` ON `Case`(`hosxpPatientRef`);

-- CreateIndex
CREATE INDEX `Case_hosxpVisitRef_idx` ON `Case`(`hosxpVisitRef`);

-- CreateIndex
CREATE INDEX `Document_recordFormId_idx` ON `Document`(`recordFormId`);

-- AddForeignKey
ALTER TABLE `RecordForm` ADD CONSTRAINT `RecordForm_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_recordFormId_fkey` FOREIGN KEY (`recordFormId`) REFERENCES `RecordForm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

