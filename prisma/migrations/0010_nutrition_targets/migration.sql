BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Athlete] ADD [calorieTarget] INT,
[carbTarget] INT,
[fatTarget] INT,
[proteinTarget] INT,
[waterTargetL] DECIMAL(4,1);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

