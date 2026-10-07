BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[WorkoutSession] ADD [programId] NVARCHAR(1000),
[templateId] NVARCHAR(1000);

-- AlterTable
ALTER TABLE [dbo].[WorkoutExercise] ADD [repMax] INT,
[repMin] INT,
[restSec] INT,
[targetSets] INT;

-- CreateTable
CREATE TABLE [dbo].[WorkoutProgram] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [programType] NVARCHAR(16) NOT NULL CONSTRAINT [WorkoutProgram_programType_df] DEFAULT 'CUSTOM',
    [description] NVARCHAR(1024),
    [isActive] BIT NOT NULL CONSTRAINT [WorkoutProgram_isActive_df] DEFAULT 0,
    [archived] BIT NOT NULL CONSTRAINT [WorkoutProgram_archived_df] DEFAULT 0,
    [source] NVARCHAR(16) NOT NULL CONSTRAINT [WorkoutProgram_source_df] DEFAULT 'MANUAL',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WorkoutProgram_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WorkoutProgram_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[WorkoutTemplate] (
    [id] NVARCHAR(1000) NOT NULL,
    [programId] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [dayOrder] INT NOT NULL CONSTRAINT [WorkoutTemplate_dayOrder_df] DEFAULT 0,
    [weekday] INT,
    [notes] NVARCHAR(1024),
    [archived] BIT NOT NULL CONSTRAINT [WorkoutTemplate_archived_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WorkoutTemplate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WorkoutTemplate_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[WorkoutTemplateExercise] (
    [id] NVARCHAR(1000) NOT NULL,
    [templateId] NVARCHAR(1000) NOT NULL,
    [exerciseId] NVARCHAR(1000) NOT NULL,
    [sortOrder] INT NOT NULL CONSTRAINT [WorkoutTemplateExercise_sortOrder_df] DEFAULT 0,
    [targetSets] INT NOT NULL CONSTRAINT [WorkoutTemplateExercise_targetSets_df] DEFAULT 3,
    [repMin] INT NOT NULL CONSTRAINT [WorkoutTemplateExercise_repMin_df] DEFAULT 8,
    [repMax] INT NOT NULL CONSTRAINT [WorkoutTemplateExercise_repMax_df] DEFAULT 12,
    [restSec] INT,
    [notes] NVARCHAR(512),
    CONSTRAINT [WorkoutTemplateExercise_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AIProposalLog] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [kind] NVARCHAR(40) NOT NULL,
    [status] NVARCHAR(16) NOT NULL CONSTRAINT [AIProposalLog_status_df] DEFAULT 'APPROVED',
    [provider] NVARCHAR(40),
    [model] NVARCHAR(80),
    [payload] NVARCHAR(max) NOT NULL,
    [createdById] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AIProposalLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AIProposalLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkoutProgram_athleteId_archived_idx] ON [dbo].[WorkoutProgram]([athleteId], [archived]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkoutTemplate_programId_dayOrder_idx] ON [dbo].[WorkoutTemplate]([programId], [dayOrder]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkoutTemplateExercise_templateId_sortOrder_idx] ON [dbo].[WorkoutTemplateExercise]([templateId], [sortOrder]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AIProposalLog_athleteId_createdAt_idx] ON [dbo].[AIProposalLog]([athleteId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutSession] ADD CONSTRAINT [WorkoutSession_programId_fkey] FOREIGN KEY ([programId]) REFERENCES [dbo].[WorkoutProgram]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutSession] ADD CONSTRAINT [WorkoutSession_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[WorkoutTemplate]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutProgram] ADD CONSTRAINT [WorkoutProgram_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutTemplate] ADD CONSTRAINT [WorkoutTemplate_programId_fkey] FOREIGN KEY ([programId]) REFERENCES [dbo].[WorkoutProgram]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutTemplateExercise] ADD CONSTRAINT [WorkoutTemplateExercise_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[WorkoutTemplate]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutTemplateExercise] ADD CONSTRAINT [WorkoutTemplateExercise_exerciseId_fkey] FOREIGN KEY ([exerciseId]) REFERENCES [dbo].[Exercise]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AIProposalLog] ADD CONSTRAINT [AIProposalLog_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

