-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContentBackground" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proficiencies" TEXT NOT NULL,
    "abilityBonuses" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "extraData" TEXT,
    CONSTRAINT "ContentBackground_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContentBackground" ("abilityBonuses", "description", "extraData", "feature", "id", "name", "proficiencies", "slug", "sourceId") SELECT "abilityBonuses", "description", "extraData", "feature", "id", "name", "proficiencies", "slug", "sourceId" FROM "ContentBackground";
DROP TABLE "ContentBackground";
ALTER TABLE "new_ContentBackground" RENAME TO "ContentBackground";
CREATE UNIQUE INDEX "ContentBackground_sourceId_slug_key" ON "ContentBackground"("sourceId", "slug");
CREATE TABLE "new_ContentClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hitDie" INTEGER NOT NULL,
    "primaryAbility" TEXT NOT NULL,
    "savingThrows" TEXT NOT NULL,
    "armorProfs" TEXT NOT NULL,
    "weaponProfs" TEXT NOT NULL,
    "skillChoices" TEXT NOT NULL,
    "spellcastingAbility" TEXT,
    "description" TEXT NOT NULL,
    "extraData" TEXT,
    CONSTRAINT "ContentClass_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContentClass" ("armorProfs", "description", "extraData", "hitDie", "id", "name", "primaryAbility", "savingThrows", "skillChoices", "slug", "sourceId", "spellcastingAbility", "weaponProfs") SELECT "armorProfs", "description", "extraData", "hitDie", "id", "name", "primaryAbility", "savingThrows", "skillChoices", "slug", "sourceId", "spellcastingAbility", "weaponProfs" FROM "ContentClass";
DROP TABLE "ContentClass";
ALTER TABLE "new_ContentClass" RENAME TO "ContentClass";
CREATE UNIQUE INDEX "ContentClass_sourceId_slug_key" ON "ContentClass"("sourceId", "slug");
CREATE TABLE "new_ContentClassFeature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT,
    "subclassId" TEXT,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "type" TEXT,
    CONSTRAINT "ContentClassFeature_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ContentClass" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentClassFeature_subclassId_fkey" FOREIGN KEY ("subclassId") REFERENCES "ContentSubclass" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContentClassFeature" ("classId", "description", "id", "level", "name", "subclassId", "type") SELECT "classId", "description", "id", "level", "name", "subclassId", "type" FROM "ContentClassFeature";
DROP TABLE "ContentClassFeature";
ALTER TABLE "new_ContentClassFeature" RENAME TO "ContentClassFeature";
CREATE INDEX "ContentClassFeature_classId_level_idx" ON "ContentClassFeature"("classId", "level");
CREATE INDEX "ContentClassFeature_subclassId_level_idx" ON "ContentClassFeature"("subclassId", "level");
CREATE TABLE "new_ContentClassOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "classId" TEXT,
    "pool" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "prerequisite" TEXT,
    "extraData" TEXT,
    CONSTRAINT "ContentClassOption_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentClassOption_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ContentClass" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ContentClassOption" ("classId", "description", "extraData", "id", "name", "pool", "prerequisite", "slug", "sourceId") SELECT "classId", "description", "extraData", "id", "name", "pool", "prerequisite", "slug", "sourceId" FROM "ContentClassOption";
DROP TABLE "ContentClassOption";
ALTER TABLE "new_ContentClassOption" RENAME TO "ContentClassOption";
CREATE UNIQUE INDEX "ContentClassOption_sourceId_slug_key" ON "ContentClassOption"("sourceId", "slug");
CREATE TABLE "new_ContentCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "effects" TEXT,
    "extraData" TEXT,
    CONSTRAINT "ContentCondition_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContentCondition" ("description", "effects", "extraData", "id", "name", "slug", "sourceId") SELECT "description", "effects", "extraData", "id", "name", "slug", "sourceId" FROM "ContentCondition";
DROP TABLE "ContentCondition";
ALTER TABLE "new_ContentCondition" RENAME TO "ContentCondition";
CREATE UNIQUE INDEX "ContentCondition_sourceId_slug_key" ON "ContentCondition"("sourceId", "slug");
CREATE TABLE "new_ContentFeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL,
    "prerequisite" TEXT,
    "description" TEXT NOT NULL,
    "extraData" TEXT,
    CONSTRAINT "ContentFeat_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContentFeat" ("category", "description", "extraData", "id", "name", "prerequisite", "slug", "sourceId") SELECT "category", "description", "extraData", "id", "name", "prerequisite", "slug", "sourceId" FROM "ContentFeat";
DROP TABLE "ContentFeat";
ALTER TABLE "new_ContentFeat" RENAME TO "ContentFeat";
CREATE UNIQUE INDEX "ContentFeat_sourceId_slug_key" ON "ContentFeat"("sourceId", "slug");
CREATE TABLE "new_ContentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemType" TEXT NOT NULL,
    "rarity" TEXT,
    "requiresAttunement" BOOLEAN NOT NULL,
    "cost" TEXT,
    "weight" TEXT,
    "damage" TEXT,
    "armorClass" TEXT,
    "properties" TEXT,
    "description" TEXT NOT NULL,
    "extraData" TEXT,
    CONSTRAINT "ContentItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContentItem" ("armorClass", "cost", "damage", "description", "extraData", "id", "itemType", "name", "properties", "rarity", "requiresAttunement", "slug", "sourceId", "weight") SELECT "armorClass", "cost", "damage", "description", "extraData", "id", "itemType", "name", "properties", "rarity", "requiresAttunement", "slug", "sourceId", "weight" FROM "ContentItem";
DROP TABLE "ContentItem";
ALTER TABLE "new_ContentItem" RENAME TO "ContentItem";
CREATE INDEX "ContentItem_itemType_idx" ON "ContentItem"("itemType");
CREATE INDEX "ContentItem_rarity_idx" ON "ContentItem"("rarity");
CREATE UNIQUE INDEX "ContentItem_sourceId_slug_key" ON "ContentItem"("sourceId", "slug");
CREATE TABLE "new_ContentMonster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
INSERT INTO "new_ContentMonster" ("abilityScores", "actions", "alignment", "armorClass", "challengeRating", "conditionImmunities", "damageImmunities", "damageResistances", "damageVulnerabilities", "description", "experiencePoints", "extraData", "hitDice", "hitPoints", "id", "languages", "legendaryActions", "monsterType", "name", "savingThrows", "senses", "size", "skills", "slug", "sourceId", "speed") SELECT "abilityScores", "actions", "alignment", "armorClass", "challengeRating", "conditionImmunities", "damageImmunities", "damageResistances", "damageVulnerabilities", "description", "experiencePoints", "extraData", "hitDice", "hitPoints", "id", "languages", "legendaryActions", "monsterType", "name", "savingThrows", "senses", "size", "skills", "slug", "sourceId", "speed" FROM "ContentMonster";
DROP TABLE "ContentMonster";
ALTER TABLE "new_ContentMonster" RENAME TO "ContentMonster";
CREATE INDEX "ContentMonster_challengeRating_idx" ON "ContentMonster"("challengeRating");
CREATE INDEX "ContentMonster_monsterType_idx" ON "ContentMonster"("monsterType");
CREATE UNIQUE INDEX "ContentMonster_sourceId_slug_key" ON "ContentMonster"("sourceId", "slug");
CREATE TABLE "new_ContentRace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "size" TEXT NOT NULL,
    "speed" TEXT NOT NULL,
    "traits" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "extraData" TEXT,
    "parentRaceId" TEXT,
    CONSTRAINT "ContentRace_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentRace_parentRaceId_fkey" FOREIGN KEY ("parentRaceId") REFERENCES "ContentRace" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);
INSERT INTO "new_ContentRace" ("description", "extraData", "id", "name", "parentRaceId", "size", "slug", "sourceId", "speed", "traits") SELECT "description", "extraData", "id", "name", "parentRaceId", "size", "slug", "sourceId", "speed", "traits" FROM "ContentRace";
DROP TABLE "ContentRace";
ALTER TABLE "new_ContentRace" RENAME TO "ContentRace";
CREATE UNIQUE INDEX "ContentRace_sourceId_slug_key" ON "ContentRace"("sourceId", "slug");
CREATE TABLE "new_ContentSpell" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" INTEGER NOT NULL,
    "school" TEXT NOT NULL,
    "castingTime" TEXT NOT NULL,
    "range" TEXT NOT NULL,
    "components" TEXT NOT NULL,
    "material" TEXT,
    "duration" TEXT NOT NULL,
    "concentration" BOOLEAN NOT NULL,
    "ritual" BOOLEAN NOT NULL,
    "classes" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "higherLevels" TEXT,
    "extraData" TEXT,
    CONSTRAINT "ContentSpell_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContentSpell" ("castingTime", "classes", "components", "concentration", "description", "duration", "extraData", "higherLevels", "id", "level", "material", "name", "range", "ritual", "school", "slug", "sourceId") SELECT "castingTime", "classes", "components", "concentration", "description", "duration", "extraData", "higherLevels", "id", "level", "material", "name", "range", "ritual", "school", "slug", "sourceId" FROM "ContentSpell";
DROP TABLE "ContentSpell";
ALTER TABLE "new_ContentSpell" RENAME TO "ContentSpell";
CREATE INDEX "ContentSpell_level_idx" ON "ContentSpell"("level");
CREATE INDEX "ContentSpell_school_idx" ON "ContentSpell"("school");
CREATE UNIQUE INDEX "ContentSpell_sourceId_slug_key" ON "ContentSpell"("sourceId", "slug");
CREATE TABLE "new_ContentSubclass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "classId" TEXT,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "extraData" TEXT,
    CONSTRAINT "ContentSubclass_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentSubclass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ContentClass" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ContentSubclass" ("classId", "description", "extraData", "id", "name", "slug", "sourceId") SELECT "classId", "description", "extraData", "id", "name", "slug", "sourceId" FROM "ContentSubclass";
DROP TABLE "ContentSubclass";
ALTER TABLE "new_ContentSubclass" RENAME TO "ContentSubclass";
CREATE UNIQUE INDEX "ContentSubclass_sourceId_slug_key" ON "ContentSubclass"("sourceId", "slug");
CREATE TABLE "new_ContentSubrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "raceId" TEXT,
    "name" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "size" TEXT,
    "speed" TEXT,
    "traits" TEXT NOT NULL,
    "extraData" TEXT,
    CONSTRAINT "ContentSubrace_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentSubrace_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "ContentRace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ContentSubrace" ("description", "extraData", "id", "name", "raceId", "size", "slug", "sourceId", "speed", "traits") SELECT "description", "extraData", "id", "name", "raceId", "size", "slug", "sourceId", "speed", "traits" FROM "ContentSubrace";
DROP TABLE "ContentSubrace";
ALTER TABLE "new_ContentSubrace" RENAME TO "ContentSubrace";
CREATE UNIQUE INDEX "ContentSubrace_sourceId_slug_key" ON "ContentSubrace"("sourceId", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
