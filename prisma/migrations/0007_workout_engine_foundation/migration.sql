BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Exercise] ADD [aliases] NVARCHAR(400),
[instructions] NVARCHAR(max),
[isCustom] BIT NOT NULL CONSTRAINT [Exercise_isCustom_df] DEFAULT 1,
[movementPattern] NVARCHAR(40),
[secondaryMuscles] NVARCHAR(200),
[tips] NVARCHAR(1024);

-- AlterTable
ALTER TABLE [dbo].[WorkoutSession] ADD [difficulty] INT,
[endedAt] DATETIME2,
[gymBranchId] NVARCHAR(1000),
[name] NVARCHAR(120),
[sessionRpe] INT,
[startedAt] DATETIME2,
[status] NVARCHAR(16) NOT NULL CONSTRAINT [WorkoutSession_status_df] DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE [dbo].[ExerciseEntry] ADD [completedAt] DATETIME2,
[rir] INT,
[rpe] DECIMAL(3,1),
[setType] NVARCHAR(12) NOT NULL CONSTRAINT [ExerciseEntry_setType_df] DEFAULT 'WORK',
[workoutExerciseId] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[WorkoutExercise] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [sessionId] NVARCHAR(1000) NOT NULL,
    [exerciseId] NVARCHAR(1000) NOT NULL,
    [sortOrder] INT NOT NULL CONSTRAINT [WorkoutExercise_sortOrder_df] DEFAULT 0,
    [supersetGroup] INT,
    [notes] NVARCHAR(1024),
    [skipped] BIT NOT NULL CONSTRAINT [WorkoutExercise_skipped_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WorkoutExercise_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [WorkoutExercise_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkoutExercise_sessionId_sortOrder_idx] ON [dbo].[WorkoutExercise]([sessionId], [sortOrder]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkoutExercise_athleteId_exerciseId_idx] ON [dbo].[WorkoutExercise]([athleteId], [exerciseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WorkoutSession_athleteId_status_idx] ON [dbo].[WorkoutSession]([athleteId], [status]);

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutSession] ADD CONSTRAINT [WorkoutSession_gymBranchId_fkey] FOREIGN KEY ([gymBranchId]) REFERENCES [dbo].[GymBranch]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutExercise] ADD CONSTRAINT [WorkoutExercise_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[WorkoutSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WorkoutExercise] ADD CONSTRAINT [WorkoutExercise_exerciseId_fkey] FOREIGN KEY ([exerciseId]) REFERENCES [dbo].[Exercise]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ExerciseEntry] ADD CONSTRAINT [ExerciseEntry_workoutExerciseId_fkey] FOREIGN KEY ([workoutExerciseId]) REFERENCES [dbo].[WorkoutExercise]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

