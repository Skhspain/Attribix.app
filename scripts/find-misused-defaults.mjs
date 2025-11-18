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
const isCode = p => exts.some(e => p.endsWith(e));

const reImportDefault =
  /import\s+([A-Za-z_]\w*)(?:\s*,\s*\{[^}]*\})?\s*from\s*["'](?:\.\.\/|\.\/|~\/)shopify\.server["']/;
const reImportNamespace =
  /import\s*\*\s+as\s+([A-Za-z_]\w*)\s*from\s*["'](?:\.\.\/|\.\/|~\/)shopify\.server["']/;

const reJSX = (name) => new RegExp(`<\\s*${name}\\b`);
const reCreateEl = (name) => new RegExp(`React\\.createElement\\(\\s*${name}\\b`);

const reDefault = /\bexport\s+default\b/;
const reObjDefault = /\bexport\s+default\s+\{/m;
const reArrDefault = /\bexport\s+default\s+\[/m;

const issues = [];

for (const file of walk(APP)) {
  if (!isCode(file)) continue;
  const txt = readFileSync(file, "utf8");

  // Flag default/namespace imports of shopify.server that are then used like components
  const d = txt.match(reImportDefault);
  if (d) {
    const name = d[1];
    if (reJSX(name).test(txt) || reCreateEl(name).test(txt)) {
      issues.push({type:"RENDERING_SHOPIFY_SERVER_DEFAULT_AS_COMPONENT", file, detail:`<${name} ... />`});
    }
  }
  const ns = txt.match(reImportNamespace);
  if (ns) {
    const name = ns[1];
    // any <Ns .../> usage means namespace-as-component
    if (reJSX(name).test(txt) || reCreateEl(name).test(txt)) {
      issues.push({type:"RENDERING_NAMESPACE_AS_COMPONENT", file, detail:`<${name} ... />`});
    }
  }

  // Extra safety: if a file exports default object/array inside routes/, that’s suspicious for SSR
  if ((file.includes(`${join("app","routes")}`)) && reDefault.test(txt)) {
    if (reObjDefault.test(txt)) issues.push({type:"ROUTE_DEFAULT_IS_OBJECT", file});
    if (reArrDefault.test(txt)) issues.push({type:"ROUTE_DEFAULT_IS_ARRAY", file});
  }
}

if (issues.length === 0) {
  console.log("✅ No misused defaults found (shopify.server is not being rendered).");
} else {
  console.log("🔎 Problems found:");
  for (const i of issues) {
    console.log("-", i.type.padEnd(38), i.file, i.detail ? `| ${i.detail}` : "");
  }
  console.log("\n➡ Fix: never render anything imported from shopify.server; use only named server utilities (e.g. { authenticate }). If a route needs a component, export a function component.");
}
