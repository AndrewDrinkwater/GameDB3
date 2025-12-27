-- Add GM visibility to note visibility enum
ALTER TYPE "NoteVisibility" ADD VALUE IF NOT EXISTS 'GM';

-- Add sharing fields for GM notes
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "shareWithArchitect" BOOLEAN NOT NULL DEFAULT false;

-- Create note share join table
CREATE TABLE IF NOT EXISTS "NoteShare" (
  "noteId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoteShare_pkey" PRIMARY KEY ("noteId", "characterId"),
  CONSTRAINT "NoteShare_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NoteShare_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "NoteShare_characterId_idx" ON "NoteShare"("characterId");
