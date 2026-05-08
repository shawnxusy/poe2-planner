import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const { currentPatchVersionId } = await import("./lib/current-patch.js");
const { info, error } = await import("./lib/log.js");
const { ingestGemTags } = await import("./repoe/gem-tags.js");
const { ingestCharacters } = await import("./repoe/characters.js");
const { ingestItemClasses } = await import("./repoe/item-classes.js");
const { ingestTags } = await import("./repoe/tags.js");

// Each step throws on failure; main() doesn't catch in between. Per the
// project decision: fail-fast on first error, no partial-success retries.
async function main() {
  const patchId = await currentPatchVersionId();
  info("ingest start", { patch_version_id: patchId });

  await ingestGemTags(patchId);
  await ingestCharacters(patchId);
  await ingestItemClasses(patchId);
  await ingestTags(patchId);

  info("ingest done");
}

main().catch((e) => {
  error("ingest failed", e);
  process.exit(1);
});
