-- DropForeignKey
ALTER TABLE IF EXISTS "SessionNote" DROP CONSTRAINT IF EXISTS "SessionNote_sessionId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "SessionNoteDraft" DROP CONSTRAINT IF EXISTS "SessionNoteDraft_sessionId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "SessionNoteReference" DROP CONSTRAINT IF EXISTS "SessionNoteReference_sessionNoteId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "SessionTimelineEntry" DROP CONSTRAINT IF EXISTS "SessionTimelineEntry_sessionId_fkey";

-- AddForeignKey
ALTER TABLE IF EXISTS "SessionNote" ADD CONSTRAINT "SessionNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "SessionNoteDraft" ADD CONSTRAINT "SessionNoteDraft_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "SessionNoteReference" ADD CONSTRAINT "SessionNoteReference_sessionNoteId_fkey" FOREIGN KEY ("sessionNoteId") REFERENCES "SessionNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "SessionTimelineEntry" ADD CONSTRAINT "SessionTimelineEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX IF EXISTS "LocationTypeRuleTemplate_parentLocationTypeTemplateId_childLoca" RENAME TO "LocationTypeRuleTemplate_parentLocationTypeTemplateId_child_key";

-- RenameIndex
ALTER INDEX IF EXISTS "Relationship_worldId_relationshipTypeId_fromEntityId_toEntityId" RENAME TO "Relationship_worldId_relationshipTypeId_fromEntityId_toEnti_key";

-- RenameIndex
ALTER INDEX IF EXISTS "RelationshipTypeRule_relationshipTypeId_fromEntityTypeId_toEnti" RENAME TO "RelationshipTypeRule_relationshipTypeId_fromEntityTypeId_to_key";
