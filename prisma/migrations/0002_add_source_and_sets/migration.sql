BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[BodyWeightEntry] ADD [source] NVARCHAR(16) NOT NULL CONSTRAINT [BodyWeightEntry_source_df] DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE [dbo].[MeasurementEntry] ADD [source] NVARCHAR(16) NOT NULL CONSTRAINT [MeasurementEntry_source_df] DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE [dbo].[ExerciseEntry] ADD [sets] INT,
[source] NVARCHAR(16) NOT NULL CONSTRAINT [ExerciseEntry_source_df] DEFAULT 'MANUAL';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

