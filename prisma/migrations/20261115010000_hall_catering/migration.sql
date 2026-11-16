-- Add hall catering tables without rewriting existing data.
BEGIN;
-- CreateEnum
CREATE TYPE "HallTaskKind" AS ENUM ('PURCHASE', 'OPEN', 'CLOSE');

-- AlterEnum

-- CreateTable
CREATE TABLE "HallPlan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "rules" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "generatedKey" TEXT,

    CONSTRAINT "HallPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallShift" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "teamId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "requiredHelpers" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "conflict" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "HallShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallTask" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "kind" "HallTaskKind" NOT NULL,

    CONSTRAINT "HallTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallMatch" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "number" TEXT,
    "teamId" TEXT NOT NULL,
    "home" TEXT NOT NULL,
    "away" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "ownHome" BOOLEAN NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HallMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_HallShiftToMember" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_HallShiftToMember_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_HallTaskToMember" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_HallTaskToMember_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "HallPlan_generatedKey_key" ON "HallPlan"("generatedKey");

-- CreateIndex
CREATE INDEX "HallPlan_day_idx" ON "HallPlan"("day");

-- CreateIndex
CREATE INDEX "HallShift_planId_startsAt_idx" ON "HallShift"("planId", "startsAt");

-- CreateIndex
CREATE INDEX "HallShift_teamId_startsAt_idx" ON "HallShift"("teamId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "HallTask_planId_kind_key" ON "HallTask"("planId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "HallMatch_sourceKey_key" ON "HallMatch"("sourceKey");

-- CreateIndex
CREATE INDEX "HallMatch_startsAt_idx" ON "HallMatch"("startsAt");

-- CreateIndex
CREATE INDEX "HallMatch_teamId_startsAt_idx" ON "HallMatch"("teamId", "startsAt");

-- CreateIndex
CREATE INDEX "_HallShiftToMember_B_index" ON "_HallShiftToMember"("B");

-- CreateIndex
CREATE INDEX "_HallTaskToMember_B_index" ON "_HallTaskToMember"("B");

-- AddForeignKey
ALTER TABLE "HallShift" ADD CONSTRAINT "HallShift_planId_fkey" FOREIGN KEY ("planId") REFERENCES "HallPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallShift" ADD CONSTRAINT "HallShift_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallTask" ADD CONSTRAINT "HallTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "HallPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallMatch" ADD CONSTRAINT "HallMatch_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HallShiftToMember" ADD CONSTRAINT "_HallShiftToMember_A_fkey" FOREIGN KEY ("A") REFERENCES "HallShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HallShiftToMember" ADD CONSTRAINT "_HallShiftToMember_B_fkey" FOREIGN KEY ("B") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HallTaskToMember" ADD CONSTRAINT "_HallTaskToMember_A_fkey" FOREIGN KEY ("A") REFERENCES "HallTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HallTaskToMember" ADD CONSTRAINT "_HallTaskToMember_B_fkey" FOREIGN KEY ("B") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Role" ("id", "label") VALUES ('HALL_CATERING', 'Hallenbewirtung')
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "HallPlan" ADD CONSTRAINT "HallPlan_time_order" CHECK ("endsAt" > "startsAt");
ALTER TABLE "HallShift" ADD CONSTRAINT "HallShift_time_order" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "HallShift_helpers_positive" CHECK ("requiredHelpers" BETWEEN 1 AND 100);
ALTER TABLE "HallMatch" ADD CONSTRAINT "HallMatch_time_order" CHECK ("endsAt" > "startsAt");

DO $privacy$
DECLARE
  table_name text;
  api_role text;
  app_schema text := current_schema();
BEGIN
  FOREACH table_name IN ARRAY ARRAY['HallPlan','HallShift','HallTask','HallMatch','_HallShiftToMember','_HallTaskToMember']
  LOOP
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', app_schema, table_name, api_role);
      END IF;
    END LOOP;
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', app_schema, table_name);
  END LOOP;
END;
$privacy$;
COMMIT;
