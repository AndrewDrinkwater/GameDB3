-- CreateEnum
CREATE TYPE "SystemViewType" AS ENUM ('LIST', 'FORM');

-- CreateEnum
CREATE TYPE "SystemFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'BOOLEAN', 'SELECT', 'DATE', 'EMAIL');

-- CreateTable
CREATE TABLE "SystemView" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "viewType" "SystemViewType" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "description" TEXT,
    "adminOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemViewField" (
    "id" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "SystemFieldType" NOT NULL,
    "listVisible" BOOLEAN NOT NULL DEFAULT true,
    "formVisible" BOOLEAN NOT NULL DEFAULT true,
    "listOrder" INTEGER NOT NULL,
    "formOrder" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "optionsListKey" TEXT,
    "width" TEXT,

    CONSTRAINT "SystemViewField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemView_key_key" ON "SystemView"("key");

-- CreateIndex
CREATE INDEX "SystemViewField_viewId_idx" ON "SystemViewField"("viewId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemViewField_viewId_fieldKey_key" ON "SystemViewField"("viewId", "fieldKey");

-- AddForeignKey
ALTER TABLE "SystemViewField" ADD CONSTRAINT "SystemViewField_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "SystemView"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
