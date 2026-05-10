// One-shot script to seed static game data (charms, augments) for the current patch.
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const { currentPatchVersionId } = await import("../lib/current-patch.js");
const { seedCharms } = await import("./charms-seed.js");
const { seedAugments } = await import("./augments-seed.js");

const patchId = await currentPatchVersionId();
await seedCharms(patchId);
await seedAugments(patchId);
process.exit(0);
