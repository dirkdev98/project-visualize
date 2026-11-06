import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (file, args) =>
  execFileSync(file, args, { cwd: root, stdio: "inherit", timeout: 300_000 });
run(process.execPath, ["scripts/build-native.mjs"]);
const compiler = join(root, "node_modules/.bin/maligator");
run(compiler, ["ffi", "types"]);
rmSync(join(root, ".cache/release"), { recursive: true, force: true });
run(compiler, ["build", "--production", "--artifact", ".cache/release"]);
run(process.execPath, ["scripts/package.mjs"]);
