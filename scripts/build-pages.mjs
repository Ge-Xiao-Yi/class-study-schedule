import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

for (const args of [
  ["scripts/prepare-ocr.mjs"],
  ["node_modules/next/dist/bin/next", "build"],
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, PAGES_BUILD: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
writeFileSync("out/.nojekyll", "");
