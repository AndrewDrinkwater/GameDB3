-- CreateEnum
CREATE TYPE "PackPosture" AS ENUM ('opinionated', 'minimal');

-- CreateTable
CREATE TABLE "Pack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "posture" "PackPosture" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityTypeTemplate" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityTypeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityTypeTemplateField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "fieldType" "EntityFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT true,
    "choices" JSONB,
    "validationRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityTypeTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationTypeTemplate" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationTypeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationTypeTemplateField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "fieldType" "LocationFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT true,
    "choices" JSONB,
    "validationRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationTypeTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationTypeRuleTemplate" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "parentLocationTypeTemplateId" TEXT NOT NULL,
    "childLocationTypeTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationTypeRuleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipTypeTemplate" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPeerable" BOOLEAN NOT NULL DEFAULT false,
    "fromLabel" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL,
    "pastFromLabel" TEXT,
    "pastToLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationshipTypeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipTypeTemplateRole" (
    "id" TEXT NOT NULL,
    "relationshipTypeTemplateId" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "toRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationshipTypeTemplateRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pack_createdById_idx" ON "Pack"("createdById");

-- CreateIndex
CREATE INDEX "EntityTypeTemplate_packId_idx" ON "EntityTypeTemplate"("packId");

-- CreateIndex
CREATE INDEX "EntityTypeTemplateField_templateId_idx" ON "EntityTypeTemplateField"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityTypeTemplateField_templateId_fieldKey_key" ON "EntityTypeTemplateField"("templateId", "fieldKey");

-- CreateIndex
CREATE INDEX "LocationTypeTemplate_packId_idx" ON "LocationTypeTemplate"("packId");

-- CreateIndex
CREATE INDEX "LocationTypeTemplateField_templateId_idx" ON "LocationTypeTemplateField"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationTypeTemplateField_templateId_fieldKey_key" ON "LocationTypeTemplateField"("templateId", "fieldKey");

-- CreateIndex
CREATE INDEX "LocationTypeRuleTemplate_packId_idx" ON "LocationTypeRuleTemplate"("packId");

-- CreateIndex
CREATE INDEX "LocationTypeRuleTemplate_parentLocationTypeTemplateId_idx" ON "LocationTypeRuleTemplate"("parentLocationTypeTemplateId");

-- CreateIndex
CREATE INDEX "LocationTypeRuleTemplate_childLocationTypeTemplateId_idx" ON "LocationTypeRuleTemplate"("childLocationTypeTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationTypeRuleTemplate_parentLocationTypeTemplateId_childLoca_key" ON "LocationTypeRuleTemplate"("parentLocationTypeTemplateId", "childLocationTypeTemplateId");

-- CreateIndex
CREATE INDEX "RelationshipTypeTemplate_packId_idx" ON "RelationshipTypeTemplate"("packId");

-- CreateIndex
CREATE INDEX "RelationshipTypeTemplateRole_relationshipTypeTemplateId_idx" ON "RelationshipTypeTemplateRole"("relationshipTypeTemplateId");

-- AddForeignKey
ALTER TABLE "Pack" ADD CONSTRAINT "Pack_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTypeTemplate" ADD CONSTRAINT "EntityTypeTemplate_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTypeTemplateField" ADD CONSTRAINT "EntityTypeTemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EntityTypeTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeTemplate" ADD CONSTRAINT "LocationTypeTemplate_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeTemplateField" ADD CONSTRAINT "LocationTypeTemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LocationTypeTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeRuleTemplate" ADD CONSTRAINT "LocationTypeRuleTemplate_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeRuleTemplate" ADD CONSTRAINT "LocationTypeRuleTemplate_parentLocationTypeTemplateId_fkey" FOREIGN KEY ("parentLocationTypeTemplateId") REFERENCES "LocationTypeTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationTypeRuleTemplate" ADD CONSTRAINT "LocationTypeRuleTemplate_childLocationTypeTemplateId_fkey" FOREIGN KEY ("childLocationTypeTemplateId") REFERENCES "LocationTypeTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipTypeTemplate" ADD CONSTRAINT "RelationshipTypeTemplate_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipTypeTemplateRole" ADD CONSTRAINT "RelationshipTypeTemplateRole_relationshipTypeTemplateId_fkey" FOREIGN KEY ("relationshipTypeTemplateId") REFERENCES "RelationshipTypeTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
