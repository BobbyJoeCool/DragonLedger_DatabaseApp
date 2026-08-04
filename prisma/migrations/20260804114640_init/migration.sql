-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "lastUpdated" DATETIME NOT NULL,
    "isDeletable" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "contentTypes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalItems" INTEGER,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "errorLog" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "ImportJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentSpell" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "ContentClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "ContentSubclass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "classId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "extraData" TEXT,
    CONSTRAINT "ContentSubclass_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentSubclass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ContentClass" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentRace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "speed" TEXT NOT NULL,
    "traits" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "extraData" TEXT,
    "parentRaceId" TEXT,
    CONSTRAINT "ContentRace_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentRace_parentRaceId_fkey" FOREIGN KEY ("parentRaceId") REFERENCES "ContentRace" ("id") ON DELETE NO ACTION ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentSubrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "raceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "size" TEXT,
    "speed" TEXT,
    "traits" TEXT NOT NULL,
    "extraData" TEXT,
    CONSTRAINT "ContentSubrace_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentSubrace_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "ContentRace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentBackground" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "proficiencies" TEXT NOT NULL,
    "abilityBonuses" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "extraData" TEXT,
    CONSTRAINT "ContentBackground_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "effects" TEXT,
    "extraData" TEXT,
    CONSTRAINT "ContentCondition_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "ContentMonster" (
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
    "actions" TEXT NOT NULL,
    "legendaryActions" TEXT,
    "description" TEXT,
    "extraData" TEXT,
    CONSTRAINT "ContentMonster_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentFeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "prerequisite" TEXT,
    "description" TEXT NOT NULL,
    "extraData" TEXT,
    CONSTRAINT "ContentFeat_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentClassOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "classId" TEXT,
    "pool" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prerequisite" TEXT,
    "extraData" TEXT,
    CONSTRAINT "ContentClassOption_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentClassOption_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ContentClass" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "ContentSpell_level_idx" ON "ContentSpell"("level");

-- CreateIndex
CREATE INDEX "ContentSpell_school_idx" ON "ContentSpell"("school");

-- CreateIndex
CREATE UNIQUE INDEX "ContentSpell_sourceId_slug_key" ON "ContentSpell"("sourceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentClass_sourceId_slug_key" ON "ContentClass"("sourceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentSubclass_sourceId_slug_key" ON "ContentSubclass"("sourceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRace_sourceId_slug_key" ON "ContentRace"("sourceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentSubrace_sourceId_slug_key" ON "ContentSubrace"("sourceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentBackground_sourceId_slug_key" ON "ContentBackground"("sourceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentCondition_sourceId_slug_key" ON "ContentCondition"("sourceId", "slug");

-- CreateIndex
CREATE INDEX "ContentItem_itemType_idx" ON "ContentItem"("itemType");

-- CreateIndex
CREATE INDEX "ContentItem_rarity_idx" ON "ContentItem"("rarity");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_sourceId_slug_key" ON "ContentItem"("sourceId", "slug");

-- CreateIndex
CREATE INDEX "ContentMonster_challengeRating_idx" ON "ContentMonster"("challengeRating");

-- CreateIndex
CREATE INDEX "ContentMonster_monsterType_idx" ON "ContentMonster"("monsterType");

-- CreateIndex
CREATE UNIQUE INDEX "ContentMonster_sourceId_slug_key" ON "ContentMonster"("sourceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentFeat_sourceId_slug_key" ON "ContentFeat"("sourceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ContentClassOption_sourceId_slug_key" ON "ContentClassOption"("sourceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Language_name_key" ON "Language"("name");
