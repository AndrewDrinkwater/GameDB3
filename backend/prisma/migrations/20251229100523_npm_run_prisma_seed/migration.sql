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

-- RenameIndex
ALTER INDEX "LocationTypeRuleTemplate_parentLocationTypeTemplateId_childLoca" RENAME TO "LocationTypeRuleTemplate_parentLocationTypeTemplateId_child_key";

-- RenameIndex
ALTER INDEX "Relationship_worldId_relationshipTypeId_fromEntityId_toEntityId" RENAME TO "Relationship_worldId_relationshipTypeId_fromEntityId_toEnti_key";

-- RenameIndex
ALTER INDEX "RelationshipTypeRule_relationshipTypeId_fromEntityTypeId_toEnti" RENAME TO "RelationshipTypeRule_relationshipTypeId_fromEntityTypeId_to_key";
