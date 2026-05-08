CREATE TABLE "base_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_version_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"item_class" varchar(64) NOT NULL,
	"implicit_mods" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"requirements" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"build_id" integer NOT NULL,
	"slot" varchar(32) NOT NULL,
	"unique_item_id" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "build_passives" (
	"id" serial PRIMARY KEY NOT NULL,
	"build_id" integer NOT NULL,
	"passive_id" integer NOT NULL,
	"is_keystone" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"build_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"supports" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"build_id" integer NOT NULL,
	"boss_dps" numeric(14, 2) NOT NULL,
	"clear_dps" numeric(14, 2) NOT NULL,
	"ehp" numeric(12, 2) NOT NULL,
	"life" integer NOT NULL,
	"es" integer NOT NULL,
	"armour" integer NOT NULL,
	"evasion" integer NOT NULL,
	"resistances" jsonb NOT NULL,
	"confidence_tier" varchar(16) NOT NULL,
	"assumptions" jsonb NOT NULL,
	"pob_boss_dps" numeric(14, 2),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builds" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_version_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"character_class" varchar(64) NOT NULL,
	"ascendancy" varchar(64),
	"pob_code" text NOT NULL,
	"description" text,
	"archetype" varchar(32) NOT NULL,
	"confidence_tier" varchar(16) NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_version_id" integer NOT NULL,
	"item_name" varchar(128) NOT NULL,
	"chaos_value" numeric(12, 2),
	"divine_value" numeric(12, 4),
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_version_id" integer NOT NULL,
	"source" varchar(64) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mods" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_version_id" integer NOT NULL,
	"mod_id" varchar(96) NOT NULL,
	"name" varchar(128),
	"stats" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"domain" varchar(32) NOT NULL,
	"generation_type" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passives" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_version_id" integer NOT NULL,
	"node_id" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"type" varchar(32) NOT NULL,
	"stats" text[] DEFAULT '{}' NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patch_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tag" varchar(16) NOT NULL,
	"label" varchar(128) NOT NULL,
	"released_at" timestamp with time zone,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_version_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"gem_type" varchar(32) NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"damage_effectiveness" numeric(6, 3),
	"base_stats" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unique_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_version_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"base_item_id" integer,
	"stats" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "base_items" ADD CONSTRAINT "base_items_patch_version_id_patch_versions_id_fk" FOREIGN KEY ("patch_version_id") REFERENCES "public"."patch_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_items" ADD CONSTRAINT "build_items_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_items" ADD CONSTRAINT "build_items_unique_item_id_unique_items_id_fk" FOREIGN KEY ("unique_item_id") REFERENCES "public"."unique_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_passives" ADD CONSTRAINT "build_passives_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_passives" ADD CONSTRAINT "build_passives_passive_id_passives_id_fk" FOREIGN KEY ("passive_id") REFERENCES "public"."passives"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_skills" ADD CONSTRAINT "build_skills_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_skills" ADD CONSTRAINT "build_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_stats" ADD CONSTRAINT "build_stats_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_patch_version_id_patch_versions_id_fk" FOREIGN KEY ("patch_version_id") REFERENCES "public"."patch_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_prices" ADD CONSTRAINT "item_prices_patch_version_id_patch_versions_id_fk" FOREIGN KEY ("patch_version_id") REFERENCES "public"."patch_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_snapshots" ADD CONSTRAINT "meta_snapshots_patch_version_id_patch_versions_id_fk" FOREIGN KEY ("patch_version_id") REFERENCES "public"."patch_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mods" ADD CONSTRAINT "mods_patch_version_id_patch_versions_id_fk" FOREIGN KEY ("patch_version_id") REFERENCES "public"."patch_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passives" ADD CONSTRAINT "passives_patch_version_id_patch_versions_id_fk" FOREIGN KEY ("patch_version_id") REFERENCES "public"."patch_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_patch_version_id_patch_versions_id_fk" FOREIGN KEY ("patch_version_id") REFERENCES "public"."patch_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unique_items" ADD CONSTRAINT "unique_items_patch_version_id_patch_versions_id_fk" FOREIGN KEY ("patch_version_id") REFERENCES "public"."patch_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unique_items" ADD CONSTRAINT "unique_items_base_item_id_base_items_id_fk" FOREIGN KEY ("base_item_id") REFERENCES "public"."base_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "base_items_patch_name_unique" ON "base_items" USING btree ("patch_version_id","name");--> statement-breakpoint
CREATE INDEX "base_items_patch_idx" ON "base_items" USING btree ("patch_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "build_items_slot_unique" ON "build_items" USING btree ("build_id","slot");--> statement-breakpoint
CREATE INDEX "build_items_build_idx" ON "build_items" USING btree ("build_id");--> statement-breakpoint
CREATE UNIQUE INDEX "build_passives_unique" ON "build_passives" USING btree ("build_id","passive_id");--> statement-breakpoint
CREATE INDEX "build_passives_build_idx" ON "build_passives" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "build_skills_build_idx" ON "build_skills" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "build_skills_role_idx" ON "build_skills" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "build_stats_build_unique" ON "build_stats" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "builds_patch_idx" ON "builds" USING btree ("patch_version_id");--> statement-breakpoint
CREATE INDEX "builds_class_idx" ON "builds" USING btree ("character_class");--> statement-breakpoint
CREATE INDEX "builds_archetype_idx" ON "builds" USING btree ("archetype");--> statement-breakpoint
CREATE INDEX "builds_published_idx" ON "builds" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "item_prices_patch_name_idx" ON "item_prices" USING btree ("patch_version_id","item_name");--> statement-breakpoint
CREATE INDEX "item_prices_fetched_idx" ON "item_prices" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "meta_snapshots_patch_source_idx" ON "meta_snapshots" USING btree ("patch_version_id","source");--> statement-breakpoint
CREATE INDEX "meta_snapshots_fetched_idx" ON "meta_snapshots" USING btree ("fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mods_patch_modid_unique" ON "mods" USING btree ("patch_version_id","mod_id");--> statement-breakpoint
CREATE INDEX "mods_patch_idx" ON "mods" USING btree ("patch_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passives_patch_node_unique" ON "passives" USING btree ("patch_version_id","node_id");--> statement-breakpoint
CREATE INDEX "passives_patch_idx" ON "passives" USING btree ("patch_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patch_versions_tag_unique" ON "patch_versions" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "patch_versions_only_one_current" ON "patch_versions" USING btree ("is_current") WHERE is_current = true;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_patch_name_unique" ON "skills" USING btree ("patch_version_id","name");--> statement-breakpoint
CREATE INDEX "skills_patch_idx" ON "skills" USING btree ("patch_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_items_patch_name_unique" ON "unique_items" USING btree ("patch_version_id","name");--> statement-breakpoint
CREATE INDEX "unique_items_patch_idx" ON "unique_items" USING btree ("patch_version_id");