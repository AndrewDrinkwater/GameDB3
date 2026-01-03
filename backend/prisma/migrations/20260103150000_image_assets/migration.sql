-- CreateEnum
CREATE TYPE "ImageVariantType" AS ENUM ('THUMB', 'SMALL', 'MEDIUM', 'LARGE');

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "originalFileName" TEXT,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "contentHash" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageVariant" (
    "id" TEXT NOT NULL,
    "imageAssetId" TEXT NOT NULL,
    "variant" "ImageVariantType" NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordImage" (
    "id" TEXT NOT NULL,
    "imageAssetId" TEXT NOT NULL,
    "entityId" TEXT,
    "locationId" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageAsset_worldId_contentHash_key" ON "ImageAsset"("worldId", "contentHash");

-- CreateIndex
CREATE INDEX "ImageAsset_worldId_idx" ON "ImageAsset"("worldId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageVariant_imageAssetId_variant_key" ON "ImageVariant"("imageAssetId", "variant");

-- CreateIndex
CREATE INDEX "ImageVariant_imageAssetId_idx" ON "ImageVariant"("imageAssetId");

-- CreateIndex
CREATE INDEX "RecordImage_imageAssetId_idx" ON "RecordImage"("imageAssetId");

-- CreateIndex
CREATE INDEX "RecordImage_entityId_idx" ON "RecordImage"("entityId");

-- CreateIndex
CREATE INDEX "RecordImage_locationId_idx" ON "RecordImage"("locationId");

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageVariant" ADD CONSTRAINT "ImageVariant_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "ImageAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordImage" ADD CONSTRAINT "RecordImage_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "ImageAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordImage" ADD CONSTRAINT "RecordImage_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordImage" ADD CONSTRAINT "RecordImage_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
