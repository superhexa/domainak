ALTER TABLE "domain" ADD COLUMN "geo_mode" varchar(12) DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "geo_countries" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "maintenance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "maintenance_message" varchar(200);--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "service_hours" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "timezone" varchar(64) DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "service_start" varchar(5) DEFAULT '00:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "service_end" varchar(5) DEFAULT '24:00' NOT NULL;