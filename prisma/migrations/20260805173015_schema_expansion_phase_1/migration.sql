/*
  Warnings:

  - Added the required column `experiencePoints` to the `ContentMonster` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "ContentClassFeature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT,
    "subclassId" TEXT,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT,
    CONSTRAINT "ContentClassFeature_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ContentClass" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentClassFeature_subclassId_fkey" FOREIGN KEY ("subclassId") REFERENCES "ContentSubclass" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContentMonster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "monsterType" TEXT NOT NULL,
    "alignment" TEXT NOT NULL,
    "armorClass" INTEGER NOT NULL,
    "hitPoints" INTEGER NOT NULL,
    "hitDice" TEXT NOT NULL,
    "speed" TEXT NOT NULL,
    "abilityScores" TEXT NOT NULL,
    "savingThrows" TEXT,
    "skills" TEXT,
    "damageResistances" TEXT,
    "damageImmunities" TEXT,
    "damageVulnerabilities" TEXT,
    "conditionImmunities" TEXT,
    "senses" TEXT,
    "languages" TEXT,
    "challengeRating" TEXT NOT NULL,
    "experiencePoints" INTEGER NOT NULL,
    "actions" TEXT NOT NULL,
    "legendaryActions" TEXT,
    "description" TEXT,
    "extraData" TEXT,
    CONSTRAINT "ContentMonster_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- experiencePoints backfilled with 0 as a migration-only placeholder — this
-- app is about to do a full wipe-and-reimport (Phase 2.6), which overwrites
-- every row with a real CR-derived value, so no real data ever depends on
-- this placeholder existing.
INSERT INTO "new_ContentMonster" ("abilityScores", "actions", "alignment", "armorClass", "challengeRating", "conditionImmunities", "damageImmunities", "damageResistances", "damageVulnerabilities", "description", "experiencePoints", "extraData", "hitDice", "hitPoints", "id", "languages", "legendaryActions", "monsterType", "name", "savingThrows", "senses", "size", "skills", "slug", "sourceId", "speed") SELECT "abilityScores", "actions", "alignment", "armorClass", "challengeRating", "conditionImmunities", "damageImmunities", "damageResistances", "damageVulnerabilities", "description", 0, "extraData", "hitDice", "hitPoints", "id", "languages", "legendaryActions", "monsterType", "name", "savingThrows", "senses", "size", "skills", "slug", "sourceId", "speed" FROM "ContentMonster";
DROP TABLE "ContentMonster";
ALTER TABLE "new_ContentMonster" RENAME TO "ContentMonster";
CREATE INDEX "ContentMonster_challengeRating_idx" ON "ContentMonster"("challengeRating");
CREATE INDEX "ContentMonster_monsterType_idx" ON "ContentMonster"("monsterType");
CREATE UNIQUE INDEX "ContentMonster_sourceId_slug_key" ON "ContentMonster"("sourceId", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ContentClassFeature_classId_level_idx" ON "ContentClassFeature"("classId", "level");

-- CreateIndex
CREATE INDEX "ContentClassFeature_subclassId_level_idx" ON "ContentClassFeature"("subclassId", "level");
