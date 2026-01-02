-- AddColumn
ALTER TABLE "EntityType" ADD COLUMN "isDeprecated" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn
ALTER TABLE "LocationType" ADD COLUMN "isDeprecated" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn
ALTER TABLE "LocationTypeField" ADD COLUMN "isDeprecated" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn
ALTER TABLE "LocationTypeRule" ADD COLUMN "isDeprecated" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn
ALTER TABLE "EntityField" ADD COLUMN "isDeprecated" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn
ALTER TABLE "ChoiceList" ADD COLUMN "isDeprecated" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn
ALTER TABLE "ChoiceOption" ADD COLUMN "isDeprecated" BOOLEAN NOT NULL DEFAULT false;

-- AddColumn
ALTER TABLE "RelationshipType" ADD COLUMN "isDeprecated" BOOLEAN NOT NULL DEFAULT false;
