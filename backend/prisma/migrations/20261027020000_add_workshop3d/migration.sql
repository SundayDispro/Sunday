CREATE TABLE "Workshop3DProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sceneData" JSONB NOT NULL DEFAULT '{}',
    "catalogData" JSONB,
    "thumbnailUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workshop3DProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Workshop3DQuotation" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "projectId" TEXT NOT NULL,
    "cliente" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "breakdownData" JSONB NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "grossMargin" DOUBLE PRECISION,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Workshop3DQuotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Workshop3DCatalogEntry" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "properties" JSONB,
    "supplier" TEXT,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workshop3DCatalogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workshop3DQuotation_folio_key" ON "Workshop3DQuotation"("folio");
CREATE INDEX "Workshop3DProject_workspaceId_idx" ON "Workshop3DProject"("workspaceId");
CREATE INDEX "Workshop3DProject_createdById_idx" ON "Workshop3DProject"("createdById");
CREATE INDEX "Workshop3DQuotation_projectId_idx" ON "Workshop3DQuotation"("projectId");
CREATE INDEX "Workshop3DQuotation_createdById_idx" ON "Workshop3DQuotation"("createdById");
CREATE INDEX "Workshop3DCatalogEntry_category_idx" ON "Workshop3DCatalogEntry"("category");

ALTER TABLE "Workshop3DProject"
    ADD CONSTRAINT "Workshop3DProject_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Workshop3DProject"
    ADD CONSTRAINT "Workshop3DProject_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Workshop3DQuotation"
    ADD CONSTRAINT "Workshop3DQuotation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Workshop3DProject"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Workshop3DQuotation"
    ADD CONSTRAINT "Workshop3DQuotation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;