-- CreateIndex
CREATE UNIQUE INDEX "BoardColumn_boardId_title_type_key" ON "BoardColumn"("boardId", "title", "type");
