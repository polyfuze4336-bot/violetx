BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Goal] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(24) NOT NULL,
    [title] NVARCHAR(120) NOT NULL,
    [exerciseId] NVARCHAR(1000),
    [startValue] DECIMAL(9,2),
    [targetValue] DECIMAL(9,2) NOT NULL,
    [currentValue] DECIMAL(9,2),
    [weeklyTarget] INT,
    [unit] NVARCHAR(16) NOT NULL CONSTRAINT [Goal_unit_df] DEFAULT '',
    [startDate] DATETIME2 NOT NULL,
    [targetDate] DATETIME2,
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [Goal_status_df] DEFAULT 'ACTIVE',
    [notes] NVARCHAR(1024),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Goal_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Goal_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DailyCheckIn] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [date] DATETIME2 NOT NULL,
    [sleepHours] DECIMAL(4,1) NOT NULL,
    [sleepQuality] INT NOT NULL,
    [energy] INT NOT NULL,
    [soreness] INT NOT NULL,
    [stress] INT NOT NULL,
    [motivation] INT NOT NULL,
    [restingHr] INT,
    [notes] NVARCHAR(1024),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DailyCheckIn_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [DailyCheckIn_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DailyCheckIn_athleteId_date_key] UNIQUE NONCLUSTERED ([athleteId],[date])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Goal_athleteId_status_idx] ON [dbo].[Goal]([athleteId], [status]);

-- AddForeignKey
ALTER TABLE [dbo].[Goal] ADD CONSTRAINT [Goal_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DailyCheckIn] ADD CONSTRAINT [DailyCheckIn_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

