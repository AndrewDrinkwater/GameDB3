-- CreateEnum
CREATE TYPE "PropertyValueType" AS ENUM ('STRING', 'INTEGER', 'BOOLEAN', 'JSON', 'DECIMAL');

-- CreateTable
CREATE TABLE "SystemProperty" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueType" "PropertyValueType" NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemUserPreferenceDefault" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueType" "PropertyValueType" NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemUserPreferenceDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemUserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueType" "PropertyValueType" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemUserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemChoice" (
    "id" TEXT NOT NULL,
    "listKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemControl" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemUserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemUserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "SystemRoleControl" (
    "roleId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemRoleControl_pkey" PRIMARY KEY ("roleId","controlId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemProperty_key_key" ON "SystemProperty"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SystemUserPreferenceDefault_key_key" ON "SystemUserPreferenceDefault"("key");

-- CreateIndex
CREATE INDEX "SystemUserPreference_userId_idx" ON "SystemUserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemUserPreference_userId_key_key" ON "SystemUserPreference"("userId", "key");

-- CreateIndex
CREATE INDEX "SystemChoice_listKey_idx" ON "SystemChoice"("listKey");

-- CreateIndex
CREATE UNIQUE INDEX "SystemChoice_listKey_value_key" ON "SystemChoice"("listKey", "value");

-- CreateIndex
CREATE UNIQUE INDEX "SystemRole_key_key" ON "SystemRole"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SystemControl_key_key" ON "SystemControl"("key");

-- CreateIndex
CREATE INDEX "SystemUserRole_roleId_idx" ON "SystemUserRole"("roleId");

-- CreateIndex
CREATE INDEX "SystemRoleControl_controlId_idx" ON "SystemRoleControl"("controlId");

-- AddForeignKey
ALTER TABLE "SystemUserPreference" ADD CONSTRAINT "SystemUserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemUserRole" ADD CONSTRAINT "SystemUserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemUserRole" ADD CONSTRAINT "SystemUserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "SystemRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemRoleControl" ADD CONSTRAINT "SystemRoleControl_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "SystemRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemRoleControl" ADD CONSTRAINT "SystemRoleControl_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "SystemControl"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
