ALTER TABLE "tester_signups"
  ADD COLUMN "invited_at" TIMESTAMP WITH TIME ZONE;

-- Partial: the admin list's only filter is "who is still waiting".
CREATE INDEX "IDX_tester_signups_waiting"
  ON "tester_signups" ("created_at" DESC)
  WHERE "invited_at" IS NULL;
