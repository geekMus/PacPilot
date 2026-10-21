import { existsSync } from "node:fs";
import { $ } from "bun";

// Git hooks are only useful in a local Git checkout. Docker build contexts and
// production installs do not need them, even if the Husky CLI is present.
if (existsSync(".git") && existsSync("node_modules/.bin/husky")) {
  await $`husky`;
}
