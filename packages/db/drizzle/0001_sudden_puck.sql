ALTER TABLE "gem_tags" ALTER COLUMN "translation" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "passives" ADD COLUMN "connections" integer[];