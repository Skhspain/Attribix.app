// scripts/clean.js
// Cross-platform cleanup for stubborn Windows locks (esbuild/rollup binaries).
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: true });
}

try {
  // 1) Try to kill any node processes that might be holding locks (VS Code terminals, dev servers)
  try { run('taskkill /IM node.exe /F'); } catch {}

  // 2) Remove lockfile
  if (existsSync("package-lock.json")) {
    run('powershell -NoProfile -Command "Remove-Item -Force package-lock.json"');
  }

  // 3) Remove common stuck bins first
  const patterns = [
    'node_modules\\**\\esbuild',
    'node_modules\\esbuild*',
    'node_modules\\**\\rollup*'
  ];
  for (const p of patterns) {
    run(`npx rimraf "${p}"`);
  }

  // 4) Remove node_modules entirely
  if (existsSync("node_modules")) {
    run('powershell -NoProfile -Command "Remove-Item -Recurse -Force node_modules"');
  }

  // 5) Clean npm cache (helps esbuild/rollup native bins)
  run("npm cache clean --force");

  console.log("Cleanup complete.");
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
}
