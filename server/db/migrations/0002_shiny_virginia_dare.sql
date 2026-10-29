CREATE TABLE "dns_record" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(253) NOT NULL,
	"type" varchar(5) NOT NULL,
	"value" text NOT NULL,
	"ttl" integer DEFAULT 300 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dns_record" ADD CONSTRAINT "dns_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dns_record_user_id_idx" ON "dns_record" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dns_record_name_type_value_idx" ON "dns_record" USING btree ("name","type","value");