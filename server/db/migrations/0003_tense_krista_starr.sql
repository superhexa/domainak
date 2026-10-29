-- Idempotent on purpose: databases that already received parts of this
-- schema through `db:push` (record_mode) must not fail on re-run.
ALTER TABLE "dns_record" ADD COLUMN IF NOT EXISTS "zone" varchar(253) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "dns_record" ADD COLUMN IF NOT EXISTS "record_mode" varchar(16) DEFAULT 'dns-only' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dns_record_zone_idx" ON "dns_record" USING btree ("zone");--> statement-breakpoint
-- Rows created before per-domain zones all belong to the legacy
-- records.domainak.qzz.io zone; derive it from the owner name.
UPDATE "dns_record"
SET "zone" = CASE
  WHEN "name" LIKE '%.records.domainak.qzz.io' THEN 'records.domainak.qzz.io'
  ELSE regexp_replace("name", '^[^.]+\.', '')
END
WHERE "zone" = '';
