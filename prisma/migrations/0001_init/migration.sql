BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000),
    [image] NVARCHAR(1024),
    [role] NVARCHAR(16) NOT NULL CONSTRAINT [User_role_df] DEFAULT 'COACH',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[Athlete] (
    [id] NVARCHAR(1000) NOT NULL,
    [ownerUserId] NVARCHAR(1000) NOT NULL,
    [displayName] NVARCHAR(200) NOT NULL,
    [heightCm] DECIMAL(5,1),
    [birthDate] DATETIME2,
    [sex] NVARCHAR(16),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Athlete_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Athlete_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Athlete_ownerUserId_key] UNIQUE NONCLUSTERED ([ownerUserId])
);

-- CreateTable
CREATE TABLE [dbo].[BodyWeightEntry] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [date] DATETIME2 NOT NULL,
    [weightKg] DECIMAL(6,2) NOT NULL,
    [note] NVARCHAR(1024),
    [importBatchId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BodyWeightEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [BodyWeightEntry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MeasurementType] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [defaultUnit] NVARCHAR(8) NOT NULL CONSTRAINT [MeasurementType_defaultUnit_df] DEFAULT 'CM',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MeasurementType_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MeasurementType_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MeasurementType_athleteId_name_key] UNIQUE NONCLUSTERED ([athleteId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[MeasurementEntry] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [typeId] NVARCHAR(1000) NOT NULL,
    [date] DATETIME2 NOT NULL,
    [value] DECIMAL(6,2) NOT NULL,
    [unit] NVARCHAR(8) NOT NULL CONSTRAINT [MeasurementEntry_unit_df] DEFAULT 'CM',
    [note] NVARCHAR(1024),
    [importBatchId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MeasurementEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MeasurementEntry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Exercise] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [category] NVARCHAR(60),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Exercise_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Exercise_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Exercise_athleteId_name_key] UNIQUE NONCLUSTERED ([athleteId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[WorkoutSession] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [date] DATETIME2 NOT NULL,
    [note] NVARCHAR(2048),
    [importBatchId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WorkoutSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WorkoutSession_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ExerciseEntry] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [exerciseId] NVARCHAR(1000) NOT NULL,
    [sessionId] NVARCHAR(1000),
    [date] DATETIME2 NOT NULL,
    [reps] INT NOT NULL,
    [weightKg] DECIMAL(6,2) NOT NULL,
    [position] INT NOT NULL CONSTRAINT [ExerciseEntry_position_df] DEFAULT 0,
    [note] NVARCHAR(1024),
    [importBatchId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ExerciseEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ExerciseEntry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Note] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [date] DATETIME2 NOT NULL,
    [title] NVARCHAR(200),
    [body] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Note_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Note_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ImportBatch] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [createdById] NVARCHAR(1000) NOT NULL,
    [rawText] NVARCHAR(max) NOT NULL,
    [sourceDate] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ImportBatch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ImportBatch_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_role_idx] ON [dbo].[User]([role]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BodyWeightEntry_athleteId_date_idx] ON [dbo].[BodyWeightEntry]([athleteId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MeasurementEntry_athleteId_typeId_date_idx] ON [dbo].[MeasurementEntry]([athleteId], [typeId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkoutSession_athleteId_date_idx] ON [dbo].[WorkoutSession]([athleteId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ExerciseEntry_athleteId_exerciseId_date_idx] ON [dbo].[ExerciseEntry]([athleteId], [exerciseId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ExerciseEntry_athleteId_date_idx] ON [dbo].[ExerciseEntry]([athleteId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Note_athleteId_date_idx] ON [dbo].[Note]([athleteId], [date]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportBatch_athleteId_createdAt_idx] ON [dbo].[ImportBatch]([athleteId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Athlete] ADD CONSTRAINT [Athlete_ownerUserId_fkey] FOREIGN KEY ([ownerUserId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BodyWeightEntry] ADD CONSTRAINT [BodyWeightEntry_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[BodyWeightEntry] ADD CONSTRAINT [BodyWeightEntry_importBatchId_fkey] FOREIGN KEY ([importBatchId]) REFERENCES [dbo].[ImportBatch]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MeasurementType] ADD CONSTRAINT [MeasurementType_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MeasurementEntry] ADD CONSTRAINT [MeasurementEntry_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MeasurementEntry] ADD CONSTRAINT [MeasurementEntry_typeId_fkey] FOREIGN KEY ([typeId]) REFERENCES [dbo].[MeasurementType]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[MeasurementEntry] ADD CONSTRAINT [MeasurementEntry_importBatchId_fkey] FOREIGN KEY ([importBatchId]) REFERENCES [dbo].[ImportBatch]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Exercise] ADD CONSTRAINT [Exercise_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutSession] ADD CONSTRAINT [WorkoutSession_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutSession] ADD CONSTRAINT [WorkoutSession_importBatchId_fkey] FOREIGN KEY ([importBatchId]) REFERENCES [dbo].[ImportBatch]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ExerciseEntry] ADD CONSTRAINT [ExerciseEntry_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ExerciseEntry] ADD CONSTRAINT [ExerciseEntry_exerciseId_fkey] FOREIGN KEY ([exerciseId]) REFERENCES [dbo].[Exercise]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ExerciseEntry] ADD CONSTRAINT [ExerciseEntry_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WorkoutSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ExerciseEntry] ADD CONSTRAINT [ExerciseEntry_importBatchId_fkey] FOREIGN KEY ([importBatchId]) REFERENCES [dbo].[ImportBatch]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Note] ADD CONSTRAINT [Note_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportBatch] ADD CONSTRAINT [ImportBatch_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportBatch] ADD CONSTRAINT [ImportBatch_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

