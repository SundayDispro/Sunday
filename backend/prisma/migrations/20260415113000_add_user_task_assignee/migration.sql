-- AlterTable
ALTER TABLE "UserTask"
ADD COLUMN "assigneeUserId" TEXT;

-- CreateIndex
CREATE INDEX "UserTask_assigneeUserId_completed_idx" ON "UserTask"("assigneeUserId", "completed");

-- AddForeignKey
ALTER TABLE "UserTask"
ADD CONSTRAINT "UserTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
