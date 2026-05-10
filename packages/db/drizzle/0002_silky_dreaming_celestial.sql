CREATE TABLE "augments" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_version_id" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"slot_types" text[] DEFAULT '{}' NOT NULL,
	"effect" text NOT NULL,
	"tier" integer
);
--> statement-breakpoint
CREATE TABLE "charms" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_version_id" integer NOT NULL,
	"name" varchar(64) NOT NULL,
	"charm_type" varchar(32) NOT NULL,
	"trigger_condition" text,
	"effect" text NOT NULL,
	"effect_duration_ms" integer,
	"charges_max" integer,
	"charges_per_use" integer
);
--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "spirit_cost" integer;--> statement-breakpoint
ALTER TABLE "augments" ADD CONSTRAINT "augments_patch_version_id_patch_versions_id_fk" FOREIGN KEY ("patch_version_id") REFERENCES "public"."patch_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charms" ADD CONSTRAINT "charms_patch_version_id_patch_versions_id_fk" FOREIGN KEY ("patch_version_id") REFERENCES "public"."patch_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "augments_patch_name_unique" ON "augments" USING btree ("patch_version_id","name");--> statement-breakpoint
CREATE INDEX "augments_patch_idx" ON "augments" USING btree ("patch_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charms_patch_name_unique" ON "charms" USING btree ("patch_version_id","name");--> statement-breakpoint
CREATE INDEX "charms_patch_idx" ON "charms" USING btree ("patch_version_id");--> statement-breakpoint
CREATE INDEX "charms_type_idx" ON "charms" USING btree ("charm_type");