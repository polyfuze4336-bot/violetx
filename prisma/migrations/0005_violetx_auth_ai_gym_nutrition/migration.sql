BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[User] ADD [active] BIT NOT NULL CONSTRAINT [User_active_df] DEFAULT 1,
[failedLoginAttempts] INT NOT NULL CONSTRAINT [User_failedLoginAttempts_df] DEFAULT 0,
[lastLoginAt] DATETIME2,
[lockedUntil] DATETIME2,
[passwordHash] NVARCHAR(255);

-- AlterTable
ALTER TABLE [dbo].[Athlete] ADD [trustedAiImports] BIT NOT NULL CONSTRAINT [Athlete_trustedAiImports_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[ImportBatch] ADD [aiProvider] NVARCHAR(40),
[model] NVARCHAR(80);

-- CreateTable
CREATE TABLE [dbo].[PasswordResetToken] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [tokenHash] NVARCHAR(255) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [usedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PasswordResetToken_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PasswordResetToken_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PasswordResetToken_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[AIAction] (
    [id] NVARCHAR(1000) NOT NULL,
    [importBatchId] NVARCHAR(1000) NOT NULL,
    [actionType] NVARCHAR(60) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [confidence] FLOAT(53),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [AIAction_status_df] DEFAULT 'PROPOSED',
    [approvedById] NVARCHAR(1000),
    [approvedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AIAction_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AIAction_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[GymBranch] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [address] NVARCHAR(400),
    [city] NVARCHAR(120),
    [state] NVARCHAR(80) NOT NULL,
    [postcode] NVARCHAR(20),
    [latitude] FLOAT(53) NOT NULL,
    [longitude] FLOAT(53) NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [GymBranch_active_df] DEFAULT 1,
    [source] NVARCHAR(80),
    [sourceUpdatedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GymBranch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GymBranch_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[GymVisit] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [gymBranchId] NVARCHAR(1000) NOT NULL,
    [visitedAt] DATETIME2 NOT NULL,
    [notes] NVARCHAR(1024),
    [source] NVARCHAR(16) NOT NULL CONSTRAINT [GymVisit_source_df] DEFAULT 'MANUAL',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GymVisit_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GymVisit_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[NutritionEntry] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [entryDate] DATETIME2 NOT NULL,
    [calories] INT,
    [protein] DECIMAL(6,1),
    [carbohydrates] DECIMAL(6,1),
    [fat] DECIMAL(6,1),
    [fibre] DECIMAL(6,1),
    [water] DECIMAL(6,2),
    [notes] NVARCHAR(2048),
    [source] NVARCHAR(16) NOT NULL CONSTRAINT [NutritionEntry_source_df] DEFAULT 'MANUAL',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [NutritionEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [NutritionEntry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PasswordResetToken_userId_idx] ON [dbo].[PasswordResetToken]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AIAction_importBatchId_idx] ON [dbo].[AIAction]([importBatchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GymBranch_state_idx] ON [dbo].[GymBranch]([state]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GymBranch_active_idx] ON [dbo].[GymBranch]([active]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GymVisit_athleteId_gymBranchId_idx] ON [dbo].[GymVisit]([athleteId], [gymBranchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GymVisit_athleteId_visitedAt_idx] ON [dbo].[GymVisit]([athleteId], [visitedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NutritionEntry_athleteId_entryDate_idx] ON [dbo].[NutritionEntry]([athleteId], [entryDate]);

-- AddForeignKey
ALTER TABLE [dbo].[PasswordResetToken] ADD CONSTRAINT [PasswordResetToken_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AIAction] ADD CONSTRAINT [AIAction_importBatchId_fkey] FOREIGN KEY ([importBatchId]) REFERENCES [dbo].[ImportBatch]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AIAction] ADD CONSTRAINT [AIAction_approvedById_fkey] FOREIGN KEY ([approvedById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GymVisit] ADD CONSTRAINT [GymVisit_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GymVisit] ADD CONSTRAINT [GymVisit_gymBranchId_fkey] FOREIGN KEY ([gymBranchId]) REFERENCES [dbo].[GymBranch]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[NutritionEntry] ADD CONSTRAINT [NutritionEntry_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

