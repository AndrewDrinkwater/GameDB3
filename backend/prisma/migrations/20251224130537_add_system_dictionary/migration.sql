-- AlterEnum
ALTER TYPE "SystemFieldType" ADD VALUE 'REFERENCE';

-- AlterTable
ALTER TABLE "SystemViewField" ADD COLUMN     "referenceEntityKey" TEXT,
ADD COLUMN     "referenceLabelField" TEXT;

-- CreateTable
CREATE TABLE "SystemDictionary" (
    "id" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "SystemFieldType" NOT NULL,
    "referenceEntityKey" TEXT,
    "isLabel" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemDictionary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemDictionary_entityKey_idx" ON "SystemDictionary"("entityKey");

-- CreateIndex
CREATE UNIQUE INDEX "SystemDictionary_entityKey_fieldKey_key" ON "SystemDictionary"("entityKey", "fieldKey");
