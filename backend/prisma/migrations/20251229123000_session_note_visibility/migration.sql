-- CreateEnum
CREATE TYPE "SessionNoteVisibility" AS ENUM ('SHARED', 'PRIVATE');

-- AlterTable
ALTER TABLE "SessionNote" ADD COLUMN "visibility" "SessionNoteVisibility" NOT NULL DEFAULT 'SHARED';

-- AlterTable
ALTER TABLE "SessionNoteDraft" ADD COLUMN "visibility" "SessionNoteVisibility" NOT NULL DEFAULT 'SHARED';
