-- CreateTable
CREATE TABLE "UserListViewPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewKey" TEXT NOT NULL,
    "entityTypeId" TEXT,
    "columnsJson" JSONB,
    "filtersJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserListViewPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityTypeListViewDefault" (
    "id" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "columnsJson" JSONB,
    "filtersJson" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityTypeListViewDefault_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserListViewPreference_userId_idx" ON "UserListViewPreference"("userId");

-- CreateIndex
CREATE INDEX "UserListViewPreference_viewKey_idx" ON "UserListViewPreference"("viewKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserListViewPreference_userId_viewKey_entityTypeId_key" ON "UserListViewPreference"("userId", "viewKey", "entityTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityTypeListViewDefault_entityTypeId_key" ON "EntityTypeListViewDefault"("entityTypeId");

-- AddForeignKey
ALTER TABLE "UserListViewPreference" ADD CONSTRAINT "UserListViewPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserListViewPreference" ADD CONSTRAINT "UserListViewPreference_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "EntityType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTypeListViewDefault" ADD CONSTRAINT "EntityTypeListViewDefault_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "EntityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityTypeListViewDefault" ADD CONSTRAINT "EntityTypeListViewDefault_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
