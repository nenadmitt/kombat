CREATE TABLE "tester_signups" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "username" character varying(32) NOT NULL,
  "email" character varying(320) NOT NULL,
  "country" character varying(2),
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "PK_tester_signups" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_tester_signups_email" UNIQUE ("email")
);

CREATE INDEX "IDX_tester_signups_created_at" ON "tester_signups" ("created_at" DESC);
