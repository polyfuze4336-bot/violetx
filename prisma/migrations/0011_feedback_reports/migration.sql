BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[FeedbackReport] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [kind] NVARCHAR(12) NOT NULL,
    [title] NVARCHAR(120) NOT NULL,
    [details] NVARCHAR(2000) NOT NULL,
    [page] NVARCHAR(200),
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [FeedbackReport_status_df] DEFAULT 'OPEN',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FeedbackReport_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [FeedbackReport_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FeedbackReport_userId_createdAt_idx] ON [dbo].[FeedbackReport]([userId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FeedbackReport_status_createdAt_idx] ON [dbo].[FeedbackReport]([status], [createdAt]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
