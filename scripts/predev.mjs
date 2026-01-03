import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  return r.status ?? 0;
}

console.log("\n[predev] prisma generate");
let code = run("npx", ["prisma", "generate"]);
if (code !== 0) process.exit(code);

console.log("\n[predev] prisma db push (will NOT fail dev if DB is offline)");
code = run("npx", ["prisma", "db", "push"]);

if (code !== 0) {
  console.log(
    "\n[predev] WARNING: prisma db push failed (DB likely offline). Continuing anyway...\n"
  );
  process.exit(0);
}

process.exit(0);
