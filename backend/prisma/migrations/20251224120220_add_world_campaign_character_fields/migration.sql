/*
  Warnings:

  - You are about to drop the column `ownerId` on the `World` table. All the data in the column will be lost.
  - Added the required column `createdById` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gmUserId` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `worldId` to the `Character` table without a default value. This is not possible if the table is not empty.
  - Added the required column `primaryArchitectId` to the `World` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CharacterCampaignStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- DropForeignKey
ALTER TABLE "World" DROP CONSTRAINT "World_ownerId_fkey";

-- DropIndex
DROP INDEX "World_ownerId_idx";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "gmUserId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "statusKey" TEXT,
ADD COLUMN     "worldId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CharacterCampaign" ADD COLUMN     "status" "CharacterCampaignStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "World" DROP COLUMN "ownerId",
ADD COLUMN     "dmLabelKey" TEXT,
ADD COLUMN     "primaryArchitectId" TEXT NOT NULL,
ADD COLUMN     "themeKey" TEXT;

-- CreateTable
CREATE TABLE "WorldArchitect" (
    "worldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldArchitect_pkey" PRIMARY KEY ("worldId","userId")
);

-- CreateTable
CREATE TABLE "WorldCampaignCreator" (
    "worldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldCampaignCreator_pkey" PRIMARY KEY ("worldId","userId")
);

-- CreateTable
CREATE TABLE "CampaignCharacterCreator" (
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignCharacterCreator_pkey" PRIMARY KEY ("campaignId","userId")
);

-- CreateIndex
CREATE INDEX "WorldArchitect_userId_idx" ON "WorldArchitect"("userId");

-- CreateIndex
CREATE INDEX "WorldCampaignCreator_userId_idx" ON "WorldCampaignCreator"("userId");

-- CreateIndex
CREATE INDEX "CampaignCharacterCreator_userId_idx" ON "CampaignCharacterCreator"("userId");

-- CreateIndex
CREATE INDEX "Campaign_gmUserId_idx" ON "Campaign"("gmUserId");

-- CreateIndex
CREATE INDEX "Campaign_createdById_idx" ON "Campaign"("createdById");

-- CreateIndex
CREATE INDEX "Character_worldId_idx" ON "Character"("worldId");

-- CreateIndex
CREATE INDEX "World_primaryArchitectId_idx" ON "World"("primaryArchitectId");

-- AddForeignKey
ALTER TABLE "World" ADD CONSTRAINT "World_primaryArchitectId_fkey" FOREIGN KEY ("primaryArchitectId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_gmUserId_fkey" FOREIGN KEY ("gmUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldArchitect" ADD CONSTRAINT "WorldArchitect_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldArchitect" ADD CONSTRAINT "WorldArchitect_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldCampaignCreator" ADD CONSTRAINT "WorldCampaignCreator_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldCampaignCreator" ADD CONSTRAINT "WorldCampaignCreator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCharacterCreator" ADD CONSTRAINT "CampaignCharacterCreator_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCharacterCreator" ADD CONSTRAINT "CampaignCharacterCreator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
