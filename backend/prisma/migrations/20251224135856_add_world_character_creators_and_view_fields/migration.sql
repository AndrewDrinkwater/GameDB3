-- AlterTable
ALTER TABLE "SystemViewField" ADD COLUMN     "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referenceScope" TEXT;

-- CreateTable
CREATE TABLE "WorldCharacterCreator" (
    "worldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldCharacterCreator_pkey" PRIMARY KEY ("worldId","userId")
);

-- CreateIndex
CREATE INDEX "WorldCharacterCreator_userId_idx" ON "WorldCharacterCreator"("userId");

-- AddForeignKey
ALTER TABLE "WorldCharacterCreator" ADD CONSTRAINT "WorldCharacterCreator_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldCharacterCreator" ADD CONSTRAINT "WorldCharacterCreator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
