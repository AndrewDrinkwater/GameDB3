-- CreateEnum
CREATE TYPE "ChoiceScope" AS ENUM ('PACK', 'WORLD');

-- CreateTable
CREATE TABLE "ChoiceList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "ChoiceScope" NOT NULL,
    "packId" TEXT,
    "worldId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoiceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChoiceOption" (
    "id" TEXT NOT NULL,
    "choiceListId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChoiceOption_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "EntityField" ADD COLUMN "choiceListId" TEXT;

-- AddColumn
ALTER TABLE "LocationTypeField" ADD COLUMN "choiceListId" TEXT;

-- AddColumn
ALTER TABLE "EntityTypeTemplateField" ADD COLUMN "choiceListId" TEXT;

-- AddColumn
ALTER TABLE "LocationTypeTemplateField" ADD COLUMN "choiceListId" TEXT;

-- DropColumn
ALTER TABLE "EntityTypeTemplateField" DROP COLUMN "choices";

-- DropColumn
ALTER TABLE "LocationTypeTemplateField" DROP COLUMN "choices";

-- DropTable
DROP TABLE IF EXISTS "EntityFieldChoice";

-- DropTable
DROP TABLE IF EXISTS "LocationTypeFieldChoice";

-- AlterEnum
CREATE TYPE "EntityFieldType_new" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'CHOICE', 'ENTITY_REFERENCE', 'LOCATION_REFERENCE');
ALTER TABLE "EntityField" ALTER COLUMN "fieldType" TYPE "EntityFieldType_new" USING "fieldType"::text::"EntityFieldType_new";
ALTER TABLE "EntityTypeTemplateField" ALTER COLUMN "fieldType" TYPE "EntityFieldType_new" USING "fieldType"::text::"EntityFieldType_new";
DROP TYPE "EntityFieldType";
ALTER TYPE "EntityFieldType_new" RENAME TO "EntityFieldType";

-- AlterEnum
CREATE TYPE "LocationFieldType_new" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'CHOICE', 'ENTITY_REFERENCE', 'LOCATION_REFERENCE');
ALTER TABLE "LocationTypeField" ALTER COLUMN "fieldType" TYPE "LocationFieldType_new" USING "fieldType"::text::"LocationFieldType_new";
ALTER TABLE "LocationTypeTemplateField" ALTER COLUMN "fieldType" TYPE "LocationFieldType_new" USING "fieldType"::text::"LocationFieldType_new";
DROP TYPE "LocationFieldType";
ALTER TYPE "LocationFieldType_new" RENAME TO "LocationFieldType";

-- CreateIndex
CREATE INDEX "ChoiceList_packId_idx" ON "ChoiceList"("packId");

-- CreateIndex
CREATE INDEX "ChoiceList_worldId_idx" ON "ChoiceList"("worldId");

-- CreateIndex
CREATE UNIQUE INDEX "ChoiceOption_choiceListId_value_key" ON "ChoiceOption"("choiceListId", "value");

-- CreateIndex
CREATE INDEX "ChoiceOption_choiceListId_idx" ON "ChoiceOption"("choiceListId");

-- CreateIndex
CREATE INDEX "EntityTypeTemplateField_choiceListId_idx" ON "EntityTypeTemplateField"("choiceListId");

-- CreateIndex
CREATE INDEX "LocationTypeTemplateField_choiceListId_idx" ON "LocationTypeTemplateField"("choiceListId");

-- CreateIndex
CREATE INDEX "EntityField_choiceListId_idx" ON "EntityField"("choiceListId");

-- CreateIndex
CREATE INDEX "LocationTypeField_choiceListId_idx" ON "LocationTypeField"("choiceListId");

-- AddForeignKey
ALTER TABLE "ChoiceList" ADD CONSTRAINT "ChoiceList_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoiceList" ADD CONSTRAINT "ChoiceList_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoiceOption" ADD CONSTRAINT "ChoiceOption_choiceListId_fkey" FOREIGN KEY ("choiceListId") REFERENCES "ChoiceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTypeTemplateField" ADD CONSTRAINT "EntityTypeTemplateField_choiceListId_fkey" FOREIGN KEY ("choiceListId") REFERENCES "ChoiceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeTemplateField" ADD CONSTRAINT "LocationTypeTemplateField_choiceListId_fkey" FOREIGN KEY ("choiceListId") REFERENCES "ChoiceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityField" ADD CONSTRAINT "EntityField_choiceListId_fkey" FOREIGN KEY ("choiceListId") REFERENCES "ChoiceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeField" ADD CONSTRAINT "LocationTypeField_choiceListId_fkey" FOREIGN KEY ("choiceListId") REFERENCES "ChoiceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
