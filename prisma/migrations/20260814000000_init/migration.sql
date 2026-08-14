-- CreateTable
CREATE TABLE `CriteriaSet` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `source` TEXT NULL,
    `sourcePage` VARCHAR(191) NULL,
    `maxScore` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CriteriaSet_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Criterion` (
    `id` VARCHAR(191) NOT NULL,
    `criteriaSetId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `maxScore` INTEGER NOT NULL,
    `allowNA` BOOLEAN NOT NULL DEFAULT false,
    `naRule` TEXT NULL,

    UNIQUE INDEX `Criterion_criteriaSetId_code_key`(`criteriaSetId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CriterionLevel` (
    `id` VARCHAR(191) NOT NULL,
    `criterionId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `description` TEXT NOT NULL,

    UNIQUE INDEX `CriterionLevel_criterionId_score_key`(`criterionId`, `score`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Case` (
    `id` VARCHAR(191) NOT NULL,
    `caseNumber` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Case_caseNumber_key`(`caseNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TimelineEvent` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `eventTime` DATETIME(3) NULL,
    `title` TEXT NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TimelineEvent_caseId_eventTime_idx`(`caseId`, `eventTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `extractedText` LONGTEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Document_caseId_idx`(`caseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Review` (
    `id` VARCHAR(191) NOT NULL,
    `caseId` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `criteriaSetId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `totalScore` INTEGER NULL,
    `maxScore` INTEGER NULL,
    `percentage` DECIMAL(5, 2) NULL,
    `factsJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Review_caseId_idx`(`caseId`),
    INDEX `Review_documentId_idx`(`documentId`),
    INDEX `Review_criteriaSetId_idx`(`criteriaSetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReviewItem` (
    `id` VARCHAR(191) NOT NULL,
    `reviewId` VARCHAR(191) NOT NULL,
    `criterionId` VARCHAR(191) NOT NULL,
    `score` INTEGER NULL,
    `isNA` BOOLEAN NOT NULL DEFAULT false,
    `reason` TEXT NULL,
    `evidence` TEXT NULL,

    INDEX `ReviewItem_criterionId_idx`(`criterionId`),
    UNIQUE INDEX `ReviewItem_reviewId_criterionId_key`(`reviewId`, `criterionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Criterion` ADD CONSTRAINT `Criterion_criteriaSetId_fkey` FOREIGN KEY (`criteriaSetId`) REFERENCES `CriteriaSet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CriterionLevel` ADD CONSTRAINT `CriterionLevel_criterionId_fkey` FOREIGN KEY (`criterionId`) REFERENCES `Criterion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TimelineEvent` ADD CONSTRAINT `TimelineEvent_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `Case`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `Document`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_criteriaSetId_fkey` FOREIGN KEY (`criteriaSetId`) REFERENCES `CriteriaSet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewItem` ADD CONSTRAINT `ReviewItem_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `Review`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewItem` ADD CONSTRAINT `ReviewItem_criterionId_fkey` FOREIGN KEY (`criterionId`) REFERENCES `Criterion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

