import {readFileSync, readdirSync, statSync} from "node:fs";
import {join} from "node:path";

const ROOT = process.cwd();
const APP = join(ROOT, "app");
const exts = [".js",".jsx",".ts",".tsx"];

function* walk(dir){
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const looksLikeCode = p => exts.some(e => p.endsWith(e));

const reDefault     = /\bexport\s+default\b/;
const reCompLike    = /\bexport\s+default\s+(function|class|\(\s*\)\s*=>|[A-Z][A-Za-z0-9_]*)/m;
const reObjDefault  = /\bexport\s+default\s+\{/m;
const reArrDefault  = /\bexport\s+default\s+\[/m;
const reEllipsis    = /^\s*\.\.\.\s*$/m;
const rePolarisBad  = /^\s*import\s+\w+\s+from\s+['"]@shopify\/polaris['"]/m;
const reNamespaceAsComponent = /import\s+\*\s+as\s+([A-Za-z_]\w*)\s+from\s+['"][^'"]+['"][\s\S]*?<\1\s*\/?>/m;

const issues = [];

for (const file of walk(APP)) {
  if (!looksLikeCode(file)) continue;
  const txt = readFileSync(file, "utf8");

  if (rePolarisBad.test(txt)) {
    issues.push({file, type:"POLARIS_DEFAULT_IMPORT"});
  }

  if (reNamespaceAsComponent.test(txt)) {
    issues.push({file, type:"NAMESPACE_USED_AS_COMPONENT"});
  }

  if (!reDefault.test(txt)) continue; // no default export at all is fine outside routes
  if (reObjDefault.test(txt)) {
    issues.push({file, type:"DEFAULT_IS_OBJECT"});
    continue;
  }
  if (reArrDefault.test(txt)) {
    issues.push({file, type:"DEFAULT_IS_ARRAY"});
    continue;
  }
  if (!reCompLike.test(txt)) {
    issues.push({file, type:"DEFAULT_NOT_COMPONENT_LIKE"});
  }

  if (reEllipsis.test(txt)) {
    issues.push({file, type:"ELLIPSIS_PLACEHOLDER"});
  }
}

if (issues.length === 0) {
  console.log("✅ No suspicious default exports/imports found in app/");
} else {
  console.log("🚨 Suspects:");
  for (const i of issues) console.log("-", i.type.padEnd(30), i.file);
}
