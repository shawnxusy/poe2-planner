import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const { currentPatchVersionId } = await import("./lib/current-patch.js");
const { info, error } = await import("./lib/log.js");
const { ingestGemTags } = await import("./repoe/gem-tags.js");
const { ingestCharacters } = await import("./repoe/characters.js");
const { ingestItemClasses } = await import("./repoe/item-classes.js");
const { ingestTags } = await import("./repoe/tags.js");
const { ingestAscendancies } = await import("./repoe/ascendancies.js");
const { ingestBaseItems } = await import("./repoe/base-items.js");
const { ingestMods } = await import("./repoe/mods.js");
const { ingestSkills } = await import("./repoe/skills.js");
const { ingestUniques } = await import("./repoe/uniques.js");
const { ingestStatTranslations } = await import("./repoe/stat-translations.js");

// Each step throws on failure; main() doesn't catch in between. Per the
// project decision: fail-fast on first error, no partial-success retries.
async function main() {
  const patchId = await currentPatchVersionId();
  info("ingest start", { patch_version_id: patchId });

  await ingestGemTags(patchId);
  await ingestCharacters(patchId);
  await ingestItemClasses(patchId);
  await ingestTags(patchId);
  // ascendancies depends on character_classes for its FK lookup.
  await ingestAscendancies(patchId);

  await ingestBaseItems(patchId);
  await ingestMods(patchId);
  await ingestSkills(patchId);
  await ingestUniques(patchId);
  await ingestStatTranslations(patchId);

  info("ingest done");
  process.exit(0);
}

main().catch((e) => {
  error("ingest failed", e);
  process.exit(1);
});
