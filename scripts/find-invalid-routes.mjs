import {readFileSync, readdirSync, statSync} from "node:fs";
import {join} from "node:path";

const ROOT = process.cwd();
const APP_DIR = join(ROOT, "app");
const ROUTES_DIR = join(APP_DIR, "routes");

const JS_EXTS = [".js", ".jsx", ".ts", ".tsx"];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const extOk = (p) => JS_EXTS.some((e) => p.endsWith(e));

const hasDefaultRe = /export\s+default/;
const componentLikeRe = /export\s+default\s+(function|class|\(\s*\)\s*=>|[A-Z][A-Za-z0-9_]*)/m;
const objectDefaultRe = /export\s+default\s+\{/m;
const arrayDefaultRe = /export\s+default\s+\[/m;
const ellipsisRe = /^\s*\.\.\.\s*$/m;
const polarisDefaultImportRe = /^\s*import\s+\w+\s+from\s+['"]@shopify\/polaris['"]/m;

const result = {
  projectRoot: ROOT,
  routesDir: ROUTES_DIR,
  haveScriptsDir: true,
  issues: [],
  polarisDefaultImports: [],
};

function pushIssue(file, type, extra=null) {
  result.issues.push({file, type, extra});
}

if (statSync(ROUTES_DIR, {throwIfNoEntry: false})?.isDirectory()) {
  for (const file of walk(ROUTES_DIR)) {
    if (!extOk(file)) continue;
    const txt = readFileSync(file, "utf8");
    if (!hasDefaultRe.test(txt)) pushIssue(file, "NO_DEFAULT_EXPORT");
    else if (objectDefaultRe.test(txt)) pushIssue(file, "DEFAULT_IS_OBJECT");
    else if (arrayDefaultRe.test(txt)) pushIssue(file, "DEFAULT_IS_ARRAY");
    else if (!componentLikeRe.test(txt)) pushIssue(file, "DEFAULT_NOT_COMPONENT_LIKE");
    if (ellipsisRe.test(txt)) pushIssue(file, "ELLIPSIS_PLACEHOLDER");
  }
} else {
  pushIssue(ROUTES_DIR, "MISSING_ROUTES_DIR");
}

for (const file of walk(APP_DIR)) {
  if (!extOk(file)) continue;
  const txt = readFileSync(file, "utf8");
  if (polarisDefaultImportRe.test(txt)) {
    const lines = txt.split(/\r?\n/).map((l, i) => [i+1, l]);
    const hits = lines.filter(([n, l]) => polarisDefaultImportRe.test(l)).map(([n, l]) => ({line: n, text: l.trim()}));
    result.polarisDefaultImports.push({file, hits});
  }
}

console.log("Project root:", result.projectRoot);
console.log("Routes dir   :", result.routesDir);
console.log("— — —");

if (result.issues.length === 0) {
  console.log("✅ No route export issues found");
} else {
  console.log("🚨 Route issues:");
  for (const i of result.issues) {
    console.log("-", i.type.padEnd(24), i.file);
  }
}

if (result.polarisDefaultImports.length === 0) {
  console.log("\\n✅ No default imports from @shopify/polaris found");
} else {
  console.log("\\n🚨 Default Polaris imports found:");
  for (const item of result.polarisDefaultImports) {
    console.log(item.file);
    for (const h of item.hits) console.log("  line", h.line + ":", h.text);
  }
}
