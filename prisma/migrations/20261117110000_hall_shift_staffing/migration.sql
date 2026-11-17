BEGIN;

ALTER TABLE "HallShift"
    ADD COLUMN "helperNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "staffingRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "HallTeamManager" (
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    CONSTRAINT "HallTeamManager_pkey" PRIMARY KEY ("teamId", "memberId"),
    CONSTRAINT "HallTeamManager_teamId_fkey" FOREIGN KEY ("teamId")
        REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HallTeamManager_memberId_fkey" FOREIGN KEY ("memberId")
        REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "HallTeamManager_memberId_idx" ON "HallTeamManager"("memberId");

ALTER TABLE "HallTeamManager" ENABLE ROW LEVEL SECURITY;
DO $privacy$
DECLARE
    api_role TEXT;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                current_schema(), 'HallTeamManager', api_role);
        END IF;
    END LOOP;
END;
$privacy$;

INSERT INTO "HallTeamManager" ("teamId", "memberId")
SELECT "id", "managerId" FROM "Team" WHERE "managerId" IS NOT NULL;

COMMIT;
