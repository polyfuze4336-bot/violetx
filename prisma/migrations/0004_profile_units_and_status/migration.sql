BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Athlete] ADD [defaultMeasurementUnit] NVARCHAR(8) NOT NULL CONSTRAINT [Athlete_defaultMeasurementUnit_df] DEFAULT 'CM',
[defaultWeightUnit] NVARCHAR(8) NOT NULL CONSTRAINT [Athlete_defaultWeightUnit_df] DEFAULT 'KG';

-- AlterTable
ALTER TABLE [dbo].[MeasurementType] ADD [active] BIT NOT NULL CONSTRAINT [MeasurementType_active_df] DEFAULT 1;

-- AlterTable
ALTER TABLE [dbo].[ImportBatch] ADD [status] NVARCHAR(20) NOT NULL CONSTRAINT [ImportBatch_status_df] DEFAULT 'COMMITTED';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

