import { existsSync } from "node:fs";
import { $ } from "bun";

// Production installs omit devDependencies, including Husky. Only set up Git hooks
// when the Husky CLI is actually installed (for local development installs).
if (existsSync("node_modules/.bin/husky")) {
  await $`husky`;
}
