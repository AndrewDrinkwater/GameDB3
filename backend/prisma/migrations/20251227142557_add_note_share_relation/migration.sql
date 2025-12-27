-- DropForeignKey
ALTER TABLE "NoteShare" DROP CONSTRAINT "NoteShare_characterId_fkey";

-- DropForeignKey
ALTER TABLE "NoteShare" DROP CONSTRAINT "NoteShare_noteId_fkey";

-- AddForeignKey
ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
