-- CreateEnum
CREATE TYPE "RelatedListFieldSource" AS ENUM ('RELATED', 'JOIN');

-- CreateTable
CREATE TABLE "SystemRelatedList" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentEntityKey" TEXT NOT NULL,
    "relatedEntityKey" TEXT NOT NULL,
    "joinEntityKey" TEXT NOT NULL,
    "parentFieldKey" TEXT NOT NULL,
    "relatedFieldKey" TEXT NOT NULL,
    "listOrder" INTEGER NOT NULL DEFAULT 0,
    "adminOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemRelatedList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemRelatedListField" (
    "id" TEXT NOT NULL,
    "relatedListId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" "RelatedListFieldSource" NOT NULL,
    "listOrder" INTEGER NOT NULL,
    "width" TEXT,

    CONSTRAINT "SystemRelatedListField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemRelatedList_key_key" ON "SystemRelatedList"("key");

-- CreateIndex
CREATE INDEX "SystemRelatedListField_relatedListId_idx" ON "SystemRelatedListField"("relatedListId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemRelatedListField_relatedListId_fieldKey_source_key" ON "SystemRelatedListField"("relatedListId", "fieldKey", "source");

-- AddForeignKey
ALTER TABLE "SystemRelatedListField" ADD CONSTRAINT "SystemRelatedListField_relatedListId_fkey" FOREIGN KEY ("relatedListId") REFERENCES "SystemRelatedList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
