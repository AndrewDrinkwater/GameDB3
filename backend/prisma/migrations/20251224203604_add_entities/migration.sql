-- CreateEnum
CREATE TYPE "WorldEntityPermissionScope" AS ENUM ('ARCHITECT', 'ARCHITECT_GM', 'ARCHITECT_GM_PLAYER');

-- CreateEnum
CREATE TYPE "EntityFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'BOOLEAN', 'CHOICE', 'ENTITY_REFERENCE', 'LOCATION_REFERENCE');

-- CreateEnum
CREATE TYPE "EntityAccessType" AS ENUM ('READ', 'WRITE');

-- CreateEnum
CREATE TYPE "EntityAccessScope" AS ENUM ('GLOBAL', 'CAMPAIGN', 'CHARACTER');

-- AlterTable
ALTER TABLE "World" ADD COLUMN     "entityPermissionScope" "WorldEntityPermissionScope" NOT NULL DEFAULT 'ARCHITECT_GM_PLAYER';

-- CreateTable
CREATE TABLE "EntityType" (
    "id" TEXT NOT NULL,
    "worldId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityField" (
    "id" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "EntityFieldType" NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "listOrder" INTEGER NOT NULL DEFAULT 0,
    "formOrder" INTEGER NOT NULL DEFAULT 0,
    "referenceEntityTypeId" TEXT,
    "referenceLocationTypeKey" TEXT,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityFieldChoice" (
    "id" TEXT NOT NULL,
    "entityFieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityFieldChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityFieldValue" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "valueString" TEXT,
    "valueText" TEXT,
    "valueBoolean" BOOLEAN,
    "valueNumber" DOUBLE PRECISION,
    "valueJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityAccess" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "accessType" "EntityAccessType" NOT NULL,
    "scopeType" "EntityAccessScope" NOT NULL,
    "scopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntityType_worldId_idx" ON "EntityType"("worldId");

-- CreateIndex
CREATE INDEX "EntityType_createdById_idx" ON "EntityType"("createdById");

-- CreateIndex
CREATE INDEX "EntityField_entityTypeId_idx" ON "EntityField"("entityTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityField_entityTypeId_fieldKey_key" ON "EntityField"("entityTypeId", "fieldKey");

-- CreateIndex
CREATE INDEX "EntityFieldChoice_entityFieldId_idx" ON "EntityFieldChoice"("entityFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityFieldChoice_entityFieldId_value_key" ON "EntityFieldChoice"("entityFieldId", "value");

-- CreateIndex
CREATE INDEX "Entity_worldId_idx" ON "Entity"("worldId");

-- CreateIndex
CREATE INDEX "Entity_entityTypeId_idx" ON "Entity"("entityTypeId");

-- CreateIndex
CREATE INDEX "Entity_createdById_idx" ON "Entity"("createdById");

-- CreateIndex
CREATE INDEX "EntityFieldValue_entityId_idx" ON "EntityFieldValue"("entityId");

-- CreateIndex
CREATE INDEX "EntityFieldValue_fieldId_idx" ON "EntityFieldValue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityFieldValue_entityId_fieldId_key" ON "EntityFieldValue"("entityId", "fieldId");

-- CreateIndex
CREATE INDEX "EntityAccess_entityId_idx" ON "EntityAccess"("entityId");

-- CreateIndex
CREATE INDEX "EntityAccess_scopeType_scopeId_idx" ON "EntityAccess"("scopeType", "scopeId");

-- AddForeignKey
ALTER TABLE "EntityType" ADD CONSTRAINT "EntityType_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityType" ADD CONSTRAINT "EntityType_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityField" ADD CONSTRAINT "EntityField_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "EntityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityField" ADD CONSTRAINT "EntityField_referenceEntityTypeId_fkey" FOREIGN KEY ("referenceEntityTypeId") REFERENCES "EntityType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityFieldChoice" ADD CONSTRAINT "EntityFieldChoice_entityFieldId_fkey" FOREIGN KEY ("entityFieldId") REFERENCES "EntityField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "EntityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityFieldValue" ADD CONSTRAINT "EntityFieldValue_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityFieldValue" ADD CONSTRAINT "EntityFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "EntityField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAccess" ADD CONSTRAINT "EntityAccess_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
