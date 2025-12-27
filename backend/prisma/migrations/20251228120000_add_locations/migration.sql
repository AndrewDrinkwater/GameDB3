-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LocationFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'BOOLEAN', 'CHOICE', 'ENTITY_REFERENCE', 'LOCATION_REFERENCE');

-- AlterTable
ALTER TABLE "Entity" ADD COLUMN     "currentLocationId" TEXT;

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Note" ALTER COLUMN "entityId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "LocationType" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "colour" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationTypeField" (
    "id" TEXT NOT NULL,
    "locationTypeId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "fieldType" "LocationFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" JSONB,
    "validationRules" JSONB,
    "listOrder" INTEGER NOT NULL DEFAULT 0,
    "formOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationTypeField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationTypeFieldChoice" (
    "id" TEXT NOT NULL,
    "locationTypeFieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER,
    "pillColor" TEXT,
    "textColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationTypeFieldChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationTypeRule" (
    "id" TEXT NOT NULL,
    "parentTypeId" TEXT NOT NULL,
    "childTypeId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationTypeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "locationTypeId" TEXT NOT NULL,
    "parentLocationId" TEXT,
    "status" "LocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationFieldValue" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "valueString" TEXT,
    "valueText" TEXT,
    "valueBoolean" BOOLEAN,
    "valueNumber" DOUBLE PRECISION,
    "valueJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationAccess" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "accessType" "EntityAccessType" NOT NULL,
    "scopeType" "EntityAccessScope" NOT NULL,
    "scopeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationAccess_pkey" PRIMARY KEY ("id")
);

-- Seed default locations for existing entities
INSERT INTO "LocationType" ("id", "worldId", "name", "description", "createdAt", "updatedAt")
SELECT
    'default-location-type-' || w."id",
    w."id",
    'Default Location Type',
    'System placeholder created during migration.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "World" w
WHERE EXISTS (
    SELECT 1 FROM "Entity" e WHERE e."worldId" = w."id"
)
AND NOT EXISTS (
    SELECT 1 FROM "LocationType" lt WHERE lt."id" = 'default-location-type-' || w."id"
);

INSERT INTO "Location" (
    "id",
    "worldId",
    "name",
    "description",
    "locationTypeId",
    "parentLocationId",
    "status",
    "metadata",
    "createdById",
    "createdAt",
    "updatedAt"
)
SELECT
    'default-location-' || w."id",
    w."id",
    'Default Location',
    'System placeholder created during migration.',
    'default-location-type-' || w."id",
    NULL,
    'ACTIVE',
    NULL,
    w."primaryArchitectId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "World" w
WHERE EXISTS (
    SELECT 1 FROM "Entity" e WHERE e."worldId" = w."id"
)
AND NOT EXISTS (
    SELECT 1 FROM "Location" l WHERE l."id" = 'default-location-' || w."id"
);

UPDATE "Entity"
SET "currentLocationId" = 'default-location-' || "worldId"
WHERE "currentLocationId" IS NULL;

-- AlterTable
ALTER TABLE "Entity" ALTER COLUMN "currentLocationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "LocationType_worldId_idx" ON "LocationType"("worldId");

-- CreateIndex
CREATE INDEX "LocationTypeField_locationTypeId_idx" ON "LocationTypeField"("locationTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationTypeField_locationTypeId_fieldKey_key" ON "LocationTypeField"("locationTypeId", "fieldKey");

-- CreateIndex
CREATE INDEX "LocationTypeFieldChoice_locationTypeFieldId_idx" ON "LocationTypeFieldChoice"("locationTypeFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationTypeFieldChoice_locationTypeFieldId_value_key" ON "LocationTypeFieldChoice"("locationTypeFieldId", "value");

-- CreateIndex
CREATE INDEX "LocationTypeRule_parentTypeId_idx" ON "LocationTypeRule"("parentTypeId");

-- CreateIndex
CREATE INDEX "LocationTypeRule_childTypeId_idx" ON "LocationTypeRule"("childTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationTypeRule_parentTypeId_childTypeId_key" ON "LocationTypeRule"("parentTypeId", "childTypeId");

-- CreateIndex
CREATE INDEX "Location_worldId_idx" ON "Location"("worldId");

-- CreateIndex
CREATE INDEX "Location_locationTypeId_idx" ON "Location"("locationTypeId");

-- CreateIndex
CREATE INDEX "Location_parentLocationId_idx" ON "Location"("parentLocationId");

-- CreateIndex
CREATE INDEX "Location_createdById_idx" ON "Location"("createdById");

-- CreateIndex
CREATE INDEX "LocationFieldValue_locationId_idx" ON "LocationFieldValue"("locationId");

-- CreateIndex
CREATE INDEX "LocationFieldValue_fieldId_idx" ON "LocationFieldValue"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationFieldValue_locationId_fieldId_key" ON "LocationFieldValue"("locationId", "fieldId");

-- CreateIndex
CREATE INDEX "LocationAccess_locationId_idx" ON "LocationAccess"("locationId");

-- CreateIndex
CREATE INDEX "LocationAccess_scopeType_scopeId_idx" ON "LocationAccess"("scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "Entity_currentLocationId_idx" ON "Entity"("currentLocationId");

-- CreateIndex
CREATE INDEX "Note_locationId_idx" ON "Note"("locationId");

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationType" ADD CONSTRAINT "LocationType_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeField" ADD CONSTRAINT "LocationTypeField_locationTypeId_fkey" FOREIGN KEY ("locationTypeId") REFERENCES "LocationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeFieldChoice" ADD CONSTRAINT "LocationTypeFieldChoice_locationTypeFieldId_fkey" FOREIGN KEY ("locationTypeFieldId") REFERENCES "LocationTypeField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeRule" ADD CONSTRAINT "LocationTypeRule_parentTypeId_fkey" FOREIGN KEY ("parentTypeId") REFERENCES "LocationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeRule" ADD CONSTRAINT "LocationTypeRule_childTypeId_fkey" FOREIGN KEY ("childTypeId") REFERENCES "LocationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_locationTypeId_fkey" FOREIGN KEY ("locationTypeId") REFERENCES "LocationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentLocationId_fkey" FOREIGN KEY ("parentLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationFieldValue" ADD CONSTRAINT "LocationFieldValue_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationFieldValue" ADD CONSTRAINT "LocationFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "LocationTypeField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationAccess" ADD CONSTRAINT "LocationAccess_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
