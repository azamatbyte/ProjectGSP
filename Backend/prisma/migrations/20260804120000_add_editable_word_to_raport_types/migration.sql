ALTER TABLE "RaportTypes"
ADD COLUMN "editable_word" TEXT DEFAULT '';

UPDATE "RaportTypes"
SET "editable_word" = COALESCE("data"->>'editableWord', '');
