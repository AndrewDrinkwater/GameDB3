-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('ACTIVE', 'EXPIRED');

-- CreateTable
CREATE TABLE "RelationshipType" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fromLabel" TEXT NOT NULL,
    "toLabel" TEXT NOT NULL,
    "pastFromLabel" TEXT,
    "pastToLabel" TEXT,
    "isPeerable" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationshipType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipTypeRule" (
    "id" TEXT NOT NULL,
    "relationshipTypeId" TEXT NOT NULL,
    "fromEntityTypeId" TEXT NOT NULL,
    "toEntityTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationshipTypeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "relationshipTypeId" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "peerGroupId" TEXT,
    "status" "RelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
    "visibilityScope" "EntityAccessScope" NOT NULL DEFAULT 'GLOBAL',
    "visibilityRefId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiredAt" TIMESTAMP(3),

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelationshipType_worldId_idx" ON "RelationshipType"("worldId");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipTypeRule_relationshipTypeId_fromEntityTypeId_toEntityTypeId_key" ON "RelationshipTypeRule"("relationshipTypeId", "fromEntityTypeId", "toEntityTypeId");

-- CreateIndex
CREATE INDEX "RelationshipTypeRule_relationshipTypeId_idx" ON "RelationshipTypeRule"("relationshipTypeId");

-- CreateIndex
CREATE INDEX "RelationshipTypeRule_fromEntityTypeId_idx" ON "RelationshipTypeRule"("fromEntityTypeId");

-- CreateIndex
CREATE INDEX "RelationshipTypeRule_toEntityTypeId_idx" ON "RelationshipTypeRule"("toEntityTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_worldId_relationshipTypeId_fromEntityId_toEntityId_key" ON "Relationship"("worldId", "relationshipTypeId", "fromEntityId", "toEntityId");

-- CreateIndex
CREATE INDEX "Relationship_worldId_idx" ON "Relationship"("worldId");

-- CreateIndex
CREATE INDEX "Relationship_relationshipTypeId_idx" ON "Relationship"("relationshipTypeId");

-- CreateIndex
CREATE INDEX "Relationship_fromEntityId_idx" ON "Relationship"("fromEntityId");

-- CreateIndex
CREATE INDEX "Relationship_toEntityId_idx" ON "Relationship"("toEntityId");

-- CreateIndex
CREATE INDEX "Relationship_peerGroupId_idx" ON "Relationship"("peerGroupId");

-- AddForeignKey
ALTER TABLE "RelationshipType" ADD CONSTRAINT "RelationshipType_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipTypeRule" ADD CONSTRAINT "RelationshipTypeRule_relationshipTypeId_fkey" FOREIGN KEY ("relationshipTypeId") REFERENCES "RelationshipType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipTypeRule" ADD CONSTRAINT "RelationshipTypeRule_fromEntityTypeId_fkey" FOREIGN KEY ("fromEntityTypeId") REFERENCES "EntityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipTypeRule" ADD CONSTRAINT "RelationshipTypeRule_toEntityTypeId_fkey" FOREIGN KEY ("toEntityTypeId") REFERENCES "EntityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_relationshipTypeId_fkey" FOREIGN KEY ("relationshipTypeId") REFERENCES "RelationshipType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddConstraint
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_fromEntity_toEntity_check" CHECK ("fromEntityId" <> "toEntityId");
