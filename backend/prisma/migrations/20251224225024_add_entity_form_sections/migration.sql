-- CreateEnum
CREATE TYPE "EntityFormSectionLayout" AS ENUM ('ONE_COLUMN', 'TWO_COLUMN');

-- AlterTable
ALTER TABLE "EntityField" ADD COLUMN     "formColumn" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "formSectionId" TEXT;

-- CreateTable
CREATE TABLE "EntityFormSection" (
    "id" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "layout" "EntityFormSectionLayout" NOT NULL DEFAULT 'ONE_COLUMN',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityFormSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntityFormSection_entityTypeId_idx" ON "EntityFormSection"("entityTypeId");

-- AddForeignKey
ALTER TABLE "EntityField" ADD CONSTRAINT "EntityField_formSectionId_fkey" FOREIGN KEY ("formSectionId") REFERENCES "EntityFormSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityFormSection" ADD CONSTRAINT "EntityFormSection_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "EntityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
