-- DropForeignKey
ALTER TABLE "ChoiceList" DROP CONSTRAINT "ChoiceList_packId_fkey";

-- DropForeignKey
ALTER TABLE "ChoiceList" DROP CONSTRAINT "ChoiceList_worldId_fkey";

-- DropForeignKey
ALTER TABLE "ImageVariant" DROP CONSTRAINT "ImageVariant_imageAssetId_fkey";

-- DropForeignKey
ALTER TABLE "RecordImage" DROP CONSTRAINT "RecordImage_imageAssetId_fkey";

-- DropForeignKey
ALTER TABLE "SessionNote" DROP CONSTRAINT "SessionNote_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "SessionNoteDraft" DROP CONSTRAINT "SessionNoteDraft_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "SessionNoteReference" DROP CONSTRAINT "SessionNoteReference_sessionNoteId_fkey";

-- DropForeignKey
ALTER TABLE "SessionTimelineEntry" DROP CONSTRAINT "SessionTimelineEntry_sessionId_fkey";

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNoteDraft" ADD CONSTRAINT "SessionNoteDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNoteReference" ADD CONSTRAINT "SessionNoteReference_sessionNoteId_fkey" FOREIGN KEY ("sessionNoteId") REFERENCES "SessionNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTimelineEntry" ADD CONSTRAINT "SessionTimelineEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoiceList" ADD CONSTRAINT "ChoiceList_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChoiceList" ADD CONSTRAINT "ChoiceList_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageVariant" ADD CONSTRAINT "ImageVariant_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "ImageAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordImage" ADD CONSTRAINT "RecordImage_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "ImageAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "LocationTypeRuleTemplate_parentLocationTypeTemplateId_childLoca" RENAME TO "LocationTypeRuleTemplate_parentLocationTypeTemplateId_child_key";
