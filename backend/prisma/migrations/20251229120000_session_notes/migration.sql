-- CreateEnum
CREATE TYPE "SessionTimelineEntryType" AS ENUM ('NOTE_PUBLISHED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "campaignId" TEXT,
    "title" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionNote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionNoteDraft" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "lastSavedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionNoteDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionNoteReference" (
    "id" TEXT NOT NULL,
    "sessionNoteId" TEXT NOT NULL,
    "targetType" "NoteTagType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionNoteReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTimelineEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "SessionTimelineEntryType" NOT NULL,
    "noteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionTimelineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_worldId_idx" ON "Session"("worldId");

-- CreateIndex
CREATE INDEX "Session_campaignId_idx" ON "Session"("campaignId");

-- CreateIndex
CREATE INDEX "SessionNote_sessionId_idx" ON "SessionNote"("sessionId");

-- CreateIndex
CREATE INDEX "SessionNote_authorId_idx" ON "SessionNote"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionNoteDraft_sessionId_authorId_key" ON "SessionNoteDraft"("sessionId", "authorId");

-- CreateIndex
CREATE INDEX "SessionNoteDraft_authorId_idx" ON "SessionNoteDraft"("authorId");

-- CreateIndex
CREATE INDEX "SessionNoteReference_sessionNoteId_idx" ON "SessionNoteReference"("sessionNoteId");

-- CreateIndex
CREATE INDEX "SessionNoteReference_targetType_targetId_idx" ON "SessionNoteReference"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "SessionTimelineEntry_sessionId_idx" ON "SessionTimelineEntry"("sessionId");

-- CreateIndex
CREATE INDEX "SessionTimelineEntry_noteId_idx" ON "SessionTimelineEntry"("noteId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNoteDraft" ADD CONSTRAINT "SessionNoteDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNoteDraft" ADD CONSTRAINT "SessionNoteDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNoteReference" ADD CONSTRAINT "SessionNoteReference_sessionNoteId_fkey" FOREIGN KEY ("sessionNoteId") REFERENCES "SessionNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTimelineEntry" ADD CONSTRAINT "SessionTimelineEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTimelineEntry" ADD CONSTRAINT "SessionTimelineEntry_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "SessionNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
