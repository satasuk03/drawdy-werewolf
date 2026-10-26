// Bundles each test/*.test.ts with esbuild and runs it under node:test.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const only = process.argv.slice(2);
const files = readdirSync(join(root, "test"))
    .filter((f) => f.endsWith(".test.ts"))
    .filter((f) => only.length === 0 || only.some((o) => f.includes(o)));
const out = mkdtempSync(join(tmpdir(), "werewolf-test-"));
await build({
    entryPoints: files.map((f) => join(root, "test", f)),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outdir: out,
    outExtension: { ".js": ".mjs" },
    logLevel: "warning",
});
const run = spawnSync(process.execPath, ["--test", "--test-force-exit", ...files.map((f) => join(out, f.replace(/\.ts$/, ".mjs")))], { stdio: "inherit" });
process.exit(run.status ?? 1);
