-- CreateTable
CREATE TABLE "SystemAudit" (
    "id" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemAudit_entityKey_entityId_idx" ON "SystemAudit"("entityKey", "entityId");

-- CreateIndex
CREATE INDEX "SystemAudit_actorId_idx" ON "SystemAudit"("actorId");

-- AddForeignKey
ALTER TABLE "SystemAudit" ADD CONSTRAINT "SystemAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
