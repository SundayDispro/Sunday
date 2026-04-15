-- CreateTable
CREATE TABLE "UserTaskAssignment" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTaskAssignment_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "UserTaskAssignment_userId_idx" ON "UserTaskAssignment"("userId");

-- AddForeignKey
ALTER TABLE "UserTaskAssignment"
ADD CONSTRAINT "UserTaskAssignment_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTaskAssignment"
ADD CONSTRAINT "UserTaskAssignment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill legacy single assignee to new assignments table.
INSERT INTO "UserTaskAssignment" ("taskId", "userId")
SELECT "id", "assigneeUserId"
FROM "UserTask"
WHERE "assigneeUserId" IS NOT NULL
ON CONFLICT ("taskId","userId") DO NOTHING;
