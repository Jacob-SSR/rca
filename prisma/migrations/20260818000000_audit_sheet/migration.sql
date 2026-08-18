-- CreateTable
CREATE TABLE `AuditSheet` (
    `id` VARCHAR(191) NOT NULL,
    `formCode` VARCHAR(10) NOT NULL,
    `title` VARCHAR(200) NULL,
    `meta` JSON NOT NULL,
    `rows` JSON NOT NULL,
    `createdBy` VARCHAR(100) NULL,
    `updatedBy` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AuditSheet_formCode_idx`(`formCode`),
    INDEX `AuditSheet_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

