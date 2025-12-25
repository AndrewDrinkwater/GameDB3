-- CreateTable
CREATE TABLE "WorldGameMaster" (
    "worldId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldGameMaster_pkey" PRIMARY KEY ("worldId","userId")
);

-- CreateIndex
CREATE INDEX "WorldGameMaster_userId_idx" ON "WorldGameMaster"("userId");

-- AddForeignKey
ALTER TABLE "WorldGameMaster" ADD CONSTRAINT "WorldGameMaster_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldGameMaster" ADD CONSTRAINT "WorldGameMaster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
