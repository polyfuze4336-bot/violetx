BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[CoachShareLink] (
    [id] NVARCHAR(1000) NOT NULL,
    [athleteId] NVARCHAR(1000) NOT NULL,
    [tokenHash] NVARCHAR(64) NOT NULL,
    [label] NVARCHAR(100),
    [expiresAt] DATETIME2 NOT NULL,
    [revokedAt] DATETIME2,
    [lastViewedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CoachShareLink_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CoachShareLink_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CoachShareLink_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CoachShareLink_athleteId_idx] ON [dbo].[CoachShareLink]([athleteId]);

-- AddForeignKey
ALTER TABLE [dbo].[CoachShareLink] ADD CONSTRAINT [CoachShareLink_athleteId_fkey] FOREIGN KEY ([athleteId]) REFERENCES [dbo].[Athlete]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

