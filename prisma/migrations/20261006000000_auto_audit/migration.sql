-- CreateTable
CREATE TABLE `AutoAuditSetting` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `runTime` VARCHAR(5) NOT NULL DEFAULT '12:00',
    `weekdays` VARCHAR(20) NOT NULL DEFAULT '0,1,2,3,4,5,6',
    `targetDay` VARCHAR(20) NOT NULL DEFAULT 'yesterday',
    `maxVisits` INTEGER NOT NULL DEFAULT 20,
    `updatedBy` VARCHAR(100) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutoAuditRun` (
    `id` VARCHAR(191) NOT NULL,
    `runKey` VARCHAR(100) NOT NULL,
    `targetDate` VARCHAR(10) NOT NULL,
    `trigger` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    `found` INTEGER NOT NULL DEFAULT 0,
    `reviewed` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `avgPercent` DECIMAL(5, 2) NULL,
    `results` JSON NULL,
    `error` TEXT NULL,
    `startedBy` VARCHAR(100) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    UNIQUE INDEX `AutoAuditRun_runKey_key`(`runKey`),
    INDEX `AutoAuditRun_startedAt_idx`(`startedAt`),
    INDEX `AutoAuditRun_targetDate_idx`(`targetDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
